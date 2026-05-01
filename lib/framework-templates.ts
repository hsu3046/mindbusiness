/**
 * Framework Templates for L1 Node Generation
 * 
 * Framework가 결정되면 즉시 L1 노드를 표시하기 위한 템플릿 데이터
 */

import { MindmapNode } from '@/types/mindmap'

// Framework별 L1 템플릿 데이터 (숫자 제거)
export const FRAMEWORK_TEMPLATES: Record<string, Record<string, string[]>> = {
    BMC: {
        Korean: [
            "왜 우리 가게일까?",
            "누구에게 팔까?",
            "어디서 만날까?",
            "어떻게 친해질까?",
            "돈은 어떻게 벌까?",
            "꼭 필요한 것은?",
            "매일 해야 할 일은?",
            "누가 도와줄까?",
            "돈은 어디에 쓸까?"
        ],
        English: [
            "Value Propositions",
            "Customer Segments",
            "Channels",
            "Customer Relationships",
            "Revenue Streams",
            "Key Resources",
            "Key Activities",
            "Key Partnerships",
            "Cost Structure"
        ],
        Japanese: [
            "価値提案",
            "顧客セグメント",
            "チャネル",
            "顧客との関係",
            "収益の流れ",
            "リソース",
            "主要活動",
            "パートナー",
            "コスト構造"
        ]
    },
    LEAN: {
        Korean: [
            "해결하고 싶은 문제는?",
            "누가 힘들어할까?",
            "우리만의 확실한 매력",
            "우리의 해결 방법",
            "따라 할 수 없는 무기",
            "돈은 어떻게 벌까?",
            "돈은 어디에 쓸까?",
            "성공했는지 어떻게 알까?",
            "어떻게 알릴까?"
        ],
        English: [
            "Problem",
            "Customer Segments",
            "Unique Value Proposition",
            "Solution",
            "Unfair Advantage",
            "Revenue Streams",
            "Cost Structure",
            "Key Metrics",
            "Channels"
        ],
        Japanese: [
            "課題",
            "顧客セグメント",
            "独自の価値提案",
            "解決策",
            "圧倒的な優位性",
            "収益の流れ",
            "コスト構造",
            "主要指標",
            "チャネル"
        ]
    },
    LEAN_CANVAS: {
        Korean: [
            "문제 (Problem)",
            "고객군 (Customer Segments)",
            "고유 가치 제안 (UVP)",
            "솔루션 (Solution)",
            "경쟁 우위 (Unfair Advantage)",
            "수익원 (Revenue Streams)",
            "비용 구조 (Cost Structure)",
            "핵심 지표 (Key Metrics)",
            "채널 (Channels)"
        ],
        English: [
            "Problem",
            "Customer Segments",
            "Unique Value Proposition",
            "Solution",
            "Unfair Advantage",
            "Revenue Streams",
            "Cost Structure",
            "Key Metrics",
            "Channels"
        ],
        Japanese: [
            "課題",
            "顧客セグメント",
            "独自の価値提案",
            "解決策",
            "圧倒的な優位性",
            "収益の流れ",
            "コスト構造",
            "主要指標",
            "チャネル"
        ]
    },
    SWOT: {
        Korean: [
            "우리의 강점",
            "우리의 약점",
            "외부의 기회",
            "외부의 위협"
        ],
        English: ["Strengths", "Weaknesses", "Opportunities", "Threats"],
        Japanese: ["強み", "弱み", "機会", "脅威"]
    },
    PESTEL: {
        Korean: [
            "정치와 정책",
            "요즘 경기와 돈의 흐름",
            "사회적 유행과 트렌드",
            "새로운 기술 변화",
            "환경과 자연 이슈",
            "법과 규제"
        ],
        English: ["Political", "Economic", "Social", "Technological", "Environmental", "Legal"],
        Japanese: ["政治", "経済", "社会", "技術", "環境", "法律"]
    },
    PERSONA: {
        Korean: [
            "그 사람은 누구일까?",
            "무엇을 원할까?",
            "무엇이 불편할까?",
            "평소 습관은?",
            "이루고 싶은 꿈은?"
        ],
        English: ["Profile", "Needs", "Pain Points", "Behavior", "Goals"],
        Japanese: ["プロフィール", "ニーズ", "悩み", "行動", "目標"]
    },
    PROCESS: {
        Korean: [
            "1단계: 상상하고 준비하기",
            "2단계: 만들고 실행하기",
            "3단계: 꼼꼼히 확인하기",
            "4단계: 세상에 내놓기"
        ],
        English: ["Plan/Prep", "Execute/Dev", "Check/Test", "Deploy/Optimize"],
        Japanese: ["企画/準備", "実行/開発", "点検/テスト", "リリース/最適化"]
    },
    CAUSE: {
        Korean: [
            "사람 문제",
            "방법 문제",
            "환경 문제",
            "설비 문제"
        ],
        English: ["People", "Method", "Environment", "Equipment"],
        Japanese: ["人", "方法", "環境", "設備"]
    },
    SCAMPER: {
        Korean: [
            "S. 무엇을 바꿀까?",
            "C. 무엇을 합칠까?",
            "A. 어디에 적용할까?",
            "M. 무엇을 수정할까?",
            "P. 다른 용도는 없을까?",
            "E. 무엇을 없애까?",
            "R. 순서를 뒤집으면?"
        ],
        English: ["Substitute", "Combine", "Adapt", "Modify", "Put to other uses", "Eliminate", "Reverse"],
        Japanese: ["代用", "結合", "適応", "修正", "転用", "除去", "逆転"]
    },
    LOGIC: {
        Korean: [
            "누가 할까?",
            "언제 할까?",
            "어디서 할까?",
            "무엇을 할까?",
            "어떻게 할까?",
            "왜 하는 걸까?"
        ],
        English: ["Who", "When", "Where", "What", "How", "Why"],
        Japanese: ["誰が", "いつ", "どこで", "何を", "どのように", "なぜ"]
    },
    // === New Frameworks ===
    "5WHYS": {
        Korean: [
            "왜 그런 문제가 생겼을까?",
            "그건 또 왜 그랬을까?",
            "어디서부터 꼬인 걸까?",
            "시스템은 왜 작동 안 했을까?",
            "결국 진짜 범인은 누구일까?"
        ],
        English: ["1st Why", "2nd Why", "3rd Why", "4th Why", "5th Why"],
        Japanese: ["1回目のなぜ", "2回目のなぜ", "3回目のなぜ", "4回目のなぜ", "5回目のなぜ"]
    },
    PROS_CONS: {
        Korean: [
            "이걸 선택하면 뭐가 남을까?",
            "대신 뭘 포기해야 할까?",
            "단점을 어떻게 때울까?",
            "그래서, 할 만한 장사인가?"
        ],
        English: ["Pros", "Cons", "Mitigation", "Verdict"],
        Japanese: ["メリット", "デメリット", "リスク軽減", "最終判断"]
    },
    DECISION_MATRIX: {
        Korean: [
            "첫 번째 안은 몇 점짜리일까?",
            "두 번째 안은 몇 점짜리일까?",
            "가성비는 어느 쪽이 좋을까?",
            "대박 터질 확률은 어디가 높을까?"
        ],
        English: ["Option A Score", "Option B Score", "Cost/Effort", "Impact"],
        Japanese: ["A案のスコア", "B案のスコア", "コスト/労力", "インパクト"]
    },
    EISENHOWER: {
        Korean: [
            "지금 당장 불 꺼야 할 일은?",
            "미리 챙겨야 할 중요한 일은?",
            "누구한테 넘길 수 있을까?",
            "과감하게 버릴 일은?"
        ],
        English: ["Do First", "Schedule", "Delegate", "Don't Do"],
        Japanese: ["今すぐやる", "スケジュール", "委任", "やらない"]
    },
    OKR: {
        Korean: [
            "우리의 가슴을 뛰게 할 목표는?",
            "성공했다는 걸 보여줄 첫 번째 숫자?",
            "성공했다는 걸 보여줄 두 번째 숫자?",
            "그래서 내일부터 당장 뭐 할까?"
        ],
        English: ["Objective", "Key Result 1", "Key Result 2", "Initiative"],
        Japanese: ["目標", "KR1", "KR2", "イニシアチブ"]
    },
    KPT: {
        Korean: [
            "이건 진짜 잘했다 싶은 건?",
            "아, 이건 좀 아쉽다 싶은 건?",
            "다음엔 이렇게 해보면 어떨까?"
        ],
        English: ["Keep", "Problem", "Try"],
        Japanese: ["続けること", "問題点", "試すこと"]
    }
}

