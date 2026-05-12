"""
Integration tests for FastAPI endpoints using TestClient.

All tests use an in-memory SQLite database via the dependency override.
Heavy ML services may raise exceptions during analysis — the _safe() wrapper
in analyze.py absorbs them, so the endpoint still returns 200.
"""
import io
import os
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Generator

import pytest

# ── Ensure the test DB env var is set before any app import ──────────────────
# (conftest.py does this, but belt-and-suspenders)
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_run_api.db")

# ── Optional import guard — skip entire module if FastAPI not installed ────────
pytest.importorskip("fastapi",   reason="FastAPI required")
pytest.importorskip("httpx",     reason="httpx required (pip install httpx)")


# ── App + DB imports ──────────────────────────────────────────────────────────

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import database as db_module
from database import Base, get_db
from main import app


# ── Test DB fixture ───────────────────────────────────────────────────────────

_TEST_DB_URL = "sqlite:///./test_api_endpoints.db"


@pytest.fixture(scope="module")
def test_engine():
    engine = create_engine(_TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    try:
        Path("test_api_endpoints.db").unlink(missing_ok=True)
    except OSError:
        pass  # Windows may hold the file open; harmless


@pytest.fixture(scope="module")
def client(test_engine) -> Generator:
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    def _override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _png_bytes(r=120, g=150, b=200, width=300, height=300) -> bytes:
    """Return raw bytes of a valid gradient PNG (avoids solid-colour rejection)."""
    PIL = pytest.importorskip("PIL", reason="Pillow required")
    from PIL import Image
    import numpy as np
    top = (r, g, b)
    bot = (r // 2, g // 2, b // 2)
    arr = np.zeros((height, width, 3), dtype=np.uint8)
    for y in range(height):
        t = y / max(height - 1, 1)
        arr[y] = [int(top[c] * (1 - t) + bot[c] * t) for c in range(3)]
    img = Image.fromarray(arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _seed_analysis(client) -> str:
    """Upload a valid image and return the analysis_id for dependent tests."""
    pytest.importorskip("PIL")
    data = _png_bytes()
    resp = client.post(
        "/api/analyze/upload",
        files={"file": ("test.png", data, "image/png")},
    )
    assert resp.status_code == 200, f"Seed upload failed: {resp.text}"
    return resp.json()["analysis_id"]


# ─────────────────────────────────────────────────────────────────────────────
# /health
# ─────────────────────────────────────────────────────────────────────────────

class TestHealth:

    def test_health_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_status_ok(self, client):
        resp = client.get("/health")
        assert resp.json()["status"] == "ok"

    def test_health_app_name(self, client):
        resp = client.get("/health")
        assert "SynthShield" in resp.json().get("app", "")


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/analyze/upload
# ─────────────────────────────────────────────────────────────────────────────

class TestAnalyzeUpload:

    def test_valid_image_returns_200(self, client):
        pytest.importorskip("PIL")
        data = _png_bytes()
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("photo.png", data, "image/png")},
        )
        assert resp.status_code == 200

    def test_valid_image_response_has_analysis_id(self, client):
        pytest.importorskip("PIL")
        data = _png_bytes()
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("photo.png", data, "image/png")},
        )
        assert "analysis_id" in resp.json()

    def test_valid_image_response_has_reality_score(self, client):
        pytest.importorskip("PIL")
        data = _png_bytes()
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("photo.png", data, "image/png")},
        )
        body = resp.json()
        assert "reality_score" in body
        assert 0 <= body["reality_score"] <= 100

    def test_valid_image_response_has_verdict(self, client):
        pytest.importorskip("PIL")
        data = _png_bytes()
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("photo.png", data, "image/png")},
        )
        assert resp.json()["verdict"] in (
            "Likely Real", "Suspicious", "Likely Fake", "Inconclusive"
        )

    def test_txt_file_rejected_422(self, client):
        data = b"This is plain text content, not a media file."
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("readme.txt", data, "text/plain")},
        )
        assert resp.status_code == 422

    def test_oversized_file_rejected(self, client):
        # Create a file larger than the validator's limit
        big = b"\x00" * (210 * 1024 * 1024)  # 210 MB
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("huge.bin", io.BytesIO(big), "application/octet-stream")},
        )
        # Should be rejected — 422 from MediaValidator or connection error from TestClient
        assert resp.status_code in (422, 413, 500)

    def test_claimed_location_accepted(self, client):
        pytest.importorskip("PIL")
        data = _png_bytes()
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("photo.png", data, "image/png")},
            data={"claimed_location": "London, UK"},
        )
        assert resp.status_code == 200

    def test_signal_breakdown_is_list(self, client):
        pytest.importorskip("PIL")
        data = _png_bytes()
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("photo.png", data, "image/png")},
        )
        assert isinstance(resp.json().get("signal_breakdown"), list)

    def test_certificate_url_in_response(self, client):
        pytest.importorskip("PIL")
        data = _png_bytes()
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("photo.png", data, "image/png")},
        )
        cert = resp.json().get("certificate_url", "")
        assert cert.startswith("/api/certificate/")


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/reports/  and  GET /api/reports/
# ─────────────────────────────────────────────────────────────────────────────

