"""POST /api/geolens — visual geolocation analysis for uploaded images."""
import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services.geolens_service import analyze_geolocation

router = APIRouter()

_UPLOAD_DIR = Path("uploads")


@router.post("/analyze")
async def geolens_analyze(
    file: UploadFile                   = File(...),
    claimed_location: Optional[str]    = Form(None),
    claimed_date:     Optional[str]    = Form(None),
):
    """
    Analyse a single image for geographic and temporal consistency.

    - **file**             — image to analyse (JPEG / PNG / WebP / BMP)
    - **claimed_location** — e.g. "London, UK"  (optional)
    - **claimed_date**     — e.g. "2023-08-15"  (optional, free-form)
    """
    _UPLOAD_DIR.mkdir(exist_ok=True)

    suffix  = Path(file.filename or "upload").suffix or ".jpg"
    tmp_path = _UPLOAD_DIR / f"geo_{uuid.uuid4().hex}{suffix}"

    try:
        with open(tmp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        result = analyze_geolocation(
            str(tmp_path),
            claimed_location=claimed_location,
            claimed_date=claimed_date,
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    return result
