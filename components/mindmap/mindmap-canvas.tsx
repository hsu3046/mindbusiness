"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ReactFlow,
    Node,
    Edge,
    Controls,
    useNodesState,
    useEdgesState,
    MiniMap,
    Panel,
    Handle,
    Position,
    useReactFlow,
    ReactFlowProvider,
    NodeToolbar,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { MindmapNode } from '@/types/mindmap'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, PencilEdit01Icon, Delete02Icon, Loading03Icon, RefreshIcon, AiChat02Icon, NoteIcon, ArrowDown01Icon, InformationCircleIcon } from '@hugeicons/core-free-icons'
import { DottedGlowBackground } from '@/components/ui/dotted-glow-background'
import { NodeStatusIndicator } from '@/components/node-status-indicator'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { calculateD3Layout } from '@/lib/d3-layout'
import { useMindmapStore, type ExpansionMode } from '@/stores/mindmap-store'
import { HomeButton } from '@/components/mindmap/home-button'
import { SaveLoadButtons } from '@/components/mindmap/save-load-buttons'

interface MindmapCanvasProps {
    rootNode: MindmapNode
    onNodeExpand: (node: MindmapNode) => void
    onNodeSelect?: (node: MindmapNode) => void
    expanding: string | null
    onReportOpen?: () => void
}

// Maximum children per level (for hiding expand button)
const MAX_CHILDREN_PER_LEVEL: Record<number, number> = {
    1: 5,  // L1 → L2: max 5
    2: 4,  // L2 → L3: max 4
    3: 3,  // L3 → L4: max 3
}

// ─── Level별 Monochrome 스타일 ───
// L0: Root - 진한 배경
// L1: 배경/테두리 없음, 굵은 Underline
// L2: 배경 있음, 테두리 없음
// L3: 배경 없음, 얇은 테두리
// L4: 배경/테두리 없음
interface LevelStyle {
    bg: string
    text: string
    border: string
    hasBg: boolean
    hasBorder: boolean
    hasUnderline: boolean
    underlineWeight: 'bold' | 'thin' | 'none'
}

function getLevelStyle(level: number): LevelStyle {
    switch (level) {
        case 0: // Root
            return {
                bg: '#1e293b',
                text: '#ffffff',
                border: '#334155',
                hasBg: true,
                hasBorder: false,
                hasUnderline: false,
                underlineWeight: 'none'
            }
        case 1: // L1: 배경/테두리 없음, 굵은 Underline
            return {
                bg: 'transparent',
                text: '#1e293b',
                border: 'transparent',
                hasBg: false,
                hasBorder: false,
                hasUnderline: true,
                underlineWeight: 'bold'
            }
        case 2: // L2: 배경 있음, 테두리 없음
            return {
                bg: '#e2e8f0',  // 더 질은 배경 (slate-200)
                text: '#334155',
                border: 'transparent',
                hasBg: true,
                hasBorder: false,
                hasUnderline: false,
                underlineWeight: 'none'
            }
        case 3: // L3: 배경 없음, 얇은 테두리
            return {
                bg: 'transparent',
                text: '#475569',
                border: '#64748b',  // 더 질은 테두리 (slate-500, 텍스트보다 약간 옆게)
                hasBg: false,
                hasBorder: true,
                hasUnderline: false,
                underlineWeight: 'none'
            }
        default: // L4+: 배경/테두리 없음
            return {
                bg: 'transparent',
                text: '#64748b',
                border: 'transparent',
                hasBg: false,
                hasBorder: false,
                hasUnderline: false,
                underlineWeight: 'none'
            }
    }
}

// ─── 커스텀 노드 컴포넌트 ───
interface CustomNodeData {
    label: string
    node: MindmapNode
    level: number
    colorIndex: number
    side: 'left' | 'right' | 'center'
    hasChildren: boolean
    canExpand: boolean
    childrenCount: number
    childrenRevealed: boolean  // 자식 노드가 표시되었는지
    onExpand: () => void
    onRevealChildren: () => void  // 자식 노드 표시 토글
    onAddChild?: () => void  // 수동 자식 노드 추가
    isExpanding?: boolean  // 이 노드가 확장 중인지
    isAnyExpanding?: boolean  // 어떤 노드든 확장 중인지 (동시 확장 방지용)
    isEditing?: boolean  // 인라인 편집 중인지
    onUpdateLabel?: (label: string) => void  // 라벨 업데이트
    onCancelEdit?: () => void  // 편집 취소
    onEdit?: () => void
    onDelete?: () => void
    [key: string]: unknown
}

