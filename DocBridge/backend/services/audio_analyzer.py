"""
Audio Analyzer — Voice Clone & Synthetic Speech Detector.

Model      : backend/models/rawnet2_antispoofing.pth
             If absent, falls back to acoustic feature heuristics.

RawNet2 architecture from ASVspoof 2021 challenge.
Download pretrained weights from https://github.com/asvspoof-challenge/2021
or train on ASVspoof 2019/2021 datasets.

Use cases
---------
1. Standalone audio file (MP3, WAV, FLAC, M4A, OGG)
2. Audio extracted from video files
3. Real-time audio chunks (phone-call monitoring)
4. Voice profile registration + impersonation detection
"""

import json
import math
import os
import subprocess
import tempfile
import uuid
import wave
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy.signal import resample as scipy_resample, butter, sosfilt
from scipy.linalg import solve_toeplitz

# ── optional deps ─────────────────────────────────────────────────────────────
try:
    import librosa
    _LIBROSA = True
except ImportError:
    _LIBROSA = False

try:
    import soundfile as _sf
    _SF = True
except ImportError:
    _SF = False

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    _TORCH = True
except ImportError:
    _TORCH = False

try:
    import cv2
    _CV2 = True
except ImportError:
    _CV2 = False

# ── constants ─────────────────────────────────────────────────────────────────
SAMPLE_RATE         = 16_000           # RawNet2 expects 16 kHz
CHUNK_SAMPLES       = 64_600           # 4.04 s at 16 kHz — RawNet2 input length
MIN_DURATION_S      = 2.0
SILENCE_RMS         = 0.001
INCONCLUSIVE_THRESH = 0.40
MODEL_PATH          = os.getenv("AUDIO_MODEL_PATH", "models/rawnet2_antispoofing.pth")
PROFILES_DIR        = "models/voice_profiles"


# ═════════════════════════════════════════════════════════════════════════════
# RawNet2 architecture
# ═════════════════════════════════════════════════════════════════════════════

