"""
Schema definitions for node expansion (Stage 1.3).
Supports dynamic expansion with context awareness.
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

from schemas.context_vector import ContextVector


class ExpandRequest(BaseModel):
    """Request model for expanding a specific node."""
    
    topic: str = Field(
        ...,
        description="Root topic of the mindmap",
        max_length=500,
        examples=["대장동 카페 전략"]
    )
    
    context_path: List[str] = Field(
        ...,
        description="Full path from L1 to parent node (for context)",
        examples=[["비용 구조", "인건비 절감", "키오스크 도입"]]
    )
    
    target_node_label: str = Field(
        ...,
        description="The node to expand (last in context_path)",
        examples=["키오스크 도입"]
    )
    
    current_framework_id: str = Field(
        ...,
        description="Root framework currently in use",
        pattern="^(BMC|LEAN|LEAN_CANVAS|SWOT|PESTEL|PERSONA|PROCESS|CAUSE|SCAMPER|LOGIC|5WHYS|PROS_CONS|DECISION_MATRIX|EISENHOWER|OKR|KPT)$"
    )
    
    used_frameworks: List[str] = Field(
        default_factory=list,
        description="Frameworks already nested in this path (for limit check)",
        examples=[["BMC"], ["BMC", "SWOT"]]
    )
    
    current_depth: int = Field(
        ...,
        description="Current depth level (L0=0, L1=1, L2=2, L3=3, L4=max)",
        ge=0,
        le=4  # L4 is the maximum depth
    )
    
    # ─── New fields for improved prompt quality ───
    sibling_labels: List[str] = Field(
        default_factory=list,
        description="Labels of sibling nodes at the same level (for MECE)",
        examples=[["20대 대학생", "40대 자영업자"]]
    )
    
    parent_sibling_labels: List[str] = Field(
        default_factory=list,
        description="Labels of parent's sibling nodes (for broader context)",
        examples=[["가치 제안", "채널", "수익원"]]
    )
    
    existing_children: List[str] = Field(
        default_factory=list,
        description="Labels of already existing children (for add mode, avoid duplication)",
        examples=[["점심시간 빠른 픽업 선호", "가성비 중시"]]
    )
    
    force_framework: Optional[str] = Field(
        None,
        description="User-requested framework (manual selection)",
        pattern="^(BMC|LEAN|LEAN_CANVAS|SWOT|PESTEL|PERSONA|PROCESS|CAUSE|SCAMPER|LOGIC|5WHYS|PROS_CONS|DECISION_MATRIX|EISENHOWER|OKR|KPT)$"
    )
    
    language: str = Field(
        default="Korean",
        description="Target language",
        pattern="^(Korean|English|Japanese)$"
    )

    seed: Optional[int] = Field(
        None,
        description=(
            "Optional Gemini sampling seed for reproducibility — passing the "
            "same seed (with the same context) returns identical children. "
            "Used by debug/A-B tooling and CI golden-output tests; left "
            "empty for normal stochastic generation."
        ),
        ge=0,
        le=2_147_483_647,  # signed int32 ceiling (Gemini SDK accepts up to this)
    )

    context_vector: Optional[ContextVector] = Field(
        None,
        description=(
            "Business DNA from smart-classify (summary/target/edge/objective). "
            "When present it's injected into the system_instruction so the AI "
            "can ground children in the user's specific business context "
            "instead of generic framework boilerplate. Optional — older "
            "frontends don't carry it and we degrade gracefully."
        ),
    )

    intent_mode: Optional[str] = Field(
        None,
        description=(
            "User's high-level intent from smart-classify "
            "(creation / diagnosis / choice / strategy). Tunes the prompt's "
            "tone toward the right kind of children at deep levels. Optional."
        ),
        pattern="^(creation|diagnosis|choice|strategy)$",
    )

    expansion_mode: Optional[str] = Field(
        None,
        description=(
            "User-selected generation strategy: default | diverse | deep | "
            "mece. Each maps to a small bundle of parameter overrides "
            "(temperature delta, top_p, model swap, prompt addon) the "
            "expander applies before the Gemini call. None == default. "
            "Distinct from `ExpandResponse.expansion_mode` which describes "
            "what kind of structure the AI produced (framework / logic_tree "
            "/ semi_structured)."
        ),
        pattern="^(default|diverse|deep|mece)$",
    )


class ExpandChildSchema(BaseModel):
    """
    Strict schema for one generated child, used as Gemini's
    `response_schema` so structured output is enforced at model level
    rather than papered over by the JSON recovery chain.

    Mirrors the loose dict fields ExpandResponse.children was using —
    label/description are required, the others optional with defaults
    so the model isn't forced to invent values for fields it can't
    confidently fill.
    """

    label: str = Field(..., max_length=80)
    description: Optional[str] = Field(None, max_length=300)
    type: Optional[str] = Field(
        None,
        pattern="^(framework_branch|action_item|category_group|sub_branch|root|category)$",
    )
    semantic_type: Optional[str] = Field(
        None,
        pattern="^(finance|action|risk|persona|resource|metric|other)$",
    )
    importance: Optional[int] = Field(None, ge=1, le=5)


class ExpandResponseSchema(BaseModel):
    """Top-level shape Gemini must return when `response_schema` is set."""

    children: List[ExpandChildSchema] = Field(...)
    applied_framework_id: Optional[str] = Field(None)
    expansion_mode: Optional[str] = Field(
        None,
        pattern="^(framework|logic_tree|semi_structured)$",
    )
    confidence_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    alternative_framework: Optional[str] = Field(None)


class ExpandResponse(BaseModel):
    """Response from node expansion."""

    children: List[dict] = Field(
        ...,
        description="Generated child nodes"
    )
    
    applied_framework_id: Optional[str] = Field(
        None,
        description="Framework applied (if any)",
        examples=["PERSONA", "SWOT", None]
    )
    
    expansion_mode: str = Field(
        ...,
        description="How expansion was performed",
        pattern="^(framework|logic_tree|semi_structured)$"
    )
    
    confidence_score: float = Field(
        ...,
        description="AI confidence in the expansion decision",
        ge=0.0,
        le=1.0
    )
    
    alternative_framework: Optional[str] = Field(
        None,
        description="Alternative framework recommendation (if confidence low)",
        examples=["CAUSE"]
    )
    
    warning: Optional[dict] = Field(
        None,
        description="Warning message (e.g., depth limit)"
    )


class NodeMetadata(BaseModel):
    """Metadata for Rearrange/Refine support (future use)."""
    
    created_at: datetime = Field(default_factory=datetime.now)
    created_mode: str = Field(
        default="auto",
        pattern="^(auto|manual|refined)$"
    )
    
    generated_by: Optional[str] = Field(
        None,
        description="AI model used",
        examples=["gemini-3-flash-preview"]
    )
    
    confidence_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    
    # Refine support
    original_id: Optional[str] = None
    version: int = 1
    
    # Rearrange support
    original_parent_id: Optional[str] = None
    original_position: Optional[int] = None
    
    # User edit tracking
    user_edited: bool = False
    edit_history: List[dict] = Field(default_factory=list)
    
    # Phase 2: Source Traceability
    source_type: str = Field(
        default="ai_generated",
        description="Data source type",
        pattern="^(ai_generated|user_input|external_api|government_data)$"
    )
    source_url: Optional[str] = Field(
        None,
        description="Source URL (e.g., K-Startup announcement)"
    )
    data_freshness: Optional[datetime] = Field(
        None,
        description="When the source data was last updated"
    )
