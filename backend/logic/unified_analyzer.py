"""
===================================================================
Unified Analyzer - 통합 입력 분석기
===================================================================

AI 호출 없이 단일 분석으로:
- DNA 필드별 점수 (정보 충분성)
- Framework 후보 선정 (점수 기반)
- 층위 기반 프레임워크 시퀀싱
- DNA 텍스트 스니펫 추출

성능 목표: ~0.1초 (AI 호출 없음)
"""

import re
from dataclasses import dataclass
from typing import Dict, List, Tuple, Optional
from collections import defaultdict


# =========================================================
# 0) 사전/메타 정의
# =========================================================

DNA_FIELDS = ("summary", "target", "edge", "objective")

# --- DNA 힌트 사전 ---
BUSINESS_TYPES = {
    "카페": 25, "음식점": 25, "매장": 25, "가게": 25,
    "앱": 25, "플랫폼": 25, "서비스": 20, "사업": 15
}
DOMAINS = ["패션", "뷰티", "식품", "it", "교육", "의료", "부동산", "금융", "여행", "스포츠"]

EXPLICIT_TARGETS = {"고객": 20, "타겟": 25, "사용자": 20, "유저": 20, "소비자": 20, "구매자": 20, "회원": 15}
OCCUPATIONS = ["직장인", "주부", "학생", "프리랜서", "자영업자", "개발자", "디자이너", "마케터", "경영진"]
LOCATIONS = ["홍대", "강남", "서울", "부산", "지역", "동네"]
PERSONA_KEYWORDS = ["라이프스타일", "관심사", "니즈", "페인포인트", "행동 패턴", "선호"]

EXPLICIT_EDGE = {"차별": 30, "강점": 25, "특징": 25, "장점": 25, "경쟁력": 30, "독특": 25, "유니크": 25}
ADJECTIVES = {"빠른": 20, "저렴한": 20, "편리한": 20, "안전한": 20, "고급": 20, "프리미엄": 25, "혁신적": 25, "효율적": 20, "간편한": 20, "맞춤": 25, "개인화": 25}
TECH_METHODS = ["ai", "인공지능", "머신러닝", "자동화", "직수입", "수제", "핸드메이드", "커스텀", "구독", "멤버십", "플랫폼"]
STRONG_DIFF = ["최초", "유일", "독보적", "원조"]
COMPARISON = ["보다", "와 달리", "에 비해", "기존 vs", "vs"]

OBJECTIVE_VERBS = {
    "창업": 30, "시작": 25, "개발": 25, "만들": 25,
    "출시": 30, "런칭": 30, "오픈": 25,
    "분석": 25, "파악": 25, "해결": 25,
    "증가": 25, "확대": 25, "성장": 25
}
TIME_KEYWORDS = ["3개월", "6개월", "1년", "올해", "내년", "빠르게", "신속", "조속"]
NEGATIVE_PROBLEMS = ["하락", "감소", "줄었", "문제", "실패", "이탈", "불만", "불편", "느림"]

# --- 슬롯 패턴 (구체성 감지) ---
SLOT_PATTERNS = {
    "metric": [
        r"(kpi|지표|전환율|매출|이탈|mau|dau|ltv|cac|roi|퍼널|%)",
        r"(\d+(\.\d+)?%|\d+명|\d+원|\d+만원|\d+주|\d+개월|\d+일)"
    ],
    "constraint": [r"(예산|기간|마감|인력|리소스|정책|법|보안|규정|제한)"],
    "options": [r"(비교|대안|옵션|선택지|vs|a\/b|a\s*vs\s*b)"],
    "problem": [r"(문제|불편|어렵|힘들|막히|리스크|오류|지연|비용|원인|근본)"],
    "process": [r"(프로세스|흐름|단계|우선순위|로드맵|스프린트|mvp|파일럿)"],
}


