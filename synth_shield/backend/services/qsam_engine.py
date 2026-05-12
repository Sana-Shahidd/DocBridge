"""
QSAM — Quantum Signal Analysis Module.

Hybrid classical-quantum frequency analysis for deepfake / AI-generation detection.

Classical path  : 2D FFT on each colour channel → four frequency-domain features.
Quantum path    : Qiskit QFT circuit on an 8-qubit amplitude-encoded noise residual
                  → eigenstate probability distribution → KL divergence anomaly score.

The two paths are fused into a single composite anomaly_score (0.0–1.0).
Higher score = more likely AI-generated.
"""

import base64
import io
import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    from PIL import Image
    _PIL = True
except ImportError:
    _PIL = False

try:
    from scipy.signal import wiener as _wiener
    _SCIPY = True
except ImportError:
    _SCIPY = False

try:
    from qiskit import QuantumCircuit, transpile
    from qiskit.circuit.library import QFT
    from qiskit_aer import AerSimulator
    _QISKIT = True
except ImportError:
    _QISKIT = False


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

N_QUBITS = 8           # 2^8 = 256 amplitude samples fed into QFT circuit
_SIMULATOR: Optional[Any] = None   # lazy-initialised AerSimulator

# Composite score weights
_W = {
    "high_freq_ratio":  0.20,
    "symmetry_deficit": 0.15,
    "periodic_score":   0.25,
    "noise_floor":      0.15,
    "quantum_anomaly":  0.25,
}


# ---------------------------------------------------------------------------
# 1. Quantum circuit builder
# ---------------------------------------------------------------------------

def build_qft_circuit(n_qubits: int, state_vector: Optional[List[complex]] = None) -> "QuantumCircuit":
    """
    Build a Qiskit QFT circuit optionally initialised with a custom state vector.

    QFT decomposes the image noise signal into frequency eigenstates.
    Real camera sensors produce characteristic noise occupying specific
    eigenstates that AI generation cannot replicate.

    Parameters
    ----------
    n_qubits    : Number of qubits (circuit operates on 2^n_qubits amplitudes).
    state_vector: Optional complex unit vector of length 2^n_qubits.  When
                  supplied the circuit is initialised to this state before QFT
                  is applied, encoding the image noise residual.

    Returns
    -------
    QuantumCircuit ready for statevector simulation.
    """
    qc = QuantumCircuit(n_qubits)

    if state_vector is not None:
        # Amplitude-encode the noise residual; Qiskit normalises automatically.
        qc.initialize(state_vector, list(range(n_qubits)))
    else:
        # Flat superposition = baseline uniform frequency spectrum.
        qc.h(list(range(n_qubits)))

    qc.compose(QFT(n_qubits, do_swaps=True, inverse=False), inplace=True)
    qc.save_statevector()
    return qc


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_simulator() -> "AerSimulator":
    global _SIMULATOR
    if _SIMULATOR is None:
        _SIMULATOR = AerSimulator(method="statevector")
    return _SIMULATOR


def _run_quantum_analysis(noise_residual: np.ndarray) -> float:
    """
    Encode a noise residual into 8-qubit amplitudes, apply QFT, and compute
    a KL-divergence anomaly score relative to a uniform eigenstate distribution.

    Real Gaussian camera noise → near-uniform QFT output → low anomaly.
    Structured GAN/diffusion noise → concentrated eigenstates → high anomaly.
    """
    if not _QISKIT:
        return 0.0

    size = 2 ** N_QUBITS          # 256

    flat = noise_residual.flatten().astype(complex)
    if len(flat) >= size:
        samples = flat[:size]
    else:
        samples = np.zeros(size, dtype=complex)
        samples[: len(flat)] = flat

    norm = np.linalg.norm(samples)
    if norm < 1e-12:
        return 0.0                 # No signal → cannot score

    state_vector = (samples / norm).tolist()

    qc = build_qft_circuit(N_QUBITS, state_vector=state_vector)
    sim = _get_simulator()
    compiled = transpile(qc, sim)
    job = sim.run(compiled)
    result = job.result()

    sv = np.array(result.get_statevector())
    probs = np.abs(sv) ** 2
    probs = probs / (probs.sum() + 1e-15)   # renormalise for floating-point safety

    # KL divergence from uniform: D_KL(P || U) where U = 1/N for all states
    n_states = len(probs)
    eps = 1e-12
    kl_div = float(np.sum(probs * np.log((probs + eps) * n_states)))

    # Normalise: max possible KL div for pure single eigenstate = ln(N)
    max_kl = math.log(n_states)
    return min(kl_div / max_kl, 1.0)


