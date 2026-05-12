"""
MetadataVerifier — EXIF forensics, Error Level Analysis, and content anchoring.

Detects tampered, AI-generated, or composited media through:
  • Full EXIF extraction and red-flag scoring
  • Error Level Analysis (ELA) for localised compositing detection
  • Video metadata and deepfake-encoder fingerprinting
  • SHA-256 content hash anchoring for provenance tracking
"""

import base64
import hashlib
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    from PIL import Image, ImageChops, ImageEnhance
    _PIL = True
except ImportError:
    _PIL = False

try:
    import exifread
    _EXIFREAD = True
except ImportError:
    _EXIFREAD = False

try:
    import cv2
    _CV2 = True
except ImportError:
    _CV2 = False

# ── constants ─────────────────────────────────────────────────────────────────

# Editing software keywords that indicate post-processing
_EDITING_SOFTWARE = {
    "photoshop", "lightroom", "gimp", "affinity", "capture one",
    "darktable", "rawtherapee", "paintshop", "luminar", "snapseed",
    "facetune", "meitu", "deepfacelab", "faceswap", "simswap",
    "stable diffusion", "midjourney", "dall-e", "firefly",
}

# Encoder strings produced by known deepfake pipelines
_DEEPFAKE_ENCODERS = {
    "deepfacelab", "faceswap", "simswap", "first order model",
    "wav2lip", "sadtalker", "diffusers", "animatediff",
}

# EXIF fields that real cameras never write
_SYNTHETIC_EXIF_HINTS = {
    "image.imagedescription",     # sometimes injected by generators
    "exif.usercomment",           # occasionally contains model name
}

# ELA threshold for "high response" pixels (0–255 scale)
_ELA_PIXEL_THRESHOLD = 15
# Quality at which the image is resaved for ELA
_ELA_RESAVE_QUALITY = 95
# Amplification factor for ELA difference image
_ELA_AMPLIFY = 10

# Timestamp mismatch tolerance (seconds)
_TIMESTAMP_TOLERANCE_S = 3600

# Hash anchor store path
_ANCHOR_STORE = "models/hash_anchors.json"


# ═════════════════════════════════════════════════════════════════════════════
# MetadataVerifier
# ═════════════════════════════════════════════════════════════════════════════

