"""
Configuration module for MindBusiness AI Backend.
Manages environment variables, model settings, and framework definitions.
"""

import os
from typing import Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# API Configuration
# API key is optional - users can provide their own key via X-API-Key header (BYOK)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    import logging
    logging.getLogger(__name__).warning(
        "GEMINI_API_KEY not found in environment variables. "
        "Users must provide their own API key via the X-API-Key header."
    )


def get_genai_client(api_key_override: Optional[str] = None):
    """
    Create a Gemini AI client with the given API key.
    Priority: api_key_override > GEMINI_API_KEY from .env
    Raises ValueError if no key is available.
    """
    from google import genai
    
    key = api_key_override or GEMINI_API_KEY
    if not key:
        raise ValueError(
            "No API key available. Please provide a Gemini API key "
            "via the Settings dialog or set GEMINI_API_KEY in your .env file."
        )
    return genai.Client(api_key=key)

# Model Configuration
MODEL_REASONING = "gemini-3-pro-preview"  # For Stage 1: Intent Classification
MODEL_GENERATION = "gemini-3-flash-preview"  # For Stage 2+: Mindmap Generation & Node Expansion
MODEL_REPORT = "gemini-3-pro-preview"  # For Report Generation (higher quality)

# Framework Database
FRAMEWORK_DB = {
    "BMC": {
        "name": "Business Model Canvas",
        "description": "For established business planning",
        "blocks": 9
    },
    "LEAN": {
        "name": "Lean Canvas",
        "description": "For startups, new ideas, problem-solving",
        "blocks": 9
    },
    "SWOT": {
        "name": "SWOT Analysis",
        "description": "For internal strengths/weaknesses & external opportunities/threats",
        "blocks": 4
    },
    "PESTEL": {
        "name": "PESTEL Analysis",
        "description": "For macro-environmental market analysis",
        "blocks": 6
    },
    "PERSONA": {
        "name": "User Persona Analysis",
        "description": "For deep customer understanding",
        "blocks": 5
    },
    "PROCESS": {
        "name": "Step-by-step Process",
        "description": "Roadmap or sequential guide",
        "blocks": 4
    },
    "CAUSE": {
        "name": "Ishikawa Diagram (Fishbone)",
        "description": "For finding root causes - People, Methods, Environment, Materials",
        "blocks": 4
    },
    "SCAMPER": {
        "name": "SCAMPER Creative Thinking",
        "description": "For innovation and creative problem-solving",
        "blocks": 7
    },
    "LOGIC": {
        "name": "5W1H Analysis (육하원칙)",
        "description": "For structured logical analysis and planning",
        "blocks": 6
    },
    # === New Frameworks ===
    "5WHYS": {
        "name": "5 Whys Root Cause Analysis",
        "description": "Drill down to find the real root cause",
        "blocks": 5
    },
    "PROS_CONS": {
        "name": "Pros & Cons Analysis",
        "description": "Weigh advantages and disadvantages of a decision",
        "blocks": 4
    },
    "DECISION_MATRIX": {
        "name": "Decision Matrix",
        "description": "Score and compare multiple options",
        "blocks": 4
    },
    "EISENHOWER": {
        "name": "Eisenhower Matrix",
        "description": "Prioritize by urgency and importance",
        "blocks": 4
    },
    "OKR": {
        "name": "OKR (Objectives & Key Results)",
        "description": "Set goals and measurable key results",
        "blocks": 4
    },
    "KPT": {
        "name": "KPT Retrospective",
        "description": "Keep, Problem, Try - for reflection",
        "blocks": 3
    }
}

# Supported Languages
SUPPORTED_LANGUAGES = ["Korean", "English", "Japanese"]

# Confidence Threshold
CONFIDENCE_THRESHOLD = 80  # Score >= 80: Direct selection, < 80: Clarification needed

# === Timeout Settings (for Vercel Pro 60s limit) ===
GEMINI_TIMEOUT_CLASSIFIER = 25.0   # Classification (조정: 30 → 25초)
GEMINI_TIMEOUT_GENERATOR = 35.0    # Full mindmap generation (조정: 45 → 35초)
GEMINI_TIMEOUT_EXPANDER = 25.0     # Single node expansion (조정: 30 → 25초)
DEFAULT_GEMINI_TIMEOUT = 25.0      # Fallback timeout
VERCEL_SAFE_TIMEOUT = 55.0         # Vercel 60초 - 5초 버퍼

# === Intent Mode → Framework Mapping ===
# 사용자가 선택한 Intent Mode에 따라 AI가 선택할 수 있는 Framework 후보군
# 주의: 여기서 반환되는 Framework ID는 template 키의 접두사임 (예: LEAN → LEAN_CREATION)
INTENT_FRAMEWORK_MAP = {
    "creation": {
        # 기획과 구상: 새로운 아이디어를 구체화
        "primary": ["LEAN", "PERSONA", "SCAMPER"],
        "shared": ["BMC", "SWOT", "PESTEL"],
        "description": "아이디어를 구체적인 계획으로 발전"
    },
    "diagnosis": {
        # 문제와 해결: 문제의 원인 분석 및 해결책 도출
        "primary": ["CAUSE", "5WHYS"],
        "shared": ["SWOT", "BMC", "PROCESS", "LOGIC"],
        "description": "문제의 원인을 파악하고 해결책 탐색"
    },
    "choice": {
        # 선택과 결정: 여러 대안 중 최선의 선택
        "primary": ["PROS_CONS", "DECISION_MATRIX", "EISENHOWER"],
        "shared": ["SWOT", "BMC", "PESTEL"],
        "description": "여러 선택지 중 최선의 결정 도출"
    },
    "strategy": {
        # 전략과 점검: 목표 설정 및 회고
        "primary": ["OKR", "KPT"],
        "shared": ["SWOT", "PESTEL", "PROCESS", "LOGIC"],
        "description": "목표 설정 및 지난 일 회고"
    }
}

def get_frameworks_for_intent(intent_mode: str) -> list:
    """
    Intent Mode에 해당하는 모든 Framework 리스트를 반환합니다.
    Primary + Shared를 합친 리스트를 반환합니다.
    
    Args:
        intent_mode: 'creation', 'diagnosis', 'choice', 'strategy'
    
    Returns:
        Framework ID 리스트 (예: ['BMC', 'LEAN', 'SWOT', ...])
    """
    mapping = INTENT_FRAMEWORK_MAP.get(intent_mode)
    if not mapping:
        # Fallback: creation 모드 사용
        mapping = INTENT_FRAMEWORK_MAP["creation"]
    
    return mapping["primary"] + mapping["shared"]