# --- Framework 메타 (15개 전체) ---
FRAMEWORK_META = {
    # === Creation Intent ===
    "BMC": {
        "keywords": [("가치제안", 3), ("고객", 2), ("세그먼트", 2), ("수익", 2), ("채널", 2), ("카페", 2), ("매장", 2), ("창업", 2)],
        "intent_bonus": {"creation": 3},
        "requirements": {"summary": 60, "target": 70, "edge": 60, "objective": 50, "overall_min": 65},
        "dna_weight": {"summary": 0.25, "target": 0.35, "edge": 0.30, "objective": 0.10},
        "slot_bonus": {"constraint": 1.0, "metric": 0.5, "options": 0.3},
    },
    "LEAN": {
        "keywords": [("가설", 3), ("검증", 3), ("mvp", 3), ("실험", 2), ("학습", 2), ("앱", 2), ("플랫폼", 2), ("스타트업", 2)],
        "intent_bonus": {"creation": 3},
        "requirements": {"summary": 60, "target": 60, "edge": 70, "objective": 50, "overall_min": 60},
        "dna_weight": {"summary": 0.25, "target": 0.25, "edge": 0.35, "objective": 0.15},
        "slot_bonus": {"metric": 1.0, "constraint": 0.6, "process": 0.4},
    },
    "PERSONA": {
        "keywords": [("페르소나", 3), ("니즈", 2), ("행동", 2), ("라이프스타일", 2), ("타겟", 2), ("고객", 2)],
        "intent_bonus": {"creation": 2},
        "requirements": {"summary": 50, "target": 80, "edge": 30, "objective": 40, "overall_min": 55},
        "dna_weight": {"summary": 0.15, "target": 0.55, "edge": 0.15, "objective": 0.15},
        "slot_bonus": {"constraint": 0.3, "metric": 0.3},
    },
    "SCAMPER": {
        "keywords": [("브레인스토밍", 3), ("아이디어", 2), ("변형", 2), ("대체", 2), ("역발상", 2), ("혁신", 2)],
        "intent_bonus": {"creation": 2},
        "requirements": {"summary": 50, "target": 40, "edge": 60, "objective": 50, "overall_min": 50},
        "dna_weight": {"summary": 0.20, "target": 0.15, "edge": 0.45, "objective": 0.20},
        "slot_bonus": {"options": 1.0, "process": 0.5},
    },
    "PESTEL": {
        "keywords": [("규제", 3), ("정책", 3), ("시장", 2), ("트렌드", 2), ("환경", 2), ("사회", 2)],
        "intent_bonus": {"creation": 1},
        "requirements": {"summary": 60, "target": 40, "edge": 50, "objective": 50, "overall_min": 50},
        "dna_weight": {"summary": 0.35, "target": 0.15, "edge": 0.25, "objective": 0.25},
        "slot_bonus": {"constraint": 1.0, "problem": 0.5},
    },
    
    # === Diagnosis Intent ===
    "CAUSE": {
        "keywords": [("원인", 3), ("왜", 2), ("문제", 2), ("하락", 2), ("실패", 2), ("이탈", 2)],
        "intent_bonus": {"diagnosis": 3},
        "requirements": {"summary": 70, "target": 30, "edge": 30, "objective": 60, "overall_min": 55},
        "dna_weight": {"summary": 0.40, "target": 0.10, "edge": 0.10, "objective": 0.40},
        "slot_bonus": {"problem": 1.2, "metric": 0.8},
    },
    "5WHYS": {
        "keywords": [("왜", 3), ("원인", 3), ("근본", 2), ("재발", 1), ("반복", 2)],
        "intent_bonus": {"diagnosis": 3},
        "requirements": {"summary": 70, "target": 40, "edge": 30, "objective": 60, "overall_min": 55},
        "dna_weight": {"summary": 0.45, "target": 0.10, "edge": 0.05, "objective": 0.40},
        "slot_bonus": {"problem": 1.2, "process": 0.4},
    },
    "SWOT": {
        "keywords": [("swot", 3), ("강점", 2), ("약점", 2), ("기회", 2), ("위협", 2), ("진단", 2), ("현황", 2)],
        "intent_bonus": {"diagnosis": 2, "creation": 1},
        "requirements": {"summary": 60, "target": 50, "edge": 50, "objective": 50, "overall_min": 55},
        "dna_weight": {"summary": 0.30, "target": 0.20, "edge": 0.25, "objective": 0.25},
        "slot_bonus": {"constraint": 0.5, "metric": 0.3},
    },
    
    # === Choice Intent ===
    "PROS_CONS": {
        "keywords": [("장점", 3), ("단점", 3), ("장단점", 3), ("좋은점", 2), ("나쁜점", 2), ("비교", 2)],
        "intent_bonus": {"choice": 3},
        "requirements": {"summary": 60, "target": 30, "edge": 40, "objective": 50, "overall_min": 50},
        "dna_weight": {"summary": 0.35, "target": 0.10, "edge": 0.30, "objective": 0.25},
        "slot_bonus": {"options": 1.2, "constraint": 0.5},
    },
    "DECISION_MATRIX": {
        "keywords": [("비교", 3), ("옵션", 2), ("선택", 2), ("점수", 2), ("평가", 2), ("A안", 2), ("B안", 2)],
        "intent_bonus": {"choice": 3},
        "requirements": {"summary": 60, "target": 30, "edge": 40, "objective": 60, "overall_min": 55},
        "dna_weight": {"summary": 0.30, "target": 0.10, "edge": 0.25, "objective": 0.35},
        "slot_bonus": {"options": 1.5, "metric": 1.0, "constraint": 0.5},
    },
    "EISENHOWER": {
        "keywords": [("우선순위", 3), ("긴급", 3), ("중요", 3), ("먼저", 2), ("나중", 2)],
        "intent_bonus": {"choice": 2, "strategy": 2},
        "requirements": {"summary": 50, "target": 30, "edge": 30, "objective": 60, "overall_min": 50},
        "dna_weight": {"summary": 0.25, "target": 0.10, "edge": 0.15, "objective": 0.50},
        "slot_bonus": {"constraint": 1.0, "process": 0.8},
    },
    
    # === Strategy Intent ===
    "OKR": {
        "keywords": [("목표", 3), ("OKR", 3), ("핵심결과", 3), ("KR", 2), ("측정", 2)],
        "intent_bonus": {"strategy": 3},
        "requirements": {"summary": 50, "target": 40, "edge": 40, "objective": 80, "overall_min": 60},
        "dna_weight": {"summary": 0.15, "target": 0.20, "edge": 0.15, "objective": 0.50},
        "slot_bonus": {"metric": 1.2, "constraint": 0.6, "process": 0.4},
    },
    "KPT": {
        "keywords": [("회고", 3), ("KPT", 3), ("Keep", 2), ("Problem", 2), ("Try", 2), ("좋았던", 2), ("아쉬운", 2)],
        "intent_bonus": {"strategy": 2},
        "requirements": {"summary": 60, "target": 30, "edge": 40, "objective": 50, "overall_min": 50},
        "dna_weight": {"summary": 0.35, "target": 0.10, "edge": 0.25, "objective": 0.30},
        "slot_bonus": {"problem": 0.8, "process": 0.5},
    },
    "PROCESS": {
        "keywords": [("로드맵", 3), ("단계", 2), ("순서", 2), ("프로세스", 2), ("어떻게", 2), ("시작", 2)],
        "intent_bonus": {"strategy": 3},
        "requirements": {"summary": 50, "target": 40, "edge": 40, "objective": 70, "overall_min": 55},
        "dna_weight": {"summary": 0.20, "target": 0.15, "edge": 0.15, "objective": 0.50},
        "slot_bonus": {"process": 1.2, "constraint": 0.6},
    },
    
    # === Fallback ===
    "LOGIC": {
        "keywords": [],
        "intent_bonus": {},
        "requirements": {"summary": 40, "target": 30, "edge": 30, "objective": 40, "overall_min": 35},
        "dna_weight": {"summary": 0.25, "target": 0.25, "edge": 0.25, "objective": 0.25},
        "slot_bonus": {"constraint": 0.2, "metric": 0.2, "options": 0.2, "problem": 0.2, "process": 0.2},
    }
}


