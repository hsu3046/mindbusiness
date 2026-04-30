"""
Question Generator for Smart Question Flow.
Generates contextual questions using persona-based methodology.
"""

from typing import List, Optional, Dict, Any
from schemas.context_vector import ContextVector
from schemas.conversation import ConversationMessage
from logic.dna_sanitizer import BAD_TARGETS, BAD_EDGES, BAD_OBJECTIVES


# 페르소나 기반 질문 템플릿
QUESTION_PERSONAS: Dict[str, Dict[str, str]] = {
    "target": {
        "persona": "마케터 (SPIN 방법론)",
        "system_instruction": "고객의 고통(Pain)과 욕망(Need)을 정의하게 하라.",
        "question_template": "누구의 어떤 결핍을 채워주고 싶으신가요?",
        "examples": "예: 바쁜 직장인의 허기, MZ세대의 과시욕, 아이와 함께하는 부모의 여유"
    },
    "edge": {
        "persona": "투자 심사역 (Socratic 방법론)",
        "system_instruction": "경쟁자와의 비교 우위를 집요하게 파고들어라.",
        "question_template": "경쟁사들이 절대 따라 할 수 없는 우리만의 무기는 무엇인가요?",
        "examples": "예: 압도적 가성비, 독점 기술/레시피, 열성 팬덤, 희소한 원재료"
    },
    "objective": {
        "persona": "경영 컨설턴트 (GROW Model)",
        "system_instruction": "성공한 미래의 모습(Goal)을 시각화하게 하라.",
        "question_template": "1년 뒤, 이 사업이 어떤 모습이길 꿈꾸시나요?",
        "examples": "예: 안정적 월수익 1천만원, 프랜차이즈 3호점, 매각(Exit)"
    },
    "identity": {
        "persona": "브랜드 디렉터 (Golden Circle)",
        "system_instruction": "What이 아니라 Why(존재 이유)를 물어라.",
        "question_template": "단순한 사업이 아닌, 어떤 가치를 전달하는 공간인가요?",
        "examples": "예: 도심 속 쉼터, 영감의 공간, 커뮤니티 허브, 문화 살롱"
    }
}

# 질문 우선순위 (부족한 정보 중 가장 중요한 것부터)
QUESTION_PRIORITY = ["target", "edge", "objective", "identity"]


def is_field_missing(dna: ContextVector, field_type: str) -> bool:
    """
    DNA 필드가 부족한지 판단.
    """
    if field_type == "target":
        value = dna.target
        bad_list = BAD_TARGETS
    elif field_type == "edge":
        value = dna.edge
        bad_list = BAD_EDGES
    elif field_type == "objective":
        value = dna.objective
        bad_list = BAD_OBJECTIVES
    elif field_type == "identity":
        value = dna.summary
        bad_list = []
    else:
        return False
    
    # 너무 짧으면 부족
    if len(value.strip()) < 5:
        return True
    
    # 금지어 포함 시 부족
    if any(bad in value for bad in bad_list):
        return True
    
    # Sanitizer가 기본값으로 대체했으면 부족
    if field_type in dna.sanitized_fields:
        return True
    
    return False


def get_next_question_type(
    dna: ContextVector, 
    asked_types: List[str]
) -> Optional[str]:
    """
    이미 물어본 타입 제외, 다음으로 부족한 타입 반환.
    
    Args:
        dna: 현재 DNA 상태
        asked_types: 이미 질문한 타입 리스트
    
    Returns:
        다음 질문 타입 또는 None (모두 충분)
    """
    for q_type in QUESTION_PRIORITY:
        if q_type in asked_types:
            continue  # 이미 물어봄
        if is_field_missing(dna, q_type):
            return q_type
    return None  # 모두 충분


def calculate_dna_quality(dna: ContextVector) -> int:
    """
    DNA 품질 점수 계산 (0-100).
    
    각 필드별 25점 만점:
    - target: 25점
    - edge: 25점
    - objective: 25점
    - summary/identity: 25점
    """
    score = 0
    
    # Target (25점)
    if not is_field_missing(dna, "target"):
        score += 25
    elif len(dna.target.strip()) >= 3:
        score += 10  # 부분 점수
    
    # Edge (25점)
    if not is_field_missing(dna, "edge"):
        score += 25
    elif len(dna.edge.strip()) >= 3:
        score += 10
    
    # Objective (25점)
    if not is_field_missing(dna, "objective"):
        score += 25
    elif len(dna.objective.strip()) >= 3:
        score += 10
    
    # Identity/Summary (25점)
    if len(dna.summary.strip()) >= 10:
        score += 25
    elif len(dna.summary.strip()) >= 5:
        score += 15
    
    return score


def get_asked_types(conversation_history: List[ConversationMessage]) -> List[str]:
    """
    대화 히스토리에서 이미 질문한 타입 추출.
    """
    return [
        msg.question_type 
        for msg in conversation_history 
        if msg.role == "assistant" and msg.question_type
    ]


def get_persona_for_type(question_type: str) -> Dict[str, str]:
    """
    질문 타입에 해당하는 페르소나 정보 반환.
    """
    return QUESTION_PERSONAS.get(question_type, QUESTION_PERSONAS["target"])
