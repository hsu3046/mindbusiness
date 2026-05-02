"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { MindmapCanvas } from "@/components/mindmap/mindmap-canvas"
import { ReportPanel } from "@/components/mindmap/report-panel"
import { ClarificationDialog } from "@/components/mindmap/clarification-dialog"
import { QualityGateDialog } from "@/components/mindmap/quality-gate-dialog"
import { useMindmapStore } from "@/stores/mindmap-store"
import { expandNode, FriendlyApiError } from "@/lib/api"
import { openApiKeySettings } from "@/lib/api-key-store"
import { loadTree, saveTree, legacyIdFromTopic } from "@/lib/tree-cache"
import { createSkeletonTree } from "@/lib/framework-templates"
import { MindmapNode, ExpandRequest } from "@/types/mindmap"
import { toast } from "sonner"

// ─── Helper Functions ───

/**
 * Find a node and its parent in the tree
 */
function findNodeWithParent(
    root: MindmapNode,
    targetId: string,
    parent: MindmapNode | null = null
): { node: MindmapNode | null; parent: MindmapNode | null } {
    if (root.id === targetId) {
        return { node: root, parent }
    }
    if (root.children) {
        for (const child of root.children) {
            const result = findNodeWithParent(child, targetId, root)
            if (result.node) return result
        }
    }
    return { node: null, parent: null }
}

/**
 * Get sibling labels (same level, different nodes)
 */
function getSiblingLabels(parent: MindmapNode | null, targetId: string): string[] {
    if (!parent || !parent.children) return []
    return parent.children
        .filter(c => c.id !== targetId)
        .map(c => c.label)
}

/**
 * Get parent's sibling labels (grandparent's other children)
 */
function getParentSiblingLabels(
    root: MindmapNode,
    parentId: string | undefined
): string[] {
    if (!parentId) return []
    const { parent: grandparent } = findNodeWithParent(root, parentId)
    if (!grandparent || !grandparent.children) return []
    return grandparent.children
        .filter(c => c.id !== parentId)
        .map(c => c.label)
}

/**
 * Walk every ancestor of `targetId` (excluding the target itself) and
 * collect their `applied_framework_id`s in path order, deduplicated.
 *
 * Phase 0 fix: previously the frontend hardcoded `used_frameworks` to
 * `[rootFramework]`, so the backend's MAX_FRAMEWORK_NESTING check was
 * effectively disabled at depth ≥ 2. The store now stamps the applied
 * framework on the target node when an expansion returns one, so each
 * subsequent expansion can read the full chain from the tree itself.
 */
function collectAncestorFrameworks(
    root: MindmapNode,
    targetId: string,
): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    let { parent } = findNodeWithParent(root, targetId)
    while (parent) {
        if (parent.applied_framework_id && !seen.has(parent.applied_framework_id)) {
            out.unshift(parent.applied_framework_id)
            seen.add(parent.applied_framework_id)
        }
        const next = findNodeWithParent(root, parent.id)
        parent = next.parent
    }
    return out
}

/**
 * 조상 노드를 root → 직계 부모 순서로 수집. 라벨뿐 아니라 description /
 * type / applied_framework_id 까지 함께 보내서 백엔드가 expansion 시
 * 누적된 의미를 활용할 수 있게 함.
 */
function collectAncestorChain(
    root: MindmapNode,
    targetId: string,
): Array<{
    label: string
    description?: string | null
    type?: string | null
    applied_framework_id?: string | null
}> {
    const ancestors: MindmapNode[] = []
    let { parent } = findNodeWithParent(root, targetId)
    while (parent) {
        ancestors.unshift(parent)
        const next = findNodeWithParent(root, parent.id)
        parent = next.parent
    }
    return ancestors.map(n => ({
        label: n.label,
        description: n.description ?? null,
        type: n.type ?? null,
        applied_framework_id: n.applied_framework_id ?? null,
    }))
}

