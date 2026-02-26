/**
 * Bi-directional Tree Layout using d3-hierarchy
 * 
 * Strategy: "Divide and Conquer"
 * 1. Split L1 children into Left/Right teams
 * 2. Run d3.tree() separately for each team
 * 3. Flip left team's X coordinates (x *= -1)
 * 4. Merge with Root at center
 */

import { hierarchy, tree, HierarchyPointNode } from 'd3-hierarchy'
import { MindmapNode } from '@/types/mindmap'
import { Node, Edge } from '@xyflow/react'

// ─── Layout Constants ───
const HORIZONTAL_GAP = 50    // Gap between node edges
const VERTICAL_GAP = 80      // Min gap between sibling nodes

// Center position for the mindmap
const CENTER_X = 600
const CENTER_Y = 400

// Node width constraints per level
const NODE_WIDTH_CONFIG = {
    root: { min: 200, max: 320, fontSize: 16, padding: 32 },
    child: { min: 120, max: 400, fontSize: 14, padding: 32 },
}

// ─── Width Cache ───
// Stores calculated widths to avoid recalculation on every render
const widthCache = new Map<string, { label: string; width: number }>()

/**
 * Get cached node width, or calculate and cache if not found
 * Cache invalidates automatically when label changes
 */
export function getCachedWidth(id: string, label: string, isRoot: boolean = false): number {
    const cached = widthCache.get(id)
    if (cached && cached.label === label) {
        return cached.width  // Cache hit!
    }
    // Cache miss → calculate and store
    const width = calculateWidth(label, isRoot)
    widthCache.set(id, { label, width })
    return width
}

/**
 * Clear width cache (call when resetting mindmap)
 */
export function clearWidthCache(): void {
    widthCache.clear()
}

/**
 * Calculate node width based on label text (internal)
 * Uses character count with different weights for Korean/ASCII
 */
function calculateWidth(label: string, isRoot: boolean): number {
    const config = isRoot ? NODE_WIDTH_CONFIG.root : NODE_WIDTH_CONFIG.child

    // Count Korean (CJK) vs ASCII characters
    let totalWidth = 0
    for (const char of label) {
        const code = char.charCodeAt(0)
        if (code >= 0xAC00 && code <= 0xD7AF) {
            // Korean syllable: roughly 1em width
            totalWidth += config.fontSize
        } else if (code >= 0x4E00 && code <= 0x9FFF) {
            // CJK ideograph: roughly 1em width
            totalWidth += config.fontSize
        } else {
            // ASCII/Latin: roughly 0.5-0.6em width
            totalWidth += config.fontSize * 0.55
        }
    }

    // Add padding (px-4 = 16px each side = 32px)
    const estimatedWidth = totalWidth + config.padding

    // Clamp to min/max
    return Math.min(Math.max(estimatedWidth, config.min), config.max)
}

// Backward compatibility export
export const estimateNodeWidth = calculateWidth

export interface LayoutResult {
    nodes: Node[]
    edges: Edge[]
}

interface TreeNode {
    id: string
    label: string
    originalNode: MindmapNode
    estimatedWidth: number  // Pre-calculated width
    children?: TreeNode[]
}

/**
 * Convert MindmapNode to TreeNode structure for d3
 */
function toTreeNode(node: MindmapNode, level: number = 1): TreeNode {
    const isRoot = level === 0
    return {
        id: node.id,
        label: node.label,
        originalNode: node,
        estimatedWidth: getCachedWidth(node.id, node.label, isRoot),  // Use cache
        children: node.children?.map(child => toTreeNode(child, level + 1)) || []
    }
}

/**
 * Calculate mindmap layout using Bi-directional Tree algorithm
 */
