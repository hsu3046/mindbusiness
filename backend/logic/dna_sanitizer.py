"""
DNA Sanitizer - Validates and cleans ContextVector.
Replaces vague or generic values with safe fallbacks.
"""

from typing import List
from schemas.context_vector import ContextVector


# Bad values that indicate vague/generic input
BAD_TARGETS = [
    # Korean - 일반적 표현
    "고객", "사람들", "누구나", "모든 사람", "일반인", "대중",
    "소비자", "구매자", "이용자", "사용자", "방문자", "손님",
    "타겟", "타깃", "대상", "시장", "마켓",
    # Korean - 너무 광범위한 연령대
    "모든 연령", "전 연령", "남녀노소",
    # English
    "users", "people", "everyone", "customers", "anyone", "somebody",
    "consumers", "buyers", "visitors", "guests", "clients",
    "target", "market", "audience", "public", "masses",
    # Japanese
    "顧客", "人々", "誰でも", "消費者", "利用者", "ユーザー", "お客様"
]

BAD_EDGES = [
    # Korean - 뻔한 형용사
    "맛있는", "좋은", "친절한", "최고의", "훌륭한", "우수한",
    "차별화된", "특별한", "독특한", "유니크한", "프리미엄",
    # Korean - 비즈니스 상용구 (의미 없는)
    "경쟁력", "시너지", "혁신", "혁신적", "차별점", "강점",
    "전문성", "노하우", "퀄리티", "품질", "서비스",
    "가성비", "가심비", "합리적", "저렴한", "비싼",
    # English
    "good", "great", "excellent", "best", "quality", "service",
    "unique", "special", "premium", "competitive", "innovative",
    "differentiated", "professional", "expertise", "affordable",
    # Japanese
    "良い", "最高の", "優れた", "特別な", "ユニークな", "プレミアム"
]

BAD_OBJECTIVES = [
    # Korean - 너무 일반적인 목표
    "수익", "돈", "성공", "성장", "발전", "매출", "이익",
    "돈 벌기", "돈벌기", "수익 창출", "매출 증대",
    "성공하기", "성장하기", "발전하기",
    # Korean - 뻔한 목표
    "1위", "최고", "선두", "리더", "대박", "히트",
    # English
    "profit", "money", "success", "growth", "revenue", "income",
    "make money", "be successful", "grow", "expand",
    "number one", "the best", "leader", "top",
    # Japanese
    "利益", "成功", "成長", "収益", "売上", "一位", "トップ"
]


# Safe fallback values
FALLBACK_TARGET = "일반 대중 (Mass Market)"
FALLBACK_EDGE = "표준 서비스 품질 및 기본기 준수"
FALLBACK_OBJECTIVE = "안정적인 수익 창출 및 지속 가능한 성장"


def sanitize_dna(dna: ContextVector, user_input: str) -> ContextVector:
    """
    Validate and clean ContextVector.
    
    Replaces vague or generic values with safe fallbacks.
    Does NOT retry AI call - just uses default values.
    
    Args:
        dna: ContextVector extracted by Classifier
        user_input: Original user input (for fallback summary)
    
    Returns:
        Sanitized ContextVector with is_sanitized=True if any changes made
    """
    sanitized_fields: List[str] = []
    
    # 1. Summary validation (must not be empty)
    if not dna.summary or len(dna.summary.strip()) < 3:
        dna.summary = f"{user_input} 비즈니스"
        sanitized_fields.append("summary")
    
    # 2. Target validation (not too short, not in bad list)
    if (
        len(dna.target.strip()) < 3 or 
        dna.target.strip() in BAD_TARGETS or
        any(bad in dna.target for bad in BAD_TARGETS)
    ):
        dna.target = FALLBACK_TARGET
        sanitized_fields.append("target")
    
    # 3. Edge validation (not containing bad words)
    if any(bad in dna.edge for bad in BAD_EDGES):
        dna.edge = FALLBACK_EDGE
        sanitized_fields.append("edge")
    
    # 4. Objective validation
    if (
        len(dna.objective.strip()) < 5 or
        any(bad == dna.objective.strip() for bad in BAD_OBJECTIVES)
    ):
        dna.objective = FALLBACK_OBJECTIVE
        sanitized_fields.append("objective")
    
    # Mark as sanitized if any changes were made
    if sanitized_fields:
        dna.is_sanitized = True
        dna.sanitized_fields = sanitized_fields
    
    return dna


def needs_clarification_for_target(dna: ContextVector) -> bool:
    """
    Check if target needs user clarification.
    
    Returns True if target was sanitized to fallback value,
    indicating we should ask user to select a target.
    """
    return dna.target == FALLBACK_TARGET


def needs_clarification_for_edge(dna: ContextVector) -> bool:
    """
    Check if edge (differentiator) needs user clarification.
    """
    return dna.edge == FALLBACK_EDGE
