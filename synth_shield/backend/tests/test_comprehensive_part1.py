"""
SynthShield Comprehensive Test Suite — Part 1 (Tests 1–50)
Tests: Health, Database, Score Engine, Media Validator, Reports, Certificate, Demo Mode
"""
import io
import os
import sys
import uuid
import struct
import hashlib
import tempfile
import wave
import array
from pathlib import Path
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone

import pytest
import numpy as np
from PIL import Image

# ── Ensure backend is importable ──────────────────────────────────────────────
_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

os.environ.setdefault("DATABASE_URL", f"sqlite:///{Path(__file__).parent / 'test_run.db'}")

from fastapi.testclient import TestClient
from database import Base, engine, AnalysisResult, CybercrimeReport, SessionLocal, init_db
from main import app

client = TestClient(app)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _init_tables():
    """Create all tables before each test."""
    init_db()
    yield


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


def _make_jpeg(w=200, h=200, color=(128, 100, 80)):
    """Create a noisy JPEG that passes the std-dev coherence check."""
    arr = np.random.randint(0, 255, (h, w, 3), dtype=np.uint8)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def _make_png(w=200, h=200, color=(100, 150, 100)):
    """Create a noisy PNG that passes the std-dev coherence check."""
    arr = np.random.randint(0, 255, (h, w, 3), dtype=np.uint8)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_wav(duration_s=3.0, sr=16000, freq=440.0):
    n = int(sr * duration_s)
    t = np.linspace(0, duration_s, n, dtype=np.float32)
    samples = (np.sin(2 * np.pi * freq * t) * 16000).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(samples.tobytes())
    return buf.getvalue()


def _save_tmp(data: bytes, suffix=".jpg") -> str:
    f = tempfile.NamedTemporaryFile(suffix=suffix, delete=False, dir=str(_BACKEND / "uploads"))
    f.write(data)
    f.close()
    return f.name


def _seed_analysis(db, analysis_id=None, score=75.0, file_type="image"):
    aid = analysis_id or str(uuid.uuid4())
    rec = AnalysisResult(
        id=aid, file_hash=hashlib.sha256(aid.encode()).hexdigest(),
        file_type=file_type, reality_score=score,
        signal_breakdown=[{"signal": "CNN Deepfake Classifier", "fake_score": 0.3, "weight": "30%", "contribution": 0.09, "finding": "ok"}],
    )
    db.add(rec)
    db.commit()
    return aid


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 1–5: Health & App Setup
# ═══════════════════════════════════════════════════════════════════════════════

def test_01_health_endpoint():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["app"] == "SynthShield"


def test_02_openapi_docs_available():
    r = client.get("/openapi.json")
    assert r.status_code == 200
    assert "paths" in r.json()


