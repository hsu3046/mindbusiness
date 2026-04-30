"""
Request schema for API endpoints.
"""

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    """Request model for framework classification endpoint."""
    
    user_input: str = Field(
        ...,
        description="User's input text to analyze",
        min_length=1,
        max_length=1000,
        examples=["성남시에서 카페 창업을 위한 마케팅 플랜"]
    )
    
    user_language: str = Field(
        default="Korean",
        description="Target language for AI responses",
        pattern="^(Korean|English|Japanese)$",
        examples=["Korean", "English", "Japanese"]
    )
