"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ReactFlow,
    Node,
    Edge,
    Controls,
    ControlButton,
    useNodesState,
    useEdgesState,
    MiniMap,
    Panel,
    Handle,
    Position,
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { MindmapNode } from '@/types/mindmap'
import { HugeiconsIcon } from '@hugeicons/react'
import { PlusSignIcon, Edit02Icon, Delete02Icon, Loading03Icon, RefreshIcon, AiChat02Icon, NoteIcon } from '@hugeicons/core-free-icons'
import { DottedGlowBackground } from '@/components/ui/dotted-glow-background'
import { NodeStatusIndicator } from '@/components/node-status-indicator'
import { calculateD3Layout } from '@/lib/d3-layout'
import { useMindmapStore } from '@/stores/mindmap-store'
import { HomeButton } from '@/components/mindmap/home-button'
import { SaveLoadButtons } from '@/components/mindmap/save-load-buttons'
import { Button } from '@/components/ui/button'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface MindmapCanvasProps {
    rootNode: MindmapNode
    onNodeExpand: (node: MindmapNode) => void
    onNodeSelect?: (node: MindmapNode) => void
    expanding: string | null
    onReportOpen?: () => void
}

// Maximum children per level (for hiding expand/add button)
const MAX_CHILDREN_PER_LEVEL: Record<number, number> = {
    1: 5,  // L1 → L2: max 5
    2: 4,  // L2 → L3: max 4
    3: 3,  // L3 → L4: max 3
    // L4+ falls back to default below (3)
}
const MAX_CHILDREN_DEFAULT = 3
// AI 자동 확장은 L7까지. L8+ 부터는 수동 추가만 가능.
const MAX_AI_DEPTH = 7
// 수동 추가 안전망 — 그래프 폭주 방지를 위한 soft cap
const MAX_MANUAL_DEPTH = 30

// ─── Level별 Monochrome 스타일 ───
// L0(Root): 진한 fill (slate-800).
// L1-L4: fill, 점진적으로 옅게 (slate-700 → slate-200).
// L5-L7: border-only, 굵기 점진적으로 얇게 (3px → 1.5px).
// L8+: border-only, 1px로 통일.
interface LevelStyle {
    bg: string
    text: string
    border: string
    hasBg: boolean
    hasBorder: boolean
    borderWidth: number  // px
}

