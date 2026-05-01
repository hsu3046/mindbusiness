"""
===================================================================
Improved Intent Classifier - 4단계 판단 프로세스
===================================================================

개선안 #1 + #2 통합:
- 키워드 가중치 시스템
- 다중 점수화 (Single → Multiple)
- DNA 기반 점수 보정
- LLM Constrained Choice
- Structured Reasoning
- Intent Mode 필터링 (NEW)
"""

import re
import asyncio
import logging
from typing import Optional, Dict, List, Tuple
from dataclasses import dataclass, asdict
from collections import defaultdict
from pathlib import Path
from google import genai
from google.genai import types

from config import GEMINI_API_KEY, get_frameworks_for_intent
from lib.json_utils import safe_json_parse
from lib.gemini_config import build_config, get_model

logger = logging.getLogger(__name__)


# ============================================================
# STEP 1: 키워드 점수화 시스템
# ============================================================

@dataclass
class KeywordRule:
    """키워드 규칙 with 가중치 및 문맥 조건"""
    keyword: str
    weight: float
    context_boost: Optional[str] = None
    negative_context: Optional[str] = None


# 15개 Framework 전체 규칙 (기존 9개 + 신규 6개)
FRAMEWORK_SCORING_RULES = {
    # === 기존 9개 Framework ===
    "SCAMPER": {
        "priority": 1,
        "keywords": [
            KeywordRule("브레인스토밍", 3.0),
            KeywordRule("아이디어 회의", 3.0),
            KeywordRule("피봇", 2.5),
            KeywordRule("혁신", 2.0, context_boost="새로운"),
            KeywordRule("변형", 1.5),
            KeywordRule("개선", 1.3),
        ],
        "boost_patterns": [r"어떻게.*(바꿀|개선)", r"새로운.*(방법|아이디어)"],
        "dna_conditions": {
            "edge_vague": +1.5,
            "objective_creative": +2.0,
        }
    },
    
    "CAUSE": {
        "priority": 2,
        "keywords": [
            KeywordRule("원인", 3.0),
            KeywordRule("왜", 2.0, context_boost="문제"),
            KeywordRule("매출 하락", 3.5),
            KeywordRule("이탈", 2.5),
            KeywordRule("문제", 2.0, negative_context="해결"),
            KeywordRule("실패", 2.0),
        ],
        "boost_patterns": [r"왜.*(하락|실패|문제)", r"원인.*분석"],
        "exclude_patterns": [r"문제.*해결.*새로운"],
        "dna_conditions": {
            "has_negative_symptom": +2.0,
            "has_external_factor": -1.0,
        }
    },
    
    "PESTEL": {
        "priority": 3,
        "keywords": [
            KeywordRule("시장 트렌드", 3.0),
            KeywordRule("규제", 2.5),
            KeywordRule("정책", 2.5),
            KeywordRule("환경 규제", 3.0),
            KeywordRule("사회 변화", 2.0),
        ],
        "boost_patterns": [r"(시장|산업).*(환경|트렌드)"],
        "dna_conditions": {
            "has_external_mention": +2.5,
        }
    },
    
    "PERSONA": {
        "priority": 4,
        "keywords": [
            KeywordRule("페르소나", 3.0),
            KeywordRule("타겟 프로필", 2.5),
            KeywordRule("고객 니즈", 2.5),
            KeywordRule("라이프스타일", 2.0),
            KeywordRule("누구", 1.5, context_boost="고객"),
        ],
        "dna_conditions": {
            "target_empty": +2.0,
            "target_focus": +1.5,
        }
    },
    
    "SWOT": {
        "priority": 5,
        "keywords": [
            KeywordRule("강점", 2.5),
            KeywordRule("약점", 2.5),
            KeywordRule("진단", 2.0),
            KeywordRule("현황", 2.0),
            KeywordRule("경쟁사", 1.5),
        ],
        "boost_patterns": [r"현재.*(상황|현황)"],
        "dna_conditions": {
            "has_current_state": +1.5,
        }
    },
    
    "BMC": {
        "priority": 6,
        "keywords": [
            KeywordRule("카페", 3.0),
            KeywordRule("매장", 3.0),
            KeywordRule("음식점", 3.0),
            KeywordRule("오프라인", 2.5),
            KeywordRule("프랜차이즈", 2.5),
            KeywordRule("창업", 2.0),
        ],
        "boost_patterns": [r"(카페|매장).*(창업|오픈)"],
        "exclude_patterns": [r"(카페|매장).*(앱|플랫폼)"],
        "dna_conditions": {
            "has_physical_location": +2.5,
            "has_app_mention": -2.0,
        }
    },
    
    "LEAN": {
        "priority": 7,
        "keywords": [
            KeywordRule("MVP", 3.0),
            KeywordRule("플랫폼", 2.5),
            KeywordRule("스타트업", 2.5),
            KeywordRule("앱 서비스", 2.5),
            KeywordRule("SaaS", 2.5),
            KeywordRule("페인포인트", 2.0),
            KeywordRule("앱", 2.0),
        ],
        "boost_patterns": [r"(앱|플랫폼).*(개발|출시|만들)"],
        # NOTE: exclude_patterns 제거 - "카페 주문 앱"은 LEAN 적합 케이스
        "dna_conditions": {
            "target_clear": +1.0,
            "has_tech_focus": +2.0,
        }
    },
    
    "PROCESS": {
        "priority": 8,
        "keywords": [
            KeywordRule("로드맵", 3.0),
            KeywordRule("단계별", 2.5),
            KeywordRule("어떻게 시작", 2.5),
            KeywordRule("순서", 2.0),
            KeywordRule("프로세스", 2.0),
        ],
        "boost_patterns": [r"어떻게.*(시작|진행)"],
        "dna_conditions": {
            "objective_has_timeline": +2.0,
        }
    },
    
    "LOGIC": {
        "priority": 9,
        "keywords": [
            KeywordRule("여행 계획", 2.0),
            KeywordRule("이벤트", 1.5),
        ]
    },
    
    # === 신규 6개 Framework ===
    "5WHYS": {
        "priority": 2,  # CAUSE와 같은 우선순위 (diagnosis)
        "keywords": [
            KeywordRule("왜", 2.5),
            KeywordRule("근본 원인", 3.0),
            KeywordRule("근본원인", 3.0),
            KeywordRule("반복", 2.0, context_boost="왜"),
            KeywordRule("깊이", 1.5, context_boost="파헤치기"),
        ],
        "boost_patterns": [r"왜.*왜", r"근본.*원인.*파헤치"],
        "dna_conditions": {
            "has_negative_symptom": +2.0,
        }
    },
    
    "PROS_CONS": {
        "priority": 5,  # choice intent
        "keywords": [
            KeywordRule("장점", 2.5),
            KeywordRule("단점", 2.5),
            KeywordRule("장단점", 3.0),
            KeywordRule("비교", 2.0),
            KeywordRule("좋은 점", 2.0),
            KeywordRule("나쁜 점", 2.0),
        ],
        "boost_patterns": [r"장단점.*(분석|비교)", r"(좋은|나쁜).*점"],
        "dna_conditions": {}
    },
    
    "DECISION_MATRIX": {
        "priority": 5,  # choice intent
        "keywords": [
            KeywordRule("점수", 2.5),
            KeywordRule("평가 기준", 3.0),
            KeywordRule("옵션", 2.0),
            KeywordRule("A안", 2.5),
            KeywordRule("B안", 2.5),
            KeywordRule("선택지", 2.0),
        ],
        "boost_patterns": [r"A안.*B안", r"(여러|다양한).*옵션", r"점수.*비교"],
        "dna_conditions": {}
    },
    
    "EISENHOWER": {
        "priority": 5,  # choice intent
        "keywords": [
            KeywordRule("우선순위", 3.0),
            KeywordRule("긴급", 2.5),
            KeywordRule("중요", 2.5),
            KeywordRule("먼저", 2.0),
            KeywordRule("나중", 1.5),
        ],
        "boost_patterns": [r"긴급.*(중요|순서)", r"먼저.*나중", r"우선순위.*(정하|결정)"],
        "dna_conditions": {}
    },
    
    "OKR": {
        "priority": 6,  # strategy intent
        "keywords": [
            KeywordRule("목표", 2.5),
            KeywordRule("OKR", 3.0),
            KeywordRule("핵심 결과", 3.0),
            KeywordRule("핵심결과", 3.0),
            KeywordRule("KR", 2.5),
            KeywordRule("측정 가능", 2.0),
        ],
        "boost_patterns": [r"목표.*(설정|세우)", r"(핵심|주요).*결과", r"측정.*가능"],
        "dna_conditions": {
            "objective_clear": +1.5,
        }
    },
    
    "KPT": {
        "priority": 6,  # strategy intent
        "keywords": [
            KeywordRule("회고", 3.0),
            KeywordRule("Keep", 2.5),
            KeywordRule("Problem", 2.5),
            KeywordRule("Try", 2.5),
            KeywordRule("KPT", 3.0),
            KeywordRule("좋았던", 2.0),
            KeywordRule("아쉬운", 2.0),
            KeywordRule("개선할", 2.0),
        ],
        "boost_patterns": [r"(좋았|잘된).*(아쉬운|개선)", r"회고.*(분석|정리)"],
        "dna_conditions": {}
    },
}


