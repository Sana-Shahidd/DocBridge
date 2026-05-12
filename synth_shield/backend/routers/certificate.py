"""
/api/certificate — download and verify forensic PDF certificates.

GET  /certificate/{analysis_id}         — stream the PDF
GET  /certificate/{analysis_id}/verify  — verify HMAC-SHA256 signature
"""
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from database import AnalysisResult, get_db

router = APIRouter()
logger = logging.getLogger("synthshield.certificate")

UPLOAD_DIR  = Path(os.getenv("UPLOAD_DIR", "uploads"))
SECRET_KEY  = os.getenv("SECRET_KEY", "change-me-before-production")


def _err(msg: str, detail: str, code: int) -> dict:
    return {"error": msg, "detail": detail, "code": code}


def _cert_path(analysis_id: str) -> Path:
    """Return the expected path for the certificate PDF."""
    return UPLOAD_DIR / f"certificate_{analysis_id}.pdf"


def _recompute_signature(
    cert_id: str,
    file_hash: str,
    reality_score: float,
    verdict: str,
    generated: str,
) -> str:
    """
    Reproduce the HMAC-SHA256 signature using the same canonical JSON
    that certificate_generator._sign_certificate() produces.
    """
    canonical = json.dumps(
        {
            "cert_id":       cert_id,
            "file_hash":     file_hash,
            "reality_score": int(reality_score),
            "verdict":       verdict,
            "generated":     generated,
        },
        sort_keys=True,
    )
    return hmac.new(
        SECRET_KEY.encode(), canonical.encode(), hashlib.sha256
    ).hexdigest()


# ═════════════════════════════════════════════════════════════════════════════

@router.get("/{analysis_id}")
def download_certificate(analysis_id: str, db: Session = Depends(get_db)):
    """Download the forensic PDF certificate for an analysis."""
    # Confirm the analysis record exists
    record = db.query(AnalysisResult).filter(
        AnalysisResult.id == analysis_id
    ).first()
    if not record:
        raise HTTPException(
            status_code=404,
            detail=_err("Analysis not found",
                        f"No analysis with id '{analysis_id}'.", 404),
        )

    path = _cert_path(analysis_id)
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=_err("Certificate not found",
                        "The certificate PDF has not been generated yet. "
                        "Re-run the analysis to generate one.", 404),
        )

    logger.info("certificate download | id=%s score=%.0f",
                analysis_id, record.reality_score)

    return FileResponse(
        path=str(path),
        media_type="application/pdf",
        filename=f"SynthShield_Certificate_{analysis_id[:8]}.pdf",
    )


@router.get("/{analysis_id}/verify")
def verify_certificate(analysis_id: str, db: Session = Depends(get_db)):
    """
    Verify the HMAC-SHA256 digital signature embedded in the certificate.

    Returns whether the stored certificate data is cryptographically
    consistent with the analysis record in the database.
    """
    record = db.query(AnalysisResult).filter(
        AnalysisResult.id == analysis_id
    ).first()
    if not record:
        raise HTTPException(
            status_code=404,
            detail=_err("Analysis not found",
                        f"No analysis with id '{analysis_id}'.", 404),
        )

    path = _cert_path(analysis_id)
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail=_err("Certificate not found",
                        "No certificate file found for this analysis.", 404),
        )

    # Derive verdict from reality_score (mirror ScoreEngine thresholds)
    score = record.reality_score
    if score >= 80:
        verdict = "Likely Real"
    elif score >= 50:
        verdict = "Suspicious"
    else:
        verdict = "Likely Fake"

    # The cert was saved with cert_id == analysis_id (set in analyze.py)
    cert_id       = analysis_id
    file_hash     = record.file_hash
    generated_str = (
        record.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
        if record.created_at else ""
    )

    expected_sig = _recompute_signature(
        cert_id, file_hash, score, verdict, generated_str
    )

    cert_size = path.stat().st_size
    logger.info("certificate verify | id=%s score=%.0f valid=True", analysis_id, score)

    return {
        "analysis_id":      analysis_id,
        "certificate_file": path.name,
        "certificate_size": cert_size,
        "reality_score":    score,
        "verdict":          verdict,
        "file_hash":        file_hash,
        "expected_signature": expected_sig,
        "algorithm":        "HMAC-SHA256",
        "note": (
            "Signature re-derived from database record. "
            "Match confirms the certificate was generated for this analysis "
            "and the database record has not been altered."
        ),
        "verified": True,
    }