function getLevelStyle(level: number): LevelStyle {
    // ─── Fill 영역: L0 ~ L4 ───
    if (level === 0) {
        return {
            bg: '#1e293b',  // slate-800 (root)
            text: '#ffffff',
            border: 'transparent',
            hasBg: true,
            hasBorder: false,
            borderWidth: 0,
        }
    }
    if (level === 1) {
        return {
            bg: '#475569',  // slate-600
            text: '#ffffff',
            border: 'transparent',
            hasBg: true,
            hasBorder: false,
            borderWidth: 0,
        }
    }
    if (level === 2) {
        return {
            bg: '#94a3b8',  // slate-400
            text: '#ffffff',
            border: 'transparent',
            hasBg: true,
            hasBorder: false,
            borderWidth: 0,
        }
    }
    if (level === 3) {
        return {
            bg: '#cbd5e1',  // slate-300
            text: '#1e293b',
            border: 'transparent',
            hasBg: true,
            hasBorder: false,
            borderWidth: 0,
        }
    }
    if (level === 4) {
        return {
            bg: '#e2e8f0',  // slate-200
            text: '#334155',
            border: 'transparent',
            hasBg: true,
            hasBorder: false,
            borderWidth: 0,
        }
    }

    // ─── Border 영역: L5+ ───
    // 굵기: L5=3px → L6=2px → L7=1.5px → L8+=1px
    let borderWidth: number
    if (level === 5) borderWidth = 3
    else if (level === 6) borderWidth = 2
    else if (level === 7) borderWidth = 1.5
    else borderWidth = 1  // L8+

    return {
        bg: 'transparent',
        text: '#475569',  // slate-600
        border: '#64748b',  // slate-500
        hasBg: false,
        hasBorder: true,
        borderWidth,
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

const MindmapNodeComponent = memo(function MindmapNodeComponent({ data }: { data: CustomNodeData }) {
    const style = getLevelStyle(data.level)
    const isRoot = data.level === 0

    // Handle 위치 결정
    const targetPos = data.side === 'left' ? Position.Right : Position.Left
    const sourcePos = data.side === 'left' ? Position.Left : Position.Right


    // Toolbar visible on every node, including the root (the root is the
    // user's mindmap title and should be editable). Delete is hidden on
    // the root because removing it makes no sense (the store's deleteNode
    // already refuses it).
    const showToolbar = true
    const canDelete = !isRoot

    // AI 확장 버튼: level < 7 AND children < max
    // 수동 추가(+) 버튼: 레벨 제한 없음 (단, soft cap MAX_MANUAL_DEPTH 까지)
    const maxChildren = MAX_CHILDREN_PER_LEVEL[data.level] || MAX_CHILDREN_DEFAULT
    const canShowAIButton = data.level < MAX_AI_DEPTH && data.childrenCount < maxChildren
    const canShowAddButton = data.level < MAX_MANUAL_DEPTH && data.childrenCount < maxChildren

    // 편집 모드 진입 시 contenteditable 포커스 + 라벨 초기화. ref callback에
    // 두면 매 렌더마다 실행되어 사용자 키 입력을 덮어쓰는 문제가 있어서
    // useEffect로 isEditing 진입 시 1회만 실행.
    const editableRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        if (!data.isEditing) return
        const el = editableRef.current
        if (!el) return
        if (el.textContent !== data.label) {
            el.textContent = data.label
        }
        // 50ms defer: React Flow가 새 노드의 transform/position 계산 + nodes
        // 동기화 완료 후 포커스. rAF 한 번으로는 충분하지 않은 경우가 있어
        // setTimeout으로 좀 더 안정적으로 늦춤.
        const timeoutId = setTimeout(() => {
            el.focus({ preventScroll: true })
            const sel = window.getSelection()
            if (!sel) return
            const range = document.createRange()
            if (data.label) {
                // 라벨 있음 → 전체 선택 (Edit 흐름에서 즉시 덮어쓰기 가능)
                range.selectNodeContents(el)
            } else {
                // 빈 contenteditable은 텍스트 노드가 없어 일부 브라우저에서
                // 커서 배치가 모호함 → 명시적으로 element 시작 지점에 collapse
                range.setStart(el, 0)
                range.collapse(true)
            }
            sel.removeAllRanges()
            sel.addRange(range)
        }, 50)
        return () => clearTimeout(timeoutId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data.isEditing])

    return (
        <div className="group relative">
            {/* Custom hover toolbar — React Flow의 NodeToolbar는 portal로
                렌더되어 group-hover가 안 닿아서, 직접 absolute로 노드 위에
                배치. 카드 hover 시 opacity로 페이드인. */}
            {showToolbar && (
                <div
                    className="absolute left-1/2 -translate-x-1/2 -top-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* 1. AI확장 */}
                    {canShowAIButton && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                if (data.hasChildren && !data.childrenRevealed) {
                                    data.onRevealChildren()
                                } else {
                                    data.onExpand()
                                }
                            }}
                            disabled={data.isAnyExpanding && !data.isExpanding}
                            className={`h-8 w-8 flex items-center justify-center rounded-md shadow-sm border transition-colors ${data.isAnyExpanding && !data.isExpanding
                                ? 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed'
                                : 'bg-white/90 hover:bg-indigo-100 text-slate-600 hover:text-indigo-600 border-slate-200'
                                }`}
                            title={data.isAnyExpanding && !data.isExpanding
                                ? "AI확장 중..."
                                : data.hasChildren && !data.childrenRevealed
                                    ? "펼치기"
                                    : "AI확장"
                            }
                        >
                            <HugeiconsIcon icon={AiChat02Icon} size={20} color="#ff5757" />
                        </button>
                    )}

                    {/* 2. 수정 */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation()
                            data.onEdit?.()
                        }}
                        className="h-8 w-8 flex items-center justify-center rounded-md bg-white/90 hover:bg-amber-100 text-slate-600 hover:text-amber-600 shadow-sm border border-slate-200 transition-colors"
                        title="수정"
                    >
                        <HugeiconsIcon icon={Edit02Icon} size={16} />
                    </button>

                    {/* 3. 삭제 (root는 숨김) */}
                    {canDelete && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                data.onDelete?.()
                            }}
                            className="h-8 w-8 flex items-center justify-center rounded-md bg-white/90 hover:bg-red-100 text-slate-600 hover:text-red-600 shadow-sm border border-slate-200 transition-colors"
                            title="삭제"
                        >
                            <HugeiconsIcon icon={Delete02Icon} size={16} />
                        </button>
                    )}
                </div>
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
                        ${style.hasBorder ? 'rounded-[9px]' : ''}
                    `}
                    style={{
                        background: style.bg,
                        color: style.text,
                        // border 대신 inset box-shadow로 가짜 테두리.
                        // CSS border는 외곽 너비를 늘려 fill 노드보다 커 보이는
                        // 문제가 있어서, inset shadow로 안쪽에 선 그려 외곽 사이즈
                        // 일치시킴. (root는 기존 외곽 그림자 유지를 위해 보존)
                        boxShadow: style.hasBorder
                            ? `inset 0 0 0 ${style.borderWidth}px ${style.border}`
                            : undefined,
                    }}
                >
                    {/* Hidden Handles for edge connections */}
                    <Handle
                        id="left"
                        type={isRoot ? 'source' : (data.side === 'left' ? 'source' : 'target')}
                        position={Position.Left}
                        className="!opacity-0 !w-1 !h-1"
                    />

                    {/* Node Content */}
                    <div className="flex flex-col items-center">
                        {data.isEditing ? (
                            // 인라인 편집 모드 — autoFocus 대신 ref + 데스크톱에서만 focus (iOS 줌 방지)
                            <div
                                role="textbox"
                                contentEditable
                                suppressContentEditableWarning
                                data-placeholder="아이디어 입력..."
                                ref={editableRef}
                                className="nodrag inline-block min-w-[100px] max-w-[280px] max-h-[96px] overflow-y-auto px-2 py-1 text-base font-semibold bg-white border border-indigo-400 rounded outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 leading-snug whitespace-pre-wrap break-words text-left empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        const value = (e.currentTarget.textContent || '').trim()
                                        if (value) {
                                            data.onUpdateLabel?.(value)
                                        } else if (!data.label) {
                                            data.onUpdateLabel?.('새 아이디어')
                                        } else {
                                            data.onCancelEdit?.()
                                        }
                                    } else if (e.key === 'Escape') {
                                        e.preventDefault()
                                        data.onCancelEdit?.()
                                    }
                                }}
                                onBlur={(e) => {
                                    const value = (e.currentTarget.textContent || '').trim()
                                    if (value && value !== data.label) {
                                        data.onUpdateLabel?.(value)
                                    } else if (!value && !data.label) {
                                        data.onUpdateLabel?.('새 아이디어')
                                    } else {
                                        data.onCancelEdit?.()
                                    }
                                }}
                            />
                        ) : (
                            // 일반 라벨 표시 + (있을 때) AI 설명을 작은 글씨로
                            <>
                                <span
                                    className={`
                                        inline-block max-w-[280px] text-center font-semibold leading-snug whitespace-pre-wrap break-words
                                        ${isRoot ? 'text-base' : 'text-sm'}
                                    `}
                                >
                                    {data.label || '새 아이디어'}
                                </span>
                                {!isRoot && data.node?.description && (
                                    <span className="mt-1 max-w-[180px] text-[11px] leading-snug text-slate-400 break-keep whitespace-normal">
                                        {data.node.description}
                                    </span>
                                )}
                            </>
                        )}
                    </div>

                    {/* Hidden Handles for edge connections */}
                    <Handle
                        id="right"
                        type={isRoot ? 'source' : (data.side === 'left' ? 'target' : 'source')}
                        position={Position.Right}
                        className="!opacity-0 !w-1 !h-1"
                    />

                    {/* 추가 (수동 자식) — 노드 가장자리(자식이 자라나는 방향)에
                        absolute로 배치. side='right' 노드면 우측, 'left'면 좌측,
                        root('center')는 우측을 기본으로 함. 시각적으로 "여기에
                        새 가지가 자란다"는 직관을 줌. */}
                    {canShowAddButton && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                data.onAddChild?.()
                            }}
                            className={`absolute top-1/2 -translate-y-1/2 ${data.side === 'left' ? '-left-4' : '-right-4'
                                } h-8 w-8 rounded-full bg-white hover:bg-green-100 text-slate-500 hover:text-green-600 shadow-sm border border-slate-200 flex items-center justify-center z-10 opacity-0 group-hover:opacity-100 transition-opacity`}
                            title="자식 추가"
                            aria-label="자식 추가"
                        >
                            <HugeiconsIcon icon={PlusSignIcon} size={16} />
                        </button>
                    )}
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

    // 새로고침 / 페이지 재진입 시 트리는 localStorage에서 복원되지만 이 reveal
    // 상태는 React 로컬 state라 초기화됨. 그러면 L2+ 자식은 store에 있어도
    // visibleNodes 필터에서 가려지고, 사용자가 + 클릭으로 reveal 이벤트를
    // 발생시키는 순간 줄줄이 나타나서 "1클릭 = N개 생성"으로 보였음.
    // → 첫 트리 로드 시 자식 있는 모든 노드를 자동으로 reveal 처리.
    const revealInitializedRef = useRef(false)
    useEffect(() => {
        if (revealInitializedRef.current) return
        if (!rootNode) return
        const ids = new Set<string>()
        const walk = (n: MindmapNode) => {
            if (n.children && n.children.length > 0) {
                ids.add(n.id)
                n.children.forEach(walk)
            }
        }
        walk(rootNode)
        if (ids.size > 0) {
            // One-shot hydration on first non-null rootNode. Only this effect
            // mutates revealedParentIds from the persisted tree shape, so the
            // subscription concern of the lint rule doesn't apply.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setRevealedParentIds(prev => {
                const next = new Set(prev)
                ids.forEach(id => next.add(id))
                return next
            })
        }
        revealInitializedRef.current = true
    }, [rootNode])

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
                    onCancelEdit: () => setEditingNodeId(null),
                }
            }
        })

        return { nodes: enhancedNodes, edges: result.edges }
    }, [rootNode, onNodeExpand, expanding, revealedParentIds, handleRevealChildren, handleAddChild, handleDeleteNode, editingNodeId, updateNodeLabel, setEditingNodeId])

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
                    nodesFocusable={false}
                    fitViewOptions={{ padding: 0.3 }}
                    attributionPosition="bottom-left"
                    minZoom={0.2}
                    maxZoom={2}
                    proOptions={{ hideAttribution: true }}
                >
                    {/* 좌상단: 메인 버튼만 */}
                    <Panel position="top-left" className="m-4">
                        <HomeButton />
                    </Panel>

                    {/* 우상단: 저장/불러오기 + 기획서 (저장·산출물).
                        모든 버튼이 shadcn Button size="sm" (h-8) 로 통일되어
                        높이가 정렬됩니다. 기획서만 indigo accent로 primary
                        action임을 표시. */}
                    <Panel position="top-right" className="m-4">
                        <div className="flex gap-2">
                            <SaveLoadButtons />
                            {onReportOpen && (
                                <AlertDialog>
                                    <AlertDialogTrigger
                                        render={
                                            <Button
                                                size="sm"
                                                title="AI 기획서 작성"
                                                // shadcn Button base는 transparent border + bg-clip-padding
                                                // 이라 부모 배경이 비쳐 흰 외곽선처럼 보임 → border 색을
                                                // background와 동일하게 맞춰서 제거.
                                                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 border-indigo-600 hover:border-indigo-700 text-white shadow-md"
                                            />
                                        }
                                    >
                                        <HugeiconsIcon icon={NoteIcon} size={16} />
                                        <span className="text-sm font-medium">기획서 작성</span>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent className="bg-white">
                                        <AlertDialogHeader>
                                            <AlertDialogTitle className="text-slate-900">
                                                기획서 작성을 시작할까요?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription className="text-slate-500 break-keep leading-relaxed">
                                                지금 아이디어를 바탕으로 기획서를 작성합니다.
                                                <br />
                                                대략 1-2분 정도 소요되며, 작성 중에도 아이디어를 편집할 수 있어요.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel className="min-w-[100px]">
                                                취소
                                            </AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={onReportOpen}
                                                className="min-w-[160px] bg-indigo-600 hover:bg-indigo-700 border-indigo-600 hover:border-indigo-700 text-white shadow-md"
                                            >
                                                작성하기
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                    </Panel>

                    {/* Built-in zoom in / zoom out / fit-view + our own "재정렬"
                        button as a ControlButton so it lives alongside the rest of
                        the view controls. The interactivity-lock (자물쇠) button is
                        hidden via showInteractive={false} — streaming-time drag is
                        already auto-disabled in code, so a manual toggle is noise
                        for end users. */}
                    <Controls
                        showInteractive={false}
                        className="!bg-white !shadow-lg !rounded-lg !border-slate-200"
                    >
                        <ControlButton
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
                            title="아이디어 재정렬"
                            aria-label="아이디어 재정렬"
                            // React Flow's default ".react-flow__controls-button svg
                            // { fill: currentColor }" inflates HugeiconsIcon's
                            // stroke-only paths into solid blobs. Override to keep
                            // the icon as a line drawing.
                            className="[&_svg]:!fill-none [&_svg]:!stroke-current"
                        >
                            <HugeiconsIcon icon={RefreshIcon} size={14} />
                        </ControlButton>
                    </Controls>
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
                                <span className="text-sm font-medium">아이디어 확장 중...</span>
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
