"""
Tests that malformed / invalid inputs are rejected before any ML analysis runs.

All tests operate at one of two levels:
  1. MediaValidator.validate() directly — no HTTP stack needed
  2. FastAPI TestClient — ensures the router returns 422, not 200

No real deepfake model is required; we only care that bad inputs are gated out.
"""
import io
import os
import struct
import tempfile
import uuid
import wave
from pathlib import Path

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_run_reject.db")

pytest.importorskip("fastapi", reason="FastAPI required")
pytest.importorskip("httpx",   reason="httpx required (pip install httpx)")

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from main import app
from services.media_validator import MediaValidator


# ── Shared validator instance ─────────────────────────────────────────────────

@pytest.fixture(scope="module")
def validator():
    return MediaValidator()


# ── TestClient with isolated DB ───────────────────────────────────────────────

_REJECT_DB = "sqlite:///./test_reject_endpoints.db"

@pytest.fixture(scope="module")
def client():
    engine = create_engine(_REJECT_DB, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def _override():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    try:
        Path("test_reject_endpoints.db").unlink(missing_ok=True)
    except OSError:
        pass  # Windows may still hold the file; harmless


@pytest.fixture(autouse=True)
def reset_rate_limit():
    """Clear the in-process rate store before each test to prevent 429 bleed."""
    from routers.analyze import _rate_store
    _rate_store.clear()
    yield


# ── File-creation helpers ─────────────────────────────────────────────────────

def _write_tmp(content: bytes, suffix: str) -> str:
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp.write(content)
    tmp.flush()
    tmp.close()
    return tmp.name


def _png_magic() -> bytes:
    """Minimal valid PNG magic header (enough for magic-byte check)."""
    return b"\x89PNG\r\n\x1a\n"


def _jpeg_magic() -> bytes:
    return b"\xFF\xD8\xFF"


def _valid_gradient_png(width=300, height=300) -> bytes:
    """Real gradient PNG that passes the solid-colour std check."""
    PIL = pytest.importorskip("PIL", reason="Pillow required")
    import numpy as np
    from PIL import Image
    arr = (
        (255 - (255 * y // (height - 1))) if (height > 1) else 0
        for y in range(height)
    )
    data = [(int(255 * y / max(height - 1, 1)), 120, 80) for y in range(height)]
    img_arr = __import__("numpy").zeros((height, width, 3), dtype=__import__("numpy").uint8)
    for y, rgb in enumerate(data):
        img_arr[y, :] = rgb
    img = Image.fromarray(img_arr, "RGB")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _silent_wav(duration_sec: float = 0.5, framerate: int = 44100) -> bytes:
    """WAV file filled with zeros (silence)."""
    buf = io.BytesIO()
    n_frames = int(framerate * duration_sec)
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(framerate)
        wf.writeframes(b"\x00" * n_frames * 2)
    return buf.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
# 1. Direct MediaValidator tests — no HTTP
# ─────────────────────────────────────────────────────────────────────────────

class TestMediaValidatorRejections:

    def test_plain_text_file_rejected(self, validator):
        path = _write_tmp(b"This is plain text, definitely not an image.", ".txt")
        try:
            result = validator.validate(path)
            assert not result.is_valid
        finally:
            os.unlink(path)

    def test_pdf_renamed_to_jpg_rejected(self, validator):
        """PDF magic bytes (%PDF-) inside a .jpg extension must be caught."""
        path = _write_tmp(b"%PDF-1.4 fake pdf content here", ".jpg")
        try:
            result = validator.validate(path)
            assert not result.is_valid, "PDF disguised as JPEG should be rejected"
        finally:
            os.unlink(path)

    def test_random_binary_rejected(self, validator):
        """Random binary data with no valid extension should be rejected."""
        path = _write_tmp(os.urandom(1024), ".bin")
        try:
            result = validator.validate(path)
            assert not result.is_valid
        finally:
            os.unlink(path)

    def test_zip_renamed_to_png_rejected(self, validator):
        """ZIP magic (PK\x03\x04) inside .png extension must be caught."""
        path = _write_tmp(b"PK\x03\x04" + b"\x00" * 100, ".png")
        try:
            result = validator.validate(path)
            assert not result.is_valid, "ZIP disguised as PNG should be rejected"
        finally:
            os.unlink(path)

    def test_empty_file_rejected(self, validator):
        path = _write_tmp(b"", ".jpg")
        try:
            result = validator.validate(path)
            assert not result.is_valid
        finally:
            os.unlink(path)

    def test_nonexistent_file_rejected(self, validator):
        result = validator.validate("/nonexistent/path/image.png")
        assert not result.is_valid

    def test_oversized_image_rejected(self, validator):
        """Fake PNG magic header on a 25 MB file should fail size check."""
        # Use a tmpdir to avoid actually writing 25 MB of real PNG data
        path = _write_tmp(_png_magic() + b"\x00" * (25 * 1024 * 1024), ".png")
        try:
            result = validator.validate(path)
            assert not result.is_valid
            assert "MB" in (result.error_message or "")
        finally:
            os.unlink(path)

    def test_valid_gradient_png_passes(self, validator):
        pytest.importorskip("PIL")
        data = _valid_gradient_png()
        path = _write_tmp(data, ".png")
        try:
            result = validator.validate(path)
            assert result.is_valid
            assert result.file_type == "image"
        finally:
            os.unlink(path)

    def test_unknown_extension_rejected(self, validator):
        path = _write_tmp(b"some data", ".xyz")
        try:
            result = validator.validate(path)
            assert not result.is_valid
        finally:
            os.unlink(path)

    def test_1x1_pixel_image_rejected(self, validator):
        pytest.importorskip("PIL")
        from PIL import Image
        img = Image.new("RGB", (1, 1), color=(128, 128, 128))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        path = _write_tmp(buf.getvalue(), ".png")
        try:
            result = validator.validate(path)
            # 1×1 is below IMAGE_MIN_DIM (64) so should be rejected
            assert not result.is_valid
        finally:
            os.unlink(path)

    def test_solid_black_image_rejected(self, validator):
        """Pure solid-colour images fail the std threshold check."""
        pytest.importorskip("PIL")
        from PIL import Image
        img = Image.new("RGB", (300, 300), color=(0, 0, 0))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        path = _write_tmp(buf.getvalue(), ".png")
        try:
            result = validator.validate(path)
            # Solid colour → std ≈ 0 < IMAGE_STD_THRESHOLD → rejected
            assert not result.is_valid
        finally:
            os.unlink(path)

    def test_silent_wav_rejected(self, validator):
        """WAV with RMS ≈ 0 should fail the audio coherence check."""
        data = _silent_wav(duration_sec=0.5)
        path = _write_tmp(data, ".wav")
        try:
            result = validator.validate(path)
            # Short AND silent → rejected by audio coherence
            assert not result.is_valid
        finally:
            os.unlink(path)


# ─────────────────────────────────────────────────────────────────────────────
# 2. HTTP-level rejection — same bad inputs sent through the API
# ─────────────────────────────────────────────────────────────────────────────

class TestApiRejectsInvalidInputs:

    def test_plain_text_upload_returns_422(self, client):
        data = b"Hello, world - this is a plain text file."
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("file.txt", data, "text/plain")},
        )
        assert resp.status_code == 422

    def test_pdf_as_jpg_returns_422(self, client):
        data = b"%PDF-1.4 fake pdf content"
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("photo.jpg", data, "image/jpeg")},
        )
        assert resp.status_code == 422

    def test_random_binary_returns_422(self, client):
        data = os.urandom(512)
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("data.bin", data, "application/octet-stream")},
        )
        assert resp.status_code == 422

    def test_empty_file_returns_422(self, client):
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("empty.png", b"", "image/png")},
        )
        assert resp.status_code == 422

    def test_solid_color_image_returns_422(self, client):
        """Solid-colour PNG should fail MediaValidator coherence check."""
        pytest.importorskip("PIL")
        from PIL import Image
        img = Image.new("RGB", (300, 300), color=(200, 200, 200))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("solid.png", buf.getvalue(), "image/png")},
        )
        assert resp.status_code == 422

    def test_tiny_image_returns_422(self, client):
        """1×1 pixel image should be rejected (below min dimension)."""
        pytest.importorskip("PIL")
        from PIL import Image
        img = Image.new("RGB", (1, 1), color=(0, 0, 0))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("tiny.png", buf.getvalue(), "image/png")},
        )
        assert resp.status_code == 422

    def test_rejection_response_has_error_key(self, client):
        data = b"not an image"
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("junk.jpg", data, "image/jpeg")},
        )
        assert resp.status_code == 422
        body = resp.json()
        # Error detail may be under "detail" at top level or nested
        assert "detail" in body or "error" in body

    def test_valid_image_is_not_rejected(self, client):
        """Sanity check: a real gradient image must NOT be rejected."""
        pytest.importorskip("PIL")
        data = _valid_gradient_png()
        resp = client.post(
            "/api/analyze/upload",
            files={"file": ("real.png", data, "image/png")},
        )
        assert resp.status_code == 200
