"""
/api/intelligence — pattern analysis, campaign briefs, and source protection.

GET  /intelligence/patterns                 — campaign cluster analysis
GET  /intelligence/brief/{pattern_id}       — FIA-formatted PDF brief
POST /intelligence/verify-claims            — cross-check claims against news APIs
POST /intelligence/sourceseal/protect       — journalist source protection
GET  /intelligence/sourceseal/verify/{id}   — verify escrow integrity
POST /intelligence/sourceseal/approve/{id}  — approve synthetic version
"""
import hashlib
import io
import json
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import AnalysisResult, get_db
from services.news_verifier import verify_claims
from services.pattern_matcher import match_patterns
from services.source_seal_service import _service as ss

router = APIRouter()
logger = logging.getLogger("synthshield.intelligence")

_UPLOAD_DIR = Path("uploads")

try:
    from reportlab.lib import colors
    from reportlab.lib.colors import HexColor
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )
    _RL = True
except ImportError:
    _RL = False


def _err(msg: str, detail: str, code: int) -> dict:
    return {"error": msg, "detail": detail, "code": code}


# ── Score-band labels ────────────────────────────────────────────────────────

def _verdict_for(score: float) -> str:
    if score >= 80:
        return "Likely Real"
    if score >= 50:
        return "Suspicious"
    return "Likely Fake"


# ═════════════════════════════════════════════════════════════════════════════
# Campaign pattern analysis
# ═════════════════════════════════════════════════════════════════════════════

def _build_clusters(records: List[AnalysisResult]) -> List[Dict[str, Any]]:
    """
    Group analyses into score-band clusters and compute aggregate statistics.
    Three bands: Likely Fake (0-49), Suspicious (50-79), Likely Real (80-100).
    """
    bands = {
        "likely_fake":  {"id": "cluster_likely_fake",  "label": "Likely Fake",  "range": "0-49",   "items": []},
        "suspicious":   {"id": "cluster_suspicious",   "label": "Suspicious",   "range": "50-79",  "items": []},
        "likely_real":  {"id": "cluster_likely_real",  "label": "Likely Real",  "range": "80-100", "items": []},
    }

    for r in records:
        score = r.reality_score or 0
        entry = {
            "analysis_id": r.id,
            "file_type":   r.file_type,
            "score":       score,
            "file_hash":   r.file_hash,
            "created_at":  r.created_at.isoformat() if r.created_at else None,
        }
        if score >= 80:
            bands["likely_real"]["items"].append(entry)
        elif score >= 50:
            bands["suspicious"]["items"].append(entry)
        else:
            bands["likely_fake"]["items"].append(entry)

    clusters = []
    for band in bands.values():
        items = band["items"]
        scores = [i["score"] for i in items]
        clusters.append({
            "cluster_id":   band["id"],
            "label":        band["label"],
            "score_range":  band["range"],
            "count":        len(items),
            "avg_score":    round(sum(scores) / len(scores), 1) if scores else None,
            "analyses":     items,
        })

    return clusters


@router.get("/patterns")
def get_patterns(db: Session = Depends(get_db)):
    """Return campaign clusters grouped by Reality Score band."""
    records = db.query(AnalysisResult).order_by(AnalysisResult.created_at.desc()).all()
    clusters = _build_clusters(records)

    total   = len(records)
    flagged = sum(1 for r in records if (r.reality_score or 0) < 50)

    logger.info("intelligence patterns | total=%d flagged=%d", total, flagged)

    return {
        "total_analyses": total,
        "flagged_count":  flagged,
        "clusters":       clusters,
        "generated_at":   datetime.now(timezone.utc).isoformat(),
    }


# ── FIA brief PDF ─────────────────────────────────────────────────────────────

