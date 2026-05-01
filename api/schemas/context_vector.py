"""
Context Vector (Business DNA) schema.
Represents the core business identity extracted from user input.
Used by Generator for consistent L1/L2 node generation.
"""

from pydantic import BaseModel, Field
from typing import Optional


class ContextVector(BaseModel):
    """
    Universal Business DNA - shared across all L1 node generation.
    
    Extracted by Classifier from user input, then broadcast to all
    parallel Generator workers for consistent content.
    """
    
    summary: str = Field(
        ...,
        description="Business identity in one sentence (~50 chars)",
        examples=["성수동의 2030 여성을 위한 인스타그래머블 쌀 디저트 카페"]
    )
    
    target: str = Field(
        ...,
        description="Primary target customer/user segment (~50 chars)",
        examples=["가치소비를 지향하는 MZ 직장인, 펫팸족"]
    )
    
    edge: str = Field(
        ...,
        description="Key differentiator or competitive advantage (~50 chars)",
        examples=["100% 글루텐 프리, 펫 프렌들리 공간, 구독형 멤버십"]
    )
    
    objective: str = Field(
        ...,
        description="Business goal or revenue model (~50 chars)",
        examples=["높은 객단가 확보 및 재방문율 50% 달성, 구독 매출 확대"]
    )
    
    # Metadata
    is_sanitized: bool = Field(
        default=False,
        description="Whether this DNA has been sanitized by DNA Sanitizer"
    )
    
    sanitized_fields: list[str] = Field(
        default_factory=list,
        description="List of field names that were sanitized (for debugging)"
    )
