"""
Tests for GeoLensService.

Structure tests use synthetic images (PIL-based) to verify the service
returns a valid schema.  The cross_check_with_claim tests use controlled
inputs and are fully deterministic — no image required.
"""
import io
import tempfile
from pathlib import Path
from typing import Any, Dict

import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_image_file(color_bgr, width=300, height=300) -> str:
    """Write a solid-colour PNG to a temp file and return the path."""
    PIL = pytest.importorskip("PIL", reason="Pillow required")
    from PIL import Image
    r, g, b = color_bgr[2], color_bgr[1], color_bgr[0]  # BGR → RGB
    img = Image.new("RGB", (width, height), color=(r, g, b))
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    img.save(tmp.name, format="PNG")
    return tmp.name


def _make_gradient_image(top_color, bottom_color, width=400, height=400) -> str:
    """
    Gradient from top_color to bottom_color (RGB tuples).
    Avoids the uniform-std problem that the MediaValidator checks.
    """
    PIL = pytest.importorskip("PIL", reason="Pillow required")
    from PIL import Image
    import numpy as np
    top  = np.array(top_color,    dtype=np.float32)
    bot  = np.array(bottom_color, dtype=np.float32)
    arr  = np.zeros((height, width, 3), dtype=np.uint8)
    for y in range(height):
        t = y / max(height - 1, 1)
        arr[y, :] = (top * (1 - t) + bot * t).astype(np.uint8)
    img = Image.fromarray(arr, "RGB")
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    img.save(tmp.name, format="PNG")
    return tmp.name


def _geo_result(region: str, conf: float = 0.6) -> Dict[str, Any]:
    """Minimal geolocation result dict for cross_check tests."""
    return {
        "likely_region":         region,
        "confidence":            conf,
        "visual_cues_detected":  [],
        "estimated_time_of_day": "daytime",
        "climate_zone":          "arid",
        "region_scores":         {region: conf},
    }


# ── Import the service ────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def svc():
    from services.geolens_service import GeoLensService
    return GeoLensService()


@pytest.fixture(scope="module")
def analyze():
    from services.geolens_service import analyze_geolocation
    return analyze_geolocation


# ─────────────────────────────────────────────────────────────────────────────
# 1. Schema / structure tests (always run, regardless of CV2 presence)
# ─────────────────────────────────────────────────────────────────────────────

class TestAnalyzeGeolocationSchema:

    def test_returns_dict(self, analyze, tmp_path):
        pytest.importorskip("PIL")
        pytest.importorskip("cv2", reason="OpenCV required for geolens analysis")
        path = _make_gradient_image((180, 140, 80), (220, 190, 130))
        result = analyze(path)
        assert isinstance(result, dict)

    def test_required_keys_present(self, analyze):
        pytest.importorskip("PIL")
        pytest.importorskip("cv2", reason="OpenCV required for geolens analysis")
        path = _make_gradient_image((180, 140, 80), (220, 190, 130))
        result = analyze(path)
        for key in ("likely_region", "confidence", "visual_cues_detected",
                    "climate_zone", "time_period"):
            assert key in result, f"Missing key: {key}"

    def test_confidence_in_range(self, analyze):
        pytest.importorskip("PIL")
        pytest.importorskip("cv2", reason="OpenCV required for geolens analysis")
        path = _make_gradient_image((180, 140, 80), (220, 190, 130))
        result = analyze(path)
        assert 0.0 <= result["confidence"] <= 1.0

    def test_likely_region_is_string(self, analyze):
        pytest.importorskip("PIL")
        pytest.importorskip("cv2", reason="OpenCV required for geolens analysis")
        path = _make_gradient_image((180, 140, 80), (220, 190, 130))
        result = analyze(path)
        assert isinstance(result["likely_region"], str)

    def test_visual_cues_is_list(self, analyze):
        pytest.importorskip("PIL")
        pytest.importorskip("cv2", reason="OpenCV required for geolens analysis")
        path = _make_gradient_image((180, 140, 80), (220, 190, 130))
        result = analyze(path)
        assert isinstance(result["visual_cues_detected"], list)

    def test_missing_file_returns_valid_structure(self, analyze):
        result = analyze("/nonexistent/path/image.png")
        assert isinstance(result, dict)
        assert "likely_region" in result

    def test_no_claimed_location_returns_no_claim_check(self, analyze):
        pytest.importorskip("cv2", reason="OpenCV required")
        pytest.importorskip("PIL")
        path = _make_gradient_image((200, 180, 160), (220, 200, 180))
        result = analyze(path, claimed_location=None)
        assert "claim_check" not in result

    def test_claimed_location_adds_claim_check(self, analyze):
        pytest.importorskip("cv2", reason="OpenCV required")
        pytest.importorskip("PIL")
        path = _make_gradient_image((200, 180, 160), (220, 200, 180))
        result = analyze(path, claimed_location="New York")
        assert "claim_check" in result

    def test_claim_check_has_required_keys(self, analyze):
        pytest.importorskip("cv2", reason="OpenCV required")
        pytest.importorskip("PIL")
        path = _make_gradient_image((200, 180, 160), (220, 200, 180))
        result = analyze(path, claimed_location="London")
        if "claim_check" in result:
            cc = result["claim_check"]
            for key in ("location_mismatch", "geolocation_suspicion_score"):
                assert key in cc


