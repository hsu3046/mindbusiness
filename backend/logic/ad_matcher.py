"""
Ad Matcher for Solution Node (Phase 2).
Maps user nodes to affiliate recommendations.

NOTE: This is a skeleton implementation for Phase 1.
      Full functionality will be implemented in Phase 2.
"""

import json
from pathlib import Path
from typing import List, Dict, Optional

from schemas.recommendation_schema import RecommendationNode, AdMappingRule
from schemas.mindmap_schema import MindmapNode


class AdMatcher:
    """
    Matches mindmap nodes to affiliate recommendations.
    
    Phase 1: Returns empty list (skeleton only)
    Phase 2: Full implementation with ad_mapping.json
    """
    
    def __init__(self):
        """Initialize Ad Matcher with mapping rules."""
        self.rules: List[AdMappingRule] = []
        
        # Phase 2: Load from ad_mapping.json
        # mapping_path = Path(__file__).parent.parent / "data" / "ad_mapping.json"
        # if mapping_path.exists():
        #     with open(mapping_path, "r", encoding="utf-8") as f:
        #         data = json.load(f)
        #         self.rules = [AdMappingRule(**rule) for rule in data]
    
    def match_solutions(self, node: MindmapNode) -> List[dict]:
        """
        Match node to relevant Solution Nodes (recommendations).
        
        Args:
            node: MindmapNode to analyze
        
        Returns:
            List of RecommendationNode dicts (empty in Phase 1)
        
        Example future usage (Phase 2):
            node.label = "커피 머신 구매"
            node.semantic_type = "resource"
            → Returns [쿠팡 파트너스 상품, 크몽 전문가 매칭]
        """
        # Phase 1: Return empty list
        # Phase 2: Implement matching logic
        return []
    
    def _match_keywords(self, node: MindmapNode, rule: AdMappingRule) -> bool:
        """Check if node matches rule's trigger keywords."""
        # Phase 2 implementation
        return False
    
    def _match_semantic_type(self, node: MindmapNode, rule: AdMappingRule) -> bool:
        """Check if node's semantic_type matches rule."""
        # Phase 2 implementation
        return False
    
    def _create_recommendation(self, node: MindmapNode, rule: AdMappingRule) -> dict:
        """Create RecommendationNode from rule template."""
        # Phase 2 implementation
        return {}


# Singleton instance
_ad_matcher = None

def get_ad_matcher() -> AdMatcher:
    """Get or create AdMatcher singleton."""
    global _ad_matcher
    if _ad_matcher is None:
        _ad_matcher = AdMatcher()
    return _ad_matcher
