"""
/api/watermark — invisible watermarking and PRNU device fingerprinting.

Watermark endpoints:
  POST /embed    — embed invisible watermark (file upload)
  POST /extract  — extract + identify watermark from a suspected leak
  POST /verify   — compare watermarks between original and leaked copy

PRNU endpoints:
  POST /prnu/register  — register a device with reference images
  POST /prnu/identify  — identify which registered device captured an image
  POST /prnu/link      — check whether two images came from the same device
"""
import os
import shutil
import uuid
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services.watermark_service import _service as wm
from services.prnu_service import _service as prnu

router = APIRouter()

_UPLOAD_DIR = Path("uploads")


# ── helpers ───────────────────────────────────────────────────────────────────

def _save(upload: UploadFile, prefix: str = "wm") -> Path:
    _UPLOAD_DIR.mkdir(exist_ok=True)
    suffix   = Path(upload.filename or "upload").suffix or ".jpg"
    tmp_path = _UPLOAD_DIR / f"{prefix}_{uuid.uuid4().hex}{suffix}"
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    return tmp_path


def _rm(*paths: Path) -> None:
    for p in paths:
        try:
            os.unlink(p)
        except OSError:
            pass


# ═════════════════════════════════════════════════════════════════════════════
# Watermark endpoints
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/embed")
async def watermark_embed(
    file:             UploadFile       = File(...),
    payload:          str              = Form(...),
    screen_resistant: bool             = Form(False),
    output_filename:  Optional[str]    = Form(None),
):
    """
    Embed an invisible watermark carrying **payload** into the uploaded image.

    - **payload**          — free-form string, e.g. `"user123:doc456:2024-01-15"`
    - **screen_resistant** — use stronger DCT+spatial embedding (default false)
    - **output_filename**  — desired name for the watermarked file (optional)
    """
    tmp_in = _save(file, "wmin")
    suffix = Path(file.filename or "out").suffix or ".jpg"
    out_name = output_filename or f"wm_{uuid.uuid4().hex}{suffix}"
    _UPLOAD_DIR.mkdir(exist_ok=True)
    out_path = str(_UPLOAD_DIR / out_name)

    try:
        if screen_resistant:
            result = wm.embed_screen_resistant_watermark(str(tmp_in), payload, out_path)
        else:
            result = wm.embed_watermark(str(tmp_in), payload, out_path)
    finally:
        _rm(tmp_in)

    if result.get("error"):
        raise HTTPException(status_code=422, detail=result["error"])
    return result


@router.post("/extract")
async def watermark_extract(
    file: UploadFile = File(...),
):
    """
    Extract the watermark from *file* and identify the original recipient.

    Returns `payload_found`, the decoded payload, and (if found in the registry)
    the `original_recipient` user ID and `watermark_id`.
    """
    tmp = _save(file, "wmex")
    try:
        result = wm.extract_watermark(str(tmp))
    finally:
        _rm(tmp)
    return result


@router.post("/verify")
async def watermark_verify(
    original_file: UploadFile = File(...),
    leaked_file:   UploadFile = File(...),
):
    """
    Compare watermarks between the **original** image and a suspected **leaked** copy.

    Returns `match` (bool), both payloads, and `leak_confirmed`.
    """
    tmp_orig   = _save(original_file, "wmvorig")
    tmp_leaked = _save(leaked_file,   "wmvleak")
    try:
        result = wm.verify_watermark_integrity(str(tmp_orig), str(tmp_leaked))
    finally:
        _rm(tmp_orig, tmp_leaked)
    return result


# ═════════════════════════════════════════════════════════════════════════════
# PRNU endpoints (carried over from Prompt 9)
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/prnu/register")
async def prnu_register(
    device_name:      str              = Form(...),
    owner_org:        str              = Form(""),
    reference_images: List[UploadFile] = File(...),
):
    """
    Register a device by uploading reference images captured by that device.

    - **device_name**      — e.g. `"Canon EOS R5 #003"`
    - **owner_org**        — organisation that owns the device
    - **reference_images** — 1–N images; 20+ recommended for a stable fingerprint
    """
    tmp_paths: List[Path] = []
    try:
        for upload in reference_images:
            tmp_paths.append(_save(upload, "prnureg"))
        result = prnu.register_device(
            device_name      = device_name,
            owner_org        = owner_org,
            reference_images = [str(p) for p in tmp_paths],
        )
    finally:
        _rm(*tmp_paths)
    return result


@router.post("/prnu/identify")
async def prnu_identify(
    file: UploadFile = File(...),
):
    """
    Identify which registered device captured the uploaded image.

    Returns `matched_device` (null if NCC < 0.85), `match_score`, and ranked
    scores for every registered device.
    """
    tmp = _save(file, "prnuq")
    try:
        result = prnu.identify_device(str(tmp))
    finally:
        _rm(tmp)
    return result


@router.post("/prnu/link")
async def prnu_link(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
):
    """
    Check whether two images were captured by the same physical device.

    Returns `same_device` (bool), `correlation_score`, and a confidence label.
    """
    tmp1 = _save(file1, "prnulnk1")
    tmp2 = _save(file2, "prnulnk2")
    try:
        result = prnu.link_images_by_device(str(tmp1), str(tmp2))
    finally:
        _rm(tmp1, tmp2)
    return result
