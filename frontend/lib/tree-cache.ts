/**
 * Tree Cache for MindBusiness
 * 
 * Stores the entire mindmap tree in localStorage for persistence across page refreshes.
 * Unlike API cache, this preserves the exact tree state including all expansions.
 */

import { MindmapNode } from '@/types/mindmap'

const TREE_CACHE_PREFIX = 'mindbusiness_tree_'

interface TreeCacheEntry {
    rootNode: MindmapNode
    createdAt: number
    lastUpdated: number
}

/**
 * Generate a simple hash for the topic
 */
function hashTopic(topic: string): string {
    return topic.toLowerCase().replace(/\s+/g, '_').slice(0, 50)
}

/**
 * Save the tree to localStorage
 */
export function saveTree(topic: string, rootNode: MindmapNode): void {
    if (typeof window === 'undefined') return

    try {
        const key = TREE_CACHE_PREFIX + hashTopic(topic)
        const entry: TreeCacheEntry = {
            rootNode,
            createdAt: Date.now(),
            lastUpdated: Date.now()
        }
        localStorage.setItem(key, JSON.stringify(entry))
        console.log('🌳 [Tree SAVED]', topic)
    } catch (e) {
        console.warn('Tree cache save failed:', e)
    }
}

/**
 * Load a tree from localStorage
 */
export function loadTree(topic: string): MindmapNode | null {
    if (typeof window === 'undefined') return null

    try {
        const key = TREE_CACHE_PREFIX + hashTopic(topic)
        const stored = localStorage.getItem(key)
        if (!stored) return null

        const entry: TreeCacheEntry = JSON.parse(stored)
        console.log('🌳 [Tree LOADED]', topic)
        return entry.rootNode
    } catch (e) {
        console.warn('Tree cache load failed:', e)
        return null
    }
}

/**
 * Clear a specific tree from cache
 */
export function clearTree(topic: string): void {
    if (typeof window === 'undefined') return

    const key = TREE_CACHE_PREFIX + hashTopic(topic)
    localStorage.removeItem(key)
    console.log('🗑️ [Tree CLEARED]', topic)
}

/**
 * Clear all tree caches
 */
export function clearAllTrees(): void {
    if (typeof window === 'undefined') return

    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(TREE_CACHE_PREFIX)) {
            keysToRemove.push(key)
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    console.log('🗑️ [All Trees CLEARED]', keysToRemove.length, 'items')
}

/**
 * Calculate tree metadata (for d3-hierarchy preparation)
 */
export interface TreeMetadata {
    totalNodes: number
    levelCounts: Record<number, number>
    maxDepth: number
}

export function calculateTreeMetadata(root: MindmapNode): TreeMetadata {
    const levelCounts: Record<number, number> = { 0: 1 }
    let totalNodes = 1
    let maxDepth = 0

    const traverse = (node: MindmapNode, depth: number) => {
        if (depth > maxDepth) maxDepth = depth

        if (node.children && node.children.length > 0) {
            node.children.forEach(child => {
                const childDepth = depth + 1
                levelCounts[childDepth] = (levelCounts[childDepth] || 0) + 1
                totalNodes++
                traverse(child, childDepth)
            })
        }
    }

    traverse(root, 0)

    return { totalNodes, levelCounts, maxDepth }
}