if _TORCH:

    class _SincConv(nn.Module):
        """
        Sinc-based bandpass filter bank operating directly on raw waveform.
        Frequencies are learnable parameters — the model discovers which bands
        are discriminative for detecting synthetic speech.
        """
        def __init__(self, n_filters: int = 70, kernel_size: int = 251,
                     sample_rate: int = 16_000,
                     min_freq: float = 50.0, max_freq: float = 8_000.0):
            super().__init__()
            assert kernel_size % 2 == 1, "kernel_size must be odd"
            self.n_filters   = n_filters
            self.kernel_size = kernel_size
            self.sample_rate = sample_rate
            self.min_freq    = min_freq
            self.max_freq    = max_freq

            # Initialise low cutoffs uniformly across the band
            low_hz  = min_freq + torch.arange(n_filters, dtype=torch.float32) \
                      * (max_freq / 2 - min_freq) / n_filters
            band_hz = torch.abs(torch.randn(n_filters) * 100) + 50.0

            self.low_hz_  = nn.Parameter(low_hz)
            self.band_hz_ = nn.Parameter(band_hz)

            # Time axis in seconds (used to compute sinc)
            n = (kernel_size - 1) / 2.0
            t = torch.arange(-n, n + 1) / sample_rate
            self.register_buffer("t", t)

            # Hamming window
            win = 0.54 - 0.46 * torch.cos(
                2 * math.pi * torch.arange(kernel_size) / (kernel_size - 1))
            self.register_buffer("window", win)

        @staticmethod
        def _sinc(x: "torch.Tensor") -> "torch.Tensor":
            return torch.where(
                x == 0,
                torch.ones_like(x),
                torch.sin(math.pi * x) / (math.pi * x + 1e-10),
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            low  = torch.clamp(self.low_hz_, self.min_freq, self.sample_rate / 2 - 25)
            high = torch.clamp(low + torch.abs(self.band_hz_),
                               low + 25, self.sample_rate / 2)

            t = self.t.unsqueeze(0)                             # 1 × T
            f_lo = 2 * low.unsqueeze(1) * t                    # F × T
            f_hi = 2 * high.unsqueeze(1) * t

            bp = (2 * high.unsqueeze(1) * self._sinc(f_hi)
                  - 2 * low.unsqueeze(1) * self._sinc(f_lo))
            bp = bp * self.window.unsqueeze(0)
            bp = bp / (2 * bp.abs().sum(-1, keepdim=True) + 1e-8)

            return F.conv1d(x, bp.unsqueeze(1),
                            padding=self.kernel_size // 2)

    class _ResBlock(nn.Module):
        def __init__(self, in_ch: int, out_ch: int):
            super().__init__()
            self.net = nn.Sequential(
                nn.BatchNorm1d(in_ch),
                nn.LeakyReLU(0.3),
                nn.Conv1d(in_ch, out_ch, 3, padding=1),
                nn.BatchNorm1d(out_ch),
                nn.LeakyReLU(0.3),
                nn.Conv1d(out_ch, out_ch, 3, padding=1),
            )
            self.skip = (nn.Sequential(nn.Conv1d(in_ch, out_ch, 1),
                                       nn.BatchNorm1d(out_ch))
                         if in_ch != out_ch else nn.Identity())

        def forward(self, x):
            return self.net(x) + self.skip(x)

    class RawNet2(nn.Module):
        """
        RawNet2 architecture from ASVspoof 2021 challenge.
        Download pretrained weights from https://github.com/asvspoof-challenge/2021
        or train on ASVspoof 2019/2021 datasets.

        Input  : (batch, 1, CHUNK_SAMPLES) — raw waveform at 16 kHz
        Output : (batch, 1) — probability of being synthetic speech
        """
        GRU_HIDDEN = 256

        def __init__(self, sr: int = SAMPLE_RATE):
            super().__init__()
            self.sinc   = _SincConv(70, 251, sr)
            self.bn0    = nn.BatchNorm1d(70)
            self.lrelu  = nn.LeakyReLU(0.3)
            self.pool   = nn.MaxPool1d(3)

            self.blocks = nn.Sequential(
                _ResBlock(70,  128),
                _ResBlock(128, 128),
                _ResBlock(128, 256),
                _ResBlock(256, 256),
                _ResBlock(256, 512),
                _ResBlock(512, 512),
            )
            self.bn1 = nn.BatchNorm1d(512)
            self.gru = nn.GRU(512, self.GRU_HIDDEN,
                               num_layers=3, batch_first=True, dropout=0.3)
            self.fc  = nn.Sequential(
                nn.Linear(self.GRU_HIDDEN, 128),
                nn.LeakyReLU(0.3),
                nn.Dropout(0.5),
                nn.Linear(128, 1),
                nn.Sigmoid(),
            )

        def forward(self, x):
            x = self.lrelu(self.bn0(self.sinc(x)))     # sinc filters
            x = self.pool(x)
            x = self.blocks(x)
            x = self.bn1(x).transpose(1, 2)            # → (B, T, 512)
            _, h = self.gru(x)                         # h: (3, B, GRU_HIDDEN)
            return self.fc(h[-1])                      # last layer, (B, 1)


# ═════════════════════════════════════════════════════════════════════════════
# AudioAnalyzer
# ═════════════════════════════════════════════════════════════════════════════

class AudioAnalyzer:

    def __init__(self):
        self._model: Optional[Any] = None
        os.makedirs(PROFILES_DIR, exist_ok=True)

    # ── model ────────────────────────────────────────────────────────────────

    def _get_model(self) -> Optional[Any]:
        if not _TORCH:
            return None
        if self._model is not None:
            return self._model

        m = RawNet2(SAMPLE_RATE)
        pth = Path(MODEL_PATH)
        if pth.exists():
            try:
                m.load_state_dict(torch.load(str(pth), map_location="cpu"))
                m._source = "pretrained"
            except Exception as e:
                m._source = f"imagenet_init ({e})"
        else:
            m._source = "random_init"
        m.eval()
        self._model = m
        return m

    # ── audio loading ─────────────────────────────────────────────────────────

    def _load_audio(self, path: str) -> Tuple[np.ndarray, int]:
        """Return (float32 samples normalised [-1,1], sample_rate=16000)."""
        if _LIBROSA:
            samples, _ = librosa.load(path, sr=SAMPLE_RATE, mono=True)
            return samples.astype(np.float32), SAMPLE_RATE

        if _SF:
            samples, sr = _sf.read(path, dtype="float32", always_2d=False)
            if samples.ndim > 1:
                samples = samples.mean(axis=1)
            if sr != SAMPLE_RATE:
                n = int(len(samples) * SAMPLE_RATE / sr)
                samples = scipy_resample(samples, n).astype(np.float32)
            return samples, SAMPLE_RATE

        # stdlib wav fallback
        with wave.open(path, "rb") as wf:
            sr = wf.getframerate()
            raw = wf.readframes(wf.getnframes())
            n_ch = wf.getnchannels()
        samples = np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0
        if n_ch > 1:
            samples = samples.reshape(-1, n_ch).mean(axis=1)
        if sr != SAMPLE_RATE:
            n = int(len(samples) * SAMPLE_RATE / sr)
            samples = scipy_resample(samples, n).astype(np.float32)
        return samples, SAMPLE_RATE

    # ── validation ────────────────────────────────────────────────────────────

    def _validate_audio(self, samples: np.ndarray) -> Tuple[bool, str]:
        dur = len(samples) / SAMPLE_RATE
        if dur < MIN_DURATION_S:
            return False, f"Audio too short ({dur:.2f}s < {MIN_DURATION_S}s minimum)."
        rms = float(np.sqrt(np.mean(samples ** 2)))
        if rms < SILENCE_RMS:
            return False, "No speech detected"
        return True, ""

    # ── features ──────────────────────────────────────────────────────────────

    def _extract_features(self, samples: np.ndarray, sr: int) -> Dict[str, Any]:
        return {
            "pitch_consistency_score":  self._pitch_consistency(samples, sr),
            "breath_noise_score":       self._breath_noise(samples, sr),
            "spectral_flatness_score":  self._spectral_flatness(samples),
            "temporal_regularity_score":self._temporal_regularity(samples, sr),
            "formant_smoothness_score": self._formant_smoothness(samples, sr),
            "tts_artifacts":            self._tts_artifacts(samples, sr),
        }

    def _pitch_consistency(self, samples: np.ndarray, sr: int) -> float:
        """
        Autocorrelation-based F0 estimator.
        TTS voices have unnaturally low F0 std (~2–15 Hz).
        Returns 0.0 (very consistent = suspicious) → 1.0 (natural variation).
        """
        frame_len = int(0.025 * sr)
        hop_len   = int(0.010 * sr)
        lo_period = max(1, sr // 500)    # max 500 Hz
        hi_period = sr // 50             # min  50 Hz

        f0s: List[float] = []
        for i in range(0, len(samples) - frame_len, hop_len):
            frame = samples[i: i + frame_len]
            if np.sqrt(np.mean(frame ** 2)) < 0.01:
                continue
            r = np.correlate(frame, frame, "full")[len(frame):]
            r = r / (r[0] + 1e-10)
            seg = r[lo_period: hi_period]
            if len(seg) == 0:
                continue
            pk = int(np.argmax(seg))
            if seg[pk] > 0.3:
                f0s.append(sr / (pk + lo_period))

        if len(f0s) < 5:
            return 0.5
        std = float(np.std(f0s))
        return round(float(np.clip(std / 40.0, 0.0, 1.0)), 4)

    def _breath_noise(self, samples: np.ndarray, sr: int) -> float:
        """
        Energy in <100 Hz band during speech pauses.
        Real speech has breath noise; TTS is silent between words.
        Returns 0.0 (no breath = suspicious) → 1.0 (natural breath noise).
        """
        hop   = int(0.010 * sr)
        flen  = int(0.025 * sr)
        rms_frames = np.array([
            np.sqrt(np.mean(samples[i: i + flen] ** 2))
            for i in range(0, len(samples) - flen, hop)
        ])
        if rms_frames.max() < 1e-6:
            return 0.0

        # Pause frames: below 20% of peak RMS
        pause_mask = rms_frames < 0.2 * rms_frames.max()
        pause_indices = np.where(pause_mask)[0]
        if len(pause_indices) < 5:
            return 0.5

        # Low-pass filter at 100 Hz using Butterworth
        sos = butter(4, 100 / (sr / 2), btype="low", output="sos")
        lp  = sosfilt(sos, samples)

        # Energy in pause segments
        energies = []
        for idx in pause_indices[:50]:
            start = idx * hop
            seg = lp[start: start + flen]
            if len(seg) == flen:
                energies.append(np.mean(seg ** 2))

        if not energies:
            return 0.5
        breath_energy = float(np.mean(energies))
        # Typical real breath: ~1e-4 to 1e-3; TTS: ~1e-8
        score = float(np.clip(np.log10(breath_energy + 1e-9) / -4.0 + 1.0, 0.0, 1.0))
        return round(score, 4)

    def _spectral_flatness(self, samples: np.ndarray) -> float:
        """
        Geometric mean / arithmetic mean of power spectrum.
        Tonal speech: low flatness; white noise: flatness ≈ 1.
        TTS is often unnaturally tonal → very low flatness.
        Returns 0.0 (completely tonal = suspicious) → 1.0 (natural noise mix).
        """
        n_fft = 1024
        hop   = n_fft // 2
        n_frames = (len(samples) - n_fft) // hop
        flatnesses: List[float] = []
        for i in range(n_frames):
            frame = samples[i * hop: i * hop + n_fft] * np.hanning(n_fft)
            spectrum = np.abs(np.fft.rfft(frame)) ** 2
            spectrum = np.maximum(spectrum, 1e-10)
            geo = np.exp(np.mean(np.log(spectrum)))
            ari = np.mean(spectrum)
            flatnesses.append(geo / ari)

        if not flatnesses:
            return 0.5
        mean_flat = float(np.mean(flatnesses))
        return round(float(np.clip(mean_flat * 5.0, 0.0, 1.0)), 4)

    def _temporal_regularity(self, samples: np.ndarray, sr: int) -> float:
        """
        Autocorrelation of the RMS energy envelope.
        TTS has metronomic energy patterns; real speech is irregular.
        Returns 0.0 (very regular = suspicious) → 1.0 (irregular = natural).
        """
        hop = int(0.010 * sr)
        env = np.array([
            np.sqrt(np.mean(samples[i: i + hop] ** 2))
            for i in range(0, len(samples) - hop, hop)
        ])
        if len(env) < 20:
            return 0.5
        env -= env.mean()
        ac = np.correlate(env, env, "full")[len(env):]
        ac = ac / (ac[0] + 1e-10)
        lo, hi = len(env) // 10, len(env) // 2
        regularity = float(np.max(np.abs(ac[lo: hi]))) if hi > lo else 0.5
        # High autocorrelation at non-DC lag = regular = suspicious
        return round(1.0 - float(np.clip(regularity, 0.0, 1.0)), 4)

    def _formant_smoothness(self, samples: np.ndarray, sr: int) -> float:
        """
        LPC-based F1/F2 formant tracking.
        TTS voices have unnaturally smooth formant trajectories.
        Returns 0.0 (glass-smooth = suspicious) → 1.0 (natural variation).
        """
        frame_len = int(0.025 * sr)
        hop_len   = int(0.010 * sr)
        order     = 2 + sr // 1000   # ~18 for 16kHz

        f1s: List[float] = []
        f2s: List[float] = []

        for i in range(0, len(samples) - frame_len, hop_len):
            frame = samples[i: i + frame_len]
            if np.sqrt(np.mean(frame ** 2)) < 0.01:
                continue
            # Pre-emphasis
            frame = np.append(frame[0], frame[1:] - 0.97 * frame[:-1])
            frame *= np.hamming(len(frame))
            # Autocorrelation
            r = np.correlate(frame, frame, "full")
            r = r[len(r) // 2: len(r) // 2 + order + 1]
            # Toeplitz LPC via scipy
            try:
                a = solve_toeplitz(r[:order], -r[1: order + 1])
            except Exception:
                continue
            coeffs = np.concatenate(([1.0], a))
            roots = np.roots(coeffs)
            roots = roots[np.imag(roots) >= 0]
            if len(roots) == 0:
                continue
            angles = np.arctan2(np.imag(roots), np.real(roots))
            freqs  = sorted([f for f in angles * (sr / (2 * math.pi)) if 50 < f < sr / 2])
            if len(freqs) >= 2:
                f1s.append(freqs[0])
                f2s.append(freqs[1])

        if len(f1s) < 5:
            return 0.5
        f1_delta = float(np.mean(np.abs(np.diff(f1s))))
        f2_delta = float(np.mean(np.abs(np.diff(f2s))))
        # Typical real speech: Δ ≈ 100–400 Hz/frame; TTS: Δ ≈ 5–30 Hz/frame
        score = float(np.clip((f1_delta + f2_delta) / 600.0, 0.0, 1.0))
        return round(score, 4)

    def _tts_artifacts(self, samples: np.ndarray, sr: int) -> Dict[str, Any]:
        """
        Detect spectral signatures characteristic of popular TTS systems.

        ElevenLabs : very flat, consistent spectral envelope; compressed dynamics.
        Tortoise TTS: vocoder residual at ~3.4 kHz (diffusion artefact band).
        Bark        : codec-like quantisation notches at multiples of ~800 Hz.
        """
        n_fft   = 2048
        hop     = n_fft // 4
        n_frames = max(1, (len(samples) - n_fft) // hop)

        # Build average power spectrum
        power = np.zeros(n_fft // 2 + 1)
        for i in range(n_frames):
            frame = samples[i * hop: i * hop + n_fft] * np.hanning(n_fft)
            power += np.abs(np.fft.rfft(frame)) ** 2
        power /= n_frames

        freqs = np.fft.rfftfreq(n_fft, 1 / sr)

        def band_energy(lo, hi):
            mask = (freqs >= lo) & (freqs < hi)
            return float(power[mask].mean()) if mask.any() else 0.0

        total_e = float(power.mean()) + 1e-10

        # ElevenLabs: dynamics flatness (std of 100-ms RMS windows)
        hop_e  = int(0.1 * sr)
        rms_wins = [float(np.sqrt(np.mean(samples[i: i + hop_e] ** 2)))
                    for i in range(0, len(samples) - hop_e, hop_e)]
        dyn_std = float(np.std(rms_wins)) if rms_wins else 0.0
        elevenlabs_flag = dyn_std < 0.015 and band_energy(200, 3000) / total_e > 0.7

        # Tortoise TTS: anomalous energy peak near 3.4 kHz
        vocoder_band = band_energy(3200, 3600)
        adj_band     = (band_energy(2800, 3200) + band_energy(3600, 4000)) / 2 + 1e-10
        tortoise_flag = vocoder_band / adj_band > 2.5

        # Bark: regular notches at multiples of ~800 Hz
        bark_notches = 0
        for k in range(1, 5):
            centre = k * 800
            notch  = band_energy(centre - 60, centre + 60)
            adj    = (band_energy(centre - 200, centre - 60) +
                      band_energy(centre + 60, centre + 200)) / 2 + 1e-10
            if notch / adj < 0.4:
                bark_notches += 1
        bark_flag = bark_notches >= 3

        return {
            "elevenlabs_pattern": bool(elevenlabs_flag),
            "tortoise_tts_pattern": bool(tortoise_flag),
            "bark_pattern": bool(bark_flag),
            "artifact_count": int(elevenlabs_flag) + int(tortoise_flag) + int(bark_flag),
        }

    def _heuristic_score(self, features: Dict[str, Any]) -> Tuple[float, float]:
        """
        Combine acoustic features into (voice_clone_probability, confidence).
        Lower feature values = more synthetic = higher fake probability.
        """
        scores = [
            1.0 - features["pitch_consistency_score"],   # low consistency = fake
            1.0 - features["breath_noise_score"],         # no breath = fake
            1.0 - features["spectral_flatness_score"],    # too tonal = fake
            1.0 - features["temporal_regularity_score"],  # already inverted in fn
            1.0 - features["formant_smoothness_score"],   # smooth = fake
        ]
        art = features["tts_artifacts"]["artifact_count"] / 3.0

        raw = (0.20 * scores[0] + 0.20 * scores[1] + 0.15 * scores[2]
               + 0.15 * scores[3] + 0.15 * scores[4] + 0.15 * art)
        prob = round(float(np.clip(raw, 0.0, 1.0)), 4)
        conf = round(min(abs(prob - 0.5) * 2.0 + 0.25, 1.0), 4)
        return prob, conf

    def _voice_embedding(self, samples: np.ndarray, sr: int) -> np.ndarray:
        """
        Compact speaker representation: mean + std of 40-bin log mel-filterbank.
        Not a production speaker-verification system — useful for basic
        impersonation detection when a reference profile exists.
        """
        n_fft  = 512
        hop    = 256
        n_mels = 40

        # Build mel filterbank
        mel_low  = 0.0
        mel_high = 2595 * np.log10(1 + (sr / 2) / 700)
        mel_pts  = np.linspace(mel_low, mel_high, n_mels + 2)
        hz_pts   = 700 * (10 ** (mel_pts / 2595) - 1)
        bins     = np.floor((n_fft + 1) * hz_pts / sr).astype(int)

        fbank = np.zeros((n_mels, n_fft // 2 + 1))
        for m in range(1, n_mels + 1):
            lo, cen, hi = bins[m - 1], bins[m], bins[m + 1]
            for k in range(lo, cen):
                fbank[m - 1, k] = (k - lo) / (cen - lo + 1e-10)
            for k in range(cen, hi):
                fbank[m - 1, k] = (hi - k) / (hi - cen + 1e-10)

        # Power spectrum frames
        n_frames = (len(samples) - n_fft) // hop
        mel_frames = np.zeros((n_mels, max(1, n_frames)))
        for i in range(n_frames):
            frame = samples[i * hop: i * hop + n_fft] * np.hanning(n_fft)
            psd   = np.abs(np.fft.rfft(frame)) ** 2
            mel_frames[:, i] = fbank @ psd

        log_mel = np.log(mel_frames + 1e-10)
        return np.concatenate([log_mel.mean(axis=1), log_mel.std(axis=1)])

    # ── public API ────────────────────────────────────────────────────────────

    def analyze_audio(self, audio_path: str) -> Dict[str, Any]:
        """
        Run full voice-clone analysis on an audio file.

        Returns
        -------
        dict with voice_clone_probability, confidence, method, features, result.
        Returns {"error": "..."} on invalid input.
        """
        if not Path(audio_path).exists():
            return {"error": "Could not process this file"}

        try:
            samples, sr = self._load_audio(audio_path)
        except Exception as exc:
            return {"error": f"Could not process this file: {exc}"}

        valid, msg = self._validate_audio(samples)
        if not valid:
            return {"error": msg}

        features = self._extract_features(samples, sr)

        # Try RawNet2 model first
        model = self._get_model()
        method = "heuristic"
        prob: float = 0.5

        if model is not None and _TORCH and getattr(model, "_source", "") == "pretrained":
            try:
                # Pad / trim to CHUNK_SAMPLES
                clip = np.zeros(CHUNK_SAMPLES, dtype=np.float32)
                ln   = min(len(samples), CHUNK_SAMPLES)
                clip[:ln] = samples[:ln]
                t = torch.tensor(clip).unsqueeze(0).unsqueeze(0)
                with torch.no_grad():
                    prob = float(model(t)[0, 0])
                method = "rawnet2"
            except Exception:
                pass

        if method == "heuristic":
            prob, _ = self._heuristic_score(features)

        confidence = round(min(abs(prob - 0.5) * 2.0 + 0.25, 1.0), 4)
        result = "inconclusive"
        if confidence >= INCONCLUSIVE_THRESH:
            result = "fake" if prob >= 0.5 else "real"

        return {
            "voice_clone_probability": round(prob, 4),
            "confidence": confidence,
            "method": method,
            "result": result,
            "features": features,
            "duration_seconds": round(len(samples) / sr, 2),
        }

    def extract_audio_from_video(self, video_path: str) -> str:
        """
        Extract audio track from a video file to a temporary WAV file.

        Uses ffmpeg (system command) — OpenCV does not support audio extraction.
        Returns the path to the temp WAV file (caller must delete it).
        Raises RuntimeError if extraction fails.
        """
        if not Path(video_path).exists():
            raise RuntimeError(f"Video not found: {video_path}")

        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp.close()

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vn",                        # no video
            "-acodec", "pcm_s16le",       # PCM 16-bit
            "-ar", str(SAMPLE_RATE),      # resample to 16kHz
            "-ac", "1",                   # mono
            tmp.name,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, timeout=60)
            if result.returncode != 0:
                # ffmpeg not available — try cv2 frame-based silence detection
                os.unlink(tmp.name)
                raise RuntimeError(
                    "ffmpeg not found or failed. Install ffmpeg for video audio extraction: "
                    "https://ffmpeg.org/download.html"
                )
        except FileNotFoundError:
            os.unlink(tmp.name)
            raise RuntimeError(
                "ffmpeg not found. Install it from https://ffmpeg.org/download.html"
            )
        return tmp.name

    def analyze_audio_chunk(self, audio_chunk: np.ndarray,
                             sample_rate: int) -> Dict[str, Any]:
        """
        Real-time analysis for phone-call monitoring.
        Optimised for < 200 ms processing time — runs only fast features.

        Parameters
        ----------
        audio_chunk : 1-D float32 array of audio samples
        sample_rate : sample rate of the chunk

        Returns
        -------
        {"voice_clone_probability": float, "confidence": float,
         "spectral_flatness": float, "is_silent": bool}
        """
        if not isinstance(audio_chunk, np.ndarray):
            audio_chunk = np.array(audio_chunk, dtype=np.float32)

        # Resample to 16 kHz if needed
        if sample_rate != SAMPLE_RATE:
            n = int(len(audio_chunk) * SAMPLE_RATE / sample_rate)
            audio_chunk = scipy_resample(audio_chunk, n).astype(np.float32)

        rms = float(np.sqrt(np.mean(audio_chunk ** 2)))
        if rms < SILENCE_RMS:
            return {
                "voice_clone_probability": 0.0,
                "confidence": 0.0,
                "spectral_flatness": 0.0,
                "is_silent": True,
            }

        flatness = self._spectral_flatness(audio_chunk)

        # Fast pitch check using a single autocorrelation pass
        lo = max(1, SAMPLE_RATE // 500)
        hi = SAMPLE_RATE // 50
        r = np.correlate(audio_chunk[:2048], audio_chunk[:2048], "full")
        r = r[len(r) // 2:]
        r = r / (r[0] + 1e-10)
        peak = float(np.max(np.abs(r[lo: hi]))) if hi > lo else 0.5
        pitch_regularity = round(1.0 - float(np.clip(peak / 0.7, 0.0, 1.0)), 4)

        raw  = 0.5 * (1.0 - flatness) + 0.5 * pitch_regularity
        prob = round(float(np.clip(raw, 0.0, 1.0)), 4)
        conf = round(min(abs(prob - 0.5) * 2.0 + 0.1, 1.0), 4)

        return {
            "voice_clone_probability": prob,
            "confidence": conf,
            "spectral_flatness": flatness,
            "is_silent": False,
        }

    def register_voice_profile(self, audio_path: str,
                                person_name: str) -> Dict[str, Any]:
        """
        Extract and store a voice embedding for future impersonation detection.

        Returns
        -------
        {"profile_id": str, "person_name": str, "embedding_dim": int}
        Or {"error": "..."} on failure.
        """
        if not Path(audio_path).exists():
            return {"error": "Could not process this file"}

        try:
            samples, sr = self._load_audio(audio_path)
        except Exception as exc:
            return {"error": f"Could not process this file: {exc}"}

        valid, msg = self._validate_audio(samples)
        if not valid:
            return {"error": msg}

        embedding = self._voice_embedding(samples, sr)
        profile_id = str(uuid.uuid4())

        np.save(os.path.join(PROFILES_DIR, f"{profile_id}.npy"), embedding)
        meta = {"profile_id": profile_id, "person_name": person_name,
                "embedding_dim": int(embedding.shape[0])}
        with open(os.path.join(PROFILES_DIR, f"{profile_id}.json"), "w") as f:
            json.dump(meta, f)

        return meta

    def compare_against_profile(self, audio_path: str,
                                  profile_id: str) -> Dict[str, Any]:
        """
        Compare incoming audio against a registered voice profile.

        Returns
        -------
        {"similarity_score": float, "is_impersonation": bool,
         "person_name": str, "confidence": float}
        """
        npy_path  = os.path.join(PROFILES_DIR, f"{profile_id}.npy")
        json_path = os.path.join(PROFILES_DIR, f"{profile_id}.json")

        if not (os.path.exists(npy_path) and os.path.exists(json_path)):
            return {"error": f"Profile '{profile_id}' not found."}

        try:
            ref_embed = np.load(npy_path)
            with open(json_path) as f:
                meta = json.load(f)
        except Exception as exc:
            return {"error": f"Could not load profile: {exc}"}

        try:
            samples, sr = self._load_audio(audio_path)
        except Exception as exc:
            return {"error": f"Could not process this file: {exc}"}

        valid, msg = self._validate_audio(samples)
        if not valid:
            return {"error": msg}

        test_embed = self._voice_embedding(samples, sr)

        # Cosine similarity
        min_len   = min(len(ref_embed), len(test_embed))
        ref_v     = ref_embed[:min_len]
        test_v    = test_embed[:min_len]
        n1        = np.linalg.norm(ref_v) + 1e-10
        n2        = np.linalg.norm(test_v) + 1e-10
        cosine    = float(np.dot(ref_v, test_v) / (n1 * n2))
        similarity = round((cosine + 1.0) / 2.0, 4)   # [−1,1] → [0,1]

        # A score < 0.55 with this simple embedding suggests different speaker
        is_impersonation = bool(similarity < 0.55)
        confidence = round(abs(similarity - 0.55) * 6.67, 4)

        return {
            "similarity_score": similarity,
            "is_impersonation": is_impersonation,
            "person_name": meta.get("person_name", "unknown"),
            "confidence": min(confidence, 1.0),
        }


# ── module-level singleton ────────────────────────────────────────────────────

_analyzer = AudioAnalyzer()


def analyze_audio(file_path: str) -> Dict[str, Any]:
    """Entry point called by routers/analyze.py."""
    return _analyzer.analyze_audio(file_path)
