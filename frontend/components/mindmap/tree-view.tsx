"use client"

import { useCallback, useMemo } from 'react'
import {
    ReactFlow,
    Node,
    Edge,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    MarkerType,
    Panel,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { MindmapNode } from '@/types/mindmap'
import { Button } from '@/components/ui/button'

interface TreeViewProps {
    rootNode: MindmapNode
    onNodeExpand: (node: MindmapNode) => void
    expanding: string | null
}

// 커스텀 노드 스타일
const nodeStyles = {
    root: {
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        color: 'white',
        border: '2px solid #047857',
        borderRadius: '12px',
        padding: '16px 24px',
        fontSize: '16px',
        fontWeight: 'bold',
        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
    },
    branch: {
        background: 'white',
        color: '#1f2937',
        border: '2px solid #10b981',
        borderRadius: '8px',
        padding: '12px 16px',
        fontSize: '14px',
        fontWeight: '500',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    },
    leaf: {
        background: '#f0fdf4',
        border: '1px solid #86efac',
        borderRadius: '6px',
        padding: '8px 12px',
        fontSize: '12px',
        color: '#166534',
    }
}

// MindmapNode를 React Flow 노드/엣지로 변환
function convertToFlowElements(
    node: MindmapNode,
    parentId: string | null = null,
    level: number = 0,
    index: number = 0,
    siblingCount: number = 1
): { nodes: Node[], edges: Edge[] } {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // 노드 위치 계산 (방사형 레이아웃)
    let x = 0
    let y = 0

    if (level === 0) {
        // Root 노드는 중앙
        x = 400
        y = 50
    } else if (level === 1) {
        // L1 노드는 가로로 배치
        const spacing = 180
        const totalWidth = (siblingCount - 1) * spacing
        x = 400 - totalWidth / 2 + index * spacing
        y = 180
    } else if (level === 2) {
        // L2 노드는 부모 아래 세로로 배치
        x = 100 + index * 150
        y = 300 + (index % 3) * 60
    } else {
        // 그 이하는 아래로 펼침
        x = 150 + index * 120
        y = 420 + level * 80
    }

    // 노드 스타일 결정
    let style = nodeStyles.leaf
    if (level === 0) style = nodeStyles.root
    else if (level === 1) style = nodeStyles.branch

    nodes.push({
        id: node.id,
        position: { x, y },
        data: {
            label: node.label,
            node: node,
            hasChildren: node.children && node.children.length > 0
        },
        style,
        type: 'default',
    })

    // 부모와 연결하는 엣지
    if (parentId) {
        edges.push({
            id: `${parentId}-${node.id}`,
            source: parentId,
            target: node.id,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#10b981', strokeWidth: 2 },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: '#10b981',
            },
        })
    }

    // 자식 노드 처리
    if (node.children && node.children.length > 0) {
        node.children.forEach((child, i) => {
            const { nodes: childNodes, edges: childEdges } = convertToFlowElements(
                child,
                node.id,
                level + 1,
                i,
                node.children.length
            )
            nodes.push(...childNodes)
            edges.push(...childEdges)
        })
    }

    return { nodes, edges }
}

export function TreeView({ rootNode, onNodeExpand, expanding }: TreeViewProps) {
    // 노드/엣지 변환
    const { nodes: initialNodes, edges: initialEdges } = useMemo(
        () => convertToFlowElements(rootNode),
        [rootNode]
    )

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

    // 노드 클릭 핸들러
    const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
        const mindmapNode = node.data.node as MindmapNode
        if (mindmapNode && !mindmapNode.children?.length) {
            onNodeExpand(mindmapNode)
        }
    }, [onNodeExpand])

    return (
        <div className="w-full h-[600px] bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                fitView
                attributionPosition="bottom-left"
                minZoom={0.3}
                maxZoom={2}
            >
                <Controls />
                <Background color="#10b981" gap={20} size={1} />

                <Panel position="top-right" className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg">
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                        <p className="font-semibold mb-1">🌳 Tree View</p>
                        <p className="text-xs">노드 클릭 → 확장</p>
                        <p className="text-xs">마우스 휠 → 줌</p>
                        <p className="text-xs">드래그 → 이동</p>
                    </div>
                </Panel>

                {expanding && (
                    <Panel position="bottom-center" className="bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg">
                        <div className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>노드 확장 중...</span>
                        </div>
                    </Panel>
                )}
            </ReactFlow>
        </div>
    )
}