# ─────────────────────────────────────────────────────────────────────────────
# 2. Desert / warm-palette image → arid climate zone
# ─────────────────────────────────────────────────────────────────────────────

class TestDesertLandscape:

    def test_warm_sandy_image_returns_arid_or_valid_region(self, analyze):
        """
        Sandy/brown gradient (warm HSV hues) should push climate toward arid.
        We don't assert a specific region because single-color images are
        ambiguous — we assert the function produces a usable result.
        """
        pytest.importorskip("cv2", reason="OpenCV required")
        pytest.importorskip("PIL")
        # Sandy gold → warm brown (RGB)
        path = _make_gradient_image((210, 170, 100), (160, 120, 60))
        result = analyze(path)
        assert isinstance(result["likely_region"], str)
        assert result["likely_region"] != ""

    def test_warm_image_climate_not_polar(self, analyze):
        pytest.importorskip("cv2", reason="OpenCV required")
        pytest.importorskip("PIL")
        path = _make_gradient_image((210, 170, 100), (160, 120, 60))
        result = analyze(path)
        assert result.get("climate_zone", "") != "polar/arctic"

    def test_warm_image_confidence_is_float(self, analyze):
        pytest.importorskip("cv2", reason="OpenCV required")
        pytest.importorskip("PIL")
        path = _make_gradient_image((210, 170, 100), (160, 120, 60))
        result = analyze(path)
        assert isinstance(result["confidence"], float)


# ─────────────────────────────────────────────────────────────────────────────
# 3. Snowy / cool-palette image → temperate / northern
# ─────────────────────────────────────────────────────────────────────────────

class TestSnowyLandscape:

    def test_cool_white_image_returns_valid_region(self, analyze):
        pytest.importorskip("cv2", reason="OpenCV required")
        pytest.importorskip("PIL")
        # White-blue sky to light grey-blue ground (RGB)
        path = _make_gradient_image((200, 220, 240), (230, 235, 245))
        result = analyze(path)
        assert isinstance(result["likely_region"], str)

    def test_cool_image_has_time_period(self, analyze):
        pytest.importorskip("cv2", reason="OpenCV required")
        pytest.importorskip("PIL")
        path = _make_gradient_image((200, 220, 240), (230, 235, 245))
        result = analyze(path)
        tp = result.get("time_period", {})
        assert isinstance(tp, dict)
        assert "estimated_decade" in tp


# ─────────────────────────────────────────────────────────────────────────────
# 4. cross_check_with_claim — fully deterministic, no image needed
# ─────────────────────────────────────────────────────────────────────────────

class TestCrossCheckWithClaim:

    def test_matching_location_no_mismatch(self, svc):
        geo    = _geo_result("Middle East / North Africa", conf=0.7)
        result = svc.cross_check_with_claim(geo, "Cairo, Egypt", "")
        assert result["location_mismatch"] is False
        assert result["geolocation_suspicion_score"] < 0.5

    def test_mismatching_location_flagged(self, svc):
        """Detected = Middle East, claimed = New York → should flag mismatch."""
        geo    = _geo_result("Middle East / North Africa", conf=0.7)
        result = svc.cross_check_with_claim(geo, "New York, USA", "")
        assert result["location_mismatch"] is True
        assert result["geolocation_suspicion_score"] > 0.3

    def test_mismatching_location_has_mismatch_details(self, svc):
        geo    = _geo_result("North America", conf=0.8)
        result = svc.cross_check_with_claim(geo, "London, United Kingdom", "")
        if result["location_mismatch"]:
            assert len(result["mismatch_details"]) > 0

    def test_empty_claimed_location_no_mismatch_flag(self, svc):
        geo    = _geo_result("Western Europe", conf=0.6)
        result = svc.cross_check_with_claim(geo, "", "")
        assert result["location_mismatch"] is False

    def test_unknown_region_no_mismatch_flag(self, svc):
        """If the detector doesn't recognise a region, don't falsely flag."""
        geo    = _geo_result("Unknown", conf=0.0)
        result = svc.cross_check_with_claim(geo, "Tokyo, Japan", "")
        assert result["location_mismatch"] is False

    def test_low_confidence_does_not_flag(self, svc):
        """Confidence below 0.20 means the detector is unsure → no flag."""
        geo    = _geo_result("Middle East / North Africa", conf=0.10)
        result = svc.cross_check_with_claim(geo, "London", "")
        assert result["location_mismatch"] is False

    def test_schema_keys_present(self, svc):
        geo    = _geo_result("East Asia", conf=0.5)
        result = svc.cross_check_with_claim(geo, "Paris, France", "")
        for key in ("location_mismatch", "date_mismatch",
                    "mismatch_details", "geolocation_suspicion_score"):
            assert key in result, f"Missing: {key}"

    def test_suspicion_score_in_range(self, svc):
        geo    = _geo_result("North America", conf=0.8)
        result = svc.cross_check_with_claim(geo, "Beijing, China", "")
        assert 0.0 <= result["geolocation_suspicion_score"] <= 1.0

    def test_matching_east_asia_no_mismatch(self, svc):
        geo    = _geo_result("East Asia", conf=0.75)
        result = svc.cross_check_with_claim(geo, "Tokyo, Japan", "")
        assert result["location_mismatch"] is False

    def test_matching_north_america_no_mismatch(self, svc):
        geo    = _geo_result("North America", conf=0.65)
        result = svc.cross_check_with_claim(geo, "New York, USA", "")
        assert result["location_mismatch"] is False