def _fft_features(channel: np.ndarray) -> Dict[str, float]:
    """
    Extract four classical frequency-domain features from a single image channel.

    Returns
    -------
    high_freq_ratio  : Energy in outer 20 % of frequency space ÷ total energy.
    symmetry_deficit : 1 − symmetry_score  (higher = more asymmetric PSD).
    periodic_score   : Max autocorrelation of row-energy at non-DC lags (GAN tiles).
    noise_floor      : Normalised mean energy in the top 5 % frequency band.
    """
    h, w = channel.shape
    fft2 = np.fft.fftshift(np.fft.fft2(channel.astype(float)))
    psd = np.abs(fft2) ** 2
    total = psd.sum()
    if total < 1e-10:
        return {"high_freq_ratio": 0.0, "symmetry_deficit": 0.0,
                "periodic_score": 0.0, "noise_floor": 0.0}

    # --- Feature 1: High-frequency energy ratio ---------------------------
    cy, cx = h // 2, w // 2
    Y, X = np.ogrid[:h, :w]
    dist = np.sqrt((Y - cy) ** 2 + (X - cx) ** 2)
    r_max = min(cy, cx)
    outer_mask = dist > 0.8 * r_max
    high_freq_ratio = float(psd[outer_mask].sum() / total)

    # --- Feature 2: PSD symmetry (top/bottom half) ------------------------
    half = h // 2
    top = psd[:half, :]
    bottom = np.flipud(psd[h - half:, :])
    sym_diff = np.mean(np.abs(top - bottom))
    sym_ref = np.mean(top + bottom) / 2 + 1e-10
    symmetry_deficit = float(min(sym_diff / sym_ref, 1.0))

    # --- Feature 3: Periodic row-energy (GAN tiling) ----------------------
    row_energy = psd.sum(axis=1)
    row_norm = row_energy / (row_energy.max() + 1e-10)
    centred = row_norm - row_norm.mean()
    ac = np.correlate(centred, centred, mode="full")[len(centred):]
    ac = ac / (ac[0] + 1e-10)
    lag_lo = max(1, h // 10)
    lag_hi = h // 2
    periodic_score = float(min(np.max(np.abs(ac[lag_lo:lag_hi])), 1.0)) if lag_hi > lag_lo else 0.0

    # --- Feature 4: Noise floor -------------------------------------------
    top5_row = int(h * 0.95)
    noise_floor = float(
        psd[top5_row:, :].mean() / (total / (h * w) + 1e-10)
    )
    noise_floor = min(noise_floor / 10.0, 1.0)   # empirical normalisation

    return {
        "high_freq_ratio": high_freq_ratio,
        "symmetry_deficit": symmetry_deficit,
        "periodic_score": periodic_score,
        "noise_floor": noise_floor,
    }


def _average_fft_features(channels: List[np.ndarray]) -> Dict[str, float]:
    all_f = [_fft_features(ch) for ch in channels]
    keys = all_f[0].keys()
    return {k: float(np.mean([f[k] for f in all_f])) for k in keys}


def _generate_heatmap(noise_residual: np.ndarray) -> Optional[str]:
    """Render noise residual magnitude as a base64-encoded PNG heatmap."""
    if not _PIL:
        return None
    try:
        mag = np.abs(noise_residual)
        mag = mag - mag.min()
        max_v = mag.max()
        if max_v > 1e-10:
            mag = mag / max_v
        img_arr = (mag * 255).astype(np.uint8)
        img = Image.fromarray(img_arr, mode="L").convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# 2. Main image analyser
# ---------------------------------------------------------------------------

def analyze_image(image_path: str) -> Dict[str, Any]:
    """
    Run full QSAM analysis on an image file.

    Returns
    -------
    dict with keys:
        anomaly_score    — float 0.0–1.0  (higher = more likely AI-generated)
        high_freq_ratio  — float
        symmetry_deficit — float
        periodic_score   — float
        noise_floor      — float
        quantum_anomaly  — float  (0.0 if Qiskit unavailable)
        heatmap          — base64 PNG of noise residual, or None
        anomalies        — list[str] human-readable flags
        details          — str
    """
    if not _PIL:
        return _unavailable("Pillow not installed.")
    if not _QISKIT:
        return _unavailable("Qiskit / qiskit-aer not installed — quantum analysis unavailable.")

    try:
        with Image.open(image_path) as img:
            rgb = img.convert("RGB")
            arr = np.array(rgb, dtype=float)   # H × W × 3
    except Exception as exc:
        return _unavailable(f"Could not load image: {exc}")

    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    gray = 0.299 * r + 0.587 * g + 0.114 * b

    # Classical FFT features (averaged across channels)
    fft_f = _average_fft_features([r, g, b])

    # Noise residual for quantum path
    noise = _extract_noise_residual(gray)

    # Quantum QFT path
    q_score = _run_quantum_analysis(noise)

    # Composite score
    raw = (
        _W["high_freq_ratio"]  * fft_f["high_freq_ratio"]
        + _W["symmetry_deficit"] * fft_f["symmetry_deficit"]
        + _W["periodic_score"]   * fft_f["periodic_score"]
        + _W["noise_floor"]      * fft_f["noise_floor"]
        + _W["quantum_anomaly"]  * q_score
    )
    anomaly_score = round(min(raw, 1.0), 4)

    anomalies: List[str] = []
    if fft_f["high_freq_ratio"] > 0.35:
        anomalies.append("Elevated high-frequency energy — possible compression artefact or GAN texture.")
    if fft_f["periodic_score"] > 0.50:
        anomalies.append("Periodic frequency pattern detected — possible GAN tiling artefact.")
    if fft_f["symmetry_deficit"] > 0.40:
        anomalies.append("Asymmetric power spectral density — inconsistent with natural camera noise.")
    if q_score > 0.55:
        anomalies.append(
            "Quantum eigenstate distribution diverges from expected PRNU pattern — "
            "noise residual does not match real-sensor characteristics."
        )

    heatmap = _generate_heatmap(noise)

    return {
        "anomaly_score": anomaly_score,
        "high_freq_ratio": round(fft_f["high_freq_ratio"], 4),
        "symmetry_deficit": round(fft_f["symmetry_deficit"], 4),
        "periodic_score": round(fft_f["periodic_score"], 4),
        "noise_floor": round(fft_f["noise_floor"], 4),
        "quantum_anomaly": round(q_score, 4),
        "heatmap": heatmap,
        "anomalies": anomalies,
        "details": "QSAM analysis complete.",
    }


# ---------------------------------------------------------------------------
# 3. PRNU fingerprint extraction
# ---------------------------------------------------------------------------

def extract_prnu_fingerprint(image_path: str) -> Optional[np.ndarray]:
    """
    Extract the PRNU (Photo Response Non-Uniformity) noise residual.

    Applies a Wiener filter to estimate the 'clean' scene, then subtracts
    it from the original to isolate sensor-specific noise.

    Returns the 2-D noise residual array (float64), or None on error.
    """
    if not _PIL:
        return None
    try:
        with Image.open(image_path) as img:
            gray = np.array(img.convert("L"), dtype=float) / 255.0
    except Exception:
        return None

    return _extract_noise_residual(gray)


def _extract_noise_residual(gray: np.ndarray) -> np.ndarray:
    """Wiener-filter denoising → subtract to isolate noise residual."""
    if _SCIPY:
        clean = _wiener(gray, mysize=5)
    else:
        # Pure-numpy fallback: uniform 5×5 box filter
        from numpy.lib.stride_tricks import sliding_window_view
        pad = 2
        padded = np.pad(gray, pad, mode="reflect")
        windows = sliding_window_view(padded, (5, 5))
        clean = windows.mean(axis=(-2, -1))

    return gray - clean


# ---------------------------------------------------------------------------
# 4. Fingerprint comparison
# ---------------------------------------------------------------------------

def compare_fingerprints(fp1: np.ndarray, fp2: np.ndarray) -> float:
    """
    Compute normalised cross-correlation between two PRNU fingerprints.

    Returns
    -------
    float in [0.0, 1.0] where 1.0 = identical device, 0.5 = no correlation.
    """
    if fp1.shape != fp2.shape:
        h = min(fp1.shape[0], fp2.shape[0])
        w = min(fp1.shape[1], fp2.shape[1])
        fp1 = fp1[:h, :w]
        fp2 = fp2[:h, :w]

    f1 = fp1.flatten().astype(float)
    f2 = fp2.flatten().astype(float)

    n1 = np.linalg.norm(f1)
    n2 = np.linalg.norm(f2)

    if n1 < 1e-10 or n2 < 1e-10:
        return 0.5   # undefined → neutral

    corr = float(np.dot(f1, f2) / (n1 * n2))
    return (corr + 1.0) / 2.0   # map [-1, 1] → [0, 1]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _unavailable(reason: str) -> Dict[str, Any]:
    return {
        "anomaly_score": 0.0,
        "high_freq_ratio": 0.0,
        "symmetry_deficit": 0.0,
        "periodic_score": 0.0,
        "noise_floor": 0.0,
        "quantum_anomaly": 0.0,
        "heatmap": None,
        "anomalies": [],
        "details": reason,
    }


# ---------------------------------------------------------------------------
# Router-facing wrapper (called by routers/analyze.py)
# ---------------------------------------------------------------------------

def run_qsam(file_path: str, media_type: str) -> Dict[str, Any]:
    """
    Entry point called by the analyze router.

    For images: runs full hybrid quantum-classical analysis.
    For video/audio: returns placeholder (frame-level support planned).
    """
    if media_type != "image":
        return {
            "score": 0.0,
            "anomalies": [],
            "heatmap": None,
            "details": f"QSAM image analysis only (received media_type='{media_type}').",
        }

    result = analyze_image(file_path)
    return {
        "score": result["anomaly_score"],
        "anomalies": result["anomalies"],
        "heatmap": result["heatmap"],
        "high_freq_ratio": result["high_freq_ratio"],
        "symmetry_deficit": result["symmetry_deficit"],
        "periodic_score": result["periodic_score"],
        "noise_floor": result["noise_floor"],
        "quantum_anomaly": result["quantum_anomaly"],
        "details": result["details"],
    }