def _build_brief_pdf(cluster: Dict[str, Any], generated: str) -> bytes:
    """Generate a FIA (Forensic Intelligence Assessment) brief as PDF bytes."""
    if not _RL:
        return json.dumps({"cluster": cluster, "generated": generated}, indent=2).encode()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            topMargin=2*cm, bottomMargin=2*cm,
                            leftMargin=2.5*cm, rightMargin=2.5*cm)
    styles  = getSampleStyleSheet()
    INDIGO  = HexColor("#4f46e5")
    DARK    = HexColor("#18181b")
    GRAY    = HexColor("#6b7280")
    RED     = HexColor("#dc2626")
    AMBER   = HexColor("#d97706")
    GREEN   = HexColor("#16a34a")

    band_color = {"Likely Fake": RED, "Suspicious": AMBER, "Likely Real": GREEN}.get(
        cluster["label"], GRAY
    )

    title_s = ParagraphStyle("BriefTitle", parent=styles["Title"],
                              fontSize=20, textColor=INDIGO, spaceAfter=4)
    sub_s   = ParagraphStyle("BriefSub",   parent=styles["Normal"],
                              fontSize=9,  textColor=GRAY)
    h2_s    = ParagraphStyle("BriefH2",    parent=styles["Heading2"],
                              fontSize=11, textColor=DARK, spaceBefore=12, spaceAfter=4)
    body_s  = ParagraphStyle("BriefBody",  parent=styles["Normal"],
                              fontSize=9,  leading=14)
    small_s = ParagraphStyle("BriefSmall", parent=styles["Normal"],
                              fontSize=8,  textColor=GRAY, leading=12)

    story: list = []

    # Header
    story.append(Paragraph("SynthShield — Forensic Intelligence Assessment", title_s))
    story.append(Paragraph(
        f"Classification: UNCLASSIFIED | Generated: {generated} | "
        f"Brief ID: FIA-{cluster['cluster_id'].upper()[:16]}",
        sub_s,
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=INDIGO, spaceAfter=8))

    # Executive summary
    story.append(Paragraph("1. Executive Summary", h2_s))
    story.append(Paragraph(
        f"This brief covers the <b>{cluster['label']}</b> campaign cluster "
        f"(Reality Score range {cluster['score_range']}). "
        f"A total of <b>{cluster['count']}</b> media files were analysed in this band "
        f"with an average Reality Score of <b>"
        f"{cluster['avg_score'] if cluster['avg_score'] is not None else 'N/A'}</b>.",
        body_s,
    ))
    story.append(Spacer(1, 8))

    # Threat assessment
    story.append(Paragraph("2. Threat Assessment", h2_s))
    threat_map = {
        "Likely Fake": "HIGH — Files in this cluster exhibit strong indicators of AI generation or manipulation. Immediate review recommended.",
        "Suspicious":  "MEDIUM — Files exhibit anomalous characteristics requiring manual forensic review before publication.",
        "Likely Real": "LOW — Files in this cluster pass automated authenticity checks. Standard editorial review applies.",
    }
    story.append(Paragraph(threat_map.get(cluster["label"], "UNKNOWN"), body_s))
    story.append(Spacer(1, 8))

    # Cluster detail table
    story.append(Paragraph("3. Cluster Detail", h2_s))
    header = [
        Paragraph("<b>Analysis ID</b>", body_s),
        Paragraph("<b>File Type</b>",   body_s),
        Paragraph("<b>Score</b>",       body_s),
        Paragraph("<b>Date</b>",        body_s),
    ]
    rows = [header]
    for item in cluster["analyses"][:20]:
        rows.append([
            Paragraph(item["analysis_id"][:12] + "…", small_s),
            Paragraph(item["file_type"] or "—", small_s),
            Paragraph(str(int(item["score"])), small_s),
            Paragraph((item["created_at"] or "—")[:10], small_s),
        ])
    if cluster["count"] > 20:
        rows.append([Paragraph(f"… and {cluster['count'] - 20} more", small_s),
                     Paragraph("", small_s), Paragraph("", small_s), Paragraph("", small_s)])

    t = Table(rows, colWidths=[6*cm, 3*cm, 2*cm, None])
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, 0), INDIGO),
        ("TEXTCOLOR",   (0, 0), (-1, 0), colors.white),
        ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",    (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#f4f4f5"), colors.white]),
        ("GRID",        (0, 0), (-1, -1), 0.3, GRAY),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(t)
    story.append(Spacer(1, 8))

    # Recommended actions
    story.append(Paragraph("4. Recommended Actions", h2_s))
    actions = {
        "Likely Fake": [
            "Escalate to senior analyst for manual review.",
            "Do not publish or redistribute without verified forensic clearance.",
            "Retain originals for potential law-enforcement referral.",
        ],
        "Suspicious": [
            "Request additional context (geolocation, chain of custody).",
            "Run targeted GeoLens and metadata deep-dive on flagged files.",
            "Withhold publication pending secondary review.",
        ],
        "Likely Real": [
            "Apply standard editorial review process.",
            "Embed SynthShield watermark before distribution.",
            "Archive certificate for future provenance queries.",
        ],
    }.get(cluster["label"], ["Conduct manual review."])
    for action in actions:
        story.append(Paragraph(f"  • {action}", body_s))
    story.append(Spacer(1, 8))

    # Footer
    story.append(HRFlowable(width="100%", thickness=2, color=INDIGO, spaceAfter=4))
    story.append(Paragraph(
        "This assessment is generated by SynthShield automated intelligence systems. "
        "For decisions with legal or editorial consequences, independent human review is required.",
        small_s,
    ))

    doc.build(story)
    return buf.getvalue()


