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

export interface ExpandRequest {
    topic: string
    context_path: string[]
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
