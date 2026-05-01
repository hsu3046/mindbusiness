import { create } from 'zustand'
import { MindmapNode, ContextVector } from '@/types/mindmap'
import { saveTree } from '@/lib/tree-cache'

/** Intent buckets the smart-classify pipeline emits. */
export type IntentMode = 'creation' | 'diagnosis' | 'choice' | 'strategy'

/** User-selected expansion strategy. See ExpandRequest.expansion_mode. */
export type ExpansionMode = 'default' | 'diverse' | 'deep' | 'mece'

const EXPANSION_MODE_STORAGE_KEY = 'mindbusiness_expansion_mode'
const DEFAULT_EXPANSION_MODE: ExpansionMode = 'default'

function readPersistedExpansionMode(): ExpansionMode {
    if (typeof window === 'undefined') return DEFAULT_EXPANSION_MODE
    try {
        const v = window.localStorage.getItem(EXPANSION_MODE_STORAGE_KEY)
        if (v === 'default' || v === 'diverse' || v === 'deep' || v === 'mece') return v
    } catch {
        // localStorage unavailable — fall through to default
    }
    return DEFAULT_EXPANSION_MODE
}

type ViewMode = 'card' | 'tree' | 'mindmap'

// 삭제된 노드 백업 정보
interface DeletedNodeBackup {
    node: MindmapNode
    parentId: string
    index: number  // 부모 내 위치
}

/** Languages the AI pipeline currently supports as input/output. */
export type AppLanguage = 'Korean' | 'English' | 'Japanese'

const LANGUAGE_STORAGE_KEY = 'mindbusiness_language'
const DEFAULT_LANGUAGE: AppLanguage = 'Korean'

/** Read the persisted language pref (SSR-safe). */
function readPersistedLanguage(): AppLanguage {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE
    try {
        const v = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
        if (v === 'Korean' || v === 'English' || v === 'Japanese') return v
    } catch {
        // localStorage may be unavailable (private mode etc) — fall through
    }
    return DEFAULT_LANGUAGE
}

interface MindmapStore {
    // Data
    rootNode: MindmapNode | null
    currentNode: MindmapNode | null
    nodeHistory: MindmapNode[]
    contextPath: string[]
    /** Topic key used to persist the tree to tree-cache. Set when the map page mounts. */
    topic: string | null
    /**
     * UI/AI language — flows into ExpandRequest.language so generated children
     * match the user's preference. Persisted to localStorage so it survives
     * refresh; default Korean. Settable via setLanguage.
     */
    language: AppLanguage
    /**
     * Business DNA captured by smart-classify (summary/target/edge/objective).
     * Populated by the home page after a successful classify, then forwarded
     * into every ExpandRequest so generated children stay specific to the
     * user's actual business instead of generic framework boilerplate.
     */
    contextVector: ContextVector | null
    /**
     * High-level intent (creation/diagnosis/choice/strategy) chosen on the
     * landing page. Threaded into ExpandRequest as `intent_mode` so the
     * prompt can tone-shift toward the right kind of children.
     */
    intentMode: IntentMode | null
    /**
     * Currently-selected expansion mode (default / diverse / deep / mece).
     * Applied to every AI확장 click until the user changes it via the
     * mode picker. Persisted to localStorage so the choice survives a
     * refresh.
     */
    expansionMode: ExpansionMode

    // Delete/Undo State
    deletedNodeBackup: DeletedNodeBackup | null

    // UI State
    viewMode: ViewMode
    expandingNodeId: string | null
    editingNodeId: string | null  // 인라인 편집 중인 노드 ID
    isLoading: boolean

    // Actions
    setTopic: (topic: string | null) => void
    setLanguage: (language: AppLanguage) => void
    setContextVector: (cv: ContextVector | null) => void
    setIntentMode: (mode: IntentMode | null) => void
    setExpansionMode: (mode: ExpansionMode) => void
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
    /**
     * Replace a node's children with the result of an expansion. When
     * `appliedFrameworkId` is set, also stamp it onto the target node so
     * subsequent expansions of any descendant can recover the full
     * frameworks-in-path list (Phase 0 fix for the broken nesting check).
     */
    expandNode: (
        nodeId: string,
        children: MindmapNode[],
        appliedFrameworkId?: string | null,
    ) => void
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
    topic: null as string | null,
    language: readPersistedLanguage(),
    contextVector: null as ContextVector | null,
    intentMode: null as IntentMode | null,
    expansionMode: readPersistedExpansionMode(),
    deletedNodeBackup: null as DeletedNodeBackup | null,
    viewMode: 'mindmap' as ViewMode,
    expandingNodeId: null,
    editingNodeId: null as string | null,
    isLoading: false,
}

/** Internal: persist the current root tree to localStorage if a topic is set. */
function persistTree(topic: string | null, rootNode: MindmapNode | null) {
    if (!topic || !rootNode) return
    try {
        saveTree(topic, rootNode)
    } catch {
        // saveTree already logs; swallow to keep store mutations resilient
    }
}

export const useMindmapStore = create<MindmapStore>((set, get) => ({
    ...initialState,

    setTopic: (topic) => set({ topic }),

    setLanguage: (language) => {
        set({ language })
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
            } catch {
                // private mode etc — silently skip persist
            }
        }
    },

    setContextVector: (cv) => set({ contextVector: cv }),
    setIntentMode: (mode) => set({ intentMode: mode }),
    setExpansionMode: (mode) => {
        set({ expansionMode: mode })
        if (typeof window !== 'undefined') {
            try {
                window.localStorage.setItem(EXPANSION_MODE_STORAGE_KEY, mode)
            } catch {
                // private mode etc — silently skip persist
            }
        }
    },

    setRootNode: (node) => {
        set({
            rootNode: node,
            currentNode: node,
            nodeHistory: [],
            contextPath: []
        })
        persistTree(get().topic, node)
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

    expandNode: (nodeId, children, appliedFrameworkId) => {
        const { rootNode, currentNode, topic } = get()
        if (!rootNode || !currentNode) return

        // Recursively update node with children. When the AI applied a
        // framework, also stamp `applied_framework_id` onto the target node
        // so future expansions of any descendant can collect the full list
        // of frameworks-in-path (used_frameworks accumulation).
        const updateNodeChildren = (node: MindmapNode): MindmapNode => {
            if (node.id === nodeId) {
                const next: MindmapNode = { ...node, children }
                if (appliedFrameworkId) {
                    next.applied_framework_id = appliedFrameworkId
                }
                return next
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
        persistTree(topic, updatedRoot)
    },

    addChildNode: (parentId) => {
        const { rootNode, currentNode, topic } = get()
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
        persistTree(topic, updatedRoot)

        return newNode
    },

    updateNodeLabel: (nodeId, label) => {
        const { rootNode, currentNode, topic } = get()
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

        set({
            rootNode: updatedRoot,
            currentNode: updatedCurrent,
            editingNodeId: null  // 편집 모드 해제
        })
        persistTree(topic, updatedRoot)
    },

    deleteNode: (nodeId) => {
        const { rootNode, currentNode, topic } = get()
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
        persistTree(topic, updatedRoot)

        return true
    },

    undoDelete: () => {
        const { rootNode, deletedNodeBackup, topic } = get()
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
        persistTree(topic, restoredRoot)

        return true
    },

    clearDeleteBackup: () => set({ deletedNodeBackup: null }),

    reset: () => set(initialState),
}))