@router.get("/brief/{pattern_id}")
def get_intelligence_brief(pattern_id: str, db: Session = Depends(get_db)):
    """Generate and return a FIA-formatted PDF brief for a campaign cluster."""
    valid_ids = {"cluster_likely_fake", "cluster_suspicious", "cluster_likely_real"}
    if pattern_id not in valid_ids:
        raise HTTPException(
            status_code=404,
            detail=_err("Pattern not found",
                        f"'{pattern_id}' is not a valid cluster ID. "
                        f"Valid IDs: {sorted(valid_ids)}", 404),
        )

    records  = db.query(AnalysisResult).order_by(AnalysisResult.created_at.desc()).all()
    clusters = _build_clusters(records)
    cluster  = next((c for c in clusters if c["cluster_id"] == pattern_id), None)
    if not cluster:
        raise HTTPException(status_code=500,
                            detail=_err("Cluster error", "Could not build cluster.", 500))

    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    pdf_bytes = _build_brief_pdf(cluster, generated)

    logger.info("intelligence brief | pattern=%s count=%d", pattern_id, cluster["count"])

    media_type = "application/pdf" if _RL else "application/json"
    ext        = "pdf" if _RL else "json"
    return Response(
        content=pdf_bytes,
        media_type=media_type,
        headers={
            "Content-Disposition":
                f"attachment; filename=FIA_{pattern_id}_{generated[:10]}.{ext}"
        },
    )


# ═════════════════════════════════════════════════════════════════════════════
# News / claims verification
# ═════════════════════════════════════════════════════════════════════════════

class ClaimsRequest(BaseModel):
    claims: List[str]


@router.post("/verify-claims")
def verify(body: ClaimsRequest):
    """Cross-check a list of text claims against live news APIs."""
    logger.info("verify-claims | count=%d", len(body.claims))
    return verify_claims(body.claims)


# ═════════════════════════════════════════════════════════════════════════════
# Source Seal — journalist / whistleblower protection
# ═════════════════════════════════════════════════════════════════════════════

def _save_upload(upload: UploadFile, prefix: str = "ss") -> Path:
    _UPLOAD_DIR.mkdir(exist_ok=True)
    suffix   = Path(upload.filename or "upload").suffix or ".wav"
    tmp_path = _UPLOAD_DIR / f"{prefix}_{uuid.uuid4().hex}{suffix}"
    with open(tmp_path, "wb") as f:
        shutil.copyfileobj(upload.file, f)
    return tmp_path


@router.post("/sourceseal/protect")
async def sourceseal_protect(
    file:             UploadFile    = File(...),
    source_name:      str           = Form(...),
    journalist_name:  str           = Form(...),
    style_descriptor: Optional[str] = Form("neutral"),
):
    """
    Upload the original recording, generate a synthetic voice avatar,
    and store the original in encrypted escrow.
    """
    tmp = _save_upload(file, "ssprotect")
    try:
        avatar_result = ss.create_voice_avatar(str(tmp), style_descriptor or "neutral")
        if "error" in avatar_result:
            raise HTTPException(status_code=422, detail=_err(
                "Avatar generation failed", avatar_result["error"], 422))

        escrow_result  = ss.store_in_escrow(
            original_file_path = str(tmp),
            source_name        = source_name,
            journalist_name    = journalist_name,
        )
        package_result = ss.generate_approval_package(
            synthetic_audio_path = avatar_result["synthetic_audio_path"],
            escrow_id            = escrow_result["escrow_id"],
        )
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass

    logger.info("sourceseal protect | escrow=%s", escrow_result.get("escrow_id"))
    return {"avatar": avatar_result, "escrow": escrow_result, "package": package_result}


@router.get("/sourceseal/verify/{escrow_id}")
def sourceseal_verify(escrow_id: str, verification_key: str = ""):
    """Verify that the escrow file is intact and has not been tampered with."""
    result = ss.verify_escrow_original(escrow_id, verification_key)
    if result.get("error"):
        raise HTTPException(
            status_code=404,
            detail=_err("Escrow not found", result["error"], 404),
        )
    logger.info("sourceseal verify | escrow=%s valid=%s", escrow_id, result.get("valid"))
    return result


@router.post("/sourceseal/approve/{escrow_id}")
def sourceseal_approve(escrow_id: str):
    """Source marks the synthetic version as approved for publication."""
    result = ss.approve(escrow_id)
    if result.get("error"):
        raise HTTPException(
            status_code=404,
            detail=_err("Escrow not found", result["error"], 404),
        )
    logger.info("sourceseal approve | escrow=%s", escrow_id)
    return result
