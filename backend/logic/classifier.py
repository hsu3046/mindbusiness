"""
Framework Classifier using Gemini Pro.
Analyzes user input and determines the best business framework.
Also extracts Business DNA (Context Vector) for Generator parallelization.
"""

import json
from pathlib import Path
from typing import Optional
from google import genai
from google.genai import types

import config
from config import GEMINI_API_KEY, MODEL_REASONING, get_frameworks_for_intent
from schemas.intent_schema import FrameworkDecision, MissingInfoType
from schemas.context_vector import ContextVector
from logic.dna_sanitizer import sanitize_dna, needs_clarification_for_target
from lib.json_utils import safe_json_parse
from lib.text_utils import strip_markdown


# ============================================================
# Framework Selection Rules (Strict Priority Order)
# LEAN 과다 선택 문제 해결을 위한 우선순위 재조정 (2025-12-21)
# ============================================================
FRAMEWORK_SELECTION_RULES = [
    {
        # 1. SCAMPER - 아이디어 브레인스토밍/혁신에 명확한 의도
        "id": "SCAMPER",
        "priority": 1,
        "trigger": "brainstorm, modify, innovate existing product/concept",
        "keywords": {
            "ko": ["브레인스토밍", "새 아이디어", "아이디어", "수정", "변형", "다른 용도", "창의적", "피봇", "혁신", "개선", "바꿔", "새롭게"],
            "en": ["brainstorming", "new idea", "modify", "change shape", "different use", "creative", "pivot", "innovation", "improve"],
            "ja": ["ブレスト", "新しいアイデア", "修正", "変形", "別の用途", "クリエイティブ", "ピボット", "革新"]
        }
    },
    {
        # 2. CAUSE - 문제 진단/원인 분석
        "id": "CAUSE",
        "priority": 2,
        "trigger": "negative symptom (sales drop, churn, defect) or root cause",
        "keywords": {
            "ko": ["왜", "매출 하락", "클레임", "문제", "고장", "원인", "실패", "안 돼", "안돼", "떨어졌", "줄었", "하락", "이탈", "불만"],
            "en": ["why", "sales drop", "complaint", "error", "problem", "failure", "broken", "issue", "decline", "churn"],
            "ja": ["なぜ", "売上低下", "クレーム", "問題", "故障", "原因", "失敗", "壊れ", "減少"]
        }
    },
    {
        # 3. PESTEL - 거시 환경/규제/트렌드
        "id": "PESTEL",
        "priority": 3,
        "trigger": "external environment, regulations, laws, future trends",
        "keywords": {
            "ko": ["시장 트렌드", "규제", "정부", "사회", "경제", "정책", "법률", "환경 규제", "사회 변화", "기술 변화"],
            "en": ["market trend", "regulation", "government", "society", "economy", "policy", "law", "environment"],
            "ja": ["市場トレンド", "規制", "政府", "社会", "経済", "政策", "法律", "環境"]
        }
    },
    {
        # 4. PERSONA - 고객 프로필/심리에 집중
        "id": "PERSONA",
        "priority": 4,
        "trigger": "deep focus on WHO the customer is, lifestyle, psychology",
        "keywords": {
            "ko": ["타겟 프로필", "누구", "어떤 사람", "일상", "고객 니즈", "페르소나", "라이프스타일", "성향", "취향"],
            "en": ["target profile", "who is he", "daily life", "customer needs", "persona", "lifestyle", "preference"],
            "ja": ["ターゲットプロフィール", "誰", "日常", "顧客ニーズ", "ペルソナ", "ライフスタイル"]
        }
    },
    {
        # 5. SWOT - 현황 진단/객관적 분석
        "id": "SWOT",
        "priority": 5,
        "trigger": "objective diagnosis, current status check (Pros/Cons)",
        "keywords": {
            "ko": ["강점", "약점", "진단", "평가", "현황", "현재 상황", "분석", "경쟁사", "비교"],
            "en": ["strength", "weakness", "diagnosis", "assessment", "current situation", "analysis", "competitor"],
            "ja": ["強み", "弱み", "診断", "評価", "現状", "分析", "競合"]
        }
    },
    {
        # 6. BMC - 오프라인/전통 비즈니스 (LEAN보다 우선)
        "id": "BMC",
        "priority": 6,
        "trigger": "physical business (Store, Cafe, Factory) or holistic business structure",
        "keywords": {
            "ko": ["오프라인", "매장", "카페", "음식점", "식당", "가게", "프랜차이즈", "공간 임대", "비용 구조", "파트너", "사업 계획", "창업"],
            "en": ["offline store", "franchise", "space rental", "cost structure", "partners", "full plan", "cafe", "restaurant", "shop"],
            "ja": ["オフライン", "店舗", "カフェ", "レストラン", "お店", "フランチャイズ", "事業計画"]
        }
    },
    {
        # 7. LEAN - Tech/App/Platform (BMC, SCAMPER에 해당 안 될 때만)
        "id": "LEAN",
        "priority": 7,
        "trigger": "Tech/App/Platform startup or problem-solution fit validation",
        "note": "Only choose LEAN if it doesn't fit BMC or SCAMPER",
        "keywords": {
            "ko": ["앱 서비스", "앱", "플랫폼", "스타트업", "MVP", "페인포인트", "솔루션", "SaaS", "O2O", "IT"],
            "en": ["app service", "platform", "startup", "mvp", "pain point", "solution", "saas", "o2o", "tech"],
            "ja": ["アプリサービス", "プラットフォーム", "スタートアップ", "MVP", "ソリューション"]
        }
    },
    {
        # 8. PROCESS - 단계별 계획/로드맵
        "id": "PROCESS",
        "priority": 8,
        "trigger": "timeline or step-by-step guide",
        "keywords": {
            "ko": ["어떻게 시작", "로드맵", "계획", "단계", "순서", "절차", "프로세스", "일정"],
            "en": ["how to start", "roadmap", "plan", "steps", "process", "timeline", "schedule"],
            "ja": ["始め方", "ロードマップ", "計画", "ステップ", "手順", "プロセス"]
        }
    },
    {
        # 9. LOGIC - Fallback (비즈니스 외 주제)
        "id": "LOGIC",
        "priority": 9,
        "trigger": "non-business topic or simple plan (fallback)",
        "keywords": {
            "ko": ["여행 계획", "이벤트", "파티", "간단히", "정리"],
            "en": ["plan a trip", "event", "party", "simple", "organize"],
            "ja": ["旅行計画", "イベント", "パーティー", "シンプル", "整理"]
        }
    }
]