# ============================================================
# STEP 2: DNA 기반 점수 보정 함수
# ============================================================

def score_by_dna(dna, framework_id: str) -> float:
    """DNA(Context Vector) 상태에 따라 프레임워크 점수 보정"""
    if not dna:
        return 0.0
    
    bonus = 0.0
    conditions = FRAMEWORK_SCORING_RULES.get(framework_id, {}).get("dna_conditions", {})
    
    # summary 가져오기 (dict 또는 object)
    summary = dna.get("summary", "") if isinstance(dna, dict) else getattr(dna, "summary", "")
    target = dna.get("target", "") if isinstance(dna, dict) else getattr(dna, "target", "")
    edge = dna.get("edge", "") if isinstance(dna, dict) else getattr(dna, "edge", "")
    
    # PERSONA: target이 비어있으면 보너스
    if "target_empty" in conditions and len(target.strip()) < 5:
        bonus += conditions["target_empty"]
    
    # PESTEL: 외부 환경 언급
    if "has_external_mention" in conditions:
        external_keywords = ["규제", "정책", "시장", "트렌드", "환경"]
        if any(kw in summary for kw in external_keywords):
            bonus += conditions["has_external_mention"]
    
    # BMC: 물리적 공간 언급
    if "has_physical_location" in conditions:
        location_keywords = ["매장", "카페", "가게", "점포", "공간"]
        if any(kw in summary for kw in location_keywords):
            bonus += conditions["has_physical_location"]
    
    # BMC: 앱 언급 시 감점
    if "has_app_mention" in conditions:
        if "앱" in summary or "플랫폼" in summary:
            bonus += conditions["has_app_mention"]
    
    # LEAN: 기술 중심
    if "has_tech_focus" in conditions:
        tech_keywords = ["IT", "소프트웨어", "디지털", "온라인"]
        if any(kw in summary for kw in tech_keywords):
            bonus += conditions["has_tech_focus"]
    
    # CAUSE/5WHYS: 부정적 증상
    if "has_negative_symptom" in conditions:
        negative_keywords = ["하락", "감소", "줄었", "문제", "실패"]
        if any(kw in summary for kw in negative_keywords):
            bonus += conditions["has_negative_symptom"]
    
    # SCAMPER: edge가 추상적
    if "edge_vague" in conditions and len(edge.strip()) < 10:
        bonus += conditions["edge_vague"]
    
    return bonus


