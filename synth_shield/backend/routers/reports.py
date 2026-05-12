"""
/api/reports — create, list, fetch, and export cybercrime reports.

POST   /reports/            — create report linked to an analysis
GET    /reports/            — list reports (filters: date_from, date_to, score_max)
GET    /reports/export/csv  — download all reports as CSV   ← must be before /{id}
GET    /reports/{id}        — fetch single report
"""
import csv
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.orm import Session

from database import AnalysisResult, CybercrimeReport, get_db

router = APIRouter()
logger = logging.getLogger("synthshield.reports")


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    analysis_id:   str
    description:   Optional[str] = None
    platform:      Optional[str] = None
    contact_email: Optional[str] = None


class ReportOut(BaseModel):
    id:            str
    analysis_id:   str
    description:   Optional[str]
    platform:      Optional[str]
    contact_email: Optional[str]
    status:        str
    created_at:    Optional[str]
    reality_score: Optional[float] = None

    model_config = {"from_attributes": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _report_out(r: CybercrimeReport, reality_score: Optional[float] = None,
                file_type: Optional[str] = None) -> dict:
    return {
        "id":            r.id,
        "analysis_id":   r.analysis_id,
        "description":   r.description,
        "platform":      r.platform,
        "contact_email": r.contact_email,
        "status":        r.status,
        "created_at":    r.created_at.isoformat() if r.created_at else None,
        "reality_score": reality_score,
        "file_type":     file_type,
    }


def _err(msg: str, detail: str, code: int) -> dict:
    return {"error": msg, "detail": detail, "code": code}


# ═════════════════════════════════════════════════════════════════════════════
# Endpoints
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/", status_code=201)
def create_report(body: ReportCreate, db: Session = Depends(get_db)):
    """Create a new cybercrime report linked to a completed analysis."""
    # Verify the analysis exists
    analysis = db.query(AnalysisResult).filter(
        AnalysisResult.id == body.analysis_id
    ).first()
    if not analysis:
        raise HTTPException(
            status_code=404,
            detail=_err("Analysis not found",
                        f"No analysis with id '{body.analysis_id}'.", 404),
        )

    report_id = str(uuid.uuid4())
    report = CybercrimeReport(
        id            = report_id,
        analysis_id   = body.analysis_id,
        description   = body.description,
        platform      = body.platform,
        contact_email = body.contact_email,
        status        = "pending",
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    logger.info(
        "report create | id=%s analysis=%s platform=%s",
        report_id, body.analysis_id, body.platform,
    )

    return _report_out(report, reality_score=analysis.reality_score)


# NOTE: /export/csv must be defined before /{id} to avoid "export" being
#       captured as a report ID.
@router.get("/export/csv")
def export_reports_csv(db: Session = Depends(get_db)):
    """Download all reports as a CSV file."""
    rows = (
        db.query(CybercrimeReport, AnalysisResult.reality_score)
        .outerjoin(AnalysisResult, CybercrimeReport.analysis_id == AnalysisResult.id)
        .order_by(CybercrimeReport.created_at.desc())
        .all()
    )

    buf = io.StringIO()
    fieldnames = [
        "id", "analysis_id", "reality_score",
        "description", "platform", "contact_email", "status", "created_at",
    ]
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for report, score in rows:
        writer.writerow({
            "id":            report.id,
            "analysis_id":   report.analysis_id,
            "reality_score": score if score is not None else "",
            "description":   report.description or "",
            "platform":      report.platform or "",
            "contact_email": report.contact_email or "",
            "status":        report.status,
            "created_at":    report.created_at.isoformat() if report.created_at else "",
        })

    buf.seek(0)
    logger.info("report export | rows=%d", len(rows))
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=synthshield_reports.csv"},
    )


@router.get("/")
def list_reports(
    date_from: Optional[str]   = Query(None, description="ISO date string, e.g. 2025-01-01"),
    date_to:   Optional[str]   = Query(None, description="ISO date string, e.g. 2025-12-31"),
    score_max: Optional[float] = Query(None, ge=0, le=100,
                                       description="Filter to reports whose analysis score ≤ this value"),
    skip:      int             = Query(0, ge=0),
    limit:     int             = Query(20, ge=1, le=100),
    db:        Session         = Depends(get_db),
):
    """List cybercrime reports with optional filters."""
    q = (
        db.query(CybercrimeReport, AnalysisResult.reality_score)
        .outerjoin(AnalysisResult, CybercrimeReport.analysis_id == AnalysisResult.id)
    )

    if date_from:
        try:
            q = q.filter(CybercrimeReport.created_at >= datetime.fromisoformat(date_from))
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=_err("Invalid date", f"date_from '{date_from}' is not ISO format.", 422),
            )

    if date_to:
        try:
            q = q.filter(CybercrimeReport.created_at <= datetime.fromisoformat(date_to))
        except ValueError:
            raise HTTPException(
                status_code=422,
                detail=_err("Invalid date", f"date_to '{date_to}' is not ISO format.", 422),
            )

    if score_max is not None:
        q = q.filter(AnalysisResult.reality_score <= score_max)

    total = q.count()
    rows  = (
        q.order_by(CybercrimeReport.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    logger.info("report list | total=%d skip=%d limit=%d", total, skip, limit)

    return {
        "reports": [_report_out(r, score) for r, score in rows],
        "total":   total,
        "skip":    skip,
        "limit":   limit,
    }


@router.get("/{report_id}")
def get_report(report_id: str, db: Session = Depends(get_db)):
    """Fetch a single report by ID."""
    row = (
        db.query(CybercrimeReport, AnalysisResult.reality_score)
        .outerjoin(AnalysisResult, CybercrimeReport.analysis_id == AnalysisResult.id)
        .filter(CybercrimeReport.id == report_id)
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=404,
            detail=_err("Report not found", f"No report with id '{report_id}'.", 404),
        )
    report, score = row
    logger.info("report fetch | id=%s", report_id)
    return _report_out(report, score)
