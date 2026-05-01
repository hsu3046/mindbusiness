"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { MindmapCanvas } from "@/components/mindmap/mindmap-canvas"
import { ReportPanel } from "@/components/mindmap/report-panel"
import { useMindmapStore } from "@/stores/mindmap-store"
import { expandNode } from "@/lib/api"
import { saveTree } from "@/lib/tree-cache"
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
        setRootNode,
        setTopic,
        navigateTo,
        setExpanding,
        setLoading,
        expandNode: storeExpandNode,
    } = useMindmapStore()

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
        if (isFreeStart) {
            setRootNode({
                id: 'root',
                label: topic,
                type: 'root',
                description: '자유 마인드맵',
                children: [],
            })
            setLoading(false)
            return
        }

        // 2) File-uploaded path — SaveLoadButtons already called setRootNode
        //    before navigating here. If the rootNode check above didn't
        //    short-circuit (rare race), don't seed a skeleton on top of it.
        if (isLoaded) {
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
            const { parent: nodeParent } = findNodeWithParent(rootNode, node.id)
            let depth = 0
            let current = nodeParent
            while (current) {
                depth++
                const result = findNodeWithParent(rootNode, current.id)
                current = result.parent
            }

            const request: ExpandRequest = {
                topic: rootNode.label,
                context_path: [...contextPath, node.label],
                target_node_label: node.label,
                current_framework_id: framework,
                used_frameworks: [framework],
                current_depth: depth,
                sibling_labels: siblingLabels,
                parent_sibling_labels: parentSiblingLabels,
                existing_children: existingChildren,
                language: 'Korean'
            }

            const response = await expandNode(request)

            // Add mode: merge existing children with new ones
            const newChildren = [
                ...(node.children || []),
                ...response.children as MindmapNode[]
            ]
            storeExpandNode(node.id, newChildren)

            // Save tree to cache
            const updatedRoot = useMindmapStore.getState().rootNode
            if (updatedRoot) {
                saveTree(topic, updatedRoot)
            }

            toast.success('노드 확장 완료!', {
                description: `${response.children.length}개 하위 항목 추가됨`
            })
        } catch (error) {
            toast.error('확장 실패', {
                description: error instanceof Error ? error.message : '알 수 없는 오류'
            })
            setExpanding(null)
        }
    }, [rootNode, contextPath, framework, setExpanding, storeExpandNode, topic])



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
