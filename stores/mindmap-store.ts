import { create } from 'zustand'
import { MindmapNode } from '@/types/mindmap'
import { saveTree } from '@/lib/tree-cache'

type ViewMode = 'card' | 'tree' | 'mindmap'

// 삭제된 노드 백업 정보
interface DeletedNodeBackup {
    node: MindmapNode
    parentId: string
    index: number  // 부모 내 위치
}

interface MindmapStore {
    // Data
    rootNode: MindmapNode | null
    currentNode: MindmapNode | null
    nodeHistory: MindmapNode[]
    contextPath: string[]
    /**
     * Random short id (12 hex). Used as the tree-cache key and the URL's
     * `?id=`. Decouples persistence from the topic string, which can be
     * long Korean text or contain URL-unsafe characters.
     */
    mindmapId: string | null
    /**
     * Display-only topic. Mirrors `rootNode.label` after edits, so the
     * report panel and other consumers always see the user-edited title.
     * No longer used as a cache key.
     */
    topic: string | null
    /**
     * Framework key (BMC, LEAN, LOGIC, …). Persisted alongside the tree
     * so the recent-maps list on the home page can re-open the map with
     * the correct `?framework=` instead of guessing.
     */
    frameworkId: string | null

    // Delete/Undo State
    deletedNodeBackup: DeletedNodeBackup | null

    // UI State
    viewMode: ViewMode
    expandingNodeId: string | null
    editingNodeId: string | null  // 인라인 편집 중인 노드 ID
    isLoading: boolean

    // Actions
    setMindmapId: (id: string | null) => void
    setTopic: (topic: string | null) => void
    setFrameworkId: (id: string | null) => void
    setRootNode: (node: MindmapNode) => void
    setCurrentNode: (node: MindmapNode) => void
    navigateTo: (node: MindmapNode) => void
    goBack: () => void
    goToRoot: () => void
    toggleView: () => void
    setViewMode: (mode: ViewMode) => void
    setExpanding: (nodeId: string | null) => void
    setEditingNodeId: (nodeId: string | null) => void  // 편집 모드 설정
    setLoading: (loading: boolean) => void
    expandNode: (nodeId: string, children: MindmapNode[]) => void
    addChildNode: (parentId: string) => MindmapNode | null  // 수동 자식 노드 추가 (빈 라벨)
    updateNodeLabel: (nodeId: string, label: string) => void  // 노드 라벨 업데이트
    deleteNode: (nodeId: string) => boolean  // 삭제 성공 여부 반환
    undoDelete: () => boolean  // 복구 성공 여부 반환
    clearDeleteBackup: () => void  // 백업 삭제
    reset: () => void
}

const initialState = {
    rootNode: null,
    currentNode: null,
    nodeHistory: [],
    contextPath: [],
    mindmapId: null as string | null,
    topic: null as string | null,
    frameworkId: null as string | null,
    deletedNodeBackup: null as DeletedNodeBackup | null,
    viewMode: 'mindmap' as ViewMode,
    expandingNodeId: null,
    editingNodeId: null as string | null,
    isLoading: false,
}

/**
 * Internal: persist the current root tree to localStorage under the id,
 * along with the framework + topic so the recent-maps list can rebuild
 * the URL when the user re-opens it.
 */
function persistTree(
    id: string | null,
    rootNode: MindmapNode | null,
    meta?: { frameworkId?: string | null; topic?: string | null },
) {
    if (!id || !rootNode) return
    try {
        saveTree(id, rootNode, {
            frameworkId: meta?.frameworkId ?? undefined,
            topic: meta?.topic ?? undefined,
        })
    } catch {
        // saveTree already logs; swallow to keep store mutations resilient
    }
}