// Phase 1: tiny semantic-type indicator (top-left of node body).
// Backend already produces `semantic_type`; this is the first place it's
// surfaced visually. Tailwind palette tokens chosen to match the rest
// of the app's accent colors.
const SEMANTIC_TYPE_COLOR: Record<string, string> = {
    finance: 'bg-emerald-500',
    action: 'bg-indigo-500',
    risk: 'bg-rose-500',
    persona: 'bg-amber-500',
    resource: 'bg-slate-400',
    metric: 'bg-cyan-500',
    // 'other' intentionally not mapped → no dot rendered
}

// Phase 2: human labels for the expansion-mode picker. Order is the order
// the items appear in the dropdown.
const EXPANSION_MODE_LABEL: Record<ExpansionMode, string> = {
    default: '기본',
    diverse: '다양하게',
    deep: '깊이있게',
    mece: '핵심만 (MECE)',
}

const EXPANSION_MODE_HINT: Record<ExpansionMode, string> = {
    default: '균형잡힌 기본 확장',
    diverse: '서로 다른 관점으로 폭넓게',
    deep: 'Pro 모델로 깊이 사고',
    mece: '겹치지 않게 빠짐없이',
}

const MindmapNodeComponent = memo(function MindmapNodeComponent({ data }: { data: CustomNodeData }) {
    const style = getLevelStyle(data.level)
    const isRoot = data.level === 0

    // Handle 위치 결정
    const targetPos = data.side === 'left' ? Position.Right : Position.Left
    const sourcePos = data.side === 'left' ? Position.Left : Position.Right

    // Semantic type color (skip root and 'other' / unset)
    const semanticDotClass = !isRoot && data.node?.semantic_type
        ? SEMANTIC_TYPE_COLOR[data.node.semantic_type]
        : undefined

    // Phase 2: read the user's selected expansion mode from the store and
    // expose a small picker next to AI확장. `default` mode shows no badge so
    // the toolbar stays uncluttered for the common case.
    const expansionMode = useMindmapStore((s) => s.expansionMode)
    const setExpansionMode = useMindmapStore((s) => s.setExpansionMode)

    // L1 이상 노드에서 NodeToolbar 표시 (Root 제외)
    const showToolbar = data.level >= 1

    // 확장 버튼 표시 조건: level < 4 AND children < max
    const maxChildren = MAX_CHILDREN_PER_LEVEL[data.level] || 5
    const canShowExpandButton = data.level < 4 && data.childrenCount < maxChildren

    return (
        <div>
            {/* NodeToolbar for L1+ nodes - 선택 시 상단에 표시 */}
            {showToolbar && (
                <NodeToolbar position={Position.Top} className="flex gap-1">
                    {/* 1. 추가 (수동) */}
                    {canShowExpandButton && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                data.onAddChild?.()
                            }}
                            className="p-1.5 rounded-md bg-white/90 hover:bg-green-100 text-slate-600 hover:text-green-600 shadow-sm border border-slate-200 transition-colors"
                            title="추가"
                        >
                            <HugeiconsIcon icon={PlusSignIcon} size={16} />
                        </button>
                    )}

                    {/* 2. AI확장 + 모드 picker (split-button cluster) */}
                    {canShowExpandButton && (
                        <div className="flex items-stretch">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    // 자식이 있지만 미표시 상태면 먼저 reveal
                                    if (data.hasChildren && !data.childrenRevealed) {
                                        data.onRevealChildren()
                                    } else {
                                        // expand 호출 (새 자식 생성)
                                        data.onExpand()
                                    }
                                }}
                                disabled={data.isAnyExpanding && !data.isExpanding}
                                className={`p-1.5 rounded-l-md shadow-sm border transition-colors ${data.isAnyExpanding && !data.isExpanding
                                    ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                                    : 'bg-white/90 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600 border-slate-200'
                                    }`}
                                title={
                                    data.isAnyExpanding && !data.isExpanding
                                        ? "AI확장 중..."
                                        : data.hasChildren && !data.childrenRevealed
                                            ? "펼치기"
                                            : `AI확장 (${EXPANSION_MODE_LABEL[expansionMode]})`
                                }
                            >
                                <HugeiconsIcon icon={AiChat02Icon} size={16} color="#ff5757" />
                            </button>
                            <DropdownMenu>
                                <DropdownMenuTrigger
                                    onClick={(e) => e.stopPropagation()}
                                    disabled={data.isAnyExpanding}
                                    render={
                                        <button
                                            className={`px-1 rounded-r-md shadow-sm border border-l-0 transition-colors ${data.isAnyExpanding
                                                ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                                                : 'bg-white/90 hover:bg-indigo-100 text-slate-500 hover:text-indigo-600 border-slate-200'
                                                }`}
                                            title="확장 방식 선택"
                                        />
                                    }
                                >
                                    <HugeiconsIcon icon={ArrowDown01Icon} size={12} />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="start"
                                    className="min-w-[200px]"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <DropdownMenuRadioGroup
                                        value={expansionMode}
                                        onValueChange={(v) => setExpansionMode(v as ExpansionMode)}
                                    >
                                        {(['default', 'diverse', 'deep', 'mece'] as const).map((m) => (
                                            <DropdownMenuRadioItem key={m} value={m}>
                                                <div className="flex flex-col">
                                                    <span className="text-sm">{EXPANSION_MODE_LABEL[m]}</span>
                                                    <span className="text-xs text-slate-400">{EXPANSION_MODE_HINT[m]}</span>
                                                </div>
                                            </DropdownMenuRadioItem>
                                        ))}
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    )}

                    {/* 3. 설명 보기 — AI가 description을 줬을 때만 노출.
                        Popover 컴포넌트가 없어서 native title tooltip으로 처리;
                        Phase 3 quality 패스에서 정식 popover로 업그레이드 예정. */}
                    {data.node?.description && (
                        <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-md bg-white/90 hover:bg-sky-100 text-slate-600 hover:text-sky-600 shadow-sm border border-slate-200 transition-colors cursor-help"
                            title={data.node.description}
                            aria-label="이 아이디어의 설명"
                        >
                            <HugeiconsIcon icon={InformationCircleIcon} size={16} />
                        </button>
                    )}

                    {/* 4. 수정 */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            data.onEdit?.()
                        }}
                        className="p-1.5 rounded-md bg-white/90 hover:bg-amber-100 text-slate-600 hover:text-amber-600 shadow-sm border border-slate-200 transition-colors"
                        title="수정"
                    >
                        <HugeiconsIcon icon={PencilEdit01Icon} size={16} />
                    </button>

                    {/* 4. 삭제 */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            data.onDelete?.()
                        }}
                        className="p-1.5 rounded-md bg-white/90 hover:bg-red-100 text-slate-600 hover:text-red-600 shadow-sm border border-slate-200 transition-colors"
                        title="삭제"
                    >
                        <HugeiconsIcon icon={Delete02Icon} size={16} />
                    </button>
                </NodeToolbar>
            )}
            <NodeStatusIndicator
                status={data.isExpanding ? "loading" : "initial"}
                variant="overlay"
            >
                <div
                    className={`
                        relative px-4 py-3 transition-all duration-200
                        hover:scale-105 cursor-pointer text-center
                        ${isRoot ? 'min-w-[200px] max-w-[320px] rounded-[9px] shadow-lg hover:shadow-xl' : 'min-w-[120px] max-w-[400px]'}
                        ${style.hasBg && !isRoot ? 'rounded-[9px]' : ''}
                        ${style.hasBorder ? 'rounded-[9px] border' : ''}
                    `}
                    style={{
                        background: style.bg,
                        color: style.text,
                        borderColor: style.hasBorder ? style.border : 'transparent',
                        borderWidth: style.hasBorder ? '1px' : '0',
                    }}
                >
                    {/* Hidden Handles for edge connections */}
                    <Handle
                        id="left"
                        type={isRoot ? 'source' : (data.side === 'left' ? 'source' : 'target')}
                        position={Position.Left}
                        className="!opacity-0 !w-1 !h-1"
                    />

                    {/* Semantic type indicator — small colored dot, top-left */}
                    {semanticDotClass && (
                        <span
                            className={`absolute top-1.5 left-1.5 h-1.5 w-1.5 rounded-full ${semanticDotClass}`}
                            aria-hidden="true"
                            title={data.node?.semantic_type}
                        />
                    )}

                    {/* Node Content */}
                    <div className="flex flex-col items-center">
                        {data.isEditing ? (
                            // 인라인 편집 모드 — autoFocus 대신 ref + 데스크톱에서만 focus (iOS 줌 방지)
                            <input
                                type="text"
                                ref={(el) => {
                                    if (!el) return
                                    // Avoid mobile auto-zoom: only focus on hover-capable (desktop) devices
                                    if (typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches) {
                                        el.focus()
                                        el.select()
                                    }
                                }}
                                placeholder="노드 이름 입력..."
                                className="nodrag px-2 py-1 text-base font-semibold bg-white border border-indigo-400 rounded outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 min-w-[100px]"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const value = (e.target as HTMLInputElement).value.trim()
                                        if (value) {
                                            data.onUpdateLabel?.(value)
                                        } else {
                                            data.onCancelEdit?.()
                                        }
                                    } else if (e.key === 'Escape') {
                                        data.onCancelEdit?.()
                                    }
                                }}
                                onBlur={(e) => {
                                    const value = e.target.value.trim()
                                    if (value) {
                                        data.onUpdateLabel?.(value)
                                    } else {
                                        data.onCancelEdit?.()
                                    }
                                }}
                            />
                        ) : (
                            // 일반 라벨 표시
                            <span
                                className={`
                                    font-semibold 
                                    ${isRoot ? 'text-base line-clamp-3' : 'text-sm line-clamp-2'}
                                    ${style.hasUnderline && style.underlineWeight === 'bold' ? 'border-b-2 border-slate-800' : ''}
                                `}
                            >
                                {data.label || '(빈 노드)'}
                            </span>
                        )}
                    </div>

                    {/* Hidden Handles for edge connections */}
                    <Handle
                        id="right"
                        type={isRoot ? 'source' : (data.side === 'left' ? 'target' : 'source')}
                        position={Position.Right}
                        className="!opacity-0 !w-1 !h-1"
                    />
                </div>
            </NodeStatusIndicator>
        </div>
    )
})