# --- 문제 층위 정의 ---
PROBLEM_LAYERS = {
    "diagnosis": {
        "frameworks": ["CAUSE", "5WHYS", "SWOT"],
        "trigger_keywords": ["왜", "원인", "문제", "하락", "이유", "실패"],
        "next_layer": "strategy",
        "question": "현재 겪고 있는 가장 큰 문제가 무엇인가요?"
    },
    "strategy": {
        "frameworks": ["SWOT", "PESTEL", "OKR"],
        "trigger_keywords": ["전략", "방향", "목표", "계획", "비전"],
        "next_layer": "execution",
        "question": "이 문제를 해결하려는 궁극적인 목표가 무엇인가요?"
    },
    "execution": {
        "frameworks": ["LEAN", "PROCESS", "BMC"],
        "trigger_keywords": ["어떻게", "실행", "구현", "개발", "만들"],
        "next_layer": None,
        "question": "어떤 방식으로 실행하고 싶으신가요?"
    },
    "decision": {
        "frameworks": ["PROS_CONS", "DECISION_MATRIX", "EISENHOWER"],
        "trigger_keywords": ["선택", "비교", "결정", "우선순위", "고민"],
        "next_layer": "execution",
        "question": "현재 고려 중인 선택지들이 있나요?"
    },
    "ideation": {
        "frameworks": ["SCAMPER", "PERSONA"],
        "trigger_keywords": ["아이디어", "브레인스토밍", "새로운", "혁신"],
        "next_layer": "strategy",
        "question": "어떤 영역에서 새로운 아이디어가 필요한가요?"
    }
}


