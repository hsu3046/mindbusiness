"""
Mindmap data schemas for recursive node structure.
Compatible with React Flow visualization.
"""

from enum import IntEnum
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
from schemas.layout_hint import LayoutHint


class NodeImportance(IntEnum):
    """Node importance for visual sizing and prioritization (1=Low, 5=Critical)"""
    LOW = 1
    NORMAL = 2      # default
    HIGH = 3
    VERY_HIGH = 4
    CRITICAL = 5


class MindmapNode(BaseModel):
    """
    Recursive mindmap node structure.
    Each node can have multiple children forming a tree hierarchy.
    """
    
    id: str = Field(
        ...,
        description="Unique node ID (e.g., 'root', 'node_1', 'node_1_1')",
        examples=["root", "node_1", "node_2_3"]
    )
    
    label: str = Field(
        ...,
        description="Node title displayed on the mindmap",
        examples=["카페 창업", "Value Propositions", "マーケティング戦略"]
    )
    
    description: Optional[str] = Field(
        None,
        description="Detailed explanation for the sidebar (1-2 sentences)",
        examples=["성남시 지역 특성을 반영한 차별화된 가치 제안"]
    )
    
    type: str = Field(
        "default",
        description="Node type for styling",
        pattern="^(root|main_branch|sub_branch)$",
        examples=["root", "main_branch", "sub_branch"]
    )
    
    # Phase 2: Semantic Analysis Fields
    semantic_type: Optional[str] = Field(
        None,
        description="Semantic categorization for business analysis (Phase 2)",
        pattern="^(root|branch|finance|action|risk|persona|resource|metric|other)$",
        examples=["finance", "action", "persona"]
    )
    
    attributes: Dict[str, Any] = Field(
        default_factory=dict,
        description="Structured data for analysis (amount, currency, period, etc.)",
        examples=[{"amount": 50000000, "currency": "KRW", "period": "monthly"}]
    )
    
    # Phase 2+: Document Generation
    layout_hint: Optional[LayoutHint] = Field(
        default=LayoutHint.DEFAULT,
        description="Visual placement hint for document/PPT conversion (Phase 2+)"
    )
    
    # Node Importance for visual sizing
    importance: int = Field(
        default=2,
        ge=1,
        le=5,
        description="Business impact weight for visual sizing (1=Low, 2=Normal, 3=High, 4=VeryHigh, 5=Critical)"
    )
    
    @field_validator('attributes')
    @classmethod
    def clean_attributes(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        """
        Clean and validate attributes data.
        
        Converts string amounts to integers:
        - "50,000,000원" → 50000000
        - "5천만" → 50000000
        - "3億円" → 300000000
        """
        if 'amount' in v:
            amount = v['amount']
            
            # Already a number - just convert to int
            if isinstance(amount, (int, float)):
                v['amount'] = int(amount)
                return v
            
            # String - extract number
            if isinstance(amount, str):
                try:
                    from lib.json_utils import extract_number_from_text
                    v['amount'] = extract_number_from_text(amount)
                except (ValueError, ImportError):
                    # Parsing failed - remove invalid field
                    del v['amount']
        
        return v
    
    # Children nodes
    children: List['MindmapNode'] = Field(
        default_factory=list,
        description="Child nodes (recursive structure)"
    )
    
    # Phase 2: Monetization Slot
    recommendations: List[dict] = Field(
        default_factory=list,
        description="Solution Nodes for affiliate marketing (Phase 2)"
    )


# Pydantic v2: Rebuild model to resolve recursive references
MindmapNode.model_rebuild()


class MindmapResponse(BaseModel):
    """API response containing the complete mindmap."""
    
    root_node: MindmapNode = Field(
        ...,
        description="Root node of the mindmap tree"
    )
    
    framework_id: str = Field(
        ...,
        description="Framework used for generation",
        pattern="^(BMC|LEAN|LEAN_CANVAS|SWOT|PESTEL|PERSONA|PROCESS|CAUSE|SCAMPER|LOGIC)$",
        examples=["BMC", "LEAN", "SCAMPER", "LOGIC"]
    )
    
    total_nodes: int = Field(
        ...,
        description="Total number of nodes in the mindmap",
        ge=1,
        examples=[45, 67]
    )
    
    expected_l2_counts: Optional[Dict[str, int]] = Field(
        None,
        description="Pre-determined L2 node counts per L1 node ID for layout calculation",
        examples=[{"l1_node_1": 4, "l1_node_2": 3, "l1_node_3": 5}]
    )


class GenerateRequest(BaseModel):
    """Request model for mindmap generation endpoint."""
    
    topic: str = Field(
        ...,
        description="Central topic for the mindmap",
        min_length=1,
        max_length=500,
        examples=["성남시 카페 창업", "SaaS Product for Remote Teams"]
    )
    
    framework_id: str = Field(
        ...,
        description="Framework to use for structure",
        pattern="^(BMC|LEAN|LEAN_CANVAS|SWOT|PESTEL|PERSONA|PROCESS|CAUSE|SCAMPER|LOGIC|5WHYS|PROS_CONS|DECISION_MATRIX|EISENHOWER|OKR|KPT)$",
        examples=["BMC", "LEAN", "LEAN_CANVAS", "SCAMPER", "LOGIC", "OKR", "KPT"]
    )
    
    language: str = Field(
        default="Korean",
        description="Target language for generated content",
        pattern="^(Korean|English|Japanese)$",
        examples=["Korean", "English", "Japanese"]
    )
    
    intent_mode: str = Field(
        default="creation",
        description="User's intent mode for framework template selection",
        pattern="^(creation|diagnosis|choice|strategy)$",
        examples=["creation", "diagnosis", "choice", "strategy"]
    )

