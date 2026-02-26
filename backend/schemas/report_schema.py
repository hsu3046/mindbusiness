"""
Report generation request/response schemas.
"""

from pydantic import BaseModel, Field
from typing import Optional


class ReportRequest(BaseModel):
    """Request schema for report generation."""
    topic: str = Field(..., description="Central business topic", max_length=500)
    framework_id: str = Field(..., description="Framework ID (e.g., LEAN, BMC)")
    mindmap_tree: dict = Field(..., description="Complete mindmap tree as JSON")
    language: str = Field(default="Korean", description="Target language")