# =========================================================
# 1) 피처 추출
# =========================================================

@dataclass
class Features:
    text: str
    text_lower: str
    length: int
    word_count: int
    sentence_count: int
    has_numbers: bool
    has_bullets: bool
    slot_hits: Dict[str, int]
    context_flags: Dict[str, bool]


def extract_features(user_input: str) -> Features:
    """1회 피처 추출 - 모든 분석에 재사용"""
    t = user_input.strip()
    tl = t.lower()

    length = len(t)
    word_count = len(t.split())
    sentence_count = max(1, len(re.findall(r"[\.!\?\n]+", t)))
    has_numbers = bool(re.search(r"\d", t))
    has_bullets = bool(re.search(r"(^|\n)\s*[-*•]\s+", t))

    slot_hits: Dict[str, int] = {}
    for slot, patterns in SLOT_PATTERNS.items():
        hits = 0
        for p in patterns:
            hits += len(re.findall(p, tl, flags=re.IGNORECASE))
        slot_hits[slot] = hits

    business_type_mentioned = any(b in tl for b in BUSINESS_TYPES.keys())
    location_mentioned = any(loc in tl for loc in LOCATIONS)

    context_flags = {
        "location_plus_business": business_type_mentioned and location_mentioned,
        "has_objective_marker": ("위해" in tl) or ("위한" in tl),
        "has_comparison": any(c in tl for c in COMPARISON),
    }

    return Features(
        text=t, text_lower=tl, length=length, word_count=word_count,
        sentence_count=sentence_count, has_numbers=has_numbers, has_bullets=has_bullets,
        slot_hits=slot_hits, context_flags=context_flags
    )


# =========================================================
# 2) DNA 점수 계산
# =========================================================