const nodeTypes = {
    mindmap: MindmapNodeComponent,
}

// ─── 메인 컴포넌트 (내부) ───
function MindmapCanvasInner({
    rootNode,
    onNodeExpand,
    onNodeSelect,
    expanding,
    onReportOpen
}: MindmapCanvasProps) {
    const { fitView } = useReactFlow()
    const hasFittedView = useRef(false)

    // Store 액션들
    const { deleteNode, undoDelete, clearDeleteBackup, deletedNodeBackup, addChildNode, editingNodeId, setEditingNodeId, updateNodeLabel } = useMindmapStore()

    // Undo 타이머 상태
    const [showUndoToast, setShowUndoToast] = useState(false)
    const undoTimerRef = useRef<NodeJS.Timeout | null>(null)

    // 삭제 핸들러
    const handleDeleteNode = useCallback((nodeId: string, nodeLabel: string) => {
        const success = deleteNode(nodeId)
        if (success) {
            // 이전 타이머 취소
            if (undoTimerRef.current) {
                clearTimeout(undoTimerRef.current)
            }

            // Undo Toast 표시
            setShowUndoToast(true)

            // 10초 후 Toast 숨기기 및 백업 삭제
            undoTimerRef.current = setTimeout(() => {
                setShowUndoToast(false)
                clearDeleteBackup()
            }, 10000)
        }
    }, [deleteNode, clearDeleteBackup])

    // Undo 핸들러
    const handleUndo = useCallback(() => {
        undoDelete()
        setShowUndoToast(false)
        if (undoTimerRef.current) {
            clearTimeout(undoTimerRef.current)
            undoTimerRef.current = null
        }
    }, [undoDelete])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (undoTimerRef.current) {
                clearTimeout(undoTimerRef.current)
            }
        }
    }, [])

    // ─── Progressive Disclosure State ───
    // L1 노드 ID들 중 자식이 revealed된 것들 (declared first so callbacks below can capture)
    const [revealedParentIds, setRevealedParentIds] = useState<Set<string>>(new Set())

    // 수동 자식 노드 추가 핸들러
    const handleAddChild = useCallback((parentId: string) => {
        const newNode = addChildNode(parentId)
        if (newNode) {
            // 새 노드가 추가된 부모를 reveal
            setRevealedParentIds(prev => {
                const next = new Set(prev)
                next.add(parentId)
                return next
            })
        }
    }, [addChildNode])

    // 자식 노드 reveal 토글 핸들러
    const handleRevealChildren = useCallback((parentId: string) => {
        setRevealedParentIds(prev => {
            const next = new Set(prev)
            if (next.has(parentId)) {
                next.delete(parentId)
            } else {
                next.add(parentId)
            }
            return next
        })
    }, [])

    // ─── 자동 Reveal: 확장 완료 시 자동으로 자식 표시 ───
    // expanding이 있었다가 없어지면 (= 확장 완료) 해당 노드를 reveal
    const prevExpandingRef = useRef<string | null>(null)
    useEffect(() => {
        // 이전에 expanding 중이었고, 이제 완료된 경우
        if (prevExpandingRef.current && !expanding) {
            const completedNodeId = prevExpandingRef.current
            // 해당 노드를 자동으로 reveal
            setRevealedParentIds(prev => {
                const next = new Set(prev)
                next.add(completedNodeId)
                return next
            })
        }
        prevExpandingRef.current = expanding
    }, [expanding])

    // 노드/엣지 변환 + 레이아웃 적용
    const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
        const result = calculateD3Layout(rootNode, onNodeExpand)

        // isExpanding, childrenRevealed, onRevealChildren 플래그 추가
        const enhancedNodes = result.nodes.map((node: Node) => {
            const nodeData = node.data as CustomNodeData
            const nodeId = nodeData.node.id

            return {
                ...node,
                data: {
                    ...node.data,
                    isExpanding: expanding === nodeId,
                    isAnyExpanding: expanding !== null,  // 어떤 노드든 확장 중
                    childrenRevealed: revealedParentIds.has(nodeId),
                    onRevealChildren: () => handleRevealChildren(nodeId),
                    onAddChild: () => handleAddChild(nodeId),
                    onDelete: () => handleDeleteNode(nodeId, nodeData.label),
                    onEdit: () => setEditingNodeId(nodeId),
                    isEditing: editingNodeId === nodeId,
                    onUpdateLabel: (label: string) => updateNodeLabel(nodeId, label),
                    onCancelEdit: () => {
                        // 빈 노드면 삭제, 아니면 편집 취소만
                        if (!nodeData.label) {
                            deleteNode(nodeId)
                        }
                        setEditingNodeId(null)
                    },
                }
            }
        })

        return { nodes: enhancedNodes, edges: result.edges }
    }, [rootNode, onNodeExpand, expanding, revealedParentIds, handleRevealChildren, handleAddChild, handleDeleteNode, editingNodeId, updateNodeLabel, deleteNode, setEditingNodeId])

    // ─── 표시할 노드/엣지 필터링 ───
    // Root(L0) + L1은 항상 표시, L2+는 부모가 revealed일 때만 표시
    const visibleNodes = useMemo(() => {
        return layoutedNodes.filter((node: Node) => {
            const nodeData = node.data as CustomNodeData
            const level = nodeData.level

            // Root(L0), L1은 항상 표시
            if (level <= 1) return true

            // L2+는 부모가 revealed된 경우에만 표시
            // 부모 ID를 찾기 위해 edge를 확인
            const parentEdge = layoutedEdges.find(e => e.target === node.id)
            if (!parentEdge) return false

            return revealedParentIds.has(parentEdge.source)
        })
    }, [layoutedNodes, layoutedEdges, revealedParentIds])

    const visibleEdges = useMemo(() => {
        const visibleNodeIds = new Set(visibleNodes.map(n => n.id))
        return layoutedEdges.filter(e =>
            visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
        )
    }, [layoutedEdges, visibleNodes])

    const [nodes, setNodes, onNodesChange] = useNodesState(visibleNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(visibleEdges)

    // Track which nodes/edges set we last synced from to avoid clobbering
    // user-side changes (drag positions) on every parent re-render. We only
    // re-sync when the visibleNodes/Edges array identity changes, which the
    // upstream useMemo guarantees only happens on real content changes.
    const lastSyncedNodesRef = useRef(visibleNodes)
    const lastSyncedEdgesRef = useRef(visibleEdges)
    useEffect(() => {
        if (lastSyncedNodesRef.current !== visibleNodes) {
            lastSyncedNodesRef.current = visibleNodes
            setNodes(visibleNodes)
        }
        if (lastSyncedEdgesRef.current !== visibleEdges) {
            lastSyncedEdgesRef.current = visibleEdges
            setEdges(visibleEdges)
        }
    }, [visibleNodes, visibleEdges, setNodes, setEdges])


    // 초기 fitView (cleanup-safe)
    const fitViewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        if (hasFittedView.current || layoutedNodes.length === 0) return
        if (fitViewTimerRef.current) clearTimeout(fitViewTimerRef.current)
        fitViewTimerRef.current = setTimeout(() => {
            fitView({ padding: 0.3, duration: 500 })
            hasFittedView.current = true
            fitViewTimerRef.current = null
        }, 100)
        return () => {
            if (fitViewTimerRef.current) {
                clearTimeout(fitViewTimerRef.current)
                fitViewTimerRef.current = null
            }
        }
    }, [layoutedNodes, fitView])

    // 노드 클릭 핸들러 (스트리밍 중 차단)
    const handleNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        if (expanding) return
        const mindmapNode = node.data.node as MindmapNode
        onNodeSelect?.(mindmapNode)
    }, [onNodeSelect, expanding])

    return (
        <div className="relative w-full h-full min-h-screen bg-slate-50">
            {/* Aceternity Dotted Glow Background */}
            <DottedGlowBackground
                className="pointer-events-none z-0"
                gap={24}
                radius={1}
                color="rgba(148, 163, 184, 0.6)"
                glowColor="rgba(99, 102, 241, 0.8)"
                opacity={0.8}
                speedScale={0.5}
            />

            {/* React Flow */}
            <div className="relative z-10 w-full h-full">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onNodeClick={handleNodeClick}
                    nodeTypes={nodeTypes}
                    nodesDraggable={!expanding}
                    fitViewOptions={{ padding: 0.3 }}
                    attributionPosition="bottom-left"
                    minZoom={0.2}
                    maxZoom={2}
                    proOptions={{ hideAttribution: true }}
                >
                    {/* 좌상단: 메인 + 재정렬 (탐색·뷰 컨트롤) */}
                    <Panel position="top-left" className="m-4">
                        <div className="flex gap-2">
                            <HomeButton />
                            <button
                                onClick={() => {
                                    hasFittedView.current = false
                                    setNodes(layoutedNodes)
                                    setEdges(layoutedEdges)
                                    if (fitViewTimerRef.current) clearTimeout(fitViewTimerRef.current)
                                    fitViewTimerRef.current = setTimeout(() => {
                                        fitView({ padding: 0.3, duration: 500 })
                                        hasFittedView.current = true
                                        fitViewTimerRef.current = null
                                    }, 100)
                                }}
                                className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 rounded-lg shadow-md border border-slate-200 transition-colors"
                                title="노드 재정렬"
                            >
                                <HugeiconsIcon icon={RefreshIcon} size={16} />
                                <span className="text-sm font-medium">재정렬</span>
                            </button>
                        </div>
                    </Panel>

                    {/* 우상단: 저장/불러오기 + 기획서 (저장·산출물) */}
                    <Panel position="top-right" className="m-4">
                        <div className="flex gap-2">
                            <SaveLoadButtons />
                            {onReportOpen && (
                                <button
                                    onClick={onReportOpen}
                                    className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-colors"
                                    title="AI 기획서 생성"
                                >
                                    <HugeiconsIcon icon={NoteIcon} size={16} />
                                    <span className="text-sm font-medium">기획서</span>
                                </button>
                            )}
                        </div>
                    </Panel>

                    <Controls className="!bg-white !shadow-lg !rounded-lg !border-slate-200" />
                    <MiniMap
                        nodeColor={(node) => {
                            const nodeData = node.data as CustomNodeData
                            const style = getLevelStyle(nodeData.level)
                            return style.hasBg ? style.bg : '#94a3b8'  // fallback to slate-400
                        }}
                        className="!bg-white !shadow-lg !rounded-lg !border-slate-200"
                    />

                    {/* 로딩 표시 */}
                    {expanding && (
                        <Panel position="bottom-center" className="bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-lg">
                            <div className="flex items-center gap-2">
                                <HugeiconsIcon icon={Loading03Icon} size={16} className="animate-spin" />
                                <span className="text-sm font-medium">노드 확장 중...</span>
                            </div>
                        </Panel>
                    )}

                    {/* 삭제 취소 Toast */}
                    {showUndoToast && deletedNodeBackup && (
                        <Panel position="bottom-center" className="bg-slate-800 text-white px-4 py-3 rounded-lg shadow-lg">
                            <div className="flex items-center gap-4">
                                <span className="text-sm">
                                    &ldquo;{deletedNodeBackup.node.label}&rdquo; 삭제됨
                                </span>
                                <button
                                    onClick={handleUndo}
                                    className="text-sm font-semibold text-indigo-300 hover:text-indigo-100 transition-colors underline"
                                >
                                    삭제 취소
                                </button>
                            </div>
                        </Panel>
                    )}
                </ReactFlow>
            </div>
        </div>
    )
}

// ─── 래퍼 컴포넌트 (ReactFlowProvider) ───
export function MindmapCanvas(props: MindmapCanvasProps) {
    return (
        <ReactFlowProvider>
            <MindmapCanvasInner {...props} />
        </ReactFlowProvider>
    )
}