def match_framework_by_keywords(user_input: str) -> Optional[str]:
    """
    키워드 기반으로 Framework를 선택합니다.
    우선순위 순서대로 매칭하여 첫 번째로 매칭되는 Framework를 반환합니다.
    
    Args:
        user_input: 사용자 입력 텍스트
    
    Returns:
        매칭된 Framework ID 또는 None
    """
    input_lower = user_input.lower()
    
    for rule in FRAMEWORK_SELECTION_RULES:
        # 모든 언어의 키워드 검사
        for lang, keywords in rule["keywords"].items():
            for keyword in keywords:
                if keyword.lower() in input_lower:
                    return rule["id"]
    
    return None  # 매칭 없음 (AI에게 판단 위임)


class IntentClassifier:
    """
    Analyzes user input and classifies intent to select appropriate framework.
    Uses Gemini Pro for reasoning and decision-making.
    Also extracts Context Vector (Business DNA) for downstream processing.
    """
    
    def __init__(self):
        """Initialize the classifier with Gemini client and system prompt."""
        self.client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
        
        # Load system prompt template
        prompt_path = Path(__file__).parent.parent / "prompts" / "system_classifier.txt"
        with open(prompt_path, "r", encoding="utf-8") as f:
            self.system_prompt_template = f.read()
        
        # Multilingual error messages
        self.error_messages = {
            "Korean": "죄송합니다. 분석 중 오류가 발생했습니다. 조금 더 구체적으로 말씀해 주시겠어요?",
            "English": "Apologies. An error occurred during analysis. Could you please provide more details?",
            "Japanese": "申し訳ありません。分析中にエラーが発生しました。もう少し具体的にお話しいただけますか？"
        }
    
    def _get_client(self, api_key: Optional[str] = None):
        """Get genai client, with optional API key override."""
        if api_key:
            return genai.Client(api_key=api_key)
        if self.client:
            return self.client
        raise ValueError("No API key available. Please set your Gemini API key in Settings.")
    
    async def analyze_intent(
        self, 
        user_input: str, 
        user_language: str = "Korean",
        api_key: Optional[str] = None
    ) -> dict:
        """
        Analyze user input and return framework decision with Context Vector.
        
        Args:
            user_input: User's input text to analyze
            user_language: Target language for output ("Korean", "English", "Japanese")
        
        Returns:
            Dictionary containing framework decision and sanitized Context Vector
        """
        try:
            # 1. Format system prompt with target language
            formatted_system_prompt = self.system_prompt_template.replace(
                "{target_language}", 
                user_language
            )
            
            # 2. Construct full prompt
            full_prompt = f"""{formatted_system_prompt}

[USER INPUT]
{user_input}
"""
            
            # === DEBUG LOGGING ===
            print("\n" + "="*60)
            print("🧠 [CLASSIFIER] AI 추론 시작")
            print("="*60)
            print(f"📝 User Input: {user_input[:100]}{'...' if len(user_input) > 100 else ''}")
            print(f"🌐 Language: {user_language}")
            print("-"*60)
            
            # 3. Call Gemini Pro with JSON Mode
            client = self._get_client(api_key)
            response = await client.aio.models.generate_content(
                model=MODEL_REASONING,
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,  # Low temperature for consistent reasoning
                )
            )
            
            # 4. Parse and validate response
            json_str = response.text
            data = safe_json_parse(json_str)
            
            # === DEBUG: AI Response ===
            print(f"✅ AI Response Received")
            print(f"   - Framework: {data.get('selected_framework_id', 'N/A')}")
            print(f"   - Confidence: {data.get('confidence_score', 'N/A')}")
            print(f"   - Reasoning: {data.get('reasoning_log', 'N/A')[:100]}...")
            if data.get('context_vector'):
                cv = data['context_vector']
                print(f"   - DNA Summary: {cv.get('summary', 'N/A')[:50]}...")
                print(f"   - DNA Target: {cv.get('target', 'N/A')[:50]}...")
            print("="*60 + "\n")
            
            # Validate with Pydantic v2
            validated_result = FrameworkDecision.model_validate(data)
            
            # 5. Apply DNA Sanitizer if context_vector exists
            if validated_result.context_vector:
                validated_result.context_vector = sanitize_dna(
                    validated_result.context_vector,
                    user_input
                )
                
                # 6. Auto-set missing_info_type based on sanitized DNA
                if validated_result.missing_info_type == MissingInfoType.NONE:
                    if needs_clarification_for_target(validated_result.context_vector):
                        validated_result.missing_info_type = MissingInfoType.TARGET_AUDIENCE
                        validated_result.needs_clarification = True
            
            # Return as dict
            return validated_result.model_dump()
        
        except json.JSONDecodeError as e:
            print(f"JSON parsing error: {e}")
            print(f"Raw response: {response.text if 'response' in locals() else 'N/A'}")
            return self._error_response(user_language, f"JSON Error: {str(e)}")
        
        except Exception as e:
            print(f"Error in Classifier: {e}")
            return self._error_response(user_language, str(e))
    
    def _error_response(self, user_language: str, error_detail: str) -> dict:
        """
        Generate error response in user's language.
        
        Args:
            user_language: Target language
            error_detail: Technical error details (for logging)
        
        Returns:
            Error response matching FrameworkDecision schema
        """
        fallback_msg = self.error_messages.get(
            user_language, 
            self.error_messages["English"]
        )
        
        return {
            "reasoning_log": f"System Error: {error_detail}",
            "selection_reason": None,
            "confidence_score": 0,
            "selected_framework_id": None,
            "root_node_title": None,
            "needs_clarification": True,
            "missing_info_type": MissingInfoType.FRAMEWORK.value,
            "clarification_question": fallback_msg,
            "clarification_options": None,
            "context_vector": None
        }


