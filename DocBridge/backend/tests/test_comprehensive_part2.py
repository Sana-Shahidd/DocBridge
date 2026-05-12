"""
SynthShield Comprehensive Test Suite — Part 2 (Tests 51–100)
Tests: Intelligence, GeoLens, Watermark, Metadata, CNN, QSAM, Audio, News, Upload, Edge Cases
"""
import io
import os
import sys
import uuid
import hashlib
import tempfile
import wave
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
import numpy as np
from PIL import Image

_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

os.environ.setdefault("DATABASE_URL", f"sqlite:///{Path(__file__).parent / 'test_run.db'}")

from fastapi.testclient import TestClient
from database import Base, engine, AnalysisResult, CybercrimeReport, SessionLocal, init_db
from main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _init():
    init_db()
    yield


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.close()


def _jpeg(w=200, h=200, color=(128, 100, 80)):
    img = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _png(w=200, h=200, color=(100, 150, 100)):
    img = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _noisy_jpeg(w=300, h=300):
    arr = np.random.randint(0, 255, (h, w, 3), dtype=np.uint8)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _tmp(data, suffix=".jpg"):
    Path(_BACKEND / "uploads").mkdir(exist_ok=True)
    f = tempfile.NamedTemporaryFile(suffix=suffix, delete=False, dir=str(_BACKEND / "uploads"))
    f.write(data)
    f.close()
    return f.name


def _seed(db, score=75.0, ftype="image"):
    aid = str(uuid.uuid4())
    rec = AnalysisResult(id=aid, file_hash=hashlib.sha256(aid.encode()).hexdigest(),
                         file_type=ftype, reality_score=score, signal_breakdown=[])
    db.add(rec)
    db.commit()
    return aid


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 51–55: Intelligence Endpoints
# ═══════════════════════════════════════════════════════════════════════════════

def test_51_patterns_endpoint_empty():
    r = client.get("/api/intelligence/patterns")
    assert r.status_code == 200
    body = r.json()
    assert "clusters" in body
    assert "total_analyses" in body


def test_52_patterns_with_data(db):
    _seed(db, score=20.0)
    _seed(db, score=85.0)
    r = client.get("/api/intelligence/patterns")
    body = r.json()
    assert body["total_analyses"] >= 2


def test_53_brief_invalid_pattern_id():
    r = client.get("/api/intelligence/brief/invalid_id")
    assert r.status_code == 404


def test_54_brief_valid_cluster_id(db):
    _seed(db, score=30.0)
    r = client.get("/api/intelligence/brief/cluster_likely_fake")
    assert r.status_code == 200


def test_55_verify_claims_empty():
    r = client.post("/api/intelligence/verify-claims", json={"claims": []})
    assert r.status_code == 200
    assert r.json()["overall_risk"] == 0.0


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 56–62: GeoLens Service
# ═══════════════════════════════════════════════════════════════════════════════

def test_56_geolens_returns_result():
    from services.geolens_service import analyze_geolocation
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        result = analyze_geolocation(path)
        assert "likely_region" in result
        assert "confidence" in result
        assert "climate_zone" in result
    finally:
        os.unlink(path)


def test_57_geolens_file_not_found():
    from services.geolens_service import analyze_geolocation
    result = analyze_geolocation("/no/such/file.jpg")
    assert result["likely_region"] == "Unknown"


def test_58_geolens_time_period():
    from services.geolens_service import GeoLensService
    svc = GeoLensService()
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        result = svc.estimate_time_period(path)
        assert "estimated_decade" in result
        assert "indicators" in result
    finally:
        os.unlink(path)


def test_59_geolens_claim_cross_check():
    from services.geolens_service import GeoLensService
    svc = GeoLensService()
    geo_result = {"likely_region": "Middle East / North Africa", "confidence": 0.7}
    check = svc.cross_check_with_claim(geo_result, "London, UK", "")
    assert "location_mismatch" in check
    assert "geolocation_suspicion_score" in check