/**
 * Framework ID와 Language로 L1 노드 트리 생성
 * @param intent - 사용자 Intent (creation, diagnosis, choice, strategy)
 *                 현재는 Backend에서 Intent별 템플릿 처리, Frontend는 기본 템플릿 사용
 */
export function createSkeletonTree(
    topic: string,
    frameworkId: string,
    language: string = 'Korean',
    intent: string = 'creation'
): MindmapNode {
    // TODO: Intent별 Frontend 템플릿 분리 시 여기서 처리
    // 현재는 기존 템플릿 사용 (Backend에서 실제 데이터 로드 시 교체됨)
    const template = FRAMEWORK_TEMPLATES[frameworkId]
    if (!template) {
        // Fallback to BMC if framework not found
        console.warn(`Unknown framework: ${frameworkId}, using BMC as fallback`)
        const fallbackTemplate = FRAMEWORK_TEMPLATES['BMC']
        const labels = fallbackTemplate[language] || fallbackTemplate['English'] || []
        return {
            id: 'root',
            label: topic,
            type: 'root',
            description: `${frameworkId} Framework (${intent})`,
            children: labels.map((label, index) => ({
                id: `l1-${index}`,
                label,
                type: 'category',
                description: '',
                children: [],
                semantic_type: 'other'
            }))
        }
    }

    const labels = template[language] || template['English'] || []

    // Root 노드 생성
    const rootNode: MindmapNode = {
        id: 'root',
        label: topic,
        type: 'root',
        description: `${frameworkId} Framework (${intent})`,
        children: labels.map((label, index) => ({
            id: `l1-${index}`,
            label,
            type: 'category',
            description: '',
            children: [],
            semantic_type: 'other'
        }))
    }

    return rootNode
}

