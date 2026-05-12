"""
Demo Mode — returns realistic synthetic analysis results without running
the full ML pipeline. Activated via DEMO_MODE=True in .env.
Useful for UI development and demos when model checkpoints are not present.
"""
import os
import random
import uuid
from datetime import datetime, timezone
from typing import Dict, Any

DEMO_MODE: bool = os.getenv("DEMO_MODE", "False").lower() in ("true", "1", "yes")


def is_demo() -> bool:
    return DEMO_MODE


def fake_analysis(filename: str, media_type: str = "image") -> Dict[str, Any]:
    """Return a plausible-looking analysis result for demo purposes."""
    rng = random.Random(filename)  # deterministic per filename
    verdict = rng.choice(["authentic", "suspicious", "fake"])

    score_map = {
        "authentic": rng.uniform(0.05, 0.24),
        "suspicious": rng.uniform(0.26, 0.54),
        "fake": rng.uniform(0.56, 0.97),
    }
    final_score = round(score_map[verdict], 4)

    return {
        "analysis_id": str(uuid.uuid4()),
        "file_hash": "demo_" + uuid.uuid4().hex[:16],
        "media_type": media_type,
        "filename": filename,
        "demo": True,
        "cnn": {
            "label": verdict,
            "confidence": round(rng.uniform(0.6, 0.99), 4),
            "frame_scores": [],
        },
        "qsam": {
            "score": round(rng.uniform(0.0, 0.8), 4),
            "anomalies": ["Spectral inconsistency in mid-frequency band"] if verdict != "authentic" else [],
            "heatmap": None,
        },
        "metadata": {
            "risk_score": round(rng.uniform(0.0, 0.5), 4),
            "flags": ["GPS coordinates stripped"] if verdict == "fake" else [],
            "raw_tags": {},
        },
        "audio": {},
        "patterns": {"matched": [], "risk_score": 0.0},
        "geolocation": {"gps_coords": None, "location_match": None, "confidence": 0.0},
        "watermark": {"found": False, "payload": None},
        "score": {
            "final_score": final_score,
            "verdict": verdict,
            "breakdown": {
                "cnn": round(final_score * 0.30, 4),
                "qsam": round(final_score * 0.25, 4),
                "audio": 0.0,
                "metadata": round(final_score * 0.10, 4),
                "news": round(final_score * 0.15, 4),
            },
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
