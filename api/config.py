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

# ── Model identifiers ────────────────────────────────────────────────────────
# Single source of truth for model IDs. STAGE_CONFIG below picks which one
# each call site uses, plus the reasoning level / temperature / search policy.
MODEL_PRO = "gemini-3.1-pro-preview"          # heavy reasoning, top quality
MODEL_FLASH = "gemini-3-flash-preview"        # fast structured generation (3.1 flash N/A)
MODEL_LITE = "gemini-3.1-flash-lite-preview"  # cheapest + fastest, simple tasks

# Legacy aliases — kept for any caller still importing them. Internal code
# should prefer STAGE_CONFIG below.
MODEL_REASONING = MODEL_PRO
MODEL_GENERATION = MODEL_FLASH
MODEL_REPORT = MODEL_PRO


# ── Per-stage call config ────────────────────────────────────────────────────
# Each entry tells the helpers which model + temperature + thinking_level +
# whether to attach Google Search grounding for ONE call site. Keeping it as
# a dict (not Pydantic) so we can hot-swap entries without code changes.
#
# Reasoning level: "off" / "minimal" / "low" / "medium" / "high"
#   - "off"  → ThinkingConfig is omitted entirely (skips thinking budget on
#              Lite where the field is unsupported anyway)
#   - others → mapped to types.ThinkingLevel by api/lib/gemini_config.py
#
# use_search: True attaches a Tool(google_search=GoogleSearch()) — currently
# only on the report writer where grounded facts matter. Adds latency + cost
# so we don't blanket-enable.
STAGE_CONFIG = {
    "validate_key":      {"model": MODEL_LITE,  "temperature": 0.0, "reasoning": "off"},
    "classify":          {"model": MODEL_PRO,   "temperature": 0.1, "reasoning": "medium"},
    "dna_extract":       {"model": MODEL_PRO,   "temperature": 0.2, "reasoning": "low"},
    "question_gen":      {"model": MODEL_LITE,  "temperature": 0.3, "reasoning": "off"},
    "framework_pick":    {"model": MODEL_LITE,  "temperature": 0.1, "reasoning": "off"},
    "framework_fallback":{"model": MODEL_LITE,  "temperature": 0.1, "reasoning": "off"},
    "generate_l1":       {"model": MODEL_FLASH, "temperature": 0.4, "reasoning": "off"},
    # Expand stages — depth-aware temperature curve. L1 should produce
    # structured framework slots (cool, deterministic), L4 should produce
    # surprising actions (hot, divergent). The bare `"expand"` key remains
    # as a fallback for callers that don't pass depth.
    "expand":            {"model": MODEL_FLASH, "temperature": 0.6, "reasoning": "off"},
    "expand_l1":         {"model": MODEL_LITE,  "temperature": 0.20, "reasoning": "low"},
    "expand_l2":         {"model": MODEL_FLASH, "temperature": 0.45, "reasoning": "off"},
    "expand_l3":         {"model": MODEL_FLASH, "temperature": 0.65, "reasoning": "off"},
    "expand_l4":         {"model": MODEL_FLASH, "temperature": 0.85, "reasoning": "off"},
    # Report = two-stage Researcher + Writer (see api/logic/report_generator.py)
    "report_researcher": {"model": MODEL_FLASH, "temperature": 0.2, "reasoning": "off",
                          "use_search": True},
    "report_writer":     {"model": MODEL_PRO,   "temperature": 0.7, "reasoning": "high"},
}

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

# === Timeout Settings ===
# Vercel Fluid Compute default = 300s for all plans; Pro can raise to 800s.
# vercel.json sets maxDuration: 300, so we keep a buffer below that for the
# synchronous endpoints. Job-queue endpoints (/api/v1/jobs/*) return in <1s
# and are NOT bound by these — see api/jobs.py for those.
GEMINI_TIMEOUT_CLASSIFIER = 25.0   # Classification (one-shot UX)
GEMINI_TIMEOUT_GENERATOR = 35.0    # Full mindmap generation (legacy sync path)
GEMINI_TIMEOUT_EXPANDER = 25.0     # Single node expansion
DEFAULT_GEMINI_TIMEOUT = 25.0      # Fallback timeout
VERCEL_SAFE_TIMEOUT = 280.0        # vercel.json maxDuration 300s minus 20s buffer

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

