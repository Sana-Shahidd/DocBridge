"""Pydantic response schemas for analysis endpoints."""
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class AnalysisOut(BaseModel):
    id: str
    file_hash: str
    file_type: str
    reality_score: float
    signal_breakdown: Optional[Dict[str, Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}
