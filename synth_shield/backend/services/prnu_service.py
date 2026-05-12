"""
PRNU Device Fingerprint Service.

Photo Response Non-Uniformity (PRNU) is the pixel-level gain variation caused
by manufacturing imperfections in every camera sensor.  It is unique to each
device, survives JPEG recompression, and persists even after EXIF stripping.

Pipeline
--------
  image → grayscale float32
        → Wiener denoising  (scipy.signal.wiener)
        → subtract clean estimate  →  noise_residual
        → high-pass filter (Gaussian subtraction)
        → zero-mean / unit-variance normalisation
        → resize to 256×256 for uniform comparison
        = PRNU fingerprint (numpy float32 array)

Multiple residuals from the same device are averaged to form a stable
device fingerprint.  Unknown images are matched against registered
fingerprints with Normalised Cross-Correlation (NCC).
Match threshold: NCC ≥ 0.85.
"""

import io
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

try:
    from scipy.signal import wiener as _wiener
    from scipy.ndimage import gaussian_filter
    _SCIPY = True
except ImportError:
    _SCIPY = False

try:
    import cv2
    _CV2 = True
except ImportError:
    _CV2 = False

from database import DeviceFingerprint, SessionLocal

# ── constants ─────────────────────────────────────────────────────────────────

_MATCH_THRESHOLD  = 0.85    # NCC score required to declare a device match
_FP_SIZE          = (256, 256)   # standard size for all stored fingerprints
_WIENER_WINDOW    = 3       # Wiener filter neighbourhood (pixels)


# ═════════════════════════════════════════════════════════════════════════════
# PRNUService
# ═════════════════════════════════════════════════════════════════════════════

