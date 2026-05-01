/**
 * Tree Cache for MindBusiness
 *
 * Stores the entire mindmap tree in localStorage for persistence across page
 * refreshes. The cache is keyed by a short random `mindmapId` (12 hex chars
 * derived from `crypto.randomUUID()`); using a stable random key avoids URL
 * encoding pain and length blow-up when the topic is long Korean text, and
 * lets the same topic open multiple independent maps.
 *
 * Backward compat: maps created before id-keyed caching used a slug derived
 * from the topic (`hashTopic`). loadTree() consults the legacy key as a
 * fallback when the id-keyed entry is missing, so existing in-progress
 * sessions don't disappear after this rollout.
 */

import { MindmapNode } from '@/types/mindmap'

const TREE_CACHE_PREFIX = 'mindbusiness_tree_'

interface TreeCacheEntry {
    rootNode: MindmapNode
    createdAt: number
    lastUpdated: number
    /**
     * Framework key (BMC, LEAN, LOGIC, …). Required to round-trip the map
     * via `?framework=` when a user re-opens it from the home page list —
     * without it we'd have to fall back to LOGIC and lose the originally
     * chosen framework. Optional for entries written before this field
     * existed.
     */
    frameworkId?: string
    /**
     * Display title at write time. We re-derive from `rootNode.label` on
     * read, but cache it here too so listRecentMaps() can render without
     * deserializing the whole tree.
     */
    topic?: string
}

/** Lightweight summary shown in the recent-maps UI on the home page. */
export interface RecentMapEntry {
    id: string
    title: string
    /** ms epoch — lastUpdated wins over createdAt for sort. */
    lastUpdated: number
    nodeCount: number
    frameworkId: string
}

/** Generate a 12-char hex id for a new mindmap. */
export function generateMindmapId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    }
    // Pre-randomUUID browser fallback (extremely rare in 2026, kept for safety).
    return Math.random().toString(16).slice(2, 14).padEnd(12, '0')
}

/**
 * Stable 8-hex hash of an arbitrary string. Used to derive a collision-
 * resistant id for legacy `?topic=` URL fallbacks — slicing the topic's
 * first 8 chars (the previous approach) collided whenever two topics
 * shared a prefix.
 */
function stableShortHash(s: string): string {
    // djb2 variant — deterministic, no crypto needed
    let h = 5381
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0
    }
    return (h >>> 0).toString(16).padStart(8, '0').slice(0, 8)
}

/** Build a stable id for a legacy `?topic=` URL — e.g. `legacy-a3f9b2c1`. */
export function legacyIdFromTopic(topic: string): string {
    return `legacy-${stableShortHash(topic)}`
}

/** Legacy slug — only used for back-compat lookups, never for new writes. */
function legacyTopicSlug(topic: string): string {
    return topic.toLowerCase().replace(/\s+/g, '_').slice(0, 50)
}

/**
 * Save the tree to localStorage under the given id. `meta` carries fields
 * we need to relist the map later (framework + display title); both
 * optional so callers that don't yet know either can keep saving.
 */
export function saveTree(
    id: string,
    rootNode: MindmapNode,
    meta?: { frameworkId?: string; topic?: string },
): void {
    if (typeof window === 'undefined' || !id) return

    try {
        const key = TREE_CACHE_PREFIX + id
        // Preserve `createdAt` across updates so the recent-maps UI can
        // distinguish "first written" from "last touched". Pull existing
        // meta to avoid stomping a frameworkId we knew on previous writes.
        const existingRaw = localStorage.getItem(key)
        let createdAt = Date.now()
        let prevFramework: string | undefined
        let prevTopic: string | undefined
        if (existingRaw) {
            try {
                const prev = JSON.parse(existingRaw) as Partial<TreeCacheEntry>
                if (typeof prev.createdAt === 'number') createdAt = prev.createdAt
                if (typeof prev.frameworkId === 'string') prevFramework = prev.frameworkId
                if (typeof prev.topic === 'string') prevTopic = prev.topic
            } catch {
                // bad JSON → just overwrite
            }
        }
        const entry: TreeCacheEntry = {
            rootNode,
            createdAt,
            lastUpdated: Date.now(),
            frameworkId: meta?.frameworkId ?? prevFramework,
            topic: meta?.topic ?? prevTopic ?? rootNode.label,
        }
        localStorage.setItem(key, JSON.stringify(entry))
    } catch (e) {
        console.warn('Tree cache save failed:', e)
    }
}

/**
 * Load a tree from localStorage. Tries the id-keyed entry first; if it's
 * missing and a `legacyTopic` is supplied, also tries the pre-id slug so
 * sessions started on the old URL scheme still recover.
 */
export function loadTree(
    id: string | null | undefined,
    legacyTopic?: string,
): MindmapNode | null {
    if (typeof window === 'undefined') return null

    try {
        if (id) {
            const idKey = TREE_CACHE_PREFIX + id
            const stored = localStorage.getItem(idKey)
            if (stored) {
                const entry: TreeCacheEntry = JSON.parse(stored)
                return entry.rootNode
            }
        }
        if (legacyTopic) {
            const legacyKey = TREE_CACHE_PREFIX + legacyTopicSlug(legacyTopic)
            const stored = localStorage.getItem(legacyKey)
            if (stored) {
                const entry: TreeCacheEntry = JSON.parse(stored)
                return entry.rootNode
            }
        }
        return null
    } catch (e) {
        console.warn('Tree cache load failed:', e)
        return null
    }
}

/**
 * Clear a specific tree from cache. Accepts either the new id or, for
 * cleanup of legacy entries, a topic string.
 */
export function clearTree(idOrTopic: string): void {
    if (typeof window === 'undefined' || !idOrTopic) return
    // Try both forms — clearing by id is the common path; topic clears
    // legacy entries that pre-date the id migration.
    localStorage.removeItem(TREE_CACHE_PREFIX + idOrTopic)
    localStorage.removeItem(TREE_CACHE_PREFIX + legacyTopicSlug(idOrTopic))
}

/**
 * Scan localStorage and return all stored mindmaps, newest first.
 *
 * Skips entries with an empty/blank title — those are typically the seed
 * tree from "자유롭게 시작" that the user never interacted with, and
 * showing them just clutters the home page list.
 */
export function listRecentMaps(): RecentMapEntry[] {
    if (typeof window === 'undefined') return []

    const out: RecentMapEntry[] = []
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith(TREE_CACHE_PREFIX)) continue
        const id = key.slice(TREE_CACHE_PREFIX.length)
        // Only include id-keyed entries (new 12-hex format or the
        // `legacy-XXXXXXXX` shape produced by legacyIdFromTopic). Old
        // slug-keyed entries are excluded — their "id" is a topic slug
        // that doesn't round-trip via `?id=`.
        if (!/^(?:[0-9a-f]{12}|legacy-[0-9a-f]{8})$/.test(id)) continue

        const raw = localStorage.getItem(key)
        if (!raw) continue
        try {
            const entry = JSON.parse(raw) as Partial<TreeCacheEntry>
            if (!entry.rootNode) continue
            const title = (entry.topic ?? entry.rootNode.label ?? '').trim()
            if (!title) continue
            out.push({
                id,
                title,
                lastUpdated: typeof entry.lastUpdated === 'number'
                    ? entry.lastUpdated
                    : (entry.createdAt ?? 0),
                nodeCount: calculateTreeMetadata(entry.rootNode).totalNodes,
                frameworkId: entry.frameworkId ?? 'LOGIC',
            })
        } catch {
            // bad JSON → ignore
        }
    }
    return out.sort((a, b) => b.lastUpdated - a.lastUpdated)
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