# ============================================================
# STEP 3: 다중 점수화 키워드 매칭 (고도화 v2)
# ============================================================

# [NEW] 방안 1: 키워드 조합 보너스
KEYWORD_COMBO_BONUS = {
    "LEAN": [
        (["앱", "서비스"], 2.0),
        (["앱", "플랫폼"], 2.5),
        (["앱", "개발"], 2.0),
        (["mvp", "개발"], 2.5),
        (["스타트업", "앱"], 2.0),
    ],
    "BMC": [
        (["카페", "창업"], 2.5),
        (["매장", "창업"], 2.5),
        (["음식점", "창업"], 2.5),
        (["오프라인", "사업"], 2.0),
    ],
    "CAUSE": [
        (["왜", "문제"], 2.0),
        (["원인", "분석"], 2.5),
        (["매출", "하락"], 2.5),
    ],
    "5WHYS": [
        (["왜", "왜"], 3.0),  # 반복 질문
        (["근본", "원인"], 2.5),
    ],
    "SCAMPER": [
        (["아이디어", "발전"], 2.0),
        (["브레인스토밍", "아이디어"], 2.5),
    ],
    "OKR": [
        (["목표", "설정"], 2.5),
        (["핵심", "결과"], 2.5),
    ],
    "KPT": [
        (["회고", "분석"], 2.5),
        (["좋았던", "아쉬운"], 2.5),
    ],
}

