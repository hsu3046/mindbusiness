"""
Recommendation (Solution Node) schema for monetization.
Supports affiliate marketing (Stream 1: 35% of revenue).
"""

from pydantic import BaseModel, Field, HttpUrl
from typing import Optional
from datetime import datetime


class RecommendationNode(BaseModel):
    """
    Solution Node for monetization through affiliate marketing.
    
    These nodes are displayed separately from regular mindmap nodes
    and provide actionable recommendations with affiliate links.
    """
    
    id: str = Field(
        ...,
        description="Unique recommendation ID",
        examples=["rec_coupang_12345", "rec_kmong_67890"]
    )
    
    label: str = Field(
        ...,
        description="Recommendation title",
        examples=["브레빌 870XL 커피머신 최저가", "전문 사업계획서 작성 서비스"]
    )
    
    description: str = Field(
        ...,
        description="Detailed explanation (2-3 sentences)",
        examples=["업소용 커피머신 중 가성비 최고. 쿠팡 최저가 269만원."]
    )
    
    # Partner information
    partner_id: str = Field(
        ...,
        description="Affiliate partner identifier",
        examples=["coupang", "kmong", "aws", "naver_smartstore"]
    )
    
    partner_name: str = Field(
        ...,
        description="Display name of partner",
        examples=["쿠팡", "크몽", "AWS", "네이버 스마트스토어"]
    )
    
    affiliate_url: HttpUrl = Field(
        ...,
        description="Affiliate tracking link"
    )
    
    # Pricing
    price: Optional[int] = Field(
        None,
        description="Price in KRW (None if variable)",
        examples=[2690000, 150000]
    )
    
    original_price: Optional[int] = Field(
        None,
        description="Original price before discount"
    )
    
    discount: Optional[str] = Field(
        None,
        description="Discount information",
        examples=["10% 할인", "최대 50만원 지원"]
    )
    
    # Tracking & Analytics
    click_tracking_id: Optional[str] = Field(
        None,
        description="Unique click tracking ID for analytics"
    )
    
    commission_rate: Optional[float] = Field(
        None,
        description="Commission rate (e.g., 0.05 for 5%)",
        ge=0.0,
        le=1.0
    )
    
    # Metadata
    category: str = Field(
        default="general",
        description="Recommendation category",
        examples=["equipment", "service", "cloud", "legal", "marketing"]
    )
    
    relevance_score: float = Field(
        default=0.5,
        description="AI-calculated relevance to parent node (0.0-1.0)",
        ge=0.0,
        le=1.0
    )
    
    created_at: datetime = Field(default_factory=datetime.now)
    
    expires_at: Optional[datetime] = Field(
        None,
        description="Expiration date for time-limited offers"
    )


class AdMappingRule(BaseModel):
    """
    Mapping rule for automatic Solution Node generation.
    Stored in ad_mapping.json for Phase 2.
    """
    
    trigger_keywords: list[str] = Field(
        ...,
        description="Keywords that trigger this recommendation",
        examples=[["커피머신", "에스프레소"], ["사업계획서", "BP작성"]]
    )
    
    trigger_semantic_types: list[str] = Field(
        default_factory=list,
        description="Semantic types that trigger (e.g., ['resource', 'finance'])"
    )
    
    recommendation_template: dict = Field(
        ...,
        description="Template for generating RecommendationNode"
    )
    
    priority: int = Field(
        default=1,
        description="Display priority (higher = shown first)",
        ge=1,
        le=10
    )
    
    active: bool = Field(
        default=True,
        description="Whether this rule is currently active"
    )
