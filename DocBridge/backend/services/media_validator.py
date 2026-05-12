"""
MediaValidator — gates all file inputs before analysis begins.
Enforces file type (magic bytes), size limits, and content coherence
for image, video, and audio uploads.
"""
import io
import os
import wave
import array
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ---------------------------------------------------------------------------
# Optional heavy dependencies — degrade gracefully when absent
# ---------------------------------------------------------------------------
try:
    from PIL import Image, ImageStat
    _PIL = True
except ImportError:
    _PIL = False

try:
    import cv2
    _CV2 = True
except ImportError:
    _CV2 = False

try:
    import numpy as np
    _NP = True
except ImportError:
    _NP = False

try:
    import soundfile as _sf_mod
    _SF = True
except ImportError:
    _SF = False

try:
    import librosa as _librosa_mod
    _LIBROSA = True
except ImportError:
    _LIBROSA = False

# ---------------------------------------------------------------------------
# Magic-byte signatures — list of (byte_offset, expected_bytes)
# ALL entries in a list must match to confirm the format.
# ---------------------------------------------------------------------------
_MAGIC: dict[str, list[tuple[int, bytes]]] = {
    "jpeg":  [(0, b"\xFF\xD8\xFF")],
    "png":   [(0, b"\x89PNG\r\n\x1a\n")],
    "webp":  [(0, b"RIFF"), (8, b"WEBP")],
    "bmp":   [(0, b"BM")],
    "mp4":   [(4, b"ftyp")],       # ISO Base Media: MP4, MOV, M4A all share ftyp box
    "avi":   [(0, b"RIFF"), (8, b"AVI ")],
    "webm":  [(0, b"\x1aE\xdf\xa3")],
    "mp3":   [(0, b"ID3")],        # ID3-tagged MP3
    "mp3r":  [(0, b"\xFF\xFB")],   # raw MP3 sync word variants
    "mp3r2": [(0, b"\xFF\xF3")],
    "mp3r3": [(0, b"\xFF\xF2")],
    "wav":   [(0, b"RIFF"), (8, b"WAVE")],
    "ogg":   [(0, b"OggS")],
    "flac":  [(0, b"fLaC")],
}

# extension → (media_category, accepted_magic_keys)
_EXT_MAP: dict[str, tuple[str, list[str]]] = {
    ".jpg":  ("image",  ["jpeg"]),
    ".jpeg": ("image",  ["jpeg"]),
    ".png":  ("image",  ["png"]),
    ".webp": ("image",  ["webp"]),
    ".bmp":  ("image",  ["bmp"]),
    ".mp4":  ("video",  ["mp4"]),
    ".mov":  ("video",  ["mp4"]),   # QuickTime = same ISO container
    ".avi":  ("video",  ["avi"]),
    ".webm": ("video",  ["webm"]),
    ".mp3":  ("audio",  ["mp3", "mp3r", "mp3r2", "mp3r3"]),
    ".wav":  ("audio",  ["wav"]),
    ".ogg":  ("audio",  ["ogg"]),
    ".m4a":  ("audio",  ["mp4"]),   # MPEG-4 audio container
    ".flac": ("audio",  ["flac"]),
}

_SIZE_LIMITS: dict[str, int] = {
    "image": 20 * 1024 * 1024,    # 20 MB
    "video": 200 * 1024 * 1024,   # 200 MB
    "audio": 50 * 1024 * 1024,    # 50 MB
}


# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

class ValidationError(Exception):
    """Raised internally when a coherence check fails."""


@dataclass
class ValidationResult:
    is_valid: bool
    file_type: str                    # 'image' | 'video' | 'audio' | ''
    error_message: Optional[str]
    file_metadata: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Validator
# ---------------------------------------------------------------------------

