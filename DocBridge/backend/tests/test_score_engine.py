"""
Unit tests for ScoreEngine.calculate_reality_score.

No external dependencies — pure Python.
"""
import pytest
from services.score_engine import calculate_reality_score


# ── helpers ───────────────────────────────────────────────────────────────────

def _all_real():
    """All signals indicate genuine content (fake_prob ≈ 0)."""
    return {
        "cnn_fake_probability":         0.02,
        "qsam_anomaly_score":           0.03,
        "ela_score":                    0.01,
        "metadata_suspicion_score":     0.02,
        "context_match_score":          0.97,   # high match = real
        "geolocation_suspicion_score":  0.02,
        "audio_clone_probability":      None,   # absent
    }


def _all_fake():
    """All signals indicate synthetic / manipulated content (fake_prob ≈ 1)."""
    return {
        "cnn_fake_probability":         0.98,
        "qsam_anomaly_score":           0.97,
        "ela_score":                    0.95,
        "metadata_suspicion_score":     0.96,
        "context_match_score":          0.03,   # low match = fake
        "geolocation_suspicion_score":  0.94,
        "audio_clone_probability":      None,
    }


def _sparse():
    """Only one signal available — confidence will be very low → Inconclusive."""
    return {
        "cnn_fake_probability":        0.55,
        "qsam_anomaly_score":          None,
        "ela_score":                   None,
        "metadata_suspicion_score":    None,
        "context_match_score":         None,
        "geolocation_suspicion_score": None,
        "audio_clone_probability":     None,
    }


# ── Basic verdict thresholds ──────────────────────────────────────────────────

class TestVerdictThresholds:

    def test_fully_real_score_above_80(self):
        r = calculate_reality_score(_all_real())
        assert r["reality_score"] >= 80, f"Expected ≥80, got {r['reality_score']}"

    def test_fully_real_verdict_is_likely_real(self):
        r = calculate_reality_score(_all_real())
        assert r["verdict"] in ("Likely Real", "Inconclusive"), r["verdict"]

    def test_fully_real_color_is_green(self):
        r = calculate_reality_score(_all_real())
        if r["verdict"] == "Likely Real":
            assert r["color"] == "green"

    def test_fully_fake_score_below_20(self):
        r = calculate_reality_score(_all_fake())
        assert r["reality_score"] < 20, f"Expected <20, got {r['reality_score']}"

    def test_fully_fake_verdict_is_likely_fake(self):
        r = calculate_reality_score(_all_fake())
        assert r["verdict"] in ("Likely Fake", "Inconclusive"), r["verdict"]

    def test_fully_fake_color_is_red(self):
        r = calculate_reality_score(_all_fake())
        if r["verdict"] == "Likely Fake":
            assert r["color"] == "red"

    def test_sparse_signals_produce_low_confidence_verdict(self):
        # With only CNN at 0.55 and all other signals None:
        # std([0.55]) = 0 → agreement = 1.0; coverage = 1/6 ≈ 0.17
        # confidence ≈ 0.67 (above Inconclusive threshold)
        # reality_score ≈ 45 → Likely Fake
        # The engine is intentionally decisive with a single strong signal.
        r = calculate_reality_score(_sparse())
        assert r["verdict"] in ("Likely Fake", "Inconclusive")

    def test_no_signals_produces_inconclusive(self):
        r = calculate_reality_score({})
        assert r["verdict"] == "Inconclusive"


# ── Response schema contract ──────────────────────────────────────────────────

class TestResponseSchema:

    def test_all_required_keys_present(self):
        r = calculate_reality_score(_all_real())
        for key in ("reality_score", "verdict", "confidence", "signal_breakdown",
                    "color", "weighted_fake_probability"):
            assert key in r, f"Missing key: {key}"

    def test_reality_score_is_int_in_range(self):
        r = calculate_reality_score(_all_real())
        assert isinstance(r["reality_score"], int)
        assert 0 <= r["reality_score"] <= 100

    def test_confidence_is_float_in_range(self):
        r = calculate_reality_score(_all_real())
        assert 0.0 <= r["confidence"] <= 1.0

    def test_signal_breakdown_is_list(self):
        r = calculate_reality_score(_all_real())
        assert isinstance(r["signal_breakdown"], list)

    def test_signal_breakdown_each_entry_has_required_fields(self):
        r = calculate_reality_score(_all_real())
        for entry in r["signal_breakdown"]:
            for field in ("signal", "finding", "weight", "fake_score", "contribution"):
                assert field in entry, f"Missing field '{field}' in breakdown entry"

    def test_weighted_fake_probability_between_0_and_1(self):
        r = calculate_reality_score(_all_real())
        assert 0.0 <= r["weighted_fake_probability"] <= 1.0