class MetadataVerifier:

    # ── 1. Image metadata + ELA ───────────────────────────────────────────────

    def verify_image_metadata(self, image_path: str) -> Dict[str, Any]:
        """
        Full EXIF forensics + Error Level Analysis on an image file.

        Returns
        -------
        {
            "exif_flags":              list[str],
            "ela_score":               float,   # 0–1, higher = more suspicious
            "ela_image_base64":        str|None, # amplified diff PNG
            "metadata_suspicion_score":float,   # 0–1 combined score
            "raw_exif":                dict,
        }
        """
        if not Path(image_path).exists():
            return _error("File not found.")

        raw_exif   = self._extract_exif(image_path)
        exif_flags = self._score_exif_flags(image_path, raw_exif)
        ela_score, ela_b64 = self._run_ela(image_path)

        # Weighted combination: EXIF flags contribute up to 0.60, ELA up to 0.40
        flag_score = min(len(exif_flags) * 0.15, 0.60)
        suspicion  = round(float(np.clip(flag_score * 0.60 + ela_score * 0.40, 0.0, 1.0)), 4)

        return {
            "exif_flags":               exif_flags,
            "ela_score":                round(ela_score, 4),
            "ela_image_base64":         ela_b64,
            "metadata_suspicion_score": suspicion,
            "raw_exif":                 raw_exif,
        }

    # ── EXIF helpers ──────────────────────────────────────────────────────────

    def _extract_exif(self, image_path: str) -> Dict[str, str]:
        """Return dict of EXIF tag → string value, or empty dict."""
        if not _EXIFREAD:
            return {}
        try:
            with open(image_path, "rb") as f:
                tags = exifread.process_file(f, details=False, strict=False)
            return {str(k): str(v) for k, v in tags.items()}
        except Exception:
            return {}

    def _score_exif_flags(self, image_path: str,
                           raw_exif: Dict[str, str]) -> List[str]:
        """Return list of human-readable red flags found in the EXIF data."""
        flags: List[str] = []
        exif_lower = {k.lower(): v.lower() for k, v in raw_exif.items()}

        # a. No device info — AI images have no Make/Model
        has_make  = any("image.make"  in k for k in exif_lower)
        has_model = any("image.model" in k for k in exif_lower)
        if not has_make and not has_model:
            flags.append("No camera Make/Model found — consistent with AI-generated images.")

        # b. Software tag reveals editing or generation tool
        software_val = exif_lower.get("image.software", "")
        for kw in _EDITING_SOFTWARE:
            if kw in software_val:
                flags.append(f"Software tag indicates post-processing tool: '{software_val}'.")
                break

        # c. Timestamp inconsistency between file mtime and EXIF DateTime
        exif_dt_str = (raw_exif.get("Image DateTime")
                       or raw_exif.get("EXIF DateTimeOriginal")
                       or raw_exif.get("EXIF DateTimeDigitized"))
        if exif_dt_str:
            try:
                exif_ts = datetime.strptime(
                    exif_dt_str.strip(), "%Y:%m:%d %H:%M:%S"
                ).replace(tzinfo=timezone.utc).timestamp()
                file_mtime = Path(image_path).stat().st_mtime
                delta = abs(file_mtime - exif_ts)
                if delta > _TIMESTAMP_TOLERANCE_S:
                    flags.append(
                        f"Timestamp mismatch: EXIF says {exif_dt_str!r} but "
                        f"file modification time differs by {delta / 3600:.1f} hours."
                    )
            except ValueError:
                flags.append(f"Unparseable EXIF timestamp: '{exif_dt_str}'.")

        # d. Missing GPS — smartphones almost always embed GPS unless stripped
        has_gps = any("gps" in k for k in exif_lower)
        if not has_gps and has_make:
            # Only flag if device info present but GPS is absent (stripped?)
            flags.append(
                "GPS metadata absent — may have been stripped to hide origin location."
            )

        # e. Unusual EXIF fields that generators sometimes inject
        for key_lower in exif_lower:
            if any(hint in key_lower for hint in _SYNTHETIC_EXIF_HINTS):
                val = exif_lower[key_lower]
                for kw in _EDITING_SOFTWARE:
                    if kw in val:
                        flags.append(
                            f"EXIF field '{key_lower}' contains generation/editing keyword."
                        )
                        break

        # f. Empty EXIF altogether — almost all real images have some fields
        if not raw_exif:
            flags.append("No EXIF metadata present — common in AI-generated or scrubbed images.")

        return flags

    # ── ELA ───────────────────────────────────────────────────────────────────

    def _run_ela(self, image_path: str) -> Tuple[float, Optional[str]]:
        """
        Error Level Analysis.

        Resaves the image at JPEG quality 95, then computes the amplified
        difference.  Regions that were already JPEG-compressed at lower quality
        (composited areas, deepfake faces) show higher residual than untouched
        regions.

        Returns (ela_score 0–1, base64-encoded PNG of amplified diff or None).
        """
        if not _PIL:
            return 0.0, None

        try:
            original = Image.open(image_path).convert("RGB")
        except Exception:
            return 0.0, None

        # Resave at quality 95 into an in-memory buffer
        buf = io.BytesIO()
        original.save(buf, format="JPEG", quality=_ELA_RESAVE_QUALITY)
        buf.seek(0)
        resaved = Image.open(buf).convert("RGB")

        # Amplified pixel-level difference
        diff = ImageChops.difference(original, resaved)
        diff_arr = np.array(diff, dtype=np.float32)
        amplified_arr = np.clip(diff_arr * _ELA_AMPLIFY, 0, 255).astype(np.uint8)
        amplified_img = Image.fromarray(amplified_arr)

        # ELA score: fraction of pixels with high residual in ANY channel
        high_response = (amplified_arr > _ELA_PIXEL_THRESHOLD).any(axis=-1)
        ela_score = float(high_response.mean())   # 0–1

        # Enhance contrast for frontend display
        enhanced = ImageEnhance.Contrast(amplified_img).enhance(2.0)
        out_buf = io.BytesIO()
        enhanced.save(out_buf, format="PNG")
        ela_b64 = base64.b64encode(out_buf.getvalue()).decode("utf-8")

        return round(ela_score, 4), ela_b64

    # ── 2. Video integrity ────────────────────────────────────────────────────

    def verify_video_integrity(self, video_path: str) -> Dict[str, Any]:
        """
        Hash + metadata inspection for video files.

        Returns
        -------
        {
            "file_hash":       str,
            "seen_before":     bool,
            "codec":           str,
            "resolution":      str,
            "fps":             float,
            "duration_seconds":float,
            "encoder":         str,
            "encoder_flags":   list[str],
            "integrity_score": float,   # 0 = clean, 1 = very suspicious
        }
        """
        if not Path(video_path).exists():
            return _error("File not found.")

        file_hash  = _sha256(video_path)
        seen_before = self._hash_seen_before(file_hash)

        # Video metadata via OpenCV
        codec = resolution = encoder = "unknown"
        fps = duration = 0.0

        if _CV2:
            cap = cv2.VideoCapture(video_path)
            if cap.isOpened():
                raw_fps    = cap.get(cv2.CAP_PROP_FPS)
                fps        = round(raw_fps, 2) if raw_fps else 0.0
                fc         = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                duration   = round(fc / fps, 2) if fps > 0 else 0.0
                w          = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                h          = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                resolution = f"{w}x{h}"
                fourcc_int = int(cap.get(cv2.CAP_PROP_FOURCC))
                codec      = "".join(chr((fourcc_int >> (8 * i)) & 0xFF)
                                     for i in range(4)).strip("\x00")
                cap.release()

        # Try ffprobe for encoder tag (subprocess)
        encoder = self._probe_encoder(video_path)

        # Flag deepfake encoders
        encoder_flags: List[str] = []
        enc_lower = encoder.lower()
        for kw in _DEEPFAKE_ENCODERS:
            if kw in enc_lower:
                encoder_flags.append(
                    f"Encoder string '{encoder}' matches known deepfake pipeline."
                )

        # Unusual codec/fps combos common in synthetic video
        if fps in (0.0,) and duration == 0.0:
            encoder_flags.append("Could not read video stream — file may be corrupt or synthesised.")
        if fps > 0 and fps not in (23.976, 24.0, 25.0, 29.97, 30.0, 50.0, 59.94, 60.0):
            encoder_flags.append(
                f"Non-standard frame rate {fps} fps — uncommon for real camera footage."
            )

        integrity_score = round(min(len(encoder_flags) * 0.35, 1.0), 4)

        return {
            "file_hash":        file_hash,
            "seen_before":      seen_before,
            "codec":            codec,
            "resolution":       resolution,
            "fps":              fps,
            "duration_seconds": duration,
            "encoder":          encoder,
            "encoder_flags":    encoder_flags,
            "integrity_score":  integrity_score,
        }

    def _probe_encoder(self, video_path: str) -> str:
        """Use ffprobe to extract encoder tag, falling back to 'unknown'."""
        import subprocess
        try:
            result = subprocess.run(
                [
                    "ffprobe", "-v", "quiet",
                    "-show_entries", "format_tags=encoder",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    video_path,
                ],
                capture_output=True, text=True, timeout=10,
            )
            enc = result.stdout.strip()
            return enc if enc else "unknown"
        except Exception:
            return "unknown"

    def _hash_seen_before(self, file_hash: str) -> bool:
        """Return True if this hash has been anchored before."""
        anchors = _load_anchors()
        return any(a.get("hash") == file_hash for a in anchors)

    # ── 3. Content hash anchor ────────────────────────────────────────────────

    def anchor_content_hash(self, file_path: str, content_type: str) -> str:
        """
        Compute SHA-256 of a file and store it as a provenance anchor.

        Anchors are persisted in models/hash_anchors.json so that re-uploads
        of the same (or tampered) file can be detected across sessions.

        Returns
        -------
        The hex SHA-256 hash (the provenance anchor ID).
        """
        if not Path(file_path).exists():
            raise FileNotFoundError(f"File not found: {file_path}")

        file_hash = _sha256(file_path)
        anchors   = _load_anchors()

        # Only append if not already present
        if not any(a.get("hash") == file_hash for a in anchors):
            anchors.append({
                "hash":         file_hash,
                "content_type": content_type,
                "anchored_at":  datetime.now(timezone.utc).isoformat(),
                "file_name":    Path(file_path).name,
            })
            _save_anchors(anchors)

        return file_hash


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _load_anchors() -> List[Dict]:
    os.makedirs(os.path.dirname(_ANCHOR_STORE) or ".", exist_ok=True)
    if not Path(_ANCHOR_STORE).exists():
        return []
    try:
        with open(_ANCHOR_STORE) as f:
            return json.load(f)
    except Exception:
        return []


def _save_anchors(anchors: List[Dict]) -> None:
    os.makedirs(os.path.dirname(_ANCHOR_STORE) or ".", exist_ok=True)
    with open(_ANCHOR_STORE, "w") as f:
        json.dump(anchors, f, indent=2)


def _error(msg: str) -> Dict[str, Any]:
    return {
        "exif_flags": [],
        "ela_score": 0.0,
        "ela_image_base64": None,
        "metadata_suspicion_score": 0.0,
        "raw_exif": {},
        "error": msg,
    }


# ── module-level singleton + router-facing wrapper ────────────────────────────

_verifier = MetadataVerifier()


def verify_metadata(file_path: str) -> Dict[str, Any]:
    """Entry point called by routers/analyze.py (image files)."""
    return _verifier.verify_image_metadata(file_path)
