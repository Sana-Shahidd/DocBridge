"""
Score Engine — combines all signal outputs into the final Reality Score.

Weight redistribution rules
---------------------------
1. Base signals (audio absent):
       CNN 30% + QSAM 18% + ELA 13% + Metadata 13%
       + Context 13% + GeoLens 13%  = 100 %

2. Audio present:
       Multiply each base weight by 0.75, Audio = 25 %
       → CNN 22.5% + QSAM 13.5% + ELA 9.75% + … + Audio 25 %

3. Signal unavailable (None):
       Remove from active set; redistribute its weight proportionally
       to the remaining active signals so weights always sum to 1.0.

Fake-probability mapping (input → fake contribution)
-----------------------------------------------------
  CNN        →  cnn_fake_probability           (high = fake)
  QSAM       →  qsam_anomaly_score             (high = fake)
  ELA        →  ela_score                      (high = fake)
  Metadata   →  metadata_suspicion_score       (high = fake)
  Context    →  1 − context_match_score        (no match = fake)
  GeoLens    →  geolocation_suspicion_score    (high = fake)
  Audio      →  audio_clone_probability        (high = fake)

reality_score = 100 − round(weighted_fake_probability × 100)
100 = definitely real, 0 = definitely fake.

Verdict thresholds
------------------
  80–100  → Likely Real    (green)
  50–79   → Suspicious     (amber)
   0–49   → Likely Fake    (red)
  confidence < 0.30 → Inconclusive (gray)
"""

from typing import Any, Dict, List, Optional

import numpy as np

# ── Base signal definitions ───────────────────────────────────────────────────

_BASE_WEIGHTS: Dict[str, float] = {
    "CNN Deepfake Classifier": 0.30,
    "Quantum Noise Analysis":  0.18,
    "Error Level Analysis":    0.13,
    "Metadata Integrity":      0.13,
    "News Context Match":      0.13,
    "Geographic Consistency":  0.13,
}
_AUDIO_LABEL  = "Voice Clone Detection"
_AUDIO_WEIGHT = 0.25   # fraction of total when audio is present


# ═════════════════════════════════════════════════════════════════════════════
# ScoreEngine
# ═════════════════════════════════════════════════════════════════════════════

