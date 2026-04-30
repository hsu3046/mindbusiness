"""
Intent classification response schema.
Defines the structure of AI-generated framework decisions.
"""

from enum import Enum
from pydantic import BaseModel, Field
from typing import List, Optional
from schemas.context_vector import ContextVector


class MissingInfoType(str, Enum):
    """Type of missing information for Turn-based clarification."""
    FRAMEWORK = "framework"          # Turn 1: Which framework to use?
    TARGET_AUDIENCE = "target_audience"  # Turn 2: Who is the target?
    OBJECTIVE = "objective"          # Turn 2: What's the goal?
    EDGE = "edge"                    # Turn 2: What's the differentiator?
    NONE = "none"                    # No clarification needed


class ClarificationOption(BaseModel):
    """Single option for user to choose when clarification is needed."""
    
    label: str = Field(
        ...,
        description="User-facing label for this option (in target language)",
        examples=["초기 스타트업", "Early Startup", "2030 직장인"]
    )
    
    value: str = Field(
        ...,
        description="Internal value to use (English, for backend processing)",
        examples=["early_startup", "2030_professional", "auto"]
    )
    
    # Optional: Only for framework selection (Turn 1)
    framework_id: Optional[str] = Field(
        None,
        description="Framework ID to use if this option is selected (Turn 1 only)",
        pattern="^(BMC|LEAN|LEAN_CANVAS|SWOT|PESTEL|PERSONA|PROCESS|CAUSE|SCAMPER|LOGIC|5WHYS|PROS_CONS|DECISION_MATRIX|EISENHOWER|OKR|KPT)$",
        examples=["LEAN", "BMC"]
    )


class FrameworkDecision(BaseModel):
    """AI's decision on which framework to use, or request for clarification."""
    
    # Internal debugging (English)
    reasoning_log: str = Field(
        ...,
        description="Internal logic explanation (English, for developers)",
        examples=["User mentioned 'startup' and 'new idea', so LEAN Canvas is more suitable than BMC."]
    )
    
    # User-facing explanation (target language)
    selection_reason: Optional[str] = Field(
        None,
        description="Polite explanation for why this framework was chosen (in target language)",
        examples=["초기 단계이시므로 린 캔버스가 시장 검증에 적합합니다."]
    )
    
    # Confidence score
    confidence_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="AI's confidence in the decision (0-100)",
        examples=[95, 30]
    )
    
    # High confidence result
    selected_framework_id: Optional[str] = Field(
        None,
        description="Selected framework ID (if confidence >= 80)",
        pattern="^(BMC|LEAN|LEAN_CANVAS|SWOT|PESTEL|PERSONA|PROCESS|CAUSE|SCAMPER|LOGIC|5WHYS|PROS_CONS|DECISION_MATRIX|EISENHOWER|OKR|KPT)$",
        examples=["BMC", "LEAN"]
    )
    
    root_node_title: Optional[str] = Field(
        None,
        description="Refined title for the mindmap's central topic (in target language)",
        examples=["카페 창업 마케팅 플랜", "Coffee Shop Marketing Plan"]
    )
    
    # Low confidence - need clarification
    needs_clarification: bool = Field(
        False,
        description="Whether additional user input is needed",
        examples=[True, False]
    )
    
    # [NEW] Type of missing info for UI routing
    missing_info_type: MissingInfoType = Field(
        default=MissingInfoType.NONE,
        description="Type of missing information for frontend UI routing"
    )
    
    clarification_question: Optional[str] = Field(
        None,
        description="Question to ask user (in target language)",
        examples=["커피와 관련하여 어떤 분석이 필요하신가요?", "어떤 고객을 타겟으로 하시나요?"]
    )
    
    clarification_options: Optional[List[ClarificationOption]] = Field(
        None,
        description="Multiple choice options for user to select (Choice Chips)",
        examples=[
            [
                {"label": "커피 사업 시작", "value": "start_business", "framework_id": "LEAN"},
                {"label": "커피 시장 분석", "value": "market_analysis", "framework_id": "PESTEL"}
            ],
            [
                {"label": "2030 직장인", "value": "2030_professional"},
                {"label": "주말 데이트 커플", "value": "weekend_couples"},
                {"label": "상관없음 (AI 추천)", "value": "auto"}
            ]
        ]
    )
    
    # [NEW] Context Vector (Business DNA) - extracted from user input
    context_vector: Optional[ContextVector] = Field(
        None,
        description="Business DNA extracted from user input (for Generator parallelization)"
    )