# [NEW] 방안 2: Intent Mode 우선순위 가중치
INTENT_PRIORITY_BOOST = {
    "creation": {"LEAN": 1.5, "BMC": 1.0, "SCAMPER": 0.5},
    "diagnosis": {"CAUSE": 2.0, "5WHYS": 1.5, "SWOT": 0.5},
    "choice": {"PROS_CONS": 1.5, "DECISION_MATRIX": 1.5, "EISENHOWER": 1.0},
    "strategy": {"OKR": 1.5, "KPT": 1.5, "SWOT": 0.5},
}


def calculate_framework_scores(
    user_input: str, 
    dna=None,
    available_frameworks: List[str] = None,
    intent_mode: str = None  # [NEW] Intent 가중치용
) -> Dict[str, float]:
    """
    각 프레임워크별 점수 계산 (키워드 + DNA 기반 + 고도화)
    
    고도화 v2:
    - 방안 1: 키워드 조합 보너스
    - 방안 2: Intent Mode 우선순위 가중치
    - 방안 3: 입력 길이 기반 보너스 (get_top_candidates에서 처리)
    """
    scores = defaultdict(float)
    input_lower = user_input.lower()
    input_length = len(user_input)
    
    for framework_id, rule_data in FRAMEWORK_SCORING_RULES.items():
        # Intent Mode 필터링
        if available_frameworks and framework_id not in available_frameworks:
            continue
        
        framework_score = 0.0
        
        # 1. 키워드 점수
        for kr in rule_data.get("keywords", []):
            if kr.keyword.lower() in input_lower:
                framework_score += kr.weight
                
                if kr.context_boost and kr.context_boost.lower() in input_lower:
                    framework_score += 1.0
                
                if kr.negative_context and kr.negative_context.lower() in input_lower:
                    framework_score -= 1.5
        
        # 2. Boost 패턴
        for pattern in rule_data.get("boost_patterns", []):
            if re.search(pattern, input_lower):
                framework_score += 2.0
        
        # 3. Exclude 패턴
        for pattern in rule_data.get("exclude_patterns", []):
            if re.search(pattern, input_lower):
                framework_score -= 3.0
        
        # 4. DNA 기반 보정
        if dna:
            dna_bonus = score_by_dna(dna, framework_id)
            framework_score += dna_bonus
        
        # [NEW] 방안 1: 키워드 조합 보너스
        combos = KEYWORD_COMBO_BONUS.get(framework_id, [])
        for keywords, bonus in combos:
            if all(kw.lower() in input_lower for kw in keywords):
                framework_score += bonus
        
        # [NEW] 방안 2: Intent Mode 우선순위 가중치
        if intent_mode and intent_mode in INTENT_PRIORITY_BOOST:
            intent_boost = INTENT_PRIORITY_BOOST[intent_mode].get(framework_id, 0)
            framework_score += intent_boost
        
        scores[framework_id] = framework_score
    
    return dict(scores)


# ============================================================
# STEP 4: 상위 후보군 추출 (고도화 v2)
# ============================================================