class TestReports:

    @pytest.fixture(scope="class")
    def analysis_id(self, client):
        return _seed_analysis(client)

    def test_create_report_returns_201(self, client, analysis_id):
        resp = client.post(
            "/api/reports/",
            json={"analysis_id": analysis_id, "platform": "Twitter", "description": "Test"},
        )
        assert resp.status_code == 201

    def test_create_report_body_has_id(self, client, analysis_id):
        resp = client.post(
            "/api/reports/",
            json={"analysis_id": analysis_id},
        )
        assert "id" in resp.json()

    def test_create_report_for_missing_analysis_returns_404(self, client):
        resp = client.post(
            "/api/reports/",
            json={"analysis_id": str(uuid.uuid4())},
        )
        assert resp.status_code == 404

    def test_list_reports_returns_200(self, client):
        resp = client.get("/api/reports/")
        assert resp.status_code == 200

    def test_list_reports_body_has_reports_key(self, client):
        resp = client.get("/api/reports/")
        assert "reports" in resp.json()

    def test_list_reports_body_has_total(self, client):
        resp = client.get("/api/reports/")
        assert "total" in resp.json()

    def test_get_report_by_id_returns_200(self, client, analysis_id):
        # Create one first
        create_resp = client.post(
            "/api/reports/",
            json={"analysis_id": analysis_id},
        )
        report_id = create_resp.json()["id"]
        resp = client.get(f"/api/reports/{report_id}")
        assert resp.status_code == 200

    def test_get_missing_report_returns_404(self, client):
        resp = client.get(f"/api/reports/{uuid.uuid4()}")
        assert resp.status_code == 404

    def test_export_csv_returns_200(self, client):
        resp = client.get("/api/reports/export/csv")
        assert resp.status_code == 200

    def test_export_csv_content_type(self, client):
        resp = client.get("/api/reports/export/csv")
        assert "text/csv" in resp.headers.get("content-type", "")


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/geolens/analyze
# ─────────────────────────────────────────────────────────────────────────────

class TestGeolensEndpoint:

    def test_geolens_accepts_image(self, client):
        pytest.importorskip("PIL")
        pytest.importorskip("cv2", reason="OpenCV required for geolens")
        data = _png_bytes(r=180, g=140, b=80)
        resp = client.post(
            "/api/geolens/analyze",
            files={"file": ("scene.png", data, "image/png")},
        )
        assert resp.status_code == 200

    def test_geolens_returns_likely_region(self, client):
        pytest.importorskip("PIL")
        pytest.importorskip("cv2", reason="OpenCV required for geolens")
        data = _png_bytes(r=180, g=140, b=80)
        resp = client.post(
            "/api/geolens/analyze",
            files={"file": ("scene.png", data, "image/png")},
        )
        assert "likely_region" in resp.json()

    def test_geolens_with_claimed_location(self, client):
        pytest.importorskip("PIL")
        pytest.importorskip("cv2", reason="OpenCV required for geolens")
        data = _png_bytes(r=180, g=140, b=80)
        resp = client.post(
            "/api/geolens/analyze",
            files={"file": ("scene.png", data, "image/png")},
            data={"claimed_location": "Dubai, UAE"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "claim_check" in body


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/watermark/embed  and  POST /api/watermark/extract
# ─────────────────────────────────────────────────────────────────────────────

class TestWatermarkEndpoints:

    def test_embed_returns_200(self, client):
        pytest.importorskip("PIL")
        data = _png_bytes()
        resp = client.post(
            "/api/watermark/embed",
            files={"file": ("img.png", data, "image/png")},
            data={"payload": "user123:doc001:2026-01-01"},
        )
        assert resp.status_code == 200

    def test_embed_response_has_output_path(self, client):
        pytest.importorskip("PIL")
        data = _png_bytes()
        resp = client.post(
            "/api/watermark/embed",
            files={"file": ("img.png", data, "image/png")},
            data={"payload": "test-payload"},
        )
        body = resp.json()
        # Service returns output_path or similar key
        assert any(k in body for k in ("output_path", "output", "status", "psnr_db"))

    def test_extract_returns_200(self, client):
        pytest.importorskip("PIL")
        data = _png_bytes()
        resp = client.post(
            "/api/watermark/extract",
            files={"file": ("img.png", data, "image/png")},
        )
        assert resp.status_code == 200

    def test_extract_has_payload_found_key(self, client):
        pytest.importorskip("PIL")
        data = _png_bytes()
        resp = client.post(
            "/api/watermark/extract",
            files={"file": ("img.png", data, "image/png")},
        )
        assert "payload_found" in resp.json()