export const useMindmapStore = create<MindmapStore>((set, get) => ({
    ...initialState,

    setMindmapId: (mindmapId) => set({ mindmapId }),
    setTopic: (topic) => set({ topic }),
    setFrameworkId: (frameworkId) => set({ frameworkId }),

    setRootNode: (node) => {
        const nextTopic = node.label || get().topic
        set({
            rootNode: node,
            currentNode: node,
            // Keep `topic` in sync with the root label so the report panel /
            // any other reader sees the latest user-edited title.
            topic: nextTopic,
            nodeHistory: [],
            contextPath: [],
        })
        persistTree(get().mindmapId, node, {
            frameworkId: get().frameworkId,
            topic: nextTopic,
        })
    },

    setCurrentNode: (node) => set({ currentNode: node }),

    navigateTo: (node) => {
        const { currentNode, nodeHistory, contextPath } = get()
        if (!currentNode) return

        // 같은 노드면 무시
        if (currentNode.id === node.id) return

        // 이미 히스토리에 있는 노드면 해당 위치로 잘라내기
        const existingIndex = nodeHistory.findIndex(n => n.id === node.id)
        if (existingIndex !== -1) {
            set({
                currentNode: node,
                nodeHistory: nodeHistory.slice(0, existingIndex),
                contextPath: contextPath.slice(0, existingIndex)
            })
            return
        }

        set({
            currentNode: node,
            nodeHistory: [...nodeHistory, currentNode],
            contextPath: [...contextPath, currentNode.label]
        })
    },

    goBack: () => {
        const { nodeHistory, contextPath } = get()
        if (nodeHistory.length === 0) return

        const prevNode = nodeHistory[nodeHistory.length - 1]
        set({
            currentNode: prevNode,
            nodeHistory: nodeHistory.slice(0, -1),
            contextPath: contextPath.slice(0, -1)
        })
    },

    goToRoot: () => {
        const { rootNode } = get()
        if (!rootNode) return

        set({
            currentNode: rootNode,
            nodeHistory: [],
            contextPath: []
        })
    },

    toggleView: () => {
        const { viewMode } = get()
        const modes: ViewMode[] = ['mindmap', 'card', 'tree']
        const currentIndex = modes.indexOf(viewMode)
        const nextIndex = (currentIndex + 1) % modes.length
        set({ viewMode: modes[nextIndex] })
    },

    setViewMode: (mode) => set({ viewMode: mode }),

    setExpanding: (nodeId) => set({ expandingNodeId: nodeId }),

    setEditingNodeId: (nodeId) => set({ editingNodeId: nodeId }),

    setLoading: (loading) => set({ isLoading: loading }),

    expandNode: (nodeId, children) => {
        const { rootNode, currentNode, mindmapId, frameworkId, topic } = get()
        if (!rootNode || !currentNode) return

        // Recursively update node with children
        const updateNodeChildren = (node: MindmapNode): MindmapNode => {
            if (node.id === nodeId) {
                return { ...node, children }
            }
            return {
                ...node,
                children: (node.children || []).map(updateNodeChildren)
            }
        }

        const updatedRoot = updateNodeChildren(rootNode)
        const updatedCurrent = updateNodeChildren(currentNode)

        set({
            rootNode: updatedRoot,
            currentNode: updatedCurrent,
            expandingNodeId: null
        })
        persistTree(mindmapId, updatedRoot, { frameworkId, topic })
    },

    addChildNode: (parentId) => {
        const { rootNode, currentNode, mindmapId, frameworkId, topic } = get()
        if (!rootNode) return null

        // 새 노드 ID 생성 (UUID 형식)
        const randomPart = Math.random().toString(36).slice(2, 11)
        const newNodeId = `node-${Date.now()}-${randomPart}`

        // 새 노드 객체 생성 (빈 라벨)
        const newNode: MindmapNode = {
            id: newNodeId,
            label: '',  // 빈 라벨로 생성
            type: 'manual',
            children: []
        }

        // 부모 노드를 찾아서 자식으로 추가
        const addToParent = (node: MindmapNode): MindmapNode => {
            if (node.id === parentId) {
                return {
                    ...node,
                    children: [...(node.children || []), newNode]
                }
            }
            if (!node.children) return node
            return {
                ...node,
                children: node.children.map(addToParent)
            }
        }

        const updatedRoot = addToParent(rootNode)
        const updatedCurrent = currentNode ? addToParent(currentNode) : null

        set({
            rootNode: updatedRoot,
            currentNode: updatedCurrent,
            editingNodeId: newNodeId  // 새 노드를 편집 모드로 설정
        })
        persistTree(mindmapId, updatedRoot, { frameworkId, topic })

        return newNode
    },

    updateNodeLabel: (nodeId, label) => {
        const { rootNode, currentNode, mindmapId, frameworkId, topic } = get()
        if (!rootNode) return

        const updateLabel = (node: MindmapNode): MindmapNode => {
            if (node.id === nodeId) {
                return { ...node, label }
            }
            if (!node.children) return node
            return {
                ...node,
                children: node.children.map(updateLabel)
            }
        }

        const updatedRoot = updateLabel(rootNode)
        const updatedCurrent = currentNode ? updateLabel(currentNode) : null

        // If the user just edited the root label, mirror it into `topic`
        // so the report panel and any other reader sees the new title.
        const isRootEdit = rootNode.id === nodeId
        const nextTopic = isRootEdit ? label : topic
        set({
            rootNode: updatedRoot,
            currentNode: updatedCurrent,
            editingNodeId: null,  // 편집 모드 해제
            ...(isRootEdit ? { topic: label } : {}),
        })
        persistTree(mindmapId, updatedRoot, { frameworkId, topic: nextTopic })
    },

    deleteNode: (nodeId) => {
        const { rootNode, currentNode, mindmapId, frameworkId, topic } = get()
        if (!rootNode) return false

        // Root 노드는 삭제 불가
        if (rootNode.id === nodeId) return false

        // 부모 노드 찾기 및 백업 정보 수집
        let deletedNode: MindmapNode | null = null
        let parentId: string = ''
        let nodeIndex: number = 0

        const findAndRemove = (node: MindmapNode): MindmapNode => {
            if (!node.children) return node

            const childIndex = node.children.findIndex(c => c.id === nodeId)
            if (childIndex !== -1) {
                // 삭제할 노드 발견
                deletedNode = node.children[childIndex]
                parentId = node.id
                nodeIndex = childIndex

                return {
                    ...node,
                    children: node.children.filter(c => c.id !== nodeId)
                }
            }

            return {
                ...node,
                children: node.children.map(findAndRemove)
            }
        }

        const updatedRoot = findAndRemove(rootNode)

        if (!deletedNode) return false

        // 백업 저장 및 상태 업데이트
        set({
            rootNode: updatedRoot,
            currentNode: currentNode?.id === nodeId ? rootNode :
                (currentNode ? findAndRemove(currentNode) : null),
            deletedNodeBackup: {
                node: deletedNode,
                parentId,
                index: nodeIndex
            }
        })
        persistTree(mindmapId, updatedRoot, { frameworkId, topic })

        return true
    },

    undoDelete: () => {
        const { rootNode, deletedNodeBackup, mindmapId, frameworkId, topic } = get()
        if (!rootNode || !deletedNodeBackup) return false

        const { node, parentId, index } = deletedNodeBackup

        // 부모 노드를 찾아서 삭제된 노드 복구
        const restoreNode = (current: MindmapNode): MindmapNode => {
            if (current.id === parentId) {
                const newChildren = [...(current.children || [])]
                // 원래 위치에 삽입 (범위 초과시 끝에 추가)
                const insertIndex = Math.min(index, newChildren.length)
                newChildren.splice(insertIndex, 0, node)
                return { ...current, children: newChildren }
            }

            if (!current.children) return current

            return {
                ...current,
                children: current.children.map(restoreNode)
            }
        }

        const restoredRoot = restoreNode(rootNode)

        set({
            rootNode: restoredRoot,
            currentNode: restoredRoot,
            deletedNodeBackup: null
        })
        persistTree(mindmapId, restoredRoot, { frameworkId, topic })

        return true
    },

    clearDeleteBackup: () => set({ deletedNodeBackup: null }),

    reset: () => set(initialState),
}))