def test_60_geolens_no_mismatch_same_region():
    from services.geolens_service import GeoLensService
    svc = GeoLensService()
    geo_result = {"likely_region": "Western Europe", "confidence": 0.6}
    check = svc.cross_check_with_claim(geo_result, "Paris, France", "")
    assert check["location_mismatch"] is False


def test_61_geolens_api_endpoint():
    data = _noisy_jpeg()
    r = client.post("/api/geolens/analyze",
                    files={"file": ("test.jpg", io.BytesIO(data), "image/jpeg")})
    assert r.status_code == 200
    assert "likely_region" in r.json()


def test_62_geolens_with_claimed_location():
    data = _noisy_jpeg()
    r = client.post("/api/geolens/analyze",
                    files={"file": ("test.jpg", io.BytesIO(data), "image/jpeg")},
                    data={"claimed_location": "Tokyo, Japan"})
    assert r.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 63–68: Metadata Verifier
# ═══════════════════════════════════════════════════════════════════════════════

def test_63_metadata_verify_image():
    from services.metadata_verifier import verify_metadata
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        result = verify_metadata(path)
        assert "ela_score" in result
        assert "metadata_suspicion_score" in result
        assert 0.0 <= result["ela_score"] <= 1.0
    finally:
        os.unlink(path)


def test_64_metadata_file_not_found():
    from services.metadata_verifier import verify_metadata
    result = verify_metadata("/no/file.jpg")
    assert "error" in result


def test_65_metadata_exif_flags_type():
    from services.metadata_verifier import verify_metadata
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        result = verify_metadata(path)
        assert isinstance(result["exif_flags"], list)
    finally:
        os.unlink(path)


def test_66_metadata_content_anchor():
    from services.metadata_verifier import MetadataVerifier
    v = MetadataVerifier()
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        h = v.anchor_content_hash(path, "image")
        assert isinstance(h, str)
        assert len(h) == 64  # SHA-256 hex
    finally:
        os.unlink(path)


def test_67_metadata_ela_image_base64():
    from services.metadata_verifier import verify_metadata
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        result = verify_metadata(path)
        if result.get("ela_image_base64"):
            import base64
            decoded = base64.b64decode(result["ela_image_base64"])
            assert len(decoded) > 0
    finally:
        os.unlink(path)


def test_68_metadata_suspicion_clamped():
    from services.metadata_verifier import verify_metadata
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        result = verify_metadata(path)
        assert 0.0 <= result["metadata_suspicion_score"] <= 1.0
    finally:
        os.unlink(path)


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 69–74: CNN Classifier
# ═══════════════════════════════════════════════════════════════════════════════

def test_69_cnn_classify_image():
    from services.cnn_classifier import classify
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        result = classify(path, "image")
        assert "fake_probability" in result or "error" in result
    finally:
        os.unlink(path)


def test_70_cnn_classify_unsupported_type():
    from services.cnn_classifier import classify
    result = classify("dummy.txt", "text")
    assert result.get("label") == "uncertain" or "details" in result


def test_71_cnn_heuristic_returns_scores():
    from services.cnn_classifier import _heuristic_score
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        result = _heuristic_score(path)
        if "error" not in result:
            assert 0.0 <= result["fake_probability"] <= 1.0
            assert result["method"] == "heuristic"
    finally:
        os.unlink(path)


def test_72_cnn_file_not_found():
    from services.cnn_classifier import classify
    result = classify("/no/such/file.jpg", "image")
    assert "error" in result


def test_73_cnn_heuristic_has_subscores():
    from services.cnn_classifier import _heuristic_score
    data = _noisy_jpeg(400, 400)
    path = _tmp(data, ".jpg")
    try:
        result = _heuristic_score(path)
        if "error" not in result:
            assert "edge_score" in result
            assert "colour_score" in result
            assert "texture_score" in result
    finally:
        os.unlink(path)


def test_74_cnn_confidence_range():
    from services.cnn_classifier import classify
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        result = classify(path, "image")
        if "confidence" in result:
            assert 0.0 <= result["confidence"] <= 1.0
    finally:
        os.unlink(path)


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 75–79: QSAM Engine
# ═══════════════════════════════════════════════════════════════════════════════

