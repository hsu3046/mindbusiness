"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { MindmapCanvas } from "@/components/mindmap/mindmap-canvas"
import { ReportPanel } from "@/components/mindmap/report-panel"
import { useMindmapStore } from "@/stores/mindmap-store"
import { expandNode } from "@/lib/api"
import { loadTree, saveTree } from "@/lib/tree-cache"
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

export default function MapPageContent() {
    const searchParams = useSearchParams()
    const topic = searchParams.get('topic') || ''
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
        language,
        setRootNode,
        setTopic,
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

    // Bind topic to store so mutations persist to tree-cache automatically.
    useEffect(() => {
        setTopic(topic || null)
    }, [topic, setTopic])

    // Initial Load: L1 노드 표시 (Backend에서 받은 l1_labels 우선 사용)
    useEffect(() => {
        if (!topic || !framework) return
        if (rootNode) return  // 이미 로드됨

        // 1) "자유롭게 시작하기" path — single root node, no L1 children.
        //    Label is editable inline so the user can rename right away.
        //    On refresh / new-tab the in-memory store is empty, so try
        //    tree-cache first to recover any edits the user already made.
        if (isFreeStart) {
            const cached = topic ? loadTree(topic) : null
            if (cached) {
                setRootNode(cached)
            } else {
                setRootNode({
                    id: 'root',
                    label: topic,
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
        //    when the cache also lost the topic.
        if (isLoaded) {
            const cached = topic ? loadTree(topic) : null
            if (cached) {
                setRootNode(cached)
            } else {
                setRootNode({
                    id: 'root',
                    label: topic || '불러온 마인드맵',
                    type: 'root',
                    description: '복원할 데이터를 찾지 못했어요. 다시 불러와 주세요.',
                    children: [],
                })
            }
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
                    label: topic,
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
                const skeleton = createSkeletonTree(topic, framework, 'Korean', intent)
                setRootNode(skeleton)
            }
        } else {
            // Fallback: Frontend 템플릿 사용 (직접 URL 접근 등)
            const skeleton = createSkeletonTree(topic, framework, 'Korean', intent)
            setRootNode(skeleton)
        }

        setLoading(false)
    }, [topic, framework, intent, rootNode, setRootNode, setLoading, isFreeStart, isLoaded])

    // Handle node expansion (supports add mode)
    const handleExpand = useCallback(async (node: MindmapNode) => {
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

            // `?debug=1` URLs may include `&seed=N` to pin Gemini sampling.
            const seedParam = searchParams.get('seed')
            const seed = isDebug && seedParam
                ? Number.parseInt(seedParam, 10)
                : undefined

            const request: ExpandRequest = {
                topic: rootNode.label,
                context_path: [...contextPath, node.label],
                target_node_label: node.label,
                current_framework_id: framework,
                used_frameworks: usedFrameworks,
                current_depth: depth,
                sibling_labels: siblingLabels,
                parent_sibling_labels: parentSiblingLabels,
                existing_children: existingChildren,
                language,
                ...(typeof seed === 'number' && Number.isFinite(seed) ? { seed } : {}),
            }

            const response = await expandNode(request)

            // Add mode: merge existing children with new ones
            const returnedChildren = response.children as MindmapNode[]
            const newChildren = [
                ...(node.children || []),
                ...returnedChildren,
            ]
            storeExpandNode(
                node.id,
                newChildren,
                response.applied_framework_id ?? null,
            )

            // Save tree to cache
            const updatedRoot = useMindmapStore.getState().rootNode
            if (updatedRoot) {
                saveTree(topic, updatedRoot)
            }

            // Low confidence OR clearly insufficient children → warn the
            // user with a "다시 시도" action instead of silently swallowing.
            // We don't surface the backend's chosen target count today, so
            // "insufficient" is anchored at < 2 children — a hard floor that
            // any layer would consider a failure.
            const tooFew = returnedChildren.length < 2
            const lowConfidence =
                typeof response.confidence_score === 'number' &&
                response.confidence_score < 0.6
            if (tooFew || lowConfidence) {
                const reason = lowConfidence
                    ? `신뢰도가 낮아요 (${Math.round((response.confidence_score ?? 0) * 100)}%)`
                    : `${returnedChildren.length}개만 추가됐어요`
                toast.warning('부분적으로만 확장됐어요', {
                    description: reason,
                    action: {
                        label: '다시 시도',
                        onClick: () => handleExpandRef.current?.(node),
                    },
                })
            } else {
                const baseDesc = `${returnedChildren.length}개 하위 항목 추가됨`
                toast.success('아이디어 확장 완료!', {
                    description: isDebug && typeof seed === 'number'
                        ? `${baseDesc} · seed=${seed}`
                        : baseDesc,
                })
            }
        } catch (error) {
            toast.error('확장 실패', {
                description: error instanceof Error ? error.message : '알 수 없는 오류'
            })
            setExpanding(null)
        }
    }, [
        rootNode,
        contextPath,
        framework,
        language,
        isDebug,
        searchParams,
        setExpanding,
        storeExpandNode,
        topic,
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

            {/* Report Panel */}
            <ReportPanel
                open={reportOpen}
                onOpenChange={setReportOpen}
                rootNode={rootNode}
                topic={topic}
                frameworkId={framework}
            />
        </main>
    )
}