export default function MapPageContent() {
    const searchParams = useSearchParams()
    const idFromUrl = searchParams.get('id') || ''
    // Legacy URL fallback — pre-id maps used `?topic=`. We accept it on
    // first hit, migrate the cache key to the new id, and stop using the
    // topic for persistence.
    const legacyTopic = searchParams.get('topic') || ''
    const framework = searchParams.get('framework') || 'BMC'
    const intent = searchParams.get('intent') || 'creation'
    // free=1 → "자유롭게 시작하기" path: skip skeleton, mount root only.
    // loaded=1 → user uploaded a file; root is already in the store, do not
    //   re-seed from skeleton/l1_labels (we'd overwrite the imported tree).
    const isFreeStart = searchParams.get('free') === '1'
    const isLoaded = searchParams.get('loaded') === '1'

    const {
        rootNode,
        currentNode,
        contextPath,
        expandingNodeId,
        isLoading,
        topic: storeTopic,
        language,
        contextVector,
        intentMode,
        setRootNode,
        setTopic,
        setMindmapId,
        setFrameworkId,
        setIntentMode,
        navigateTo,
        setExpanding,
        setLoading,
        expandNode: storeExpandNode,
    } = useMindmapStore()

    // `?debug=1` exposes hidden affordances (currently the deterministic
    // seed echo on the success toast). Read once from the URL — this is a
    // dev/QA flag, not user-facing.
    const isDebug = searchParams.get('debug') === '1'

    // Ref-trampoline so the "다시 시도" toast action can re-invoke the
    // current `handleExpand` without the callback referencing itself in
    // its closure (lint rule: cannot access var before declaration).
    const handleExpandRef = useRef<((node: MindmapNode) => Promise<void>) | null>(null)

    const [reportOpen, setReportOpen] = useState(false)

    // Phase 2.1 — clarification 다이얼로그 (AI가 정보 부족 신호 보낸 경우)
    const [clarification, setClarification] = useState<{
        targetNode: MindmapNode
        question: string
        turn: number  // 0-base: 0 = 첫 질문, 2 = 마지막 (3턴 cap)
    } | null>(null)

    // Phase 2.1 — 저품질 결과 게이트 (children 적거나 confidence 낮은 경우)
    const [qualityGate, setQualityGate] = useState<{
        targetNode: MindmapNode
        previewChildren: MindmapNode[]
        confidence: number
    } | null>(null)

    // Bind id to store so mutations persist to tree-cache under it. If the
    // URL only carries a legacy ?topic= we mint a fresh id; the cache
    // migration happens inside the loadTree call below (legacyTopic
    // fallback recovers the old entry, then setRootNode persists it under
    // the new id).
    // For legacy `?topic=` URLs, derive a stable hash-based id so two
    // topics that share a prefix (e.g. "AI 자동화 생산성" / "AI 자동화 비즈니스")
    // don't collide in tree-cache.
    const effectiveId = idFromUrl || (legacyTopic ? legacyIdFromTopic(legacyTopic) : '')
    useEffect(() => {
        if (effectiveId) setMindmapId(effectiveId)
        if (legacyTopic && !storeTopic) setTopic(legacyTopic)
        // Mirror the framework into the store so persistTree() knows which
        // framework this map uses — the recent-maps list reads it from
        // there to rebuild ?framework= when the user re-opens.
        if (framework) setFrameworkId(framework)
    }, [effectiveId, legacyTopic, storeTopic, framework, setMindmapId, setTopic, setFrameworkId])

    // Seed intentMode from the URL when the store doesn't already have one
    // (covers refresh / new-tab / direct URL access). The home page sets
    // it during smart-classify; this is the recovery path.
    useEffect(() => {
        if (intentMode) return
        if (intent === 'creation' || intent === 'diagnosis' || intent === 'choice' || intent === 'strategy') {
            setIntentMode(intent)
        }
    }, [intent, intentMode, setIntentMode])

    // Initial Load: L1 노드 표시 (Backend에서 받은 l1_labels 우선 사용)
    useEffect(() => {
        if (!effectiveId || !framework) return
        if (rootNode) return  // 이미 로드됨

        // The label we'll seed the root with when no cache hit recovers a
        // real one. Prefer the live store value (set by the home page
        // before navigating here), then the legacy ?topic=, then fallbacks.
        const seedTopic = storeTopic || legacyTopic || ""

        // 1) "자유롭게 시작하기" path — single root node, no L1 children.
        //    Label is editable inline so the user can rename right away.
        //    On refresh / new-tab the in-memory store is empty, so try
        //    tree-cache first to recover any edits the user already made.
        if (isFreeStart) {
            const cached = loadTree(effectiveId, legacyTopic || undefined)
            if (cached) {
                setRootNode(cached)
            } else {
                setRootNode({
                    id: 'root',
                    label: seedTopic || '새 아이디어',
                    type: 'root',
                    description: '자유 마인드맵',
                    children: [],
                })
            }
            setLoading(false)
            return
        }

        // 2) File-uploaded path — SaveLoadButtons already called setRootNode
        //    before navigating here. The rootNode guard above short-circuits
        //    that case. If we got here, the in-memory store is empty (user
        //    refreshed or opened the URL in a new tab), so try tree-cache;
        //    fall back to a blank root rather than rendering null forever
        //    when the cache also lost the entry.
        if (isLoaded) {
            const cached = loadTree(effectiveId, legacyTopic || undefined)
            if (cached) {
                setRootNode(cached)
            } else {
                setRootNode({
                    id: 'root',
                    label: seedTopic || '불러온 마인드맵',
                    type: 'root',
                    description: '복원할 데이터를 찾지 못했어요. 다시 불러와 주세요.',
                    children: [],
                })
            }
            setLoading(false)
            return
        }

        // 3) Normal smart-classify path — try the cache first (covers
        //    refresh after user has been editing) before consuming the
        //    one-shot l1_labels from localStorage. Loading via
        //    effectiveId (not idFromUrl) ensures legacy URL refreshes
        //    keep finding their migrated entry instead of the stale slug.
        const cached = loadTree(effectiveId, legacyTopic || undefined)
        if (cached) {
            setRootNode(cached)
            setLoading(false)
            return
        }

        // localStorage에서 Backend가 전달한 l1_labels 확인
        const storedLabels = localStorage.getItem('mindmap_l1_labels')

        if (storedLabels) {
            try {
                const l1Labels = JSON.parse(storedLabels) as Array<{ label: string; display: string }>

                // Backend에서 받은 Intent별 맞춤형 L1으로 Skeleton 생성
                const rootNode: MindmapNode = {
                    id: 'root',
                    label: seedTopic,
                    type: 'root',
                    description: `${framework} Framework (${intent})`,
                    children: l1Labels.map((item, index) => ({
                        id: `l1-${index}`,
                        label: item.display || item.label,  // display 우선
                        type: 'category' as const,
                        description: '',
                        children: [],
                        semantic_type: 'other' as const
                    }))
                }

                setRootNode(rootNode)
                localStorage.removeItem('mindmap_l1_labels')  // 사용 후 정리
                console.log(`📋 L1 Labels from Backend: ${l1Labels.length}개`)
            } catch (e) {
                console.error('Failed to parse l1_labels:', e)
                // Fallback: Frontend 템플릿 사용
                const skeleton = createSkeletonTree(seedTopic, framework, 'Korean', intent)
                setRootNode(skeleton)
            }
        } else {
            // Fallback: Frontend 템플릿 사용 (직접 URL 접근 등)
            const skeleton = createSkeletonTree(seedTopic, framework, 'Korean', intent)
            setRootNode(skeleton)
        }

        setLoading(false)
    }, [
        effectiveId,
        idFromUrl,
        legacyTopic,
        storeTopic,
        framework,
        intent,
        rootNode,
        setRootNode,
        setLoading,
        isFreeStart,
        isLoaded,
    ])

    // Handle node expansion (supports add mode)
    const handleExpand = useCallback(async (
        node: MindmapNode,
        clarificationOpts?: {
            answer: string
            turn: number  // 0-base: 첫 답변 = 0 → 1로 카운트, 두 번째 = 1 → 2 ...
        },
    ) => {
        if (!rootNode) return

        setExpanding(node.id)
        try {
            // Find node context in tree
            const { parent } = findNodeWithParent(rootNode, node.id)

            // Collect sibling labels (MECE)
            const siblingLabels = getSiblingLabels(parent, node.id)

            // Collect parent sibling labels (broader context)
            const parentSiblingLabels = getParentSiblingLabels(rootNode, parent?.id)

            // Collect existing children (for add mode)
            const existingChildren = node.children?.map(c => c.label) || []

            // Calculate depth based on tree position
            let depth = 0
            let current = parent
            while (current) {
                depth++
                const result = findNodeWithParent(rootNode, current.id)
                current = result.parent
            }

            // Collect frameworks already applied along the ancestor chain.
            // The root framework is always present; ancestors that the AI
            // wrapped in a sub-framework (PERSONA, SWOT, …) contribute too.
            const ancestorFrameworks = collectAncestorFrameworks(rootNode, node.id)
            const usedFrameworks = Array.from(
                new Set([framework, ...ancestorFrameworks]),
            )

            // 조상 chain (root → 직계부모) 라벨+description+type 수집.
            // 백엔드가 ancestor_chain 우선 사용, 없으면 context_path fallback.
            const ancestorChain = collectAncestorChain(rootNode, node.id)

            // `?debug=1` URLs may include `&seed=N` to pin Gemini sampling.
            const seedParam = searchParams.get('seed')
            const seed = isDebug && seedParam
                ? Number.parseInt(seedParam, 10)
                : undefined

            const request: ExpandRequest = {
                topic: rootNode.label,
                context_path: [...contextPath, node.label],
                ancestor_chain: ancestorChain,
                target_node_label: node.label,
                current_framework_id: framework,
                used_frameworks: usedFrameworks,
                current_depth: depth,
                sibling_labels: siblingLabels,
                parent_sibling_labels: parentSiblingLabels,
                existing_children: existingChildren,
                language,
                ...(typeof seed === 'number' && Number.isFinite(seed) ? { seed } : {}),
                // Phase 1: ground children in the user's actual business
                // and intent. Both optional — backend degrades cleanly.
                ...(contextVector ? { context_vector: contextVector } : {}),
                ...(intentMode ? { intent_mode: intentMode } : {}),
                // Mode is auto-picked by the backend based on depth (L1
                // → mece, L2-L3 → default, L4 → diverse). We don't send
                // expansion_mode so the strategy registry's depth-based
                // auto-select kicks in.
                // Phase 2.1 — clarification 루프 상태
                ...(clarificationOpts ? {
                    clarification_answer: clarificationOpts.answer,
                    clarification_turn: clarificationOpts.turn + 1,  // 1-base 카운터로 백엔드에 전달
                } : {}),
            }

            const response = await expandNode(request)

            const returnedChildren = response.children as MindmapNode[]

            // Phase 2.1 — Quality Gate ① clarification 신호
            // AI가 정보 부족이라 children=[] + 질문을 보낸 경우. 자식 추가 안
            // 하고 ClarificationDialog 노출. 사용자 답변 후 재호출.
            if (response.needs_clarification && response.clarifying_question) {
                setClarification({
                    targetNode: node,
                    question: response.clarifying_question,
                    turn: clarificationOpts?.turn ?? 0,
                })
                setExpanding(null)
                return
            }

            // Phase 2.1 — Quality Gate ② 저품질 결과
            // children 적거나 confidence 낮은 케이스. 자동 추가 안 하고
            // QualityGateDialog로 사용자 결정 받음.
            const tooFew = returnedChildren.length < 2
            const lowConfidence =
                typeof response.confidence_score === 'number' &&
                response.confidence_score < 0.6
            if (tooFew || lowConfidence) {
                setQualityGate({
                    targetNode: node,
                    previewChildren: returnedChildren,
                    confidence: response.confidence_score ?? 0,
                })
                setExpanding(null)
                return
            }

            // 정상 — 자식 추가 + 토스트
            const newChildren = [
                ...(node.children || []),
                ...returnedChildren,
            ]
            storeExpandNode(
                node.id,
                newChildren,
                response.applied_framework_id ?? null,
            )
            const state = useMindmapStore.getState()
            if (state.rootNode && state.mindmapId) {
                saveTree(state.mindmapId, state.rootNode, {
                    frameworkId: state.frameworkId ?? undefined,
                    topic: state.topic ?? undefined,
                })
            }
            const baseDesc = `${returnedChildren.length}개 하위 항목 추가됨`
            toast.success('아이디어 확장 완료!', {
                description: isDebug && typeof seed === 'number'
                    ? `${baseDesc} · seed=${seed}`
                    : baseDesc,
            })
        } catch (error) {
            setExpanding(null)

            // FriendlyApiError 는 사용자 친화적 메시지 + kind 로 액션 분기
            if (error instanceof FriendlyApiError) {
                const isKeyIssue = error.kind === 'no_key' || error.kind === 'invalid_key'
                const titleByKind: Record<FriendlyApiError['kind'], string> = {
                    no_key: 'API 키가 필요해요',
                    invalid_key: 'API 키 확인이 필요해요',
                    rate_limit: '잠시만 기다려주세요',
                    timeout: '응답이 늦어요',
                    validation: '확장할 수 없어요',
                    server: 'AI 확장 실패',
                    network: '연결이 끊겼어요',
                }
                toast.error(titleByKind[error.kind], {
                    description: error.message,
                    action: isKeyIssue
                        ? { label: '설정 열기', onClick: () => openApiKeySettings() }
                        : error.retry
                            ? { label: '다시 시도', onClick: () => handleExpandRef.current?.(node) }
                            : undefined,
                })
                return
            }

            toast.error('AI 확장 실패', {
                description: error instanceof Error ? error.message : '알 수 없는 오류가 발생했어요.',
            })
        }
    }, [
        rootNode,
        contextPath,
        framework,
        language,
        contextVector,
        intentMode,
        isDebug,
        searchParams,
        setExpanding,
        storeExpandNode,
        setClarification,
        setQualityGate,
    ])

    // Keep the trampoline pointing at the current handleExpand so the toast
    // retry action always invokes the latest closure (deps may have changed
    // since the toast was emitted).
    useEffect(() => {
        handleExpandRef.current = handleExpand
    }, [handleExpand])

    if (isLoading || !currentNode || !rootNode) {
        return null // Suspense will show skeleton
    }

    return (
        <main className="min-h-screen relative overflow-hidden">
            {/* MindmapCanvas - 항상 전체 화면에 표시 */}
            <div className="fixed inset-0 z-0">
                <MindmapCanvas
                    rootNode={rootNode}
                    onNodeExpand={handleExpand}
                    onNodeSelect={(node) => {
                        if (node.children && node.children.length > 0) {
                            navigateTo(node)
                        }
                    }}
                    expanding={expandingNodeId}
                    onReportOpen={() => setReportOpen(true)}
                />
            </div>

            {/* Report Panel — title comes from the live root label so an
                edit on the root propagates into the report immediately. */}
            <ReportPanel
                open={reportOpen}
                onOpenChange={setReportOpen}
                rootNode={rootNode}
                topic={rootNode.label || storeTopic || legacyTopic}
                frameworkId={framework}
            />

            {/* Phase 2.1 — 정보 부족 시 후속 질문 */}
            {clarification && (
                <ClarificationDialog
                    open={true}
                    onOpenChange={(open) => {
                        if (!open) setClarification(null)
                    }}
                    targetLabel={clarification.targetNode.label}
                    question={clarification.question}
                    turn={clarification.turn}
                    onSubmit={(answer) => {
                        const target = clarification.targetNode
                        const nextTurn = clarification.turn + 1
                        setClarification(null)
                        // 같은 노드로 expand 재호출 + clarification 옵션 주입
                        void handleExpand(target, { answer, turn: nextTurn })
                    }}
                />
            )}

            {/* Phase 2.1 — 저품질 결과 게이트 */}
            {qualityGate && (
                <QualityGateDialog
                    open={true}
                    onOpenChange={(open) => {
                        if (!open) setQualityGate(null)
                    }}
                    targetLabel={qualityGate.targetNode.label}
                    previewChildren={qualityGate.previewChildren}
                    confidence={qualityGate.confidence}
                    onAccept={() => {
                        // 그대로 추가 — 트리 머지 + cache 저장
                        const target = qualityGate.targetNode
                        const merged = [
                            ...(target.children || []),
                            ...qualityGate.previewChildren,
                        ]
                        storeExpandNode(target.id, merged, null)
                        const state = useMindmapStore.getState()
                        if (state.rootNode && state.mindmapId) {
                            saveTree(state.mindmapId, state.rootNode, {
                                frameworkId: state.frameworkId ?? undefined,
                                topic: state.topic ?? undefined,
                            })
                        }
                        toast.success('아이디어 확장 완료!', {
                            description: `${qualityGate.previewChildren.length}개 추가됨`,
                        })
                        setQualityGate(null)
                    }}
                    onRetry={() => {
                        const target = qualityGate.targetNode
                        setQualityGate(null)
                        void handleExpand(target)
                    }}
                />
            )}
        </main>
    )
}
