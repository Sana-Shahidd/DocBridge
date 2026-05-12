"""POST /api/analyze/upload — full deepfake detection pipeline with parallel analysis."""
import asyncio
import hashlib
import logging
import os
import shutil
import time
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from database import AnalysisResult, get_db
from services.audio_analyzer import analyze_audio
from services.certificate_generator import generate_certificate
from services.cnn_classifier import classify
from services.geolens_service import analyze_geolocation
from services.media_validator import MediaValidator
from services.metadata_verifier import verify_metadata
from services.news_verifier import NewsVerifier
from services.qsam_engine import run_qsam
from services.score_engine import calculate_reality_score

router = APIRouter()
logger = logging.getLogger("synthshield.analyze")

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))
_validator = MediaValidator()
_executor  = ThreadPoolExecutor(max_workers=8, thread_name_prefix="ss-analyze")

# ── Rate limiting: sliding window 10 req / 60 s per IP ───────────────────────
_RATE_LIMIT  = 10
_RATE_WINDOW = 60.0
_rate_store: Dict[str, List[float]] = defaultdict(list)


def _reset_rate_store() -> None:
    """Clear all rate-limit state — called by tests between requests."""
    _rate_store.clear()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(ip: str) -> None:
    now = time.monotonic()
    _rate_store[ip] = [t for t in _rate_store[ip] if now - t < _RATE_WINDOW]
    if len(_rate_store[ip]) >= _RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={
                "error":  "Rate limit exceeded",
                "detail": "Max 10 analysis requests per minute per IP.",
                "code":   429,
            },
        )
    _rate_store[ip].append(now)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


async def _run(fn, *args):
    """Run a blocking function in the shared thread pool."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_executor, fn, *args)


async def _noop_dict():
    return {}


async def _noop_none():
    return None


# ═════════════════════════════════════════════════════════════════════════════

@router.post("/upload")
async def analyze_upload(
    request:          Request,
    file:             UploadFile    = File(...),
    context_text:     Optional[str] = Form(None),
    claimed_location: Optional[str] = Form(None),
    db:               Session       = Depends(get_db),
):
    """
    Run the full SynthShield detection pipeline on an uploaded media file.

    Returns reality_score, all signal breakdowns, geolocation_result,
    and a certificate_url for downloading the forensic PDF.
    """
    client_ip = _client_ip(request)
    _check_rate_limit(client_ip)

    analysis_id = str(uuid.uuid4())
    UPLOAD_DIR.mkdir(exist_ok=True)
    suffix    = Path(file.filename or "upload").suffix or ".bin"
    dest_path = UPLOAD_DIR / f"{analysis_id}{suffix}"

    # Save file to disk first
    with open(dest_path, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    # Validate immediately — reject before any heavy analysis
    vr = _validator.validate(str(dest_path))
    if not vr.is_valid:
        dest_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=422,
            detail={
                "error":  "Invalid media file",
                "detail": vr.error_message,
                "code":   422,
            },
        )

    media_type = vr.file_type
    file_hash  = _sha256(dest_path)
    path_str   = str(dest_path)
    is_av      = media_type in ("audio", "video")

    logger.info(
        "analyze start | id=%s ip=%s file=%s type=%s",
        analysis_id, client_ip, file.filename, media_type,
    )

    # ── Build task list for parallel execution ────────────────────────────────
    coros: List[Any] = [
        _run(run_qsam,   path_str, media_type),        # 0
        _run(classify,   path_str, media_type),        # 1
        _run(verify_metadata, path_str),               # 2
        _run(analyze_geolocation, path_str,            # 3
             claimed_location),
    ]

    # Audio analysis — only for audio/video files
    coros.append(_run(analyze_audio, path_str) if is_av else _noop_dict())   # 4

    # News verification — only when context_text is provided
    if context_text and context_text.strip():
        _nv = NewsVerifier()
        coros.append(_run(_nv.verify_context, context_text, ""))             # 5
    else:
        coros.append(_noop_none())                                           # 5

    raw = await asyncio.gather(*coros, return_exceptions=True)

    def _safe(r, default=None):
        return r if not isinstance(r, Exception) else (default or {})

    qsam_r  = _safe(raw[0])
    cnn_r   = _safe(raw[1])
    meta_r  = _safe(raw[2])
    geo_r   = _safe(raw[3])
    audio_r = _safe(raw[4])
    news_r  = raw[5] if not isinstance(raw[5], Exception) else None

    # ── Map service outputs → score engine signal keys ────────────────────────
    geo_suspicion: Optional[float] = None
    if geo_r and "claim_check" in geo_r:
        geo_suspicion = geo_r["claim_check"].get("geolocation_suspicion_score")

    signals: Dict[str, Any] = {
        "qsam_anomaly_score":          qsam_r.get("score"),
        "cnn_fake_probability":        cnn_r.get("fake_probability"),
        "ela_score":                   meta_r.get("ela_score"),
        "metadata_suspicion_score":    meta_r.get("metadata_suspicion_score"),
        "context_match_score":         news_r.get("context_match_score") if news_r else None,
        "geolocation_suspicion_score": geo_suspicion,
        "audio_clone_probability":     audio_r.get("voice_clone_probability") if is_av else None,
    }

    score_result = calculate_reality_score(signals)

    # ── Generate PDF certificate ──────────────────────────────────────────────
    file_info = {
        "filename":        file.filename or dest_path.name,
        "file_hash":       file_hash,
        "file_type":       media_type,
        "file_size_bytes": dest_path.stat().st_size,
    }
    full_result_for_cert = {
        **score_result,
        "geolocation":       geo_r,
        "news_verification": news_r,
    }
    cert_bytes = await _run(generate_certificate, full_result_for_cert, file_info)
    # Save under analysis_id-based name so certificate.py can locate it
    cert_path = UPLOAD_DIR / f"certificate_{analysis_id}.pdf"
    cert_path.write_bytes(cert_bytes)

    # ── Persist to database ───────────────────────────────────────────────────
    record = AnalysisResult(
        id                 = analysis_id,
        file_hash          = file_hash,
        file_type          = media_type,
        reality_score      = float(score_result["reality_score"]),
        signal_breakdown   = score_result["signal_breakdown"],
        geolocation_result = geo_r,
        watermark_data     = {"cert_id": analysis_id},
    )
    db.add(record)
    db.commit()

    logger.info(
        "analyze done | id=%s type=%s score=%d verdict=%s",
        analysis_id, media_type,
        score_result["reality_score"], score_result.get("verdict"),
    )

    return {
        "analysis_id":       analysis_id,
        "filename":          file.filename,
        "file_hash":         file_hash,
        "file_type":         media_type,
        "reality_score":     score_result["reality_score"],
        "verdict":           score_result["verdict"],
        "confidence":        score_result["confidence"],
        "color":             score_result["color"],
        "signal_breakdown":  score_result["signal_breakdown"],
        "geolocation_result": geo_r,
        "news_verification": news_r,
        "qsam":              qsam_r,
        "cnn":               cnn_r,
        "metadata":          meta_r,
        "audio":             audio_r if is_av else None,
        "certificate_url":   f"/api/certificate/{analysis_id}",
    }