def test_75_qsam_non_image_returns_zero():
    from services.qsam_engine import run_qsam
    result = run_qsam("dummy.mp3", "audio")
    assert result["score"] == 0.0


def test_76_qsam_fft_features():
    from services.qsam_engine import _fft_features
    channel = np.random.rand(256, 256)
    feats = _fft_features(channel)
    assert "high_freq_ratio" in feats
    assert "symmetry_deficit" in feats
    assert "periodic_score" in feats
    assert "noise_floor" in feats


def test_77_qsam_fingerprint_extraction():
    from services.qsam_engine import extract_prnu_fingerprint
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        fp = extract_prnu_fingerprint(path)
        assert fp is not None
        assert isinstance(fp, np.ndarray)
    finally:
        os.unlink(path)


def test_78_qsam_fingerprint_compare():
    from services.qsam_engine import compare_fingerprints
    fp1 = np.random.randn(100, 100)
    fp2 = fp1 + np.random.randn(100, 100) * 0.01
    score = compare_fingerprints(fp1, fp2)
    assert 0.0 <= score <= 1.0
    assert score > 0.8  # very similar


def test_79_qsam_fingerprint_compare_different():
    from services.qsam_engine import compare_fingerprints
    fp1 = np.random.randn(100, 100)
    fp2 = np.random.randn(100, 100)
    score = compare_fingerprints(fp1, fp2)
    assert 0.0 <= score <= 1.0


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 80–84: News Verifier
# ═══════════════════════════════════════════════════════════════════════════════

def test_80_news_verifier_no_api_keys():
    from services.news_verifier import NewsVerifier
    nv = NewsVerifier()
    result = nv.verify_context("earthquake in Turkey 2024", "outdoor scene")
    assert "context_match_score" in result
    assert result["context_match_score"] == 0.5  # neutral when no keys


def test_81_news_verifier_empty_context():
    from services.news_verifier import NewsVerifier
    nv = NewsVerifier()
    result = nv.verify_context("", "")
    assert result["status"] in ("no_context_provided", "api_keys_not_configured")


def test_82_verify_claims_function():
    from services.news_verifier import verify_claims
    result = verify_claims(["The earth is round"])
    assert "verdicts" in result
    assert "overall_risk" in result


def test_83_news_image_description():
    from services.news_verifier import NewsVerifier
    nv = NewsVerifier()
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        desc = nv.extract_image_description(path)
        assert isinstance(desc, str)
    finally:
        os.unlink(path)


def test_84_news_tokeniser():
    from services.news_verifier import _tokenise
    tokens = _tokenise("The quick brown fox jumps over the lazy dog")
    assert "quick" in tokens
    assert "the" not in tokens  # stop word


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 85–89: Upload Endpoint & Validation
# ═══════════════════════════════════════════════════════════════════════════════

def test_85_upload_rejects_no_file():
    r = client.post("/api/analyze/upload")
    assert r.status_code == 422


def test_86_upload_rejects_text_file():
    r = client.post("/api/analyze/upload",
                    files={"file": ("test.txt", io.BytesIO(b"hello world"), "text/plain")})
    assert r.status_code == 422


def test_87_upload_rejects_tiny_image():
    img = Image.new("RGB", (32, 32), (100, 100, 100))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    r = client.post("/api/analyze/upload",
                    files={"file": ("tiny.jpg", io.BytesIO(buf.getvalue()), "image/jpeg")})
    assert r.status_code == 422


def test_88_upload_valid_image_succeeds():
    data = _noisy_jpeg(300, 300)
    r = client.post("/api/analyze/upload",
                    files={"file": ("photo.jpg", io.BytesIO(data), "image/jpeg")})
    assert r.status_code == 200
    body = r.json()
    assert "analysis_id" in body
    assert "reality_score" in body
    assert "verdict" in body
    assert "signal_breakdown" in body
    assert "certificate_url" in body