def get_top_candidates(
    scores: Dict[str, float], 
    top_n: int = 3,
    min_score: float = 2.0,
    input_length: int = 0  # [NEW] 방안 3용
) -> List[Tuple[str, float]]:
    """
    점수 기반 상위 N개 후보 추출 (고도화 v2)
    
    고도화:
    - 방안 3: 입력 길이 기반 보너스
    - 방안 4: 동적 min_score (1위의 60% 미만 제외)
    - 방안 5: 점수 격차 확정 (1위-2위 >= 1.5면 단일 확정)
    """
    if not scores:
        return []
    
    # 양수 점수만 필터링
    valid_scores = {k: v for k, v in scores.items() if v > 0}
    
    if not valid_scores:
        return []
    
    sorted_scores = sorted(valid_scores.items(), key=lambda x: x[1], reverse=True)
    top_score = sorted_scores[0][1]
    
    # [NEW] 방안 3: 입력 길이 기반 보너스 (짧은 입력에서 1위에 보너스)
    if input_length > 0 and input_length < 50:
        # 짧은 입력: 1위에 1.5점 보너스 적용 후 재정렬
        boosted = [(k, v + 1.5 if i == 0 else v) for i, (k, v) in enumerate(sorted_scores)]
        sorted_scores = sorted(boosted, key=lambda x: x[1], reverse=True)
        top_score = sorted_scores[0][1]
    
    # [NEW] 방안 4: 동적 min_score (1위의 60% 미만 제외)
    dynamic_min = max(min_score, top_score * 0.6)
    
    # [NEW] 방안 5: 점수 격차 확정 (1위-2위 >= 1.5면 단일 확정)
    if len(sorted_scores) >= 2:
        gap = sorted_scores[0][1] - sorted_scores[1][1]
        if gap >= 1.5:
            return [sorted_scores[0]]  # 단일 후보 확정!
    
    # 동적 min_score 적용
    valid = [(k, v) for k, v in sorted_scores if v >= dynamic_min]
    return valid[:top_n]


# ============================================================
# STEP 5: 구조화된 이유 생성
# ============================================================

@dataclass
class StructuredReasoning:
    """프레임워크 선택 이유를 구조화"""
    selected_framework: str
    confidence: int
    matched_keywords: List[str]
    dna_signals: List[str]
    rejected_frameworks: Dict[str, str]
    all_scores: Dict[str, float]


def build_structured_reasoning(
    selected_framework: str,
    scores: Dict[str, float],
    user_input: str,
    dna=None
) -> StructuredReasoning:
    """선택 이유를 구조화된 형태로 생성"""
    matched_keywords = []
    input_lower = user_input.lower()
    
    rule_data = FRAMEWORK_SCORING_RULES.get(selected_framework, {})
    for kr in rule_data.get("keywords", []):
        if kr.keyword.lower() in input_lower:
            matched_keywords.append(kr.keyword)
    
    # DNA 시그널
    dna_signals = []
    if dna:
        target = dna.get("target", "") if isinstance(dna, dict) else getattr(dna, "target", "")
        edge = dna.get("edge", "") if isinstance(dna, dict) else getattr(dna, "edge", "")
        objective = dna.get("objective", "") if isinstance(dna, dict) else getattr(dna, "objective", "")
        
        if len(target.strip()) < 5:
            dna_signals.append("target_missing")
        if len(edge.strip()) < 5:
            dna_signals.append("edge_missing")
        if len(objective.strip()) > 10:
            dna_signals.append("objective_clear")
    
    # 거부된 프레임워크
    rejected = {}
    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    
    for fw_id, score in sorted_scores[:3]:
        if fw_id != selected_framework and score > 0:
            if score < scores.get(selected_framework, 0) - 2.0:
                rejected[fw_id] = f"점수 차이 큼 ({score:.1f} vs {scores[selected_framework]:.1f})"
            else:
                rejected[fw_id] = "우선순위에서 밀림"
    
    # 신뢰도 계산
    top_score = scores.get(selected_framework, 0)
    second_score = sorted_scores[1][1] if len(sorted_scores) > 1 else 0
    gap = top_score - second_score
    
    confidence = min(int(50 + top_score * 5 + gap * 5), 100)
    
    return StructuredReasoning(
        selected_framework=selected_framework,
        confidence=confidence,
        matched_keywords=matched_keywords[:5],
        dna_signals=dna_signals,
        rejected_frameworks=rejected,
        all_scores=scores
    )


# ============================================================
# STEP 6: LLM Constrained Choice
# ============================================================