/**
 * 로딩 화면용 텍스트 목록
 */
export const LOADING_TEXTS = [
    "전략 프레임워크를 분석하고 있어요",
    "시장 트렌드를 파악하는 중...",
    "비즈니스 구조를 설계하고 있어요",
    "핵심 요소들을 정리하는 중...",
    "맞춤형 인사이트를 준비 중이에요",
    "최적의 분석 방법을 찾고 있어요",
    "데이터를 구조화하고 있어요",
    "전문가 관점에서 검토 중...",
    "창의적인 접근법을 탐색 중이에요",
    "당신만의 전략을 구성하고 있어요"
]

/**
 * 랜덤 로딩 텍스트 반환
 */
export function getRandomLoadingText(): string {
    return LOADING_TEXTS[Math.floor(Math.random() * LOADING_TEXTS.length)]
}

/**
 * Loading Quotes - 명언 데이터
 */
export interface LoadingQuote {
    text: string
    author: string
}

export const LOADING_QUOTES: LoadingQuote[] = [
    // 1. 전략 & 비전
    { text: "미래를 예측하는 가장 좋은 방법은 미래를 창조하는 것이다.", author: "피터 드러커" },
    { text: "전략 없는 전술은 패배 앞의 소음일 뿐이다.", author: "손자" },
    { text: "계획 없는 목표는 단지 바람일 뿐이다.", author: "생텍쥐페리" },
    { text: "가장 불만족스러운 고객이 가장 큰 배움의 원천이다.", author: "빌 게이츠" },
    { text: "우리는 경쟁자가 아닌 고객에게 집착한다.", author: "제프 베조스" },

    // 2. 실행 & 시작
    { text: "아이디어는 쉽다. 중요한 것은 실행이다.", author: "샘 알트만" },
    { text: "시작하는 방법은 말을 멈추고 행동하는 것이다.", author: "월트 디즈니" },
    { text: "출시한 제품이 부끄럽지 않다면, 너무 늦게 출시한 것이다.", author: "리드 호프만" },
    { text: "완벽함이 아니라 진보를 목표로 하라.", author: "셰릴 샌드버그" },
    { text: "행동하지 않으면 아무 일도 시작되지 않는다.", author: "기시미 이치로" },

    // 3. 혁신 & 리스크
    { text: "혁신은 리더와 추종자를 구분하는 잣대다.", author: "스티브 잡스" },
    { text: "위험을 감수하지 않는 것이야말로 가장 큰 위험이다.", author: "마크 저커버그" },
    { text: "실패는 옵션이다. 실패하지 않는다면 충분히 혁신하지 않는 것이다.", author: "일론 머스크" },
    { text: "경쟁은 패배자들을 위한 것이다.", author: "피터 틸" },
    { text: "단순함은 궁극의 정교함이다.", author: "레오나르도 다빈치" },

    // 4. 끈기 & 마인드셋
    { text: "성공은 열정을 잃지 않고 실패를 거듭하는 능력이다.", author: "윈스턴 처칠" },
    { text: "오늘을 견디면 내일은 더 힘들지도 모른다. 하지만 모레는 아름다울 것이다.", author: "마윈" },
    { text: "고통에 반성을 더하면 발전이 된다.", author: "레이 달리오" },
    { text: "도전받지 않는 삶은 살 가치가 없다.", author: "소크라테스" },
    { text: "실행이 전략을 이긴다.", author: "폴 그레이엄" },

    // 5. 마케팅 & 가치
    { text: "사람들은 당신이 한 일을 구매하지 않는다. 당신이 왜 그 일을 했는지를 구매한다.", author: "사이먼 시넥" },
    { text: "100만 명이 적당히 좋아하는 것보다, 100명이 열광하는 제품을 만들어라.", author: "브라이언 체스키" },
    { text: "명성을 쌓는 데는 20년이 걸리지만, 그것을 무너뜨리는 데는 5분이면 충분하다.", author: "워런 버핏" },
    { text: "브랜드는 당신이 없을 때 사람들이 당신에 대해 하는 이야기다.", author: "제프 베조스" },
    { text: "마케팅은 제품의 싸움이 아니라 인식의 싸움이다.", author: "알 리스" },

    // 6. 리더십 & 성장
    { text: "성공은 다른 사람들이 불가능하다고 생각하는 것을 가능하게 만드는 것이다.", author: "하워드 슐츠" },
    { text: "오직 편집광만이 살아남는다.", author: "앤디 그로브" },
    { text: "위대함은 좋음의 적이다.", author: "짐 콜린스" },
    { text: "가장 용감한 행동은 독립적으로 생각하는 것이다. 그것도 큰 소리로.", author: "코코 샤넬" },
    { text: "나무를 심기에 가장 좋은 때는 20년 전이었다. 두 번째로 좋은 때는 바로 지금이다.", author: "중국 속담" }
]

/**
 * 랜덤 명언 반환
 */
export function getRandomQuote(): LoadingQuote {
    return LOADING_QUOTES[Math.floor(Math.random() * LOADING_QUOTES.length)]
}