def analyze_dna_scores(f: Features) -> Dict[str, int]:
    """각 DNA 필드별 점수 계산 (0-100)"""
    tl = f.text_lower
    scores = {k: 0 for k in DNA_FIELDS}

    # === summary ===
    for biz, s in BUSINESS_TYPES.items():
        if biz in tl:
            scores["summary"] += s
            break
    if any(d in tl for d in DOMAINS):
        scores["summary"] += 15
    if any(kw in tl for kw in ["문제", "하락", "증가", "개선", "창업"]):
        scores["summary"] += 20
    scores["summary"] = min(scores["summary"], 100)

    # === target ===
    for kw, s in EXPLICIT_TARGETS.items():
        if kw in tl:
            scores["target"] += s
            break
    if re.search(r"\d{2}대|\d{1,2}세|청소년|중장년|노년", tl):
        scores["target"] += 30
    if any(o in tl for o in OCCUPATIONS):
        scores["target"] += 25
    if any(x in tl for x in ["남성", "여성", "남자", "여자"]):
        scores["target"] += 15
    if f.context_flags["location_plus_business"]:
        scores["target"] += 20
    if any(p in tl for p in PERSONA_KEYWORDS):
        scores["target"] += 15
    scores["target"] = min(scores["target"], 100)

    # === edge ===
    for kw, s in EXPLICIT_EDGE.items():
        if kw in tl:
            scores["edge"] += s
            break
    for adj, s in ADJECTIVES.items():
        if adj in tl:
            scores["edge"] += s
            break
    if any(tm in tl for tm in TECH_METHODS):
        scores["edge"] += 25
    if any(sd in tl for sd in STRONG_DIFF):
        scores["edge"] += 30
    if f.context_flags["has_comparison"]:
        scores["edge"] += 20
    scores["edge"] = min(scores["edge"], 100)

    # === objective ===
    for v, s in OBJECTIVE_VERBS.items():
        if v in tl:
            scores["objective"] += s
    if re.search(r"\d+%|\d+명|\d+원|\d+건", tl):
        scores["objective"] += 30
    if any(x in tl for x in TIME_KEYWORDS):
        scores["objective"] += 20
    if any(x in tl for x in NEGATIVE_PROBLEMS):
        scores["objective"] += 25
    if f.context_flags["has_objective_marker"]:
        scores["objective"] += 15
    scores["objective"] = min(scores["objective"], 100)

    # 맥락 보너스: 3개 이상 필드가 살아있으면 +10
    non_zero = sum(1 for v in scores.values() if v > 0)
    if non_zero >= 3:
        for k in scores:
            scores[k] = min(scores[k] + 10, 100)

    return scores


def overall_info_score(dna: Dict[str, int], f: Features) -> int:
    """전체 정보 충분성 점수 (가중평균 + 구체성 보너스)"""
    base = (
        dna["summary"] * 0.20 +
        dna["target"] * 0.30 +
        dna["edge"] * 0.25 +
        dna["objective"] * 0.25
    )

    bonus = 0
    if f.slot_hits.get("metric", 0) > 0:
        bonus += 6
    if f.slot_hits.get("constraint", 0) > 0:
        bonus += 4
    if f.has_numbers:
        bonus += 3
    if f.has_bullets:
        bonus += 3
    if f.sentence_count >= 3:
        bonus += 2
    if f.length >= 120:
        bonus += 2
    if f.length >= 240:
        bonus += 1

    return int(min(100, base + bonus))


def check_info_sufficiency(dna: Dict[str, int], overall: int, req: Dict[str, int]) -> bool:
    """Framework별 요구사항 충족 여부"""
    if overall < req["overall_min"]:
        return False
    for field in DNA_FIELDS:
        if dna[field] < req[field]:
            return False
    return True


# =========================================================
# 3) Framework 점수 계산
# =========================================================

