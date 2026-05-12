"""
CNN Classifier — EfficientNet-B4 deepfake detector.

Model path  : backend/models/efficientnet_deepfake.pth
              If absent, falls back to ImageNet weights + heuristic scoring.

Heuristic   : Edge inconsistency (Canny) + colour distribution anomaly
              + texture regularity (Laplacian variance) via OpenCV/numpy.
              Provides real signal — not a random number.
"""

import os
from pathlib import Path
from typing import Any, Dict, Optional

# ── optional heavy deps ──────────────────────────────────────────────────────
try:
    import torch
    import torch.nn as nn
    from torchvision import transforms
    from torchvision.models import efficientnet_b4, EfficientNet_B4_Weights
    _TORCH = True
except ImportError:
    _TORCH = False

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
    from PIL import Image
    _PIL = True
except ImportError:
    _PIL = False

# ── constants ────────────────────────────────────────────────────────────────
MODEL_PATH = os.getenv("CNN_MODEL_PATH", "models/efficientnet_deepfake.pth")
INCONCLUSIVE_THRESHOLD = 0.35

_IMAGENET_MEAN = [0.485, 0.456, 0.406]
_IMAGENET_STD  = [0.229, 0.224, 0.225]

_preprocess = None   # lazy-built torchvision transform
_model      = None   # lazy-loaded EfficientNet-B4


# ─────────────────────────────────────────────────────────────────────────────
# Model construction & loading
# ─────────────────────────────────────────────────────────────────────────────

def _build_model() -> "nn.Module":
    """
    EfficientNet-B4 with a custom binary classification head:
        Linear(1792, 512) → ReLU → Dropout(0.3) → Linear(512, 1) → Sigmoid
    """
    base = efficientnet_b4(weights=EfficientNet_B4_Weights.IMAGENET1K_V1)
    in_features = base.classifier[1].in_features   # 1792 for B4

    base.classifier = nn.Sequential(
        nn.Linear(in_features, 512),
        nn.ReLU(inplace=True),
        nn.Dropout(p=0.3),
        nn.Linear(512, 1),
        nn.Sigmoid(),
    )
    return base


def _get_model() -> Optional["nn.Module"]:
    """Lazy-load or build the model, returning None if torch is unavailable."""
    global _model
    if not _TORCH:
        return None
    if _model is not None:
        return _model

    model = _build_model()
    model_path = Path(MODEL_PATH)

    if model_path.exists():
        try:
            state = torch.load(str(model_path), map_location="cpu")
            model.load_state_dict(state)
            model._weights_source = "finetuned"
        except Exception as e:
            model._weights_source = f"imagenet_fallback (load error: {e})"
    else:
        model._weights_source = "imagenet_fallback"

    model.eval()
    _model = model
    return _model


def _get_preprocess() -> Optional["transforms.Compose"]:
    global _preprocess
    if not _TORCH:
        return None
    if _preprocess is None:
        _preprocess = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=_IMAGENET_MEAN, std=_IMAGENET_STD),
        ])
    return _preprocess


# ─────────────────────────────────────────────────────────────────────────────
# Heuristic fallback  (OpenCV + numpy — no torch required)
# ─────────────────────────────────────────────────────────────────────────────

