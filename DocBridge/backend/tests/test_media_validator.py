"""
Comprehensive tests for MediaValidator.

Run from backend/:
    pytest tests/test_media_validator.py -v
"""
import array
import io
import math
import os
import wave
from pathlib import Path

import pytest

from services.media_validator import MediaValidator, ValidationResult, ValidationError

# Pre-generated test fixture (created by opencv, verified ftyp magic bytes)
_FIXTURE_MP4 = Path(__file__).parent / "fixtures" / "sample.mp4"

# ---------------------------------------------------------------------------
# Fixture factories
# ---------------------------------------------------------------------------


def _make_mp4(path: str, n_frames: int = 90, fps: float = 30.0,
              width: int = 320, height: int = 240) -> None:
    """Generate a synthetic MP4 with varied content using opencv."""
    cv2 = pytest.importorskip("cv2")
    np = pytest.importorskip("numpy")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(path, fourcc, fps, (width, height))
    for i in range(n_frames):
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        for y in range(0, height, 20):
            for x in range(0, width, 20):
                c = 200 if (y // 20 + x // 20) % 2 == 0 else 50
                frame[y:y + 20, x:x + 20] = (c, 80 + i % 100, 120)
        cv2.rectangle(frame, (i * 2 % 200, 50), (i * 2 % 200 + 80, 150), (0, 255, 100), -1)
        writer.write(frame)
    writer.release()

def _make_wav(duration_s: float = 3.0, silent: bool = False, sample_rate: int = 44100) -> bytes:
    """Build a valid WAV file using stdlib only — no external deps."""
    n_frames = int(sample_rate * duration_s)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        if silent:
            data = array.array("h", [0] * n_frames)
        else:
            data = array.array(
                "h",
                [int(16000 * math.sin(2 * math.pi * 440 * i / sample_rate)) for i in range(n_frames)],
            )
        wf.writeframes(data.tobytes())
    return buf.getvalue()


def _make_png(width: int = 200, height: int = 200, solid: bool = False) -> bytes:
    """Build a PNG using Pillow. Tests that call this are auto-skipped if Pillow missing."""
    PIL = pytest.importorskip("PIL", reason="Pillow required for image fixtures")
    from PIL import Image
    import random

    if solid:
        img = Image.new("RGB", (width, height), color=(128, 128, 128))
    else:
        pixels = [tuple(random.randint(10, 245) for _ in range(3)) for _ in range(width * height)]
        img = Image.new("RGB", (width, height))
        img.putdata(pixels)

    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def _make_jpeg(width: int = 200, height: int = 200) -> bytes:
    PIL = pytest.importorskip("PIL", reason="Pillow required for image fixtures")
    from PIL import Image
    import random

    pixels = [tuple(random.randint(10, 245) for _ in range(3)) for _ in range(width * height)]
    img = Image.new("RGB", (width, height))
    img.putdata(pixels)
    out = io.BytesIO()
    img.save(out, format="JPEG")
    return out.getvalue()


@pytest.fixture
def v() -> MediaValidator:
    return MediaValidator()


# ---------------------------------------------------------------------------
# Step 1 — File type validation
# ---------------------------------------------------------------------------

class TestFileTypeValidation:
    def test_txt_renamed_jpg_is_rejected(self, v, tmp_path):
        p = tmp_path / "fake.jpg"
        p.write_bytes(b"This is plain text pretending to be a JPEG.\n")
        result = v.validate(str(p))
        assert not result.is_valid
        assert result.file_type == ""

    def test_txt_renamed_mp4_is_rejected(self, v, tmp_path):
        p = tmp_path / "fake.mp4"
        p.write_bytes(b"not a video")
        result = v.validate(str(p))
        assert not result.is_valid
        assert result.file_type == ""

    def test_txt_renamed_wav_is_rejected(self, v, tmp_path):
        p = tmp_path / "fake.wav"
        p.write_bytes(b"not a wav file at all")
        result = v.validate(str(p))
        assert not result.is_valid
        assert result.file_type == ""

    def test_unsupported_extension_gif_rejected(self, v, tmp_path):
        p = tmp_path / "anim.gif"
        p.write_bytes(b"GIF87a" + b"\x00" * 20)
        result = v.validate(str(p))
        assert not result.is_valid
        assert "Unsupported" in result.error_message

    def test_nonexistent_file_rejected(self, v):
        result = v.validate("/does/not/exist/file.jpg")
        assert not result.is_valid
        assert "not found" in result.error_message.lower()

    def test_valid_png_magic_accepted(self, v, tmp_path):
        pytest.importorskip("PIL")
        p = tmp_path / "real.png"
        p.write_bytes(_make_png(200, 200))
        result = v.validate(str(p))
        assert result.file_type == "image"

    def test_valid_jpeg_magic_accepted(self, v, tmp_path):
        pytest.importorskip("PIL")
        p = tmp_path / "real.jpg"
        p.write_bytes(_make_jpeg(200, 200))
        assert v.validate(str(p)).file_type == "image"

    def test_valid_wav_magic_accepted(self, v, tmp_path):
        p = tmp_path / "real.wav"
        p.write_bytes(_make_wav())
        assert v.validate(str(p)).file_type == "audio"


# ---------------------------------------------------------------------------
# Step 2 — Size limits
# ---------------------------------------------------------------------------

class TestFileSizeLimits:
    def test_rejects_oversized_image(self, v, tmp_path, monkeypatch):
        import services.media_validator as mv
        monkeypatch.setitem(mv._SIZE_LIMITS, "image", 50)  # 50-byte limit for test
        pytest.importorskip("PIL")
        p = tmp_path / "big.png"
        p.write_bytes(_make_png(200, 200))
        result = v.validate(str(p))
        assert not result.is_valid
        assert "exceeds" in result.error_message

    def test_rejects_oversized_audio(self, v, tmp_path, monkeypatch):
        import services.media_validator as mv
        monkeypatch.setitem(mv._SIZE_LIMITS, "audio", 50)  # 50-byte limit for test
        p = tmp_path / "big.wav"
        p.write_bytes(_make_wav(duration_s=3.0))
        result = v.validate(str(p))
        assert not result.is_valid
        assert "exceeds" in result.error_message

    def test_file_within_size_limit_passes_size_check(self, v, tmp_path):
        p = tmp_path / "ok.wav"
        p.write_bytes(_make_wav(duration_s=3.0))
        result = v.validate(str(p))
        # May fail coherence, but should not fail on size
        assert "exceeds" not in (result.error_message or "")


# ---------------------------------------------------------------------------
# Step 3 — Image coherence
# ---------------------------------------------------------------------------

class TestImageCoherence:
    def test_valid_image_passes(self, v, tmp_path):
        pytest.importorskip("PIL")
        p = tmp_path / "valid.png"
        p.write_bytes(_make_png(200, 200))
        result = v.validate(str(p))
        assert result.is_valid, result.error_message

    def test_valid_jpeg_passes(self, v, tmp_path):
        pytest.importorskip("PIL")
        p = tmp_path / "valid.jpg"
        p.write_bytes(_make_jpeg(200, 200))
        result = v.validate(str(p))
        assert result.is_valid, result.error_message

    def test_solid_color_image_rejected(self, v, tmp_path):
        pytest.importorskip("PIL")
        p = tmp_path / "solid.png"
        p.write_bytes(_make_png(200, 200, solid=True))
        result = v.validate(str(p))
        assert not result.is_valid
        assert "meaningful visual content" in result.error_message

    def test_tiny_image_under_64px_rejected(self, v, tmp_path):
        pytest.importorskip("PIL")
        from PIL import Image
        img = Image.new("RGB", (32, 32), color=(100, 150, 200))
        out = io.BytesIO()
        img.save(out, format="PNG")
        p = tmp_path / "tiny.png"
        p.write_bytes(out.getvalue())
        result = v.validate(str(p))
        assert not result.is_valid
        assert "32" in result.error_message or "minimum" in result.error_message.lower()

    def test_exactly_64px_passes_dimension_check(self, v, tmp_path):
        pytest.importorskip("PIL")
        p = tmp_path / "borderline.png"
        p.write_bytes(_make_png(64, 64))
        result = v.validate(str(p))
        # Should pass dimension check (may fail std_dev if unlucky with random, but unlikely)
        if not result.is_valid:
            assert "64" not in result.error_message  # not a dimension error

    def test_valid_result_contains_dimensions(self, v, tmp_path):
        pytest.importorskip("PIL")
        p = tmp_path / "meta.png"
        p.write_bytes(_make_png(200, 200))
        result = v.validate(str(p))
        if result.is_valid:
            assert result.file_metadata["width"] == 200
            assert result.file_metadata["height"] == 200
            assert result.file_metadata["size_bytes"] > 0


# ---------------------------------------------------------------------------
# Step 4 — Video coherence (skipped without opencv)
# ---------------------------------------------------------------------------

class TestVideoCoherence:
    def test_txt_renamed_mp4_always_rejected(self, v, tmp_path):
        p = tmp_path / "fake.mp4"
        p.write_bytes(b"this is not a real mp4")
        result = v.validate(str(p))
        assert not result.is_valid

    def test_valid_mp4_passes(self, v, tmp_path):
        pytest.importorskip("cv2", reason="opencv required for video coherence test")
        path = str(tmp_path / "valid.mp4")
        _make_mp4(path)
        result = v.validate(path)
        assert result.is_valid, result.error_message
        assert result.file_type == "video"

    def test_valid_mp4_result_has_metadata(self, v, tmp_path):
        pytest.importorskip("cv2", reason="opencv required for video coherence test")
        path = str(tmp_path / "meta.mp4")
        _make_mp4(path, n_frames=90, fps=30.0, width=320, height=240)
        result = v.validate(path)
        assert result.is_valid, result.error_message
        assert result.file_metadata["width"] == 320
        assert result.file_metadata["height"] == 240
        assert result.file_metadata["duration_seconds"] >= 1.0
        assert result.file_metadata["fps"] > 0

    def test_pregenerated_fixture_mp4_passes(self, v):
        pytest.importorskip("cv2", reason="opencv required for video coherence test")
        if not _FIXTURE_MP4.exists():
            pytest.skip("Pre-generated fixture not found — run: python -c \"...\" to create it.")
        result = v.validate(str(_FIXTURE_MP4))
        assert result.is_valid, result.error_message
        assert result.file_type == "video"

    def test_mp4_exceeding_60s_rejected(self, v, tmp_path):
        pytest.importorskip("cv2", reason="opencv required for video coherence test")
        path = str(tmp_path / "long.mp4")
        _make_mp4(path, n_frames=1830, fps=30.0)  # 61 seconds
        result = v.validate(path)
        assert not result.is_valid
        assert "60" in result.error_message or "exceed" in result.error_message.lower()


# ---------------------------------------------------------------------------
# Step 5 — Audio coherence
# ---------------------------------------------------------------------------

class TestAudioCoherence:
    def test_valid_wav_passes(self, v, tmp_path):
        p = tmp_path / "valid.wav"
        p.write_bytes(_make_wav(duration_s=3.0))
        result = v.validate(str(p))
        assert result.is_valid, result.error_message

    def test_silent_wav_rejected(self, v, tmp_path):
        p = tmp_path / "silent.wav"
        p.write_bytes(_make_wav(duration_s=3.0, silent=True))
        result = v.validate(str(p))
        assert not result.is_valid
        assert "silent" in result.error_message.lower()

    def test_short_audio_rejected(self, v, tmp_path):
        p = tmp_path / "short.wav"
        p.write_bytes(_make_wav(duration_s=0.5))
        result = v.validate(str(p))
        assert not result.is_valid
        assert "0.5" in result.error_message or "least 2" in result.error_message

    def test_valid_audio_result_has_metadata(self, v, tmp_path):
        p = tmp_path / "meta.wav"
        p.write_bytes(_make_wav(duration_s=3.0))
        result = v.validate(str(p))
        assert result.is_valid, result.error_message
        assert result.file_metadata["duration_seconds"] >= 2.0
        assert result.file_metadata["sample_rate"] == 44100
        assert result.file_metadata["rms"] > 0


# ---------------------------------------------------------------------------
# ValidationResult contract
# ---------------------------------------------------------------------------

class TestValidationResultContract:
    def test_is_valid_false_on_rejection(self, v, tmp_path):
        p = tmp_path / "bad.jpg"
        p.write_bytes(b"not an image")
        result = v.validate(str(p))
        assert isinstance(result, ValidationResult)
        assert result.is_valid is False
        assert result.error_message is not None
        assert isinstance(result.file_metadata, dict)

    def test_is_valid_true_on_success(self, v, tmp_path):
        pytest.importorskip("PIL")
        p = tmp_path / "good.png"
        p.write_bytes(_make_png(200, 200))
        result = v.validate(str(p))
        assert result.is_valid is True
        assert result.error_message is None
        assert result.file_type == "image"