def compute_framework_scores(f: Features, dna: Dict[str, int], intent_mode: str) -> Dict[str, float]:
    """각 Framework별 적합도 점수 계산"""
    scores: Dict[str, float] = {}
    tl = f.text_lower

    for fw, meta in FRAMEWORK_META.items():
        s = 0.0

        # 1) 키워드 점수
        for kw, w in meta["keywords"]:
            if kw.lower() in tl:
                s += w

        # 2) Intent 보너스
        s += meta["intent_bonus"].get(intent_mode, 0)

        # 3) DNA 적합도 (0~100 -> 0~10)
        dna_w = meta["dna_weight"]
        dna_fit = (
            dna["summary"] * dna_w["summary"] +
            dna["target"] * dna_w["target"] +
            dna["edge"] * dna_w["edge"] +
            dna["objective"] * dna_w["objective"]
        )
        s += (dna_fit / 10.0)

        # 4) 슬롯 적합도
        for slot, bw in meta.get("slot_bonus", {}).items():
            if f.slot_hits.get(slot, 0) > 0:
                s += bw

        # 5) 맥락 조합 보너스
        if fw in ("BMC", "PERSONA") and f.context_flags["location_plus_business"]:
            s += 0.8

        # 6) 패널티
        if fw == "PERSONA" and dna["target"] < 35:
            s -= 2.0
        if fw == "5WHYS" and dna["summary"] < 40 and f.slot_hits.get("problem", 0) == 0:
            s -= 2.0

        scores[fw] = s

    return scores


def pick_candidates(scores: Dict[str, float], top_n: int = 3, min_score: float = 5.0) -> List[Tuple[str, float]]:
    """상위 N개 후보 추출"""
    items = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    filtered = [it for it in items if it[1] >= min_score]
    return filtered[:top_n] if filtered else items[:top_n]


def framework_confidence(candidates: List[Tuple[str, float]]) -> int:
    """Framework 선택 신뢰도 (0-100)"""
    if not candidates:
        return 0
    top = candidates[0][1]
    second = candidates[1][1] if len(candidates) > 1 else 0.0
    margin = top - second

    conf = 0
    conf += min(60, int(top * 6))
    conf += min(40, int(max(0.0, margin) * 20))
    return max(0, min(100, conf))


# =========================================================
# 4) 질문 타입 결정
# =========================================================

PRIORITY_MAP = {
    "BMC": ["target", "edge", "summary", "objective"],
    "LEAN": ["target", "edge", "objective", "summary"],
    "PERSONA": ["target", "summary", "edge", "objective"],
    "CAUSE": ["summary", "objective", "target", "edge"],
    "5WHYS": ["summary", "objective", "target", "edge"],
    "SWOT": ["summary", "target", "edge", "objective"],
    "SCAMPER": ["edge", "summary", "target", "objective"],
    "PESTEL": ["summary", "edge", "target", "objective"],
    "PROS_CONS": ["summary", "edge", "objective", "target"],
    "DECISION_MATRIX": ["summary", "objective", "edge", "target"],
    "EISENHOWER": ["objective", "summary", "edge", "target"],
    "OKR": ["objective", "target", "summary", "edge"],
    "KPT": ["summary", "objective", "edge", "target"],
    "PROCESS": ["objective", "summary", "edge", "target"],
    "LOGIC": ["target", "edge", "objective", "summary"],
}

def identify_missing_fields(dna: Dict[str, int], req: Dict[str, int]) -> List[str]:
    """요구사항 미달 필드 식별"""
    return [k for k in DNA_FIELDS if dna[k] < req[k]]

def prioritize_question(missing: List[str], fw: str) -> str:
    """Framework별 우선순위에 따라 질문할 필드 결정"""
    order = PRIORITY_MAP.get(fw, ["target", "edge", "objective", "summary"])
    for x in order:
        if x in missing:
            return x
    return missing[0] if missing else "target"


# =========================================================
# 5) 층위 기반 시퀀싱
# =========================================================

def suggest_framework_sequence(user_input: str, top_framework: str) -> dict:
    """층위 기반 프레임워크 시퀀스 제안"""
    text_lower = user_input.lower()
    
    # 1. 현재 층위 감지
    current_layer = None
    for layer, meta in PROBLEM_LAYERS.items():
        if any(kw in text_lower for kw in meta["trigger_keywords"]):
            current_layer = layer
            break
    
    if not current_layer:
        current_layer = "execution"  # 기본값
    
    # 2. 시퀀스 구성
    sequence = []
    layer = current_layer
    while layer:
        sequence.extend(PROBLEM_LAYERS[layer]["frameworks"][:1])
        layer = PROBLEM_LAYERS[layer].get("next_layer")
    
    return {
        "current_layer": current_layer,
        "primary_framework": top_framework,
        "sequence": sequence[:3],
        "first_question": PROBLEM_LAYERS[current_layer]["question"]
    }