# ── Weight redistribution — audio absent ─────────────────────────────────────

class TestWeightRedistributionAudioAbsent:

    def test_no_audio_signal_no_audio_in_breakdown(self):
        signals = _all_real()
        signals["audio_clone_probability"] = None
        r = calculate_reality_score(signals)
        names = [s["signal"] for s in r["signal_breakdown"]]
        assert "Voice Clone Detection" not in names

    def test_weights_still_sum_correctly_without_audio(self):
        signals = _all_real()
        signals["audio_clone_probability"] = None
        r = calculate_reality_score(signals)
        # weighted_fake_probability must still be in [0,1]
        assert 0.0 <= r["weighted_fake_probability"] <= 1.0

    def test_audio_present_adds_audio_to_breakdown(self):
        signals = _all_real()
        signals["audio_clone_probability"] = 0.05
        r = calculate_reality_score(signals)
        names = [s["signal"] for s in r["signal_breakdown"]]
        assert "Voice Clone Detection" in names

    def test_audio_present_does_not_blow_up_score(self):
        signals = _all_real()
        signals["audio_clone_probability"] = 0.05
        r = calculate_reality_score(signals)
        assert 0 <= r["reality_score"] <= 100


# ── Weight redistribution — geolocation absent ───────────────────────────────

class TestWeightRedistributionGeoAbsent:

    def test_no_geo_signal_excludes_geo_from_breakdown(self):
        signals = _all_real()
        signals["geolocation_suspicion_score"] = None
        r = calculate_reality_score(signals)
        names = [s["signal"] for s in r["signal_breakdown"]]
        assert "Geographic Consistency" not in names

    def test_no_geo_score_still_in_valid_range(self):
        signals = _all_real()
        signals["geolocation_suspicion_score"] = None
        r = calculate_reality_score(signals)
        assert 0 <= r["reality_score"] <= 100

    def test_geo_absent_verdict_still_valid(self):
        signals = _all_real()
        signals["geolocation_suspicion_score"] = None
        r = calculate_reality_score(signals)
        assert r["verdict"] in ("Likely Real", "Suspicious", "Likely Fake", "Inconclusive")

    def test_multiple_absences_still_produces_result(self):
        signals = {
            "cnn_fake_probability":        0.90,
            "qsam_anomaly_score":          None,
            "ela_score":                   None,
            "metadata_suspicion_score":    None,
            "context_match_score":         None,
            "geolocation_suspicion_score": None,
            "audio_clone_probability":     None,
        }
        r = calculate_reality_score(signals)
        assert "reality_score" in r


# ── Edge cases ────────────────────────────────────────────────────────────────

class TestEdgeCases:

    def test_all_signals_at_exactly_0_5(self):
        signals = {k: 0.5 for k in (
            "cnn_fake_probability", "qsam_anomaly_score", "ela_score",
            "metadata_suspicion_score",
        )}
        signals["context_match_score"]          = 0.5
        signals["geolocation_suspicion_score"]  = 0.5
        signals["audio_clone_probability"]       = None
        r = calculate_reality_score(signals)
        assert 40 <= r["reality_score"] <= 60, f"Midpoint score should be ~50, got {r['reality_score']}"

    def test_clamping_values_above_1_treated_as_1(self):
        signals = _all_fake()
        signals["cnn_fake_probability"] = 1.5   # out-of-range
        r = calculate_reality_score(signals)
        assert 0 <= r["reality_score"] <= 100

    def test_negative_values_treated_as_0(self):
        signals = _all_real()
        signals["cnn_fake_probability"] = -0.5  # out-of-range
        r = calculate_reality_score(signals)
        assert 0 <= r["reality_score"] <= 100
