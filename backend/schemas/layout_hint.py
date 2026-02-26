"""
Layout hint system for document/PPT generation.
Supports Japanese Ponchi-zu style reports and automatic pagination.
"""

from enum import Enum


class LayoutHint(str, Enum):
    """
    Visual placement hints for document/PPT conversion.
    
    Usage:
    - Japanese Ponchi-zu style: PROBLEM (left) → SOLUTION (center) → EFFECT (right)
    - Slide deck: SECTION_HEADER triggers new slide
    - Document structure: Organization hints for export
    """
    
    # 1. Logical Flow (Japanese Ponchi-zu Style)
    PROBLEM = "problem"
    """Background, challenges, issues (左側配置)"""
    
    SOLUTION = "solution"
    """Solutions, actions, methods (中央配置)"""
    
    EFFECT = "effect"
    """Expected results, achievements, KPIs (右側配置)"""
    
    # 2. Document Structure (Slide Deck)
    SECTION_HEADER = "section_header"
    """Major section start (triggers new slide/page)"""
    
    BULLET_POINT = "bullet_point"
    """List item in presentation"""
    
    IMAGE_PLACEHOLDER = "image"
    """Chart, diagram, visual element"""
    
    BODY_CONTENT = "body"
    """Regular body content"""
    
    # 3. Default
    DEFAULT = "default"
    """No specific layout hint"""


# Mapping for AI prompt (Phase 2+)
LAYOUT_HINT_KEYWORDS = {
    LayoutHint.PROBLEM: [
        "문제", "과제", "배경", "현황", "issue", "problem", "challenge", "background",
        "問題", "課題", "背景"
    ],
    LayoutHint.SOLUTION: [
        "해결", "방안", "전략", "실행", "solution", "strategy", "action", "method",
        "解決", "方策", "戦略"
    ],
    LayoutHint.EFFECT: [
        "효과", "성과", "결과", "기대", "effect", "result", "achievement", "outcome",
        "効果", "成果", "結果"
    ],
}