# =========================================================
# 6) DNA 텍스트 추출
# =========================================================

def extract_dna_text(user_input: str, dna_scores: Dict[str, int]) -> Dict[str, str]:
    """점수와 함께 실제 텍스트 스니펫 추출 (AI 없음)"""
    text = user_input
    text_lower = text.lower()
    
    dna_text = {
        "summary": text[:200],
        "target": "",
        "edge": "",
        "objective": ""
    }
    
    # === Target 추출 ===
    # 패턴 1: 연령대
    age_match = re.search(r"(\d{2}대|\d{1,2}세|청소년|중장년|노년)", text)
    if age_match:
        start = max(0, age_match.start() - 20)
        end = min(len(text), age_match.end() + 20)
        dna_text["target"] = text[start:end].strip()
    
    # 패턴 2: 직업군
    if not dna_text["target"]:
        for occupation in OCCUPATIONS:
            if occupation in text_lower:
                idx = text_lower.find(occupation)
                start = max(0, idx - 15)
                end = min(len(text), idx + len(occupation) + 15)
                dna_text["target"] = text[start:end].strip()
                break
    
    # === Edge 추출 ===
    # 패턴 1: 명시적 마커 주변
    edge_markers = ["차별", "강점", "특징", "장점", "vs", "보다"]
    for marker in edge_markers:
        if marker in text_lower:
            idx = text_lower.find(marker)
            start = max(0, idx - 10)
            end = min(len(text), idx + 40)
            dna_text["edge"] = text[start:end].strip()
            break
    
    # 패턴 2: 형용사 + 명사
    if not dna_text["edge"]:
        adj_match = re.search(r"(빠른|저렴한|편리한|안전한|혁신적인?|맞춤형?)\s*\w+", text)
        if adj_match:
            dna_text["edge"] = adj_match.group()
    
    # === Objective 추출 ===
    # 패턴 1: 동사 + 목적어
    obj_match = re.search(r"(창업|개발|분석|해결|증가|확대|출시|런칭)(하고|하려|하기|할)", text)
    if obj_match:
        start = max(0, obj_match.start() - 20)
        end = min(len(text), obj_match.end() + 10)
        dna_text["objective"] = text[start:end].strip()
    
    # 패턴 2: "~하고 싶어요" 앞부분
    if not dna_text["objective"]:
        want_match = re.search(r"(.{10,50})(하고\s*싶|하려고|할\s*계획|할\s*예정)", text)
        if want_match:
            dna_text["objective"] = want_match.group(1).strip()
    
    return dna_text


# =========================================================
# 7) 의사결정
# =========================================================

def make_decision(conf: int, info_ok: bool, text_length: int, margin: float) -> str:
    """최종 의사결정: proceed / ask_question / ai_fallback"""
    # 완벽
    if conf >= 85 and info_ok and margin >= 1.5:
        return "proceed"

    # Framework는 맞는데 정보 부족
    if conf >= 75 and not info_ok:
        return "ask_question"

    # 애매한 Framework
    if margin < 1.0 and conf < 85:
        return "ask_question" if text_length < 220 else "ai_fallback"

    # 낮은 신뢰도 + 짧은 입력
    if conf < 70 and text_length < 50:
        return "ask_question"

    # 낮은 신뢰도 + 긴 입력
    if conf < 70 and text_length >= 50:
        return "ai_fallback"

    # 중간 신뢰도
    if 70 <= conf < 85:
        return "proceed" if info_ok else "ask_question"

    return "ask_question"


# =========================================================
# 8) 최종 통합 함수
# =========================================================