class ScoreEngine:

    def calculate_reality_score(self, signals: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compute the final Reality Score from all available analysis signals.

        Parameters
        ----------
        signals : dict with keys (all optional except cnn):
            cnn_fake_probability       float 0-1
            qsam_anomaly_score         float 0-1
            ela_score                  float 0-1
            metadata_suspicion_score   float 0-1
            context_match_score        float 0-1  (1.0 = context matches = real)
            geolocation_suspicion_score float 0-1 | None
            audio_clone_probability    float 0-1 | None

        Returns
        -------
        dict with reality_score, verdict, confidence, signal_breakdown, color
        """
        # ── Extract raw values ────────────────────────────────────────────────
        raw: Dict[str, Optional[float]] = {
            "CNN Deepfake Classifier": _safe(signals.get("cnn_fake_probability")),
            "Quantum Noise Analysis":  _safe(signals.get("qsam_anomaly_score")),
            "Error Level Analysis":    _safe(signals.get("ela_score")),
            "Metadata Integrity":      _safe(signals.get("metadata_suspicion_score")),
            "News Context Match":      _safe(
                1.0 - signals["context_match_score"]
                if signals.get("context_match_score") is not None
                else None
            ),
            "Geographic Consistency":  _safe(signals.get("geolocation_suspicion_score")),
        }
        audio_val: Optional[float] = _safe(signals.get("audio_clone_probability"))

        # ── Build weights ─────────────────────────────────────────────────────
        weights = dict(_BASE_WEIGHTS)
        if audio_val is not None:
            # Scale base weights to 75 % of total, audio takes 25 %
            weights = {k: v * (1 - _AUDIO_WEIGHT) for k, v in weights.items()}
            weights[_AUDIO_LABEL] = _AUDIO_WEIGHT
            raw[_AUDIO_LABEL]     = audio_val

        # ── Remove unavailable signals and redistribute weight ─────────────────
        active = {k: v for k, v in raw.items() if v is not None and k in weights}
        inactive = {k for k in weights if k not in active}

        if not active:
            return _inconclusive_result("No analysis signals available.")

        if inactive:
            weights = _redistribute(weights, inactive)

        # ── Weighted fake probability ─────────────────────────────────────────
        weighted_fake = sum(weights[k] * active[k] for k in active)

        # ── Confidence: coverage × agreement ─────────────────────────────────
        total_possible = len(_BASE_WEIGHTS) + (1 if audio_val is not None else 0)
        n_active       = len(active)
        coverage       = n_active / max(total_possible, 1)
        fake_vals      = list(active.values())
        agreement      = float(max(0.0, 1.0 - np.std(fake_vals) * 2))
        confidence     = round(0.40 * coverage + 0.60 * agreement, 4)

        # ── Reality score ─────────────────────────────────────────────────────
        reality_score = int(round(np.clip((1.0 - weighted_fake) * 100, 0, 100)))

        # ── Verdict ───────────────────────────────────────────────────────────
        if confidence < 0.30:
            verdict, color = "Inconclusive", "gray"
        elif reality_score >= 80:
            verdict, color = "Likely Real",  "green"
        elif reality_score >= 50:
            verdict, color = "Suspicious",   "amber"
        else:
            verdict, color = "Likely Fake",  "red"

        # ── Signal breakdown ──────────────────────────────────────────────────
        breakdown = []
        # Ordered display (audio appended last if present)
        ordered_keys = list(_BASE_WEIGHTS.keys()) + (
            [_AUDIO_LABEL] if audio_val is not None else []
        )
        for label in ordered_keys:
            if label not in active:
                continue
            fp      = active[label]
            w       = weights[label]
            # Display weight as percentage of the *original* design
            if label == _AUDIO_LABEL:
                w_label = f"{int(round(_AUDIO_WEIGHT * 100))}%"
            else:
                orig_base = _BASE_WEIGHTS[label]
                w_label   = f"{int(round(orig_base * 100))}%"

            breakdown.append({
                "signal":       label,
                "contribution": round(fp * w, 4),
                "finding":      _finding_text(label, fp),
                "weight":       w_label,
                "fake_score":   round(fp, 4),
            })

        return {
            "reality_score":    reality_score,
            "verdict":          verdict,
            "confidence":       confidence,
            "signal_breakdown": breakdown,
            "color":            color,
            "weighted_fake_probability": round(float(weighted_fake), 4),
        }


# ═════════════════════════════════════════════════════════════════════════════
# Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _safe(val: Any) -> Optional[float]:
    """Return float clamped to [0,1] or None for missing/invalid values."""
    if val is None:
        return None
    try:
        f = float(val)
        return float(np.clip(f, 0.0, 1.0))
    except (TypeError, ValueError):
        return None


def _redistribute(
    weights: Dict[str, float], to_remove: set
) -> Dict[str, float]:
    """
    Remove signals in *to_remove* from *weights* and redistribute their
    total weight proportionally to the remaining signals.
    """
    removed_total = sum(weights[k] for k in to_remove)
    remaining     = {k: v for k, v in weights.items() if k not in to_remove}
    if not remaining:
        return {}
    remaining_total = sum(remaining.values())
    if remaining_total < 1e-9:
        return remaining
    scale = (remaining_total + removed_total) / remaining_total
    return {k: v * scale for k, v in remaining.items()}


def _finding_text(label: str, fake_prob: float) -> str:
    """Generate a human-readable finding string for a signal."""
    _findings: Dict[str, tuple] = {
        "CNN Deepfake Classifier": (
            "No significant deepfake indicators — image/video appears authentic.",
            "Moderate deepfake indicators detected — requires further review.",
            "Strong deepfake indicators — likely AI-generated or manipulated.",
        ),
        "Quantum Noise Analysis": (
            "Noise patterns consistent with real camera sensor.",
            "Some frequency anomalies — noise profile slightly atypical.",
            "Anomalous frequency patterns — inconsistent with real camera noise.",
        ),
        "Error Level Analysis": (
            "Uniform compression history — no evidence of localized editing.",
            "Some regions show elevated ELA response — possible minor edits.",
            "High ELA response in multiple regions — significant compositing detected.",
        ),
        "Metadata Integrity": (
            "EXIF data intact and consistent with device capture.",
            "Minor EXIF irregularities — metadata may have been partially stripped.",
            "Multiple EXIF red flags — metadata absent, mismatched, or synthetic.",
        ),
        "News Context Match": (
            "Context is strongly supported by news sources.",
            "Context partially matches news sources — some discrepancies.",
            "Context contradicts or is absent from news sources.",
        ),
        "Geographic Consistency": (
            "Geographic visual cues are consistent with the claimed location.",
            "Minor geographic inconsistencies detected.",
            "Geographic mismatch — visual cues conflict with the claimed location.",
        ),
        "Voice Clone Detection": (
            "Voice patterns consistent with authentic human speech.",
            "Some voice irregularities detected — inconclusive.",
            "High voice clone probability — synthesized speech indicators present.",
        ),
    }
    low, med, high = _findings.get(label, ("Low.", "Moderate.", "High."))
    if fake_prob < 0.30:
        return low
    if fake_prob < 0.65:
        return med
    return high


def _inconclusive_result(reason: str) -> Dict[str, Any]:
    return {
        "reality_score":    50,
        "verdict":          "Inconclusive",
        "confidence":       0.0,
        "signal_breakdown": [],
        "color":            "gray",
        "weighted_fake_probability": 0.5,
        "note":             reason,
    }


# ── module-level singleton ────────────────────────────────────────────────────

_engine = ScoreEngine()


def calculate_reality_score(signals: Dict[str, Any]) -> Dict[str, Any]:
    """Entry point for routers."""
    return _engine.calculate_reality_score(signals)


# ── Legacy compatibility (kept for any code referencing old API) ──────────────

def compute_score(results: Dict[str, Any]) -> Dict[str, Any]:
    """Map old result keys to the new score engine."""
    signals = {
        "cnn_fake_probability":      results.get("cnn_confidence", 0.5),
        "qsam_anomaly_score":        results.get("qsam_score", 0.5),
        "audio_clone_probability":   results.get("audio_confidence"),
        "metadata_suspicion_score":  results.get("metadata_risk", 0.5),
        "context_match_score":       1.0 - results.get("news_risk", 0.5),
        "ela_score":                 results.get("ela_score"),
        "geolocation_suspicion_score": results.get("geo_score"),
    }
    return _engine.calculate_reality_score(signals)