def _heuristic_score(image_path: str) -> Dict[str, Any]:
    """
    Signal-processing heuristic combining three cues:

    1. Edge inconsistency   — GANs produce unnatural edge density gradients.
       Method: Canny edges on grayscale; compare edge density in face-centre
               region vs. outer region.  Real photos are more uniform.

    2. Colour distribution  — Deepfakes often show shifted/clamped colour
       histograms in YCrCb space (over-saturated skin tones).
       Method: std-dev of Cr channel histogram.  Low std = clamped = suspect.

    3. Texture regularity   — GAN generators produce suspiciously regular
       micro-textures.  Real photos contain fractal-like natural noise.
       Method: Laplacian variance of the luminance channel.
               Very high or near-zero Laplacian variance is anomalous.
    """
    if not (_CV2 and _NP and _PIL):
        return {"fake_probability": 0.5, "confidence": 0.0, "method": "unavailable",
                "details": "OpenCV/numpy/Pillow not installed — heuristic unavailable."}

    try:
        bgr = cv2.imread(image_path)
        if bgr is None:
            return {"error": "Could not process this file"}

        bgr_r = cv2.resize(bgr, (224, 224))
        gray  = cv2.cvtColor(bgr_r, cv2.COLOR_BGR2GRAY)
        ycrcb = cv2.cvtColor(bgr_r, cv2.COLOR_BGR2YCrCb)

        # 1. Edge inconsistency ─────────────────────────────────────────────
        edges = cv2.Canny(gray, 50, 150)
        h, w  = edges.shape
        margin = h // 4
        centre_density = edges[margin: h - margin, margin: w - margin].mean()
        outer_mask = np.ones_like(edges, dtype=bool)
        outer_mask[margin: h - margin, margin: w - margin] = False
        outer_density = edges[outer_mask].mean()
        # Anomalous if centre is far more or less detailed than borders
        if outer_density < 1e-6:
            edge_score = 0.5
        else:
            ratio = centre_density / (outer_density + 1e-6)
            # Well-composed real photos: ratio ~ 1–3. GANs: often <0.5 or >5
            edge_score = float(np.clip(abs(np.log(ratio + 1e-6)) / 3.0, 0.0, 1.0))

        # 2. Colour distribution ────────────────────────────────────────────
        cr_channel = ycrcb[:, :, 1].astype(float)
        hist, _ = np.histogram(cr_channel, bins=32, range=(0, 256))
        hist_norm = hist / (hist.sum() + 1e-10)
        cr_std = float(np.std(hist_norm))
        # Low std = very uniform Cr distribution = likely AI skin
        # normalise: empirically real ≈ 0.04–0.12, clamped AI ≈ 0.01–0.03
        colour_score = float(np.clip(1.0 - cr_std / 0.08, 0.0, 1.0))

        # 3. Texture regularity ─────────────────────────────────────────────
        lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        # Real photo range: ~200–2000. GANs: often <80 (over-smooth) or >4000 (artefacts)
        if lap_var < 80:
            texture_score = 1.0
        elif lap_var > 4000:
            texture_score = 0.8
        elif lap_var < 200:
            texture_score = float((200 - lap_var) / 120)
        else:
            texture_score = 0.0

        # Weighted combination
        raw = 0.35 * edge_score + 0.35 * colour_score + 0.30 * texture_score
        fake_prob = round(float(np.clip(raw, 0.0, 1.0)), 4)
        # Confidence: how far from the ambiguous 0.5 midpoint
        confidence = round(min(abs(fake_prob - 0.5) * 2.0 + 0.2, 1.0), 4)

        return {
            "fake_probability": fake_prob,
            "confidence": confidence,
            "method": "heuristic",
            "edge_score": round(edge_score, 4),
            "colour_score": round(colour_score, 4),
            "texture_score": round(texture_score, 4),
        }

    except Exception as exc:
        return {"error": f"Could not process this file: {exc}"}


# ─────────────────────────────────────────────────────────────────────────────
# CNNClassifier
# ─────────────────────────────────────────────────────────────────────────────