async def llm_constrained_choice(
    client,
    user_input: str,
    candidates: List[str],
    dna,
    language: str = "Korean"
) -> dict:
    """LLM에게 후보군 내에서만 선택하도록 제약"""
    
    # DNA 정보 포맷팅
    dna_info = ""
    if dna:
        summary = dna.get("summary", "") if isinstance(dna, dict) else getattr(dna, "summary", "")
        target = dna.get("target", "") if isinstance(dna, dict) else getattr(dna, "target", "")
        edge = dna.get("edge", "") if isinstance(dna, dict) else getattr(dna, "edge", "")
        objective = dna.get("objective", "") if isinstance(dna, dict) else getattr(dna, "objective", "")
        
        dna_info = f"""
Business DNA:
- Summary: {summary}
- Target: {target if target else "(not specified)"}
- Edge: {edge if edge else "(not specified)"}
- Objective: {objective if objective else "(not specified)"}
"""
    
    prompt = f"""You are a business framework expert.

USER INPUT:
{user_input}

{dna_info}

CANDIDATE FRAMEWORKS (choose ONE):
{', '.join(candidates)}

TASK:
1. Analyze the user's intent and business DNA
2. Choose the BEST framework from the candidates above
3. Explain WHY this framework is better than the others

Respond in JSON format:
{{
    "selected_framework": "framework_id",
    "reasoning": "clear explanation in {language}",
    "rejected_frameworks": {{
        "framework_id": "reason why rejected"
    }}
}}
"""
    
    response = await client.aio.models.generate_content(
        model=get_model("framework_pick"),
        contents=prompt,
        config=build_config("framework_pick", response_mime_type="application/json"),
    )

    return safe_json_parse(response.text)


# ============================================================
# STEP 7: 통합된 ImprovedIntentClassifier
# ============================================================

