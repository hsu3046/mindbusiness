"""
Semantic type definitions for meaningful node categorization.
Enables Phase 2 features: Gap Analysis, Reality Check, K-Startup Matcher.
"""

from enum import Enum


class NodeSemanticType(str, Enum):
    """
    Semantic categorization of nodes for business analysis.
    
    These types enable:
    - Gap Analysis: Detect missing critical nodes (e.g., no 'finance' nodes)
    - Reality Check: Validate metrics against industry benchmarks
    - K-Startup Matcher: Match nodes to government support programs
    """
    
    # Structural types (기존 호환성)
    ROOT = "root"
    BRANCH = "branch"
    
    # Semantic types (Phase 2 analysis용)
    FINANCE = "finance"      # Revenue, cost, budget, funding
    ACTION = "action"        # Marketing, hiring, execution steps
    RISK = "risk"            # Competition, regulation, market threats
    PERSONA = "persona"      # Target customers, user segments
    RESOURCE = "resource"    # Equipment, facilities, personnel
    METRIC = "metric"        # KPIs, goals, measurable targets
    
    # Generic
    OTHER = "other"          # Default for unclassified nodes


# Mapping rules for AI classification
SEMANTIC_TYPE_KEYWORDS = {
    NodeSemanticType.FINANCE: [
        "매출", "비용", "예산", "자금", "투자", "수익", "손익",
        "revenue", "cost", "budget", "funding", "profit", "loss",
        "売上", "費用", "予算", "資金"
    ],
    NodeSemanticType.ACTION: [
        "실행", "진행", "준비", "채용", "계약", "마케팅", "출시",
        "launch", "execute", "hire", "contract", "marketing",
        "実行", "採用", "契約", "マーケティング"
    ],
    NodeSemanticType.RISK: [
        "경쟁", "위협", "규제", "리스크", "문제", "장애물",
        "competition", "threat", "regulation", "risk", "problem",
        "競争", "脅威", "規制", "リスク"
    ],
    NodeSemanticType.PERSONA: [
        "고객", "사용자", "타겟", "세그먼트", "페르소나",
        "customer", "user", "target", "segment", "persona",
        "顧客", "ユーザー", "ターゲット"
    ],
    NodeSemanticType.RESOURCE: [
        "장비", "시설", "인력", "설비", "자산", "인프라",
        "equipment", "facility", "personnel", "asset", "infrastructure",
        "設備", "施設", "人材", "資産"
    ],
    NodeSemanticType.METRIC: [
        "목표", "지표", "KPI", "성과", "측정", "달성",
        "goal", "target", "KPI", "metric", "performance", "achievement",
        "目標", "指標", "達成"
    ]
}