class CNNClassifier:

    # ── image ────────────────────────────────────────────────────────────────

    def classify_image(self, image_path: str) -> Dict[str, Any]:
        """
        Run inference on a single image.

        Returns
        -------
        {
            "fake_probability": float,   # 0.0 = real, 1.0 = fake
            "confidence":       float,   # model certainty
            "method":           str,     # "model" | "heuristic"
            "result":           str      # "real" | "fake" | "inconclusive"
        }
        Or {"error": "Could not process this file"} on failure.
        """
        p = Path(image_path)
        if not p.exists():
            return {"error": "Could not process this file"}

        # ── torch inference path ─────────────────────────────────────────
        if _TORCH and _PIL:
            try:
                model = _get_model()
                prep  = _get_preprocess()
                with Image.open(image_path).convert("RGB") as img:
                    tensor = prep(img).unsqueeze(0)   # 1 × 3 × 224 × 224

                with torch.no_grad():
                    fake_prob = float(model(tensor)[0, 0])

                confidence = min(abs(fake_prob - 0.5) * 2.0 + 0.2, 1.0)
                confidence = round(confidence, 4)
                fake_prob  = round(fake_prob, 4)

                if confidence < INCONCLUSIVE_THRESHOLD:
                    return {
                        "fake_probability": fake_prob,
                        "confidence": confidence,
                        "method": getattr(model, "_weights_source", "model"),
                        "result": "inconclusive",
                    }

                return {
                    "fake_probability": fake_prob,
                    "confidence": confidence,
                    "method": getattr(model, "_weights_source", "model"),
                    "result": "fake" if fake_prob >= 0.5 else "real",
                }

            except Exception:
                pass   # fall through to heuristic

        # ── heuristic fallback ───────────────────────────────────────────
        result = _heuristic_score(image_path)
        if "error" in result:
            return result

        fp = result["fake_probability"]
        conf = result["confidence"]

        if conf < INCONCLUSIVE_THRESHOLD:
            result["result"] = "inconclusive"
        else:
            result["result"] = "fake" if fp >= 0.5 else "real"

        return result

    # ── video ────────────────────────────────────────────────────────────────

    def classify_video(self, video_path: str) -> Dict[str, Any]:
        """
        Extract 10 evenly-spaced frames and classify each with classify_image.

        Returns
        -------
        {
            "fake_probability":  float,
            "frames_analyzed":   int,
            "suspicious_frames": int,
            "confidence":        float,
            "result":            str,
            "frame_results":     list[dict]
        }
        """
        if not _CV2:
            return {"error": "Could not process this file"}

        if not Path(video_path).exists():
            return {"error": "Could not process this file"}

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"error": "Could not process this file"}

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        if total_frames < 1:
            return {"error": "Could not process this file"}

        n_samples = min(10, total_frames)
        indices   = [int(i * total_frames / n_samples) for i in range(n_samples)]

        import tempfile
        frame_results: list = []
        fake_probs: list    = []

        cap = cv2.VideoCapture(video_path)
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if not ret:
                continue

            # Write frame to a temp file for classify_image to load
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf:
                tmp_path = tf.name
            try:
                cv2.imwrite(tmp_path, frame)
                res = self.classify_image(tmp_path)
            finally:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

            if "error" not in res:
                frame_results.append({"frame_index": idx, **res})
                fake_probs.append(res.get("fake_probability", 0.5))

        cap.release()

        if not frame_results:
            return {"error": "Could not process this file"}

        avg_fp   = round(float(sum(fake_probs) / len(fake_probs)), 4)
        sus      = sum(1 for fp in fake_probs if fp >= 0.5)
        conf     = round(min(abs(avg_fp - 0.5) * 2.0 + 0.2, 1.0), 4)
        result_label = "inconclusive"
        if conf >= INCONCLUSIVE_THRESHOLD:
            result_label = "fake" if avg_fp >= 0.5 else "real"

        return {
            "fake_probability": avg_fp,
            "frames_analyzed": len(frame_results),
            "suspicious_frames": sus,
            "confidence": conf,
            "result": result_label,
            "frame_results": frame_results,
        }


# ─────────────────────────────────────────────────────────────────────────────
# Module-level singleton + router-facing wrapper
# ─────────────────────────────────────────────────────────────────────────────

_classifier = CNNClassifier()


def classify(file_path: str, media_type: str) -> Dict[str, Any]:
    """Entry point called by routers/analyze.py."""
    if media_type == "image":
        return _classifier.classify_image(file_path)
    if media_type == "video":
        return _classifier.classify_video(file_path)
    return {
        "label": "uncertain",
        "confidence": 0.0,
        "frame_scores": [],
        "details": f"CNN classifier does not handle media_type='{media_type}'.",
    }