class PRNUService:

    # ── 1. Extract PRNU residual ──────────────────────────────────────────────

    def extract_prnu(self, image_path: str) -> Optional[np.ndarray]:
        """
        Extract the PRNU noise fingerprint from a single image.

        Steps:
          1. Load as float32 luminance (0–1 range).
          2. Estimate clean signal with Wiener denoising.
          3. Subtract: noise_residual = original − clean.
          4. Remove low-frequency scene content with a high-pass Gaussian.
          5. Normalise to zero-mean, unit-variance.
          6. Resize to 256×256 for uniform comparison.

        Returns a float32 numpy array or None on failure.
        """
        if not Path(image_path).exists():
            return None
        if not _SCIPY or not _CV2:
            return None

        img_bgr = cv2.imread(image_path)
        if img_bgr is None:
            return None

        # Luminance channel in [0, 1]
        gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0

        # Step 2 — Wiener denoising
        clean = _wiener(gray, mysize=_WIENER_WINDOW).astype(np.float32)

        # Step 3 — noise residual
        residual = gray - clean

        # Step 4 — high-pass: remove remaining low-frequency scene content
        low_freq = gaussian_filter(residual, sigma=2.0).astype(np.float32)
        hp_residual = residual - low_freq

        # Step 5 — normalise
        std = float(np.std(hp_residual))
        if std < 1e-9:
            return None
        normalised = ((hp_residual - hp_residual.mean()) / std).astype(np.float32)

        # Step 6 — resize to standard comparison size
        resized = cv2.resize(normalised, _FP_SIZE, interpolation=cv2.INTER_AREA)
        return resized

    # ── 2. Estimate device fingerprint from multiple images ───────────────────

    def estimate_device_fingerprint(
        self, image_paths: List[str]
    ) -> Optional[np.ndarray]:
        """
        Average PRNU residuals from multiple images to produce a stable
        device fingerprint.  The more images, the more accurate the result
        (20+ images recommended; single-image registration also works).

        Returns None if no image could be processed.
        """
        residuals = []
        for path in image_paths:
            fp = self.extract_prnu(path)
            if fp is not None:
                residuals.append(fp)

        if not residuals:
            return None

        avg = np.mean(np.stack(residuals, axis=0), axis=0).astype(np.float32)

        # Re-normalise the averaged result
        std = float(np.std(avg))
        if std < 1e-9:
            return avg
        return ((avg - avg.mean()) / std).astype(np.float32)

    # ── 3. Register a device ──────────────────────────────────────────────────

    def register_device(
        self,
        device_name:      str,
        owner_org:        str,
        reference_images: List[str],
    ) -> Dict[str, Any]:
        """
        Build a device fingerprint from reference images and persist it in the
        DeviceFingerprint table.

        Returns
        -------
        {"device_id", "device_name", "owner_org", "images_used",
         "fingerprint_quality", "status"}
        """
        fingerprint = self.estimate_device_fingerprint(reference_images)
        n_valid     = sum(
            1 for p in reference_images
            if Path(p).exists() and self.extract_prnu(p) is not None
        )

        fp_bytes:           Optional[bytes] = None
        fingerprint_quality                  = 0.0

        if fingerprint is not None:
            fp_bytes            = _serialize(fingerprint)
            fingerprint_quality = _quality_score(fingerprint, n_valid)

        device_id = uuid.uuid4().hex

        db = SessionLocal()
        try:
            record = DeviceFingerprint(
                id               = device_id,
                device_name      = device_name,
                owner_org        = owner_org,
                prnu_fingerprint = fp_bytes,
            )
            db.add(record)
            db.commit()
        finally:
            db.close()

        return {
            "device_id":           device_id,
            "device_name":         device_name,
            "owner_org":           owner_org,
            "images_used":         n_valid,
            "fingerprint_quality": round(fingerprint_quality, 4),
            "status":              "registered" if fp_bytes else "registered_no_fingerprint",
        }

    # ── 4. Identify device ────────────────────────────────────────────────────

    def identify_device(self, image_path: str) -> Dict[str, Any]:
        """
        Extract PRNU from a query image and compare it against every registered
        device fingerprint.

        Returns
        -------
        {
            "matched_device": str | None,   # None if best NCC < 0.85
            "match_score":    float,
            "all_scores":     [{"device_id", "device_name", "owner_org", "score"}, …],
            "confidence":     str,
        }
        """
        if not _SCIPY or not _CV2:
            return _unavailable("PRNU analysis libraries not installed.")

        query_fp = self.extract_prnu(image_path)
        if query_fp is None:
            return {
                "matched_device": None, "match_score": 0.0,
                "all_scores": [], "confidence": "unavailable",
                "error": "Could not extract PRNU from the supplied image.",
            }

        db = SessionLocal()
        try:
            devices = db.query(DeviceFingerprint).all()
        finally:
            db.close()

        all_scores: List[Dict[str, Any]] = []
        best_score  = -1.0
        best_device = None

        for dev in devices:
            if not dev.prnu_fingerprint:
                continue
            ref_fp = _deserialize(dev.prnu_fingerprint)
            if ref_fp is None:
                continue
            score = _ncc(query_fp, ref_fp)
            all_scores.append({
                "device_id":   dev.id,
                "device_name": dev.device_name,
                "owner_org":   dev.owner_org or "",
                "score":       round(score, 4),
            })
            if score > best_score:
                best_score  = score
                best_device = dev.device_name

        all_scores.sort(key=lambda x: -x["score"])

        matched = best_device if best_score >= _MATCH_THRESHOLD else None

        return {
            "matched_device": matched,
            "match_score":    round(max(best_score, 0.0), 4),
            "all_scores":     all_scores,
            "confidence":     _confidence_label(best_score),
        }

    # ── 5. Link two images by device ──────────────────────────────────────────

    def link_images_by_device(
        self, image_path_1: str, image_path_2: str
    ) -> Dict[str, Any]:
        """
        Determine whether two images were captured by the same physical device
        by comparing their PRNU residuals.

        Returns
        -------
        {"same_device": bool, "correlation_score": float, "confidence": str}
        """
        if not _SCIPY or not _CV2:
            return _unavailable("PRNU analysis libraries not installed.")

        fp1 = self.extract_prnu(image_path_1)
        fp2 = self.extract_prnu(image_path_2)

        if fp1 is None or fp2 is None:
            missing = []
            if fp1 is None: missing.append("image 1")
            if fp2 is None: missing.append("image 2")
            return {
                "same_device":       False,
                "correlation_score": 0.0,
                "confidence":        "unavailable",
                "error":             f"Could not extract PRNU from: {', '.join(missing)}.",
            }

        score = _ncc(fp1, fp2)
        return {
            "same_device":       bool(score >= _MATCH_THRESHOLD),
            "correlation_score": round(score, 4),
            "confidence":        _confidence_label(score),
        }


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _serialize(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    np.save(buf, arr)
    return buf.getvalue()


def _deserialize(data: bytes) -> Optional[np.ndarray]:
    try:
        return np.load(io.BytesIO(data)).astype(np.float32)
    except Exception:
        return None


def _ncc(fp1: np.ndarray, fp2: np.ndarray) -> float:
    """Normalised Cross-Correlation of two fingerprint arrays → [−1, 1]."""
    a = fp1.flatten().astype(np.float64)
    b = fp2.flatten().astype(np.float64)

    # Handle size mismatch (different image dimensions at registration time)
    if a.shape != b.shape:
        if _CV2:
            fp2_r = cv2.resize(fp2, (fp1.shape[1], fp1.shape[0]),
                               interpolation=cv2.INTER_AREA)
            b = fp2_r.flatten().astype(np.float64)
        else:
            # Fall back to truncating to shorter length
            n = min(len(a), len(b))
            a, b = a[:n], b[:n]

    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return float(np.clip(np.dot(a, b) / (na * nb), -1.0, 1.0))


def _quality_score(fp: np.ndarray, n_images: int) -> float:
    """
    Estimate fingerprint quality.
    More structure (higher variance) + more reference images → higher quality.
    """
    var        = float(np.var(fp))
    img_factor = min(n_images / 20.0, 1.0)
    return float(np.clip(var * 5.0 * (0.5 + 0.5 * img_factor), 0.0, 1.0))


def _confidence_label(score: float) -> str:
    if score >= 0.95: return "Very High"
    if score >= 0.85: return "High"
    if score >= 0.70: return "Moderate"
    if score >= 0.50: return "Low"
    return "No Match"


def _unavailable(msg: str) -> Dict[str, Any]:
    return {
        "matched_device": None, "match_score": 0.0,
        "all_scores": [], "confidence": "unavailable",
        "error": msg,
    }


# ── module-level singleton ────────────────────────────────────────────────────

_service = PRNUService()