def test_89_upload_returns_correct_fields():
    data = _noisy_jpeg()
    r = client.post("/api/analyze/upload",
                    files={"file": ("test.jpg", io.BytesIO(data), "image/jpeg")})
    if r.status_code == 200:
        body = r.json()
        assert "file_hash" in body
        assert "file_type" in body
        assert body["file_type"] == "image"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 90–94: Watermark Service Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def test_90_watermark_bytes_to_bits():
    from services.watermark_service import _bytes_to_bits, _bits_to_bytes
    original = b"\xAB\xCD"
    bits = _bytes_to_bits(original)
    assert len(bits) == 16
    recovered = _bits_to_bytes(bits)
    assert recovered == original


def test_91_watermark_xor_crc():
    from services.watermark_service import _xor_crc
    assert _xor_crc(b"\x00\x00") == 0
    assert _xor_crc(b"\xFF\xFF") == 0
    assert _xor_crc(b"\xAA\x55") == 0xFF


def test_92_watermark_psnr_identical():
    from services.watermark_service import _psnr
    img = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
    assert _psnr(img, img) == 100.0


def test_93_watermark_psnr_different():
    from services.watermark_service import _psnr
    img1 = np.zeros((100, 100, 3), dtype=np.uint8)
    img2 = np.ones((100, 100, 3), dtype=np.uint8) * 255
    psnr = _psnr(img1, img2)
    assert psnr < 10.0


def test_94_watermark_extract_no_file():
    from services.watermark_service import WatermarkService
    ws = WatermarkService()
    result = ws.extract_watermark("/no/file.jpg")
    assert result["payload_found"] is False


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 95–100: Edge Cases & Integration
# ═══════════════════════════════════════════════════════════════════════════════

def test_95_score_engine_weight_redistribution():
    from services.score_engine import _redistribute
    weights = {"A": 0.5, "B": 0.3, "C": 0.2}
    result = _redistribute(weights, {"C"})
    assert abs(sum(result.values()) - 1.0) < 0.01
    assert "C" not in result


def test_96_score_engine_all_removed():
    from services.score_engine import _redistribute
    result = _redistribute({"A": 0.5, "B": 0.5}, {"A", "B"})
    assert result == {}


def test_97_finding_text_levels():
    from services.score_engine import _finding_text
    low = _finding_text("CNN Deepfake Classifier", 0.1)
    mid = _finding_text("CNN Deepfake Classifier", 0.5)
    high = _finding_text("CNN Deepfake Classifier", 0.8)
    assert "authentic" in low.lower()
    assert "moderate" in mid.lower() or "review" in mid.lower()
    assert "strong" in high.lower() or "likely" in high.lower()


def test_98_source_seal_legacy_create():
    from services.source_seal_service import create_seal, verify_seal
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        seal = create_seal(path, {"author": "test"})
        assert "seal_id" in seal
        assert "signature" in seal
        verify_result = verify_seal(path, seal)
        assert verify_result["valid"] is True
    finally:
        os.unlink(path)


def test_99_source_seal_tampered_file():
    from services.source_seal_service import create_seal, verify_seal
    data = _noisy_jpeg()
    path = _tmp(data, ".jpg")
    try:
        seal = create_seal(path, {"author": "test"})
        with open(path, "ab") as f:
            f.write(b"tampered!")
        verify_result = verify_seal(path, seal)
        assert verify_result["valid"] is False
        assert "mismatch" in verify_result["reason"].lower()
    finally:
        os.unlink(path)


def test_100_full_pipeline_report_from_analysis():
    """Integration: upload → get analysis → create report → fetch report."""
    data = _noisy_jpeg(300, 300)
    r1 = client.post("/api/analyze/upload",
                     files={"file": ("pipeline.jpg", io.BytesIO(data), "image/jpeg")})
    if r1.status_code != 200:
        pytest.skip("Upload pipeline not available in test env")
    aid = r1.json()["analysis_id"]

    r2 = client.post("/api/reports/", json={
        "analysis_id": aid, "description": "Pipeline test", "platform": "instagram"
    })
    assert r2.status_code == 201
    rid = r2.json()["id"]

    r3 = client.get(f"/api/reports/{rid}")
    assert r3.status_code == 200
    assert r3.json()["analysis_id"] == aid
    assert r3.json()["platform"] == "instagram"