class SmartClassifier:
    """
    Smart 3-turn classifier with persona-based questions.
    Collects DNA through contextual questions before generation.
    
    [2025-12-24 Update] Integrated ImprovedIntentClassifier for better framework selection.
    """
    
    def __init__(self):
        """Initialize with Gemini client and prompts."""
        self.client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
        
        # Load question generator prompt
        prompt_path = Path(__file__).parent.parent / "prompts" / "system_question_generator.txt"
        with open(prompt_path, "r", encoding="utf-8") as f:
            self.question_prompt_template = f.read()
        
        # Load classifier prompt for DNA extraction
        classifier_path = Path(__file__).parent.parent / "prompts" / "system_classifier.txt"
        with open(classifier_path, "r", encoding="utf-8") as f:
            self.classifier_prompt_template = f.read()
        
        # Load DNA+Question One-Shot prompt (for optimized single AI call)
        dna_question_path = Path(__file__).parent.parent / "prompts" / "system_dna_question.txt"
        with open(dna_question_path, "r", encoding="utf-8") as f:
            self.dna_question_prompt_template = f.read()
        
        # Load Infer Mode prompt (for long input >=100 chars, silent inference)
        dna_infer_path = Path(__file__).parent.parent / "prompts" / "system_dna_infer.txt"
        with open(dna_infer_path, "r", encoding="utf-8") as f:
            self.dna_infer_prompt_template = f.read()
        
        # Load framework templates for L1 labels
        template_path = Path(__file__).parent.parent / "prompts" / "framework_templates.json"
        with open(template_path, "r", encoding="utf-8") as f:
            self.framework_templates = json.load(f)
        
        # Import question generator utilities
        from logic.question_generator import (
            QUESTION_PERSONAS,
            get_next_question_type,
            calculate_dna_quality,
            get_asked_types,
            get_persona_for_type
        )
        self.QUESTION_PERSONAS = QUESTION_PERSONAS
        self.get_next_question_type = get_next_question_type
        self.calculate_dna_quality = calculate_dna_quality
        self.get_asked_types = get_asked_types
        self.get_persona_for_type = get_persona_for_type
        
        # [NEW] ImprovedIntentClassifier for better framework selection
        from logic.improved_classifier import ImprovedIntentClassifier
        self.improved_classifier = ImprovedIntentClassifier()
    
    def _get_client(self, api_key: Optional[str] = None):
        """Get genai client, with optional API key override."""
        if api_key:
            return genai.Client(api_key=api_key)
        if self.client:
            return self.client
        raise ValueError("No API key available. Please set your Gemini API key in Settings.")
    
    async def select_framework_improved(self, user_input: str, dna: dict, intent_mode: str, language: str) -> dict:
        """
        [NEW] Use ImprovedIntentClassifier for framework selection.
        
        Args:
            user_input: Combined user input
            dna: DNA dict (summary, target, edge, objective)
            intent_mode: Intent mode (creation, diagnosis, choice, strategy)
            language: User language
        
        Returns:
            {
                'framework_id': str,
                'confidence': int,
                'reasoning': str,
                'source': str  # 'keyword+dna' | 'hybrid_constrained' | 'ai_full'
            }
        """
        result = await self.improved_classifier.analyze_intent(
            user_input=user_input,
            user_language=language,
            intent_mode=intent_mode,
            dna=dna
        )
        
        return {
            'framework_id': result.get('selected_framework_id', 'LEAN'),
            'confidence': result.get('confidence_score', 70),
            'reasoning': result.get('reasoning_log', ''),
            'source': result.get('source', 'ai_full')
        }
    
    def get_l1_labels(self, framework_id: str, intent_mode: str, language: str = "Korean") -> list:
        """
        Get L1 labels from Intent-specific framework template.
        
        Args:
            framework_id: Framework ID (e.g., 'LEAN', 'SWOT')
            intent_mode: Intent mode (e.g., 'creation', 'diagnosis')
            language: Target language (default: 'Korean')
        
        Returns:
            List of {label, display} dicts, or empty list if not found
        """
        # Build template key: {FRAMEWORK}_{INTENT} (e.g., LEAN_CREATION)
        intent_suffix = intent_mode.upper()
        template_key = f"{framework_id}_{intent_suffix}"
        
        template_data = self.framework_templates.get(template_key)
        
        # Fallback: try creation intent if specific intent not found
        if not template_data and intent_mode != "creation":
            template_key = f"{framework_id}_CREATION"
            template_data = self.framework_templates.get(template_key)
            print(f"⚠️ L1 Template fallback: {framework_id}_{intent_suffix} → {template_key}")
        
        if not template_data:
            print(f"⚠️ L1 Template not found: {template_key}")
            return []
        
        # Get language-specific labels
        labels = template_data.get(language, template_data.get("Korean", []))
        return labels
    
    async def smart_classify(self, request, api_key: Optional[str] = None) -> dict:
        """
        3-turn conversation-based classification with DNA collection.
        
        Args:
            request: SmartClassifyRequest with conversation history
        
        Returns:
            SmartClassifyResponse as dict
        """
        from schemas.conversation import SmartClassifyResponse
        
        try:
            # Temporarily override client if api_key provided
            original_client = self.client
            if api_key:
                self.client = self._get_client(api_key)
                self.improved_classifier.client = self.client
            elif not self.client:
                self.client = self._get_client()
                self.improved_classifier.client = self.client
            
            # === DEBUG LOGGING ===
            print("\n" + "="*60)
            print("🧠 [SMART CLASSIFIER] 분석 시작")
            print("="*60)
            print(f"🔄 Turn: {request.turn_number}")
            print(f"🌐 Language: {request.user_language}")
            print(f"🎯 Intent Mode: {request.intent_mode}")
            print("-"*60)
            
            # 1. Combine all user inputs from history
            all_inputs = self._combine_user_inputs(request)
            input_length = len(all_inputs)
            print(f"📝 Combined Input ({input_length}자): {all_inputs[:150]}{'...' if input_length > 150 else ''}")
            
            # === INFER MODE: 첫 입력이 100자 이상이면 질문 없이 Silent Inference ===
            if request.turn_number == 1 and input_length >= 100:
                print(f"🧠 INFER MODE 활성화 (입력 {input_length}자 >= 100자)")
                
                # === STEP 1: 키워드 매칭 먼저 (AI 호출 없음, ~0.05초) ===
                from logic.improved_classifier import calculate_framework_scores, get_top_candidates
                from config import get_frameworks_for_intent
                
                available_frameworks = get_frameworks_for_intent(request.intent_mode)
                scores = calculate_framework_scores(
                    all_inputs, 
                    dna=None, 
                    available_frameworks=available_frameworks,
                    intent_mode=request.intent_mode  # [NEW] Intent 가중치
                )
                candidates = get_top_candidates(
                    scores, 
                    top_n=3, 
                    min_score=2.0,
                    input_length=input_length  # [NEW] 길이 보너스
                )
                
                print(f"   🔍 키워드 매칭 결과: {candidates if candidates else '없음'}")
                
                # 단일 후보 → AI 호출 스킵! (~0.2초)
                if candidates and len(candidates) == 1:
                    framework = candidates[0][0]
                    score = candidates[0][1]
                    
                    # DNA는 간단하게 생성 (AI 호출 없음)
                    from schemas.context_vector import ContextVector
                    dna = ContextVector(
                        summary=all_inputs[:200],
                        target="",
                        edge="",
                        objective=""
                    )
                    quality_score = 50  # 기본값
                    
                    l1_labels = self.get_l1_labels(framework, request.intent_mode, request.user_language)
                    
                    print(f"   ✅ 단일 후보 확정! AI 호출 스킵")
                    print(f"🎯 Framework: {framework} (score: {score:.1f})")
                    print(f"📋 L1 Labels: {len(l1_labels)}개")
                    print(f"⚡ 응답 시간: ~0.2초 (AI 스킵)")
                    print("="*60 + "\n")
                    
                    return SmartClassifyResponse(
                        dna_quality_score=quality_score,
                        context_vector=dna,
                        action="generate",
                        selected_framework_id=framework,
                        l1_labels=l1_labels,
                        reasoning_log=f"Keyword match: {framework} (score: {score:.1f}). AI skipped for speed."
                    ).model_dump()
                
                # 다중 후보 또는 매칭 실패 → 기존 AI DNA 추출 사용
                print("   → 키워드 매칭 불충분, AI DNA 추출 시작...")
                result = await self._extract_dna_infer(all_inputs, request.user_language, request.intent_mode)
                dna = result["dna"]
                dna = sanitize_dna(dna, all_inputs)
                quality_score = self.calculate_dna_quality(dna)
                
                # 기존 AI가 선택한 Framework 사용 (추가 AI 호출 없음!)
                framework = result.get("recommended_framework", "LEAN")
                
                l1_labels = self.get_l1_labels(framework, request.intent_mode, request.user_language)
                
                print(f"📊 DNA Score: {quality_score}")
                print(f"   - Summary: {dna.summary[:80] if dna.summary else 'N/A'}...")
                print(f"   - Target: {dna.target[:50] if dna.target else 'N/A'}")
                print(f"🎯 Framework (AI): {framework}")
                print(f"📋 L1 Labels: {len(l1_labels)}개")
                print("="*60 + "\n")
                
                return SmartClassifyResponse(
                    dna_quality_score=quality_score,
                    context_vector=dna,
                    action="generate",
                    selected_framework_id=framework,
                    l1_labels=l1_labels,
                    reasoning_log=f"DNA infer: AI selected {framework}. {result.get('framework_reasoning', '')}"
                ).model_dump()
            
            # === ONE-SHOT: DNA 추출 + 질문 생성을 단일 AI 호출로 처리 ===
            print("🔄 One-Shot 모드: DNA + 질문 통합 처리")
            
            result = await self._extract_dna_and_question(
                all_inputs, request.conversation_history, request.user_language, request.intent_mode
            )
            dna = result["dna"]
            
            # 3. Sanitize DNA
            dna = sanitize_dna(dna, all_inputs)
            
            # 4. Calculate quality score
            quality_score = self.calculate_dna_quality(dna)
            
            # === DEBUG: DNA Info ===
            print(f"\n📊 DNA Quality Score: {quality_score}")
            print(f"   - Summary: {dna.summary[:80] if dna.summary else 'N/A'}...")
            print(f"   - Target: {dna.target[:50] if dna.target else 'N/A'}")
            print(f"   - Edge: {dna.edge[:50] if dna.edge else 'N/A'}")
            print(f"   - Objective: {dna.objective[:50] if dna.objective else 'N/A'}")
            
            # 5. Decision: Early exit if DNA is sufficient
            if quality_score >= 90:
                # [NEW] 개선된 Framework 선택 로직 사용
                dna_dict = {
                    "summary": dna.summary,
                    "target": dna.target,
                    "edge": dna.edge,
                    "objective": dna.objective
                }
                fw_result = await self.select_framework_improved(
                    all_inputs, dna_dict, request.intent_mode, request.user_language
                )
                framework = fw_result['framework_id']
                l1_labels = self.get_l1_labels(framework, request.intent_mode, request.user_language)
                print(f"✅ DNA 충분! Framework (Improved): {framework} [source: {fw_result['source']}]")
                print(f"📋 L1 Labels: {len(l1_labels)}개")
                print("="*60 + "\n")
                return SmartClassifyResponse(
                    dna_quality_score=quality_score,
                    context_vector=dna,
                    action="generate",
                    selected_framework_id=framework,
                    l1_labels=l1_labels,
                    reasoning_log=f"DNA sufficient. {fw_result['source']} selected {framework}. {fw_result['reasoning']}"
                ).model_dump()
            
            if request.turn_number >= 3:
                filled_dna = self._auto_fill_dna(dna, all_inputs)
                # [NEW] 개선된 Framework 선택 로직 사용
                dna_dict = {
                    "summary": filled_dna.summary,
                    "target": filled_dna.target,
                    "edge": filled_dna.edge,
                    "objective": filled_dna.objective
                }
                fw_result = await self.select_framework_improved(
                    all_inputs, dna_dict, request.intent_mode, request.user_language
                )
                framework = fw_result['framework_id']
                l1_labels = self.get_l1_labels(framework, request.intent_mode, request.user_language)
                print(f"📋 Turn 3 완료: Auto-fill + Framework (Improved) {framework} [source: {fw_result['source']}]")
                print(f"📋 L1 Labels: {len(l1_labels)}개")
                print("="*60 + "\n")
                return SmartClassifyResponse(
                    dna_quality_score=quality_score,
                    context_vector=filled_dna,
                    action="fill_and_generate",
                    fill_in_message="지금까지 주신 정보를 바탕으로 마인드맵을 작성할게요. 🚀",
                    selected_framework_id=framework,
                    l1_labels=l1_labels,
                    reasoning_log=f"Turn 3 complete. {fw_result['source']} selected {framework}."
                ).model_dump()
            
            # 7. Ask next question (One-Shot에서 이미 생성됨)
            asked_types = self.get_asked_types(request.conversation_history)
            next_type = self.get_next_question_type(dna, asked_types)
            
            if next_type is None:
                # All info collected, generate
                # [NEW] 개선된 Framework 선택 로직 사용
                dna_dict = {
                    "summary": dna.summary,
                    "target": dna.target,
                    "edge": dna.edge,
                    "objective": dna.objective
                }
                fw_result = await self.select_framework_improved(
                    all_inputs, dna_dict, request.intent_mode, request.user_language
                )
                framework = fw_result['framework_id']
                l1_labels = self.get_l1_labels(framework, request.intent_mode, request.user_language)
                print(f"✅ DNA 필드 완료! Framework (Improved): {framework} [source: {fw_result['source']}]")
                print(f"📋 L1 Labels: {len(l1_labels)}개")
                print("="*60 + "\n")
                return SmartClassifyResponse(
                    dna_quality_score=quality_score,
                    context_vector=dna,
                    action="generate",
                    selected_framework_id=framework,
                    l1_labels=l1_labels,
                    reasoning_log=f"All DNA fields collected. {fw_result['source']} selected {framework}."
                ).model_dump()
            
            # One-Shot에서 생성된 질문 사용
            persona = self.get_persona_for_type(next_type)
            question = result.get("question") or persona["question_template"]
            examples = result.get("question_examples") or persona["examples"]
            
            # [NEW] 마크다운 문법 제거
            question = strip_markdown(question)
            examples = strip_markdown(examples)
            
            print(f"❓ 질문 생성: {next_type}")
            print(f"   Question: {question[:50]}...")
            print("="*60 + "\n")
            
            return SmartClassifyResponse(
                dna_quality_score=quality_score,
                context_vector=dna,
                action="ask_question",
                question=question,
                question_type=next_type,
                question_persona=persona["persona"],
                question_examples=examples,
                reasoning_log=f"One-Shot: Asking about {next_type}. Quality={quality_score}."
            ).model_dump()
        
        except Exception as e:
            print(f"Error in SmartClassifier: {e}")
            return SmartClassifyResponse(
                dna_quality_score=0,
                context_vector=None,
                action="ask_question",
                question="어떤 사업을 생각하고 계신가요? 조금 더 자세히 알려주세요.",
                question_type="identity",
                reasoning_log=f"Error: {str(e)}"
            ).model_dump()
        finally:
            # Restore original client
            if api_key and original_client is not None:
                self.client = original_client
    
    def _combine_user_inputs(self, request) -> str:
        """Combine all user inputs from conversation history."""
        inputs = [
            msg.content for msg in request.conversation_history 
            if msg.role == "user"
        ]
        inputs.append(request.user_input)
        return " ".join(inputs)
    
    async def _extract_dna(self, combined_input: str, language: str) -> ContextVector:
        """Extract DNA from combined user inputs using AI."""
        prompt = self.classifier_prompt_template.replace("{target_language}", language)
        full_prompt = f"{prompt}\n\n[USER INPUT]\n{combined_input}"
        
        response = await self.client.aio.models.generate_content(
            model=MODEL_REASONING,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            )
        )
        
        data = safe_json_parse(response.text)
        
        # Extract context_vector from response
        cv_data = data.get("context_vector", {})
        return ContextVector(
            summary=cv_data.get("summary", combined_input),
            target=cv_data.get("target", ""),
            edge=cv_data.get("edge", ""),
            objective=cv_data.get("objective", "")
        )
    
    async def _extract_dna_infer(self, combined_input: str, language: str, intent_mode: str = "creation") -> dict:
        """
        Infer Mode: Extract DNA with silent inference.
        For long input (>=100 chars), AI infers missing fields without asking questions.
        """
        # Get available frameworks for this intent mode
        available_frameworks = get_frameworks_for_intent(intent_mode)
        frameworks_str = ", ".join(available_frameworks)
        
        # Format prompt
        prompt = self.dna_infer_prompt_template.replace(
            "{user_input}", combined_input
        ).replace(
            "{conversation_history}", "(첫 대화)"
        ).replace(
            "{target_language}", language
        ).replace(
            "{available_frameworks}", frameworks_str
        )
        
        response = await self.client.aio.models.generate_content(
            model=MODEL_REASONING,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            )
        )
        
        data = safe_json_parse(response.text)
        
        # Extract context_vector from response
        cv_data = data.get("context_vector", {})
        
        # Log inferred fields and framework
        inferred = data.get("inferred_fields", [])
        if inferred:
            print(f"   → 추론된 필드: {', '.join(inferred)}")
        
        framework = data.get("recommended_framework", "BMC")
        reasoning = data.get("framework_reasoning", "")
        print(f"   → AI 프레임워크 선택: {framework}")
        if reasoning:
            print(f"      이유: {reasoning}")
        
        dna = ContextVector(
            summary=cv_data.get("summary", combined_input),
            target=cv_data.get("target", ""),
            edge=cv_data.get("edge", ""),
            objective=cv_data.get("objective", "")
        )
        
        return {
            "dna": dna,
            "recommended_framework": framework,
            "framework_reasoning": reasoning
        }
    
    async def _extract_dna_and_question(
        self, combined_input: str, history: list, language: str, intent_mode: str = "creation"
    ) -> dict:
        """
        One-Shot: Extract DNA and generate question in single AI call.
        Reduces Turn-based AI calls from 2 to 1.
        """
        # Get available frameworks for this intent mode
        available_frameworks = get_frameworks_for_intent(intent_mode)
        frameworks_str = ", ".join(available_frameworks)
        
        # Format conversation history
        history_str = "\n".join([
            f"{'User' if msg.role == 'user' else 'AI'}: {msg.content}"
            for msg in history
        ]) if history else "(첫 대화)"
        
        # Format prompt
        prompt = self.dna_question_prompt_template.replace(
            "{user_input}", combined_input
        ).replace(
            "{conversation_history}", history_str
        ).replace(
            "{target_language}", language
        ).replace(
            "{available_frameworks}", frameworks_str
        )
        
        response = await self.client.aio.models.generate_content(
            model=MODEL_REASONING,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            )
        )
        
        data = safe_json_parse(response.text)
        
        # Extract DNA
        cv_data = data.get("context_vector", {})
        dna = ContextVector(
            summary=cv_data.get("summary", combined_input),
            target=cv_data.get("target", ""),
            edge=cv_data.get("edge", ""),
            objective=cv_data.get("objective", "")
        )
        
        # Extract AI-selected framework
        framework = data.get("recommended_framework", "BMC")
        reasoning = data.get("framework_reasoning", "")
        print(f"   → AI 프레임워크 선택: {framework}")
        if reasoning:
            print(f"      이유: {reasoning}")
        
        return {
            "dna": dna,
            "recommended_framework": framework,
            "framework_reasoning": reasoning,
            "question": data.get("question", ""),
            "question_type": data.get("question_type", "target"),
            "question_examples": data.get("question_examples", "")
        }
    
    async def _generate_question(
        self, dna: ContextVector, question_type: str, 
        history: list, language: str
    ) -> dict:
        """Generate contextual question using AI."""
        persona = self.get_persona_for_type(question_type)
        
        # Format conversation history
        history_str = "\n".join([
            f"{'User' if msg.role == 'user' else 'AI'}: {msg.content}"
            for msg in history
        ]) if history else "(첫 대화)"
        
        # Format asked types
        asked = self.get_asked_types(history)
        asked_str = ", ".join(asked) if asked else "없음"
        
        prompt = self.question_prompt_template.replace(
            "{summary}", dna.summary
        ).replace(
            "{target}", dna.target
        ).replace(
            "{target_status}", "✅" if len(dna.target) > 5 else "❌ 부족"
        ).replace(
            "{edge}", dna.edge
        ).replace(
            "{edge_status}", "✅" if len(dna.edge) > 5 else "❌ 부족"
        ).replace(
            "{objective}", dna.objective
        ).replace(
            "{objective_status}", "✅" if len(dna.objective) > 5 else "❌ 부족"
        ).replace(
            "{conversation_history}", history_str
        ).replace(
            "{asked_types}", asked_str
        ).replace(
            "{next_question_type}", question_type
        ).replace(
            "{persona_name}", persona["persona"]
        ).replace(
            "{persona_instruction}", persona["system_instruction"]
        ).replace(
            "{target_language}", language
        )
        
        response = await self.client.aio.models.generate_content(
            model=MODEL_REASONING,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.3,
            )
        )
        
        return safe_json_parse(response.text)
    
    def _select_framework(self, dna: ContextVector) -> str:
        """Select best framework based on DNA content."""
        summary_lower = dna.summary.lower()
        
        # Simple keyword matching for framework selection
        if any(kw in summary_lower for kw in ["창업", "스타트업", "신규", "아이디어"]):
            return "LEAN"
        elif any(kw in summary_lower for kw in ["기존", "확장", "성장", "모델"]):
            return "BMC"
        elif any(kw in summary_lower for kw in ["문제", "원인", "왜"]):
            return "CAUSE"
        elif any(kw in summary_lower for kw in ["단계", "로드맵", "순서", "프로세스"]):
            return "PROCESS"
        elif any(kw in summary_lower for kw in ["환경", "시장", "트렌드"]):
            return "PESTEL"
        elif any(kw in summary_lower for kw in ["고객", "타겟", "페르소나"]):
            return "PERSONA"
        else:
            return "LEAN"  # Default for new ideas
    
    def _auto_fill_dna(self, dna: ContextVector, context: str) -> ContextVector:
        """Auto-fill missing DNA fields with reasonable defaults."""
        if len(dna.target.strip()) < 5:
            dna.target = "일반 소비자 및 잠재 고객"
        
        if len(dna.edge.strip()) < 5:
            dna.edge = "시장 내 경쟁력 확보를 위한 차별화 전략"
        
        if len(dna.objective.strip()) < 5:
            dna.objective = "지속 가능한 성장과 안정적 수익 창출"
        
        dna.is_sanitized = True
        return dna
