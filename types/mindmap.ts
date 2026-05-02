export interface MindmapNode {
    id: string
    label: string
    description?: string
    type: string

    // Node importance for visual sizing (1=Low, 2=Normal, 3=High, 4=VeryHigh, 5=Critical)
    importance?: 1 | 2 | 3 | 4 | 5

    // Phase 2: Semantic Analysis
    semantic_type?: 'finance' | 'action' | 'risk' | 'persona' | 'resource' | 'metric' | 'other'
    attributes?: Record<string, unknown>

    // Recursive structure
    children: MindmapNode[]

    // Phase 2: Monetization
    recommendations?: RecommendationNode[]

    /**
     * If the AI applied a specific framework (PERSONA, SWOT, …) when
     * expanding this node, the framework id is stamped here. Lets later
     * expansions of any descendant collect the full chain of frameworks
     * along the path — used by the `used_frameworks` accumulation in
     * map-page-content's handleExpand to fix the nesting-limit check.
     */
    applied_framework_id?: string
}

export interface RecommendationNode {
    id: string
    label: string
    description: string
    partner_id: string
    partner_name: string
    affiliate_url: string
    price?: number
    original_price?: number
    discount?: string
}

// Context Vector (Business DNA)
export interface ContextVector {
    summary: string
    target: string
    edge: string
    objective: string
    is_sanitized?: boolean
    sanitized_fields?: string[]
}

// Missing info types for clarification flow
export type MissingInfoType = 'framework' | 'target_audience' | 'objective' | 'edge' | 'none'

// Choice Chip option
export interface ClarificationOption {
    label: string
    value: string
    framework_id?: string  // Only for Turn 1 (framework selection)
}

/**
 * 조상 노드 정보 — 라벨뿐 아니라 description/type/framework까지 포함해
 * 백엔드 expand prompt가 누적된 의미를 활용할 수 있게 함.
 */
export interface AncestorNode {
    label: string
    description?: string | null
    type?: string | null  // 'ai' | 'manual' | 'root'
    applied_framework_id?: string | null
}

export interface ExpandRequest {
    topic: string
    context_path: string[]
    /**
     * Same path as `context_path` but enriched with each ancestor's
     * description / type / applied framework. Backend prefers this when
     * present and falls back to `context_path` when missing.
     */
    ancestor_chain?: AncestorNode[]
    target_node_label: string
    current_framework_id: string
    used_frameworks: string[]
    current_depth: number
    // New fields for improved prompt quality
    sibling_labels?: string[]           // Same level siblings (for MECE)
    parent_sibling_labels?: string[]    // Parent's siblings (broader context)
    existing_children?: string[]        // Already existing children (for add mode)
    force_framework?: string
    language: string
    /**
     * Optional Gemini sampling seed — pass an integer to make the call
     * deterministic (debug / A-B / CI golden tests). Omit for normal
     * stochastic generation.
     */
    seed?: number
    /**
     * Business DNA from smart-classify. When present the backend injects
     * a `[BUSINESS DNA]` block into the system_instruction so generated
     * children are specific to the user's actual business.
     */
    context_vector?: ContextVector
    /**
     * High-level intent (creation/diagnosis/choice/strategy). Tunes the
     * prompt's tone toward the right kind of children at deep levels.
     */
    intent_mode?: 'creation' | 'diagnosis' | 'choice' | 'strategy'
    /**
     * User-selected expansion strategy (Phase 2 mode dropdown). Each maps
     * to a parameter override bundle in the backend (temperature delta,
     * top_p, model swap, prompt addon).
     *   - default: stage settings as-is
     *   - diverse: hotter + top_p high + ~1.5x count + diversity prompt
     *   - deep: Pro + HIGH reasoning + cooler + step-by-step prompt
     *   - mece: cooler + tighter top_p + MECE-strict prompt
     * Distinct from `ExpandResponse.expansion_mode` which describes the
     * structure shape the AI produced.
     */
    expansion_mode?: 'default' | 'diverse' | 'deep' | 'mece'
    /**
     * 이전 expand가 needs_clarification=true였을 때 사용자가 입력한 답변.
     * 백엔드는 이 답변을 system_instruction에 [USER CLARIFICATION] 섹션으로
     * 주입해 AI가 활용하게 함. None이면 첫 호출.
     */
    clarification_answer?: string
    /**
     * Clarification 라운드 카운터. 0=최초, 1+=재호출. 3 도달 시 백엔드가
     * needs_clarification 무시하고 강제 생성 (무한루프 방지).
     */
    clarification_turn?: number
}

export interface ExpandResponse {
    children: MindmapNode[]
    applied_framework_id?: string
    expansion_mode: 'framework' | 'logic_tree' | 'semi_structured'
    confidence_score: number
    alternative_framework?: string
    warning?: {
        message: string
        code: string
    }
    /**
     * AI가 정보 부족으로 의미있는 expansion을 못 만들겠다고 신호. true면
     * children=[] + clarifying_question 채워서 옴.
     */
    needs_clarification?: boolean
    /**
     * needs_clarification=true일 때 AI가 사용자에게 묻고 싶은 구체적 질문.
     */
    clarifying_question?: string
}

export interface ClassificationResponse {
    reasoning_log?: string
    confidence_score: number
    needs_clarification: boolean
    selected_framework_id?: string
    root_node_title?: string

    // Clarification flow
    missing_info_type?: MissingInfoType
    clarification_question?: string
    clarification_options?: ClarificationOption[]

    // Business DNA
    context_vector?: ContextVector
}

export interface GenerateResponse {
    root_node: MindmapNode
    framework_id: string
    total_nodes: number
    expected_l2_counts?: Record<string, number>  // L1 node ID → L2 count
}

// Smart Question Flow Types

export interface ConversationMessage {
    role: 'user' | 'assistant'
    content: string
    question_type?: string  // "target", "edge", "objective", "identity"
}

export interface SmartClassifyRequest {
    user_input: string
    user_language?: string
    turn_number: number  // 1, 2, or 3
    intent_mode?: string  // 'creation' | 'diagnosis' | 'choice' | 'strategy'
    conversation_history: ConversationMessage[]
}

export interface SmartClassifyResponse {
    // DNA 상태
    dna_quality_score: number
    context_vector?: ContextVector

    // 다음 액션
    action: 'ask_question' | 'generate' | 'fill_and_generate'

    // 질문 (action === 'ask_question')
    question?: string
    question_type?: string
    question_persona?: string
    question_examples?: string

    // 생성 (action === 'generate' or 'fill_and_generate')
    selected_framework_id?: string
    fill_in_message?: string

    // L1 템플릿 (Intent별 맞춤형 L1 노드)
    l1_labels?: Array<{ label: string; display: string }>

    // 디버깅
    reasoning_log?: string
}

// API Error Response (for timeout and error handling)
export interface APIErrorResponse {
    error: 'classification_timeout' | 'generation_timeout' | 'expansion_timeout' |
    'classification_error' | 'generation_error' | 'expansion_error' | 'validation_error'
    message: string
    retry: boolean
}

// Type guard for API error response
export function isAPIError(data: unknown): data is APIErrorResponse {
    return typeof data === 'object' && data !== null && 'error' in data && 'message' in data
}

// Report generation
export interface ReportRequest {
    topic: string
    framework_id: string
    mindmap_tree: MindmapNode
    language: string
}