export function calculateD3Layout(
    rootNode: MindmapNode,
    onExpand: (node: MindmapNode) => void,
    expectedL2Counts?: Record<string, number>
): LayoutResult {
    const nodes: Node[] = []
    const edges: Edge[] = []

    // No children - just return root
    if (!rootNode.children || rootNode.children.length === 0) {
        nodes.push(createReactFlowNode(rootNode, CENTER_X, CENTER_Y, 0, 'center', 0, onExpand))
        return { nodes, edges }
    }

    // ─── Step 1: Split children into Left/Right teams ───
    const l1Count = rootNode.children.length
    const rightCount = Math.ceil(l1Count / 2)
    const rightChildren = rootNode.children.slice(0, rightCount)
    const leftChildren = rootNode.children.slice(rightCount)

    // ─── Step 2: Create virtual root for each side and run d3.tree() ───
    const treeLayout = tree<TreeNode>().nodeSize([VERTICAL_GAP, HORIZONTAL_GAP])

    // Process Right side
    const rightNodes: Array<{ node: MindmapNode; x: number; y: number; level: number; colorIndex: number; estimatedWidth: number }> = []
    if (rightChildren.length > 0) {
        const rightTreeData: TreeNode = {
            id: 'virtual-right-root',
            label: rootNode.label,
            originalNode: rootNode,
            estimatedWidth: estimateNodeWidth(rootNode.label, true),
            children: rightChildren.map(child => toTreeNode(child, 1))
        }
        const rightHierarchy = treeLayout(hierarchy(rightTreeData))

        // Calculate cumulative X based on node widths
        rightHierarchy.each((d: HierarchyPointNode<TreeNode>) => {
            if (d.data.id === 'virtual-right-root') return // Skip virtual root

            // Calculate X by walking up to root and summing widths + gaps
            let cumulativeX = 0
            const ancestors = d.ancestors().reverse() // from root to node

            for (let i = 0; i < ancestors.length - 1; i++) {
                const parent = ancestors[i]
                cumulativeX += parent.data.estimatedWidth + HORIZONTAL_GAP
            }

            rightNodes.push({
                node: d.data.originalNode,
                x: cumulativeX,  // Cumulative width-based X
                y: d.x,  // vertical position from d3
                level: d.depth,
                colorIndex: getColorIndex(d, rightChildren),
                estimatedWidth: d.data.estimatedWidth
            })
        })
    }

    // Process Left side
    const leftNodes: Array<{ node: MindmapNode; x: number; y: number; level: number; colorIndex: number; estimatedWidth: number }> = []
    if (leftChildren.length > 0) {
        const leftTreeData: TreeNode = {
            id: 'virtual-left-root',
            label: rootNode.label,
            originalNode: rootNode,
            estimatedWidth: estimateNodeWidth(rootNode.label, true),
            children: leftChildren.map(child => toTreeNode(child, 1))
        }
        const leftHierarchy = treeLayout(hierarchy(leftTreeData))

        // Calculate cumulative X based on node widths (negative for left side)
        leftHierarchy.each((d: HierarchyPointNode<TreeNode>) => {
            if (d.data.id === 'virtual-left-root') return // Skip virtual root

            // For left side: gap + own width, then add ancestors (excluding virtual root)
            let cumulativeX = HORIZONTAL_GAP + d.data.estimatedWidth
            const ancestors = d.ancestors().reverse() // from root to node

            // Skip index 0 (virtual root = Root at center) and last (self)
            for (let i = 1; i < ancestors.length - 1; i++) {
                const ancestor = ancestors[i]
                cumulativeX += ancestor.data.estimatedWidth + HORIZONTAL_GAP
            }

            leftNodes.push({
                node: d.data.originalNode,
                x: -cumulativeX,  // NEGATIVE for left side
                y: d.x,
                level: d.depth,
                colorIndex: rightCount + getColorIndex(d, leftChildren),
                estimatedWidth: d.data.estimatedWidth
            })
        })
    }

    // ─── Step 3: Add Root node at center ───
    nodes.push(createReactFlowNode(rootNode, CENTER_X, CENTER_Y, 0, 'center', 0, onExpand))

    // ─── Step 4: Add all positioned nodes with offset ───
    const allPositioned = [...rightNodes, ...leftNodes]

    allPositioned.forEach(({ node, x, y, level, colorIndex }) => {
        const side = x > 0 ? 'right' : 'left'
        const finalX = CENTER_X + x
        const finalY = CENTER_Y + y

        nodes.push(createReactFlowNode(node, finalX, finalY, level, side, colorIndex, onExpand))
    })

    // ─── Step 5: Create edges ───
    // Root to L1 edges
    rightChildren.forEach((child, idx) => {
        edges.push(createEdge(rootNode.id, child.id, 'right'))
    })
    leftChildren.forEach((child, idx) => {
        edges.push(createEdge(rootNode.id, child.id, 'left'))
    })

    // Recursive edges for deeper levels
    function addChildEdges(parent: MindmapNode, side: 'left' | 'right') {
        if (!parent.children) return
        parent.children.forEach(child => {
            edges.push(createEdge(parent.id, child.id, side))
            addChildEdges(child, side)
        })
    }

    rightChildren.forEach(child => addChildEdges(child, 'right'))
    leftChildren.forEach(child => addChildEdges(child, 'left'))

    return { nodes, edges }
}

/**
 * Get color index for a node based on its L1 ancestor
 */
function getColorIndex(
    d: HierarchyPointNode<TreeNode>,
    l1Children: MindmapNode[]
): number {
    // Walk up to find L1 ancestor (depth 1)
    let current = d
    while (current.depth > 1 && current.parent) {
        current = current.parent
    }
    // Find index in L1 children
    const l1Id = current.data.id
    const idx = l1Children.findIndex(c => c.id === l1Id)
    return idx >= 0 ? idx : 0
}

/**
 * Create a React Flow node
 */
function createReactFlowNode(
    node: MindmapNode,
    x: number,
    y: number,
    level: number,
    side: 'left' | 'right' | 'center',
    colorIndex: number,
    onExpand: (node: MindmapNode) => void
): Node {
    return {
        id: node.id,
        type: 'mindmap',
        position: { x, y },
        data: {
            label: node.label,
            node: node,
            level,
            side,
            colorIndex,
            hasChildren: (node.children?.length ?? 0) > 0,
            childrenCount: node.children?.length ?? 0,
            canExpand: level < 4,
            onExpand: () => onExpand(node),
        },
    }
}

/**
 * Create an edge between two nodes
 */
function createEdge(sourceId: string, targetId: string, side: 'left' | 'right'): Edge {
    return {
        id: `edge-${sourceId}-${targetId}`,
        source: sourceId,
        target: targetId,
        sourceHandle: side,
        targetHandle: side === 'right' ? 'left' : 'right',
        type: 'bezier',
    }
}