class MediaValidator:
    # Coherence thresholds
    IMAGE_MIN_DIM: int = 64
    IMAGE_STD_THRESHOLD: float = 10.0
    VIDEO_MAX_DURATION: int = 60      # seconds
    VIDEO_MIN_DURATION: int = 1       # seconds
    VIDEO_MIN_FRAMES: int = 24
    VIDEO_COHERENCE_RATIO: float = 0.5
    AUDIO_MIN_DURATION: float = 2.0   # seconds
    AUDIO_RMS_THRESHOLD: float = 0.001

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def validate(self, file_path: str) -> ValidationResult:
        """Run all validation steps and return a ValidationResult."""
        path = Path(file_path)
        if not path.exists():
            return ValidationResult(False, "", "File not found.", {})

        file_size = path.stat().st_size
        suffix = path.suffix.lower()

        # Step 1 — type detection (extension + magic bytes)
        category, fmt = self._detect_type(path, suffix)
        if not category:
            return ValidationResult(
                False, "",
                f"Unsupported or unrecognized file type '{suffix}'. "
                "Accepted images: JPEG, PNG, WebP, BMP. "
                "Accepted videos: MP4, MOV, AVI, WebM. "
                "Accepted audio: MP3, WAV, OGG, M4A, FLAC.",
                {},
            )

        # Step 2 — size limits
        limit = _SIZE_LIMITS[category]
        if file_size > limit:
            return ValidationResult(
                False, category,
                f"File size {file_size / (1024 * 1024):.1f} MB exceeds the "
                f"{limit // (1024 * 1024)} MB limit for {category} files.",
                {"size_bytes": file_size},
            )

        # Steps 3–5 — content coherence
        metadata: dict = {"size_bytes": file_size, "format": fmt}
        try:
            if category == "image":
                metadata.update(self._check_image(str(path)))
            elif category == "video":
                metadata.update(self._check_video(str(path)))
            elif category == "audio":
                metadata.update(self._check_audio(str(path)))
        except ValidationError as exc:
            return ValidationResult(False, category, str(exc), metadata)

        return ValidationResult(True, category, None, metadata)

    # ------------------------------------------------------------------
    # Step 1 — Type detection
    # ------------------------------------------------------------------

    def _detect_type(self, path: Path, suffix: str) -> tuple[str, str]:
        """Return (category, format_key) or ('', '') on mismatch/unknown."""
        if suffix not in _EXT_MAP:
            return "", ""

        category, valid_keys = _EXT_MAP[suffix]

        with open(path, "rb") as fh:
            header = fh.read(16)

        for key in valid_keys:
            checks = _MAGIC[key]
            if all(header[off: off + len(sig)] == sig for off, sig in checks):
                return category, key

        # Extension claimed one type but magic bytes say otherwise — reject.
        return "", ""

    # ------------------------------------------------------------------
    # Step 3 — Image coherence
    # ------------------------------------------------------------------

    def _check_image(self, file_path: str) -> dict:
        if not _PIL:
            return {"warning": "Pillow not installed — image coherence check skipped."}

        with Image.open(file_path) as img:
            width, height = img.size

            if width < self.IMAGE_MIN_DIM or height < self.IMAGE_MIN_DIM:
                raise ValidationError(
                    f"Image resolution {width}×{height} is below the minimum "
                    f"{self.IMAGE_MIN_DIM}×{self.IMAGE_MIN_DIM} pixels."
                )

            gray = img.convert("L")
            stat = ImageStat.Stat(gray)
            std_dev = stat.stddev[0]
            mean = stat.mean[0]

            # Solid color (std ≈ 0), all-black (mean ≈ 0), all-white (mean ≈ 255)
            if std_dev < self.IMAGE_STD_THRESHOLD:
                raise ValidationError(
                    "The uploaded image does not appear to contain meaningful visual content. "
                    "Please upload a real photo, screenshot, or video frame."
                )

            return {
                "width": width,
                "height": height,
                "mode": img.mode,
                "std_dev": round(std_dev, 2),
                "mean_luminance": round(mean, 2),
            }

    # ------------------------------------------------------------------
    # Step 4 — Video coherence
    # ------------------------------------------------------------------

    def _check_video(self, file_path: str) -> dict:
        if not _CV2:
            return {"warning": "opencv-python not installed — video coherence check skipped."}

        cap = cv2.VideoCapture(file_path)
        if not cap.isOpened():
            raise ValidationError("Could not open video file — it may be corrupt or in an unsupported codec.")

        fps = cap.get(cv2.CAP_PROP_FPS) or 0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()

        duration = frame_count / fps if fps > 0 else 0

        if duration > self.VIDEO_MAX_DURATION:
            raise ValidationError(
                f"Video duration {duration:.1f}s exceeds the {self.VIDEO_MAX_DURATION}s maximum. "
                "Please trim the video before uploading."
            )
        if duration < self.VIDEO_MIN_DURATION:
            raise ValidationError(
                f"Video must be at least {self.VIDEO_MIN_DURATION}s long. Got {duration:.2f}s."
            )
        if frame_count < self.VIDEO_MIN_FRAMES:
            raise ValidationError(
                f"Video must contain at least {self.VIDEO_MIN_FRAMES} frames. Got {frame_count}."
            )

        # Sample up to 10 evenly spaced frames and check each for visual content
        cap = cv2.VideoCapture(file_path)
        n_samples = min(10, frame_count)
        interval = max(1, frame_count // n_samples)
        passed = total = 0

        for i in range(n_samples):
            cap.set(cv2.CAP_PROP_POS_FRAMES, i * interval)
            ret, frame = cap.read()
            if not ret:
                continue
            total += 1
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            if gray.std() > self.IMAGE_STD_THRESHOLD:
                passed += 1

        cap.release()

        if total > 0 and (passed / total) < self.VIDEO_COHERENCE_RATIO:
            raise ValidationError(
                "The uploaded video does not appear to contain meaningful visual content."
            )

        return {
            "width": width,
            "height": height,
            "duration_seconds": round(duration, 2),
            "frame_count": frame_count,
            "fps": round(fps, 2),
        }

    # ------------------------------------------------------------------
    # Step 5 — Audio coherence
    # ------------------------------------------------------------------

    def _check_audio(self, file_path: str) -> dict:
        audio, sr = self._load_audio(file_path)
        if audio is None:
            return {"warning": "No audio library available — audio coherence check skipped."}

        n_samples = len(audio)
        duration = n_samples / sr if sr else 0

        if duration < self.AUDIO_MIN_DURATION:
            raise ValidationError(
                f"Audio must be at least {self.AUDIO_MIN_DURATION}s long. Got {duration:.2f}s."
            )

        rms = self._rms(audio)
        if rms < self.AUDIO_RMS_THRESHOLD:
            raise ValidationError(
                "Audio signal is silent or near-silent. "
                "Please upload a file with actual audio content."
            )

        return {
            "duration_seconds": round(duration, 2),
            "sample_rate": sr,
            "rms": round(rms, 6),
        }

    def _load_audio(self, file_path: str) -> tuple:
        """Try soundfile → librosa → stdlib wave. Returns (samples, sample_rate) or (None, None)."""
        if _SF:
            try:
                data, sr = _sf_mod.read(file_path, dtype="float32", always_2d=False)
                return list(data.flatten() if hasattr(data, "flatten") else data), sr
            except Exception:
                pass

        if _LIBROSA:
            try:
                data, sr = _librosa_mod.load(file_path, sr=None, mono=True)
                return list(data), sr
            except Exception:
                pass

        # stdlib fallback — WAV files only
        try:
            with wave.open(file_path, "rb") as wf:
                sr = wf.getframerate()
                n_frames = wf.getnframes()
                raw = wf.readframes(n_frames)
            raw_samples = array.array("h", raw)
            samples = [s / 32768.0 for s in raw_samples]
            return samples, sr
        except Exception:
            pass

        return None, None

    @staticmethod
    def _rms(samples) -> float:
        """Root-mean-square energy. Works with lists and numpy arrays."""
        if _NP:
            arr = np.array(samples, dtype=np.float32)
            return float(np.sqrt(np.mean(arr ** 2)))
        n = len(samples)
        if n == 0:
            return 0.0
        return math.sqrt(sum(s * s for s in samples) / n)


# ---------------------------------------------------------------------------
# Module-level convenience function (used by routers)
# ---------------------------------------------------------------------------

_validator = MediaValidator()


def validate_media(file_path: str) -> tuple[bool, str, str]:
    """
    Thin wrapper kept for router compatibility.
    Returns (is_valid, media_type, error_message).
    """
    result = _validator.validate(file_path)
    return result.is_valid, result.file_type, result.error_message or ""