def test_03_cors_headers():
    r = client.options("/health", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert r.status_code in (200, 204, 405)


def test_04_unknown_route_returns_404():
    r = client.get("/api/nonexistent")
    assert r.status_code in (404, 405)


def test_05_app_title_correct():
    r = client.get("/openapi.json")
    assert r.json()["info"]["title"] == "SynthShield API"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 6–15: Score Engine
# ═══════════════════════════════════════════════════════════════════════════════

def test_06_score_engine_all_signals_real():
    from services.score_engine import calculate_reality_score
    signals = {"cnn_fake_probability": 0.1, "qsam_anomaly_score": 0.05,
               "ela_score": 0.1, "metadata_suspicion_score": 0.05,
               "context_match_score": 0.9, "geolocation_suspicion_score": 0.05}
    result = calculate_reality_score(signals)
    assert result["reality_score"] >= 80
    assert result["verdict"] == "Likely Real"
    assert result["color"] == "green"


def test_07_score_engine_all_signals_fake():
    from services.score_engine import calculate_reality_score
    signals = {"cnn_fake_probability": 0.95, "qsam_anomaly_score": 0.9,
               "ela_score": 0.85, "metadata_suspicion_score": 0.9,
               "context_match_score": 0.1, "geolocation_suspicion_score": 0.9}
    result = calculate_reality_score(signals)
    assert result["reality_score"] < 50
    assert result["verdict"] == "Likely Fake"
    assert result["color"] == "red"


def test_08_score_engine_suspicious_range():
    from services.score_engine import calculate_reality_score
    signals = {"cnn_fake_probability": 0.4, "qsam_anomaly_score": 0.35,
               "ela_score": 0.3, "metadata_suspicion_score": 0.4}
    result = calculate_reality_score(signals)
    assert 0 <= result["reality_score"] <= 100


def test_09_score_engine_no_signals():
    from services.score_engine import calculate_reality_score
    result = calculate_reality_score({})
    assert result["verdict"] == "Inconclusive"
    assert result["confidence"] == 0.0


def test_10_score_engine_with_audio():
    from services.score_engine import calculate_reality_score
    signals = {"cnn_fake_probability": 0.2, "qsam_anomaly_score": 0.1,
               "audio_clone_probability": 0.8}
    result = calculate_reality_score(signals)
    assert any(s["signal"] == "Voice Clone Detection" for s in result["signal_breakdown"])


def test_11_score_engine_clamps_values():
    from services.score_engine import calculate_reality_score
    signals = {"cnn_fake_probability": 5.0, "qsam_anomaly_score": -2.0}
    result = calculate_reality_score(signals)
    assert 0 <= result["reality_score"] <= 100


def test_12_score_engine_none_signals_skipped():
    from services.score_engine import calculate_reality_score
    signals = {"cnn_fake_probability": 0.3, "qsam_anomaly_score": None,
               "ela_score": None, "metadata_suspicion_score": 0.2}
    result = calculate_reality_score(signals)
    assert result["reality_score"] > 0
    assert len(result["signal_breakdown"]) == 2


def test_13_score_engine_breakdown_has_required_fields():
    from services.score_engine import calculate_reality_score
    signals = {"cnn_fake_probability": 0.5}
    result = calculate_reality_score(signals)
    for item in result["signal_breakdown"]:
        assert "signal" in item
        assert "contribution" in item
        assert "finding" in item
        assert "weight" in item
        assert "fake_score" in item


def test_14_score_engine_confidence_range():
    from services.score_engine import calculate_reality_score
    signals = {"cnn_fake_probability": 0.9, "qsam_anomaly_score": 0.85,
               "ela_score": 0.8, "metadata_suspicion_score": 0.9,
               "context_match_score": 0.1, "geolocation_suspicion_score": 0.88}
    result = calculate_reality_score(signals)
    assert 0.0 <= result["confidence"] <= 1.0


def test_15_score_engine_legacy_compute_score():
    from services.score_engine import compute_score
    results = {"cnn_confidence": 0.3, "qsam_score": 0.2, "metadata_risk": 0.1, "news_risk": 0.3}
    out = compute_score(results)
    assert "reality_score" in out
    assert "verdict" in out


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 16–25: Media Validator
# ═══════════════════════════════════════════════════════════════════════════════

def test_16_validator_valid_jpeg():
    from services.media_validator import MediaValidator
    v = MediaValidator()
    data = _make_jpeg()
    path = _save_tmp(data, ".jpg")
    try:
        result = v.validate(path)
        assert result.is_valid is True
        assert result.file_type == "image"
    finally:
        os.unlink(path)


def test_17_validator_valid_png():
    from services.media_validator import MediaValidator
    v = MediaValidator()
    data = _make_png()
    path = _save_tmp(data, ".png")
    try:
        result = v.validate(path)
        assert result.is_valid is True
        assert result.file_type == "image"
    finally:
        os.unlink(path)


def test_18_validator_rejects_nonexistent_file():
    from services.media_validator import MediaValidator
    v = MediaValidator()
    result = v.validate("/nonexistent/file.jpg")
    assert result.is_valid is False
    assert "not found" in result.error_message.lower()


def test_19_validator_rejects_unsupported_extension():
    from services.media_validator import MediaValidator
    v = MediaValidator()
    path = _save_tmp(b"not a real file", ".xyz")
    try:
        result = v.validate(path)
        assert result.is_valid is False
        assert "unsupported" in result.error_message.lower()
    finally:
        os.unlink(path)


def test_20_validator_rejects_magic_mismatch():
    from services.media_validator import MediaValidator
    v = MediaValidator()
    path = _save_tmp(b"this is just plain text content " * 10, ".jpg")
    try:
        result = v.validate(path)
        assert result.is_valid is False
    finally:
        os.unlink(path)


def test_21_validator_rejects_tiny_image():
    from services.media_validator import MediaValidator
    v = MediaValidator()
    data = _make_jpeg(w=32, h=32)
    path = _save_tmp(data, ".jpg")
    try:
        result = v.validate(path)
        assert result.is_valid is False
        assert "resolution" in result.error_message.lower() or "minimum" in result.error_message.lower()
    finally:
        os.unlink(path)


def test_22_validator_rejects_solid_color_image():
    from services.media_validator import MediaValidator
    v = MediaValidator()
    img = Image.new("RGB", (200, 200), (0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    path = _save_tmp(buf.getvalue(), ".jpg")
    try:
        result = v.validate(path)
        assert result.is_valid is False
        assert "meaningful" in result.error_message.lower() or "content" in result.error_message.lower()
    finally:
        os.unlink(path)


def test_23_validator_file_size_limit():
    from services.media_validator import MediaValidator, _SIZE_LIMITS
    assert _SIZE_LIMITS["image"] == 20 * 1024 * 1024
    assert _SIZE_LIMITS["video"] == 200 * 1024 * 1024
    assert _SIZE_LIMITS["audio"] == 50 * 1024 * 1024


def test_24_validator_valid_wav():
    from services.media_validator import MediaValidator
    v = MediaValidator()
    data = _make_wav(duration_s=3.0)
    path = _save_tmp(data, ".wav")
    try:
        result = v.validate(path)
        assert result.is_valid is True
        assert result.file_type == "audio"
    finally:
        os.unlink(path)


def test_25_validator_rejects_silent_audio():
    from services.media_validator import MediaValidator
    v = MediaValidator()
    n = int(16000 * 3)
    samples = np.zeros(n, dtype=np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(samples.tobytes())
    path = _save_tmp(buf.getvalue(), ".wav")
    try:
        result = v.validate(path)
        assert result.is_valid is False
        assert "silent" in result.error_message.lower()
    finally:
        os.unlink(path)


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 26–37: Reports CRUD & Filters
# ═══════════════════════════════════════════════════════════════════════════════

def test_26_create_report_success(db):
    aid = _seed_analysis(db, score=30.0)
    r = client.post("/api/reports/", json={
        "analysis_id": aid, "description": "Test deepfake", "platform": "twitter",
        "contact_email": "test@example.com"
    })
    assert r.status_code == 201
    body = r.json()
    assert body["analysis_id"] == aid
    assert body["status"] == "pending"
    assert body["platform"] == "twitter"


def test_27_create_report_missing_analysis():
    r = client.post("/api/reports/", json={"analysis_id": "nonexistent-id-12345"})
    assert r.status_code == 404


def test_28_list_reports_returns_array(db):
    aid = _seed_analysis(db, score=40.0)
    client.post("/api/reports/", json={"analysis_id": aid, "platform": "facebook"})
    r = client.get("/api/reports/")
    assert r.status_code == 200
    body = r.json()
    assert "reports" in body
    assert "total" in body
    assert isinstance(body["reports"], list)


def test_29_list_reports_pagination(db):
    for i in range(5):
        aid = _seed_analysis(db, score=20.0 + i)
        client.post("/api/reports/", json={"analysis_id": aid})
    r = client.get("/api/reports/", params={"skip": 0, "limit": 2})
    body = r.json()
    assert len(body["reports"]) <= 2


def test_30_list_reports_score_filter(db):
    aid_low = _seed_analysis(db, score=20.0)
    aid_high = _seed_analysis(db, score=90.0)
    client.post("/api/reports/", json={"analysis_id": aid_low})
    client.post("/api/reports/", json={"analysis_id": aid_high})
    r = client.get("/api/reports/", params={"score_max": 50})
    body = r.json()
    for rpt in body["reports"]:
        if rpt["reality_score"] is not None:
            assert rpt["reality_score"] <= 50


def test_31_get_report_by_id(db):
    aid = _seed_analysis(db, score=60.0)
    create_r = client.post("/api/reports/", json={"analysis_id": aid, "description": "fetch test"})
    rid = create_r.json()["id"]
    r = client.get(f"/api/reports/{rid}")
    assert r.status_code == 200
    assert r.json()["id"] == rid


def test_32_get_report_not_found():
    r = client.get("/api/reports/nonexistent-report-id")
    assert r.status_code == 404


def test_33_report_includes_reality_score(db):
    aid = _seed_analysis(db, score=45.0)
    create_r = client.post("/api/reports/", json={"analysis_id": aid})
    assert create_r.json()["reality_score"] == 45.0


def test_34_report_optional_fields(db):
    aid = _seed_analysis(db, score=50.0)
    r = client.post("/api/reports/", json={"analysis_id": aid})
    body = r.json()
    assert body["description"] is None
    assert body["platform"] is None
    assert body["contact_email"] is None


def test_35_export_csv(db):
    aid = _seed_analysis(db, score=55.0)
    client.post("/api/reports/", json={"analysis_id": aid, "platform": "csv_test"})
    r = client.get("/api/reports/export/csv")
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    text = r.text
    assert "id" in text
    assert "analysis_id" in text


def test_36_date_filter_invalid_format():
    r = client.get("/api/reports/", params={"date_from": "not-a-date"})
    assert r.status_code == 422


def test_37_report_created_at_populated(db):
    aid = _seed_analysis(db, score=70.0)
    create_r = client.post("/api/reports/", json={"analysis_id": aid})
    assert create_r.json()["created_at"] is not None


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 38–42: Certificate
# ═══════════════════════════════════════════════════════════════════════════════

def test_38_certificate_not_found_no_analysis():
    r = client.get("/api/certificate/nonexistent-analysis-id")
    assert r.status_code == 404


def test_39_certificate_verify_not_found():
    r = client.get("/api/certificate/nonexistent/verify")
    assert r.status_code == 404


def test_40_certificate_verify_with_record(db):
    aid = str(uuid.uuid4())
    rec = AnalysisResult(id=aid, file_hash="abc123", file_type="image",
                         reality_score=85.0, signal_breakdown=[])
    db.add(rec)
    db.commit()
    cert_path = Path("uploads") / f"certificate_{aid}.pdf"
    cert_path.parent.mkdir(exist_ok=True)
    cert_path.write_bytes(b"%PDF-1.4 fake cert content for test")
    try:
        r = client.get(f"/api/certificate/{aid}/verify")
        assert r.status_code == 200
        body = r.json()
        assert body["verified"] is True
        assert body["algorithm"] == "HMAC-SHA256"
    finally:
        cert_path.unlink(missing_ok=True)


def test_41_certificate_download_with_file(db):
    aid = str(uuid.uuid4())
    rec = AnalysisResult(id=aid, file_hash="xyz789", file_type="image",
                         reality_score=90.0, signal_breakdown=[])
    db.add(rec)
    db.commit()
    cert_path = Path("uploads") / f"certificate_{aid}.pdf"
    cert_path.parent.mkdir(exist_ok=True)
    cert_path.write_bytes(b"%PDF-1.4 test content")
    try:
        r = client.get(f"/api/certificate/{aid}")
        assert r.status_code == 200
        assert "pdf" in r.headers.get("content-type", "").lower()
    finally:
        cert_path.unlink(missing_ok=True)


def test_42_certificate_no_pdf_file(db):
    aid = str(uuid.uuid4())
    rec = AnalysisResult(id=aid, file_hash="nopdf", file_type="image",
                         reality_score=50.0, signal_breakdown=[])
    db.add(rec)
    db.commit()
    r = client.get(f"/api/certificate/{aid}")
    assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 43–47: Demo Mode
# ═══════════════════════════════════════════════════════════════════════════════

def test_43_demo_mode_fake_analysis():
    from demo_mode import fake_analysis
    result = fake_analysis("test_photo.jpg", "image")
    assert "analysis_id" in result
    assert "score" in result
    assert result["demo"] is True


def test_44_demo_mode_deterministic():
    from demo_mode import fake_analysis
    r1 = fake_analysis("same_file.jpg")
    r2 = fake_analysis("same_file.jpg")
    assert r1["score"]["final_score"] == r2["score"]["final_score"]
    assert r1["score"]["verdict"] == r2["score"]["verdict"]


def test_45_demo_mode_different_files_differ():
    from demo_mode import fake_analysis
    r1 = fake_analysis("file_a.jpg")
    r2 = fake_analysis("file_b.jpg")
    # Different filenames should produce different analysis_ids
    assert r1["analysis_id"] != r2["analysis_id"]


def test_46_demo_mode_score_range():
    from demo_mode import fake_analysis
    result = fake_analysis("range_test.png")
    assert 0.0 <= result["score"]["final_score"] <= 1.0


def test_47_demo_mode_has_all_keys():
    from demo_mode import fake_analysis
    result = fake_analysis("keys_test.mp4", "video")
    required = ["analysis_id", "file_hash", "media_type", "filename", "demo",
                 "cnn", "qsam", "metadata", "audio", "patterns", "geolocation",
                 "watermark", "score", "created_at"]
    for key in required:
        assert key in result, f"Missing key: {key}"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 48–50: Database Models
# ═══════════════════════════════════════════════════════════════════════════════

def test_48_analysis_result_persist(db):
    aid = str(uuid.uuid4())
    rec = AnalysisResult(id=aid, file_hash="h1", file_type="image", reality_score=88.0)
    db.add(rec)
    db.commit()
    fetched = db.query(AnalysisResult).filter_by(id=aid).first()
    assert fetched is not None
    assert fetched.reality_score == 88.0


def test_49_cybercrime_report_persist(db):
    aid = _seed_analysis(db, score=30.0)
    rid = str(uuid.uuid4())
    rpt = CybercrimeReport(id=rid, analysis_id=aid, description="test",
                           platform="telegram", status="pending")
    db.add(rpt)
    db.commit()
    fetched = db.query(CybercrimeReport).filter_by(id=rid).first()
    assert fetched is not None
    assert fetched.platform == "telegram"


def test_50_init_db_idempotent():
    init_db()
    init_db()  # should not raise
    db = SessionLocal()
    try:
        count = db.query(AnalysisResult).count()
        assert count >= 0
    finally:
        db.close()