class ImprovedIntentClassifier:
    """
    개선된 Intent Classifier - 4단계 판단 프로세스
    - Intent Mode 필터링 지원
    - 신규 6개 Framework 지원

    Stateless: each request resolves its own Gemini client via the
    `api_key` parameter — never mutates shared instance state.
    """

    def __init__(self):
        # Default client (only used when no per-request key is provided)
        self._default_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

        # 기존 프롬프트 로드
        prompt_path = Path(__file__).parent.parent / "prompts" / "system_classifier.txt"
        if prompt_path.exists():
            with open(prompt_path, "r", encoding="utf-8") as f:
                self.system_prompt_template = f.read()
        else:
            self.system_prompt_template = ""

    def _get_client(self, api_key: Optional[str] = None):
        """Resolve a Gemini client for this request without mutating shared state."""
        if api_key:
            return genai.Client(api_key=api_key)
        if self._default_client:
            return self._default_client
        raise ValueError("No API key available. Please set your Gemini API key in Settings.")

    async def analyze_intent(
        self,
        user_input: str,
        user_language: str = "Korean",
        intent_mode: str = "creation",
        dna: Optional[dict] = None,
        api_key: Optional[str] = None,
    ) -> dict:
        """
        개선된 4단계 판단 프로세스:
        1. 키워드 기반 다중 점수화
        2. DNA 기반 점수 보정
        3. Intent Mode 필터링
        4. LLM Constrained Choice (상위 후보만)
        """
        client = self._get_client(api_key)

        logger.info("Improved classifier: intent_mode=%s", intent_mode)

        # Intent에 허용된 Framework 목록 가져오기
        available_frameworks = get_frameworks_for_intent(intent_mode)
        logger.debug("Allowed frameworks: %s", available_frameworks)

        # === STEP 1: 키워드 기반 점수화 ===
        initial_scores = calculate_framework_scores(
            user_input,
            dna=None,
            available_frameworks=available_frameworks
        )

        valid_scores = {k: v for k, v in initial_scores.items() if v > 0}

        if valid_scores:
            top_initial = sorted(valid_scores.items(), key=lambda x: x[1], reverse=True)[:5]
            logger.debug("Initial keyword scores top5: %s", top_initial)
        else:
            logger.debug("No keyword match -> defer to AI")

        # === STEP 2: DNA 기반 점수 보정 ===
        if dna is None:
            dna = {"summary": user_input[:200], "target": "", "edge": "", "objective": ""}

        refined_scores = calculate_framework_scores(
            user_input,
            dna=dna,
            available_frameworks=available_frameworks
        )

        valid_refined = {k: v for k, v in refined_scores.items() if v > 0}

        if valid_refined:
            top_refined = sorted(valid_refined.items(), key=lambda x: x[1], reverse=True)[:5]
            logger.debug("Refined scores top5: %s", top_refined)

        # === STEP 3: 상위 후보 추출 ===
        candidates = get_top_candidates(refined_scores, top_n=3, min_score=2.0)

        if not candidates:
            logger.debug("No candidates -> full AI fallback")
            return await self._fallback_to_full_ai(client, user_input, user_language, available_frameworks)

        candidate_ids = [fw for fw, _ in candidates]
        logger.debug("Top candidates: %s", candidate_ids)

        # 단일 후보면 즉시 확정
        if len(candidates) == 1:
            selected = candidates[0][0]
            logger.info("Single candidate confirmed: %s", selected)

            reasoning = build_structured_reasoning(selected, refined_scores, user_input, dna)

            return {
                "selected_framework_id": selected,
                "confidence_score": reasoning.confidence,
                "reasoning_log": f"키워드 매칭 ({reasoning.confidence}%): {', '.join(reasoning.matched_keywords)}",
                "structured_reasoning": asdict(reasoning),
                "context_vector": dna,
                "source": "keyword+dna"
            }

        # === STEP 4: LLM Constrained Choice ===
        logger.info("LLM constrained choice over %d candidates", len(candidate_ids))

        llm_result = await llm_constrained_choice(
            client,
            user_input,
            candidate_ids,
            dna,
            user_language
        )

        selected = llm_result["selected_framework"]
        logger.info("LLM picked: %s", selected)

        reasoning = build_structured_reasoning(selected, refined_scores, user_input, dna)

        return {
            "selected_framework_id": selected,
            "confidence_score": reasoning.confidence,
            "reasoning_log": llm_result["reasoning"],
            "structured_reasoning": asdict(reasoning),
            "context_vector": dna,
            "source": "hybrid_constrained"
        }

    async def _fallback_to_full_ai(
        self,
        client,
        user_input: str,
        language: str,
        available_frameworks: List[str]
    ) -> dict:
        """키워드 매칭 실패 시 기존 AI 전체 위임"""
        logger.debug("Falling back to full AI selection")

        # 제한된 프레임워크 목록으로 프롬프트 생성
        frameworks_list = ", ".join(available_frameworks)

        prompt = f"""You are a business framework expert.

Choose the most appropriate framework from: {frameworks_list}

USER INPUT:
{user_input}

Respond in JSON:
{{
    "selected_framework": "framework_id",
    "reasoning": "Why this framework in {language}",
    "confidence": 70
}}
"""

        response = await client.aio.models.generate_content(
            model=get_model("framework_fallback"),
            contents=prompt,
            config=build_config("framework_fallback", response_mime_type="application/json"),
        )

        data = safe_json_parse(response.text)

        return {
            "selected_framework_id": data.get("selected_framework"),
            "confidence_score": data.get("confidence", 70),
            "reasoning_log": data.get("reasoning", ""),
            "source": "ai_full"
        }


# ============================================================
# 테스트 코드
# ============================================================

if __name__ == "__main__":
    test_cases = [
        ("카페 창업하고 싶어요", "Korean", "creation"),
        ("카페 주문 앱을 만들고 싶어요", "Korean", "creation"),
        ("왜 매출이 하락했는지 원인 분석", "Korean", "diagnosis"),
        ("A안과 B안 중 어떤 게 나을까", "Korean", "choice"),
        ("올해 목표를 세우고 싶어", "Korean", "strategy"),
        ("지난 프로젝트 회고하고 싶어", "Korean", "strategy"),
    ]
    
    async def run_tests():
        classifier = ImprovedIntentClassifier()
        
        for user_input, language, intent in test_cases:
            print(f"\n{'='*80}")
            print(f"테스트: {user_input} (Intent: {intent})")
            print(f"{'='*80}")
            
            result = await classifier.analyze_intent(user_input, language, intent)
            
            print(f"\n✅ 최종 결과:")
            print(f"   Framework: {result['selected_framework_id']}")
            print(f"   Confidence: {result.get('confidence_score', 'N/A')}%")
            print(f"   Source: {result['source']}")
    
    print("\n테스트를 실행하려면:")
    print("python -c \"import asyncio; from logic.improved_classifier import run_tests; asyncio.run(run_tests())\"")
