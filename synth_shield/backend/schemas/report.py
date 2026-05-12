"""Pydantic response schemas for report and cybercrime-report endpoints."""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CybercrimeReportOut(BaseModel):
    id: str
    analysis_id: str
    description: Optional[str] = None
    platform: Optional[str] = None
    contact_email: Optional[str] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