def analyze_input_unified(user_input: str, intent_mode: str) -> dict:
    """
    단일 통합 분석 (~0.1초, AI 없음)
    
    Returns:
        {
            # Framework
            "top_framework": "LEAN",
            "framework_candidates": [("LEAN", 12.5), ("BMC", 8.2)],
            "framework_confidence": 87,
            "single_framework": True,
            
            # Info
            "dna_field_scores": {"summary": 75, "target": 80, "edge": 60, "objective": 70},
            "dna_text": {"summary": "...", "target": "2030대 직장인", ...},
            "info_score": 82,
            "info_sufficient": True,
            
            # Question
            "needs_question": False,
            "missing_fields": [],
            "question_priority": None,
            
            # Decision
            "decision": "proceed",
            
            # Layer (ai_fallback용)
            "layer_sequence": {"current_layer": "execution", ...}
        }
    """
    f = extract_features(user_input)
    dna = analyze_dna_scores(f)

    # Framework scoring
    fw_scores = compute_framework_scores(f, dna, intent_mode=intent_mode)
    candidates = pick_candidates(fw_scores, top_n=3, min_score=5.0)

    top_fw = candidates[0][0] if candidates else "LOGIC"
    top_score = candidates[0][1] if candidates else 0.0
    second_score = candidates[1][1] if len(candidates) > 1 else 0.0
    margin = top_score - second_score

    conf = framework_confidence(candidates)

    # Info sufficiency
    req = FRAMEWORK_META.get(top_fw, FRAMEWORK_META["LOGIC"])["requirements"]
    overall = overall_info_score(dna, f)
    info_ok = check_info_sufficiency(dna, overall, req)

    decision = make_decision(conf, info_ok, f.length, margin)

    # Question
    if decision == "ask_question":
        missing = identify_missing_fields(dna, req)
        q_priority = prioritize_question(missing, top_fw)
    else:
        missing = []
        q_priority = None

    # Single framework 확정
    single_framework = (decision == "proceed") and (margin >= 1.5 or len(candidates) == 1)

    # DNA 텍스트 추출
    dna_text = extract_dna_text(user_input, dna)

    # 층위 시퀀스 (ai_fallback용)
    layer_seq = suggest_framework_sequence(user_input, top_fw)

    return {
        # Framework
        "top_framework": top_fw,
        "framework_candidates": candidates,
        "framework_confidence": conf,
        "single_framework": single_framework,
        "confidence_detail": {"top_score": top_score, "second_score": second_score, "margin": margin},

        # Info
        "dna_field_scores": dna,
        "dna_text": dna_text,
        "info_score": overall,
        "info_sufficient": info_ok,

        # Question
        "needs_question": decision == "ask_question",
        "missing_fields": missing,
        "question_priority": q_priority,

        # Decision
        "decision": decision,

        # Layer sequence
        "layer_sequence": layer_seq,

        # Debug
        "feature_snapshot": {
            "length": f.length,
            "word_count": f.word_count,
            "sentence_count": f.sentence_count,
            "has_numbers": f.has_numbers,
            "has_bullets": f.has_bullets,
            "slot_hits": f.slot_hits,
            "context_flags": f.context_flags,
        }
    }


# =========================================================
# 테스트
# =========================================================

if __name__ == "__main__":
    test_cases = [
        ("카페 창업하고 싶어요", "creation"),
        ("카페 주문 앱을 만들고 싶어요. 타겟은 2030대 직장인", "creation"),
        ("왜 매출이 하락했을까", "diagnosis"),
        ("A안과 B안 중 어떤 게 나을까", "choice"),
        ("올해 목표를 세우고 싶어", "strategy"),
    ]
    
    for user_input, intent in test_cases:
        result = analyze_input_unified(user_input, intent)
        
        print(f"\n{'='*60}")
        print(f"입력: {user_input}")
        print(f"Intent: {intent}")
        print(f"{'='*60}")
        print(f"Framework: {result['top_framework']} (conf: {result['framework_confidence']}%)")
        print(f"Decision: {result['decision']}")
        print(f"Info Score: {result['info_score']}")
        print(f"DNA Scores: {result['dna_field_scores']}")
        if result['needs_question']:
            print(f"Missing: {result['missing_fields']} → Ask: {result['question_priority']}")
