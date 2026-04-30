/**
 * LocalStorage Cache for Development/Testing
 * 
 * 같은 키워드로 재검색 시 API 호출 없이 캐시에서 불러옵니다.
 * 프로덕션 배포 시 이 기능을 비활성화하세요.
 */

const CACHE_PREFIX = 'mindbusiness_cache_'
const CACHE_ENABLED = process.env.NODE_ENV === 'development'

interface CacheEntry<T> {
    data: T
    timestamp: number
    ttl: number  // milliseconds
}

/**
 * 캐시에서 데이터 가져오기
 */
export function getFromCache<T>(key: string): T | null {
    if (!CACHE_ENABLED || typeof window === 'undefined') return null

    try {
        const stored = localStorage.getItem(CACHE_PREFIX + key)
        if (!stored) return null

        const entry: CacheEntry<T> = JSON.parse(stored)

        // TTL 체크
        if (Date.now() - entry.timestamp > entry.ttl) {
            localStorage.removeItem(CACHE_PREFIX + key)
            return null
        }

        return entry.data
    } catch {
        return null
    }
}

/**
 * 캐시에 데이터 저장
 */
export function setToCache<T>(key: string, data: T, ttlMinutes: number = 60): void {
    if (!CACHE_ENABLED || typeof window === 'undefined') return

    try {
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            ttl: ttlMinutes * 60 * 1000
        }
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
    } catch (e) {
        console.warn('Cache storage failed:', e)
    }
}

/**
 * 캐시 키 생성 (topic + framework 조합)
 */
export function generateCacheKey(type: 'mindmap' | 'intent' | 'expand', ...params: string[]): string {
    return `${type}_${params.join('_').toLowerCase().replace(/\s+/g, '_')}`
}

/**
 * 모든 캐시 클리어
 */
export function clearAllCache(): void {
    if (typeof window === 'undefined') return

    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(CACHE_PREFIX)) {
            keysToRemove.push(key)
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
}

/**
 * 캐시 통계
 */
export function getCacheStats(): { count: number, size: number } {
    if (typeof window === 'undefined') return { count: 0, size: 0 }

    let count = 0
    let size = 0
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(CACHE_PREFIX)) {
            count++
            size += localStorage.getItem(key)?.length || 0
        }
    }
    return { count, size: Math.round(size / 1024) }  // KB
}
