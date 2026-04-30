import {
    ClassificationResponse,
    GenerateResponse,
    ExpandRequest,
    ExpandResponse,
    SmartClassifyRequest,
    SmartClassifyResponse,
    ReportRequest,
    isAPIError
} from '@/types/mindmap'
import { getFromCache, setToCache, generateCacheKey } from './cache'
import { getApiHeaders } from './api-key-store'
import { API_BASE_URL } from './api-config'

export async function classifyIntent(userInput: string, language: string = 'Korean'): Promise<ClassificationResponse> {
    // 캐시 체크
    const cacheKey = generateCacheKey('intent', userInput, language)
    const cached = getFromCache<ClassificationResponse>(cacheKey)
    if (cached) return cached

    const res = await fetch(`${API_BASE_URL}/api/v1/classify`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ user_input: userInput, user_language: language })
    })

    if (!res.ok) {
        throw new Error(`Classification failed: ${res.statusText}`)
    }

    const data = await res.json()
    setToCache(cacheKey, data, 60)  // 60분 TTL
    return data
}

/**
 * Smart 3-turn classification with persona-based questions.
 * Collects DNA through contextual conversation before generation.
 */
export async function smartClassify(request: SmartClassifyRequest): Promise<SmartClassifyResponse> {
    const res = await fetch(`${API_BASE_URL}/api/v1/smart-classify`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(request)
    })

    if (res.ok) return await res.json()

    // Try to parse a FastAPI HTTPException detail; fall back to a plain Error.
    let errorData: unknown = null
    try {
        errorData = await res.json()
    } catch {
        throw new Error(`Smart classification failed: ${res.statusText}`)
    }

    const detail = (errorData as { detail?: unknown })?.detail
    if (isAPIError(detail)) {
        throw Object.assign(new Error(detail.message), { ...detail, isAPIError: true })
    }
    throw new Error(`Smart classification failed: ${res.statusText}`)
}

export async function generateMindmap(
    topic: string,
    frameworkId: string,
    language: string = 'Korean',
    intentMode: string = 'creation'
): Promise<GenerateResponse> {
    // 캐시 체크
    const cacheKey = generateCacheKey('mindmap', topic, frameworkId, language, intentMode)
    const cached = getFromCache<GenerateResponse>(cacheKey)
    if (cached) return cached

    const res = await fetch(`${API_BASE_URL}/api/v1/generate`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
            topic,
            framework_id: frameworkId,
            language,
            intent_mode: intentMode
        })
    })

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Generation failed: ${errorText}`)
    }

    const data = await res.json()
    setToCache(cacheKey, data, 60)  // 60분 TTL
    return data
}

export async function expandNode(request: ExpandRequest): Promise<ExpandResponse> {
    // No caching for expand - each expansion should be fresh
    // Tree cache (localStorage) is used instead for persistence

    const res = await fetch(`${API_BASE_URL}/api/v1/expand`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(request)
    })

    if (!res.ok) {
        throw new Error(`Expansion failed: ${res.statusText}`)
    }

    return await res.json()
}

// Export API base URL for debugging
export { API_BASE_URL }

/**
 * Generate a professional business report from mindmap data via SSE streaming.
 *
 * Returns an `abort` function the caller MUST call when unmounting / closing
 * the panel to avoid leaked readers and zombie connections. The stream is also
 * aborted automatically if no chunk arrives within `idleTimeoutMs`.
 */
export function generateReport(
    request: ReportRequest,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (error: Error) => void,
    options?: { idleTimeoutMs?: number }
): { abort: () => void } {
    const controller = new AbortController()
    const idleTimeoutMs = options?.idleTimeoutMs ?? 60_000
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let aborted = false

    const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
            aborted = true
            controller.abort()
            onError(new Error('Report streaming idle timeout'))
        }, idleTimeoutMs)
    }

    const cleanup = () => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = null
    }

    const run = async () => {
        try {
            resetIdleTimer()
            const res = await fetch(`${API_BASE_URL}/api/v1/generate-report`, {
                method: 'POST',
                headers: getApiHeaders(),
                body: JSON.stringify(request),
                signal: controller.signal,
            })

            if (!res.ok) throw new Error(`Report generation failed: ${res.statusText}`)

            const reader = res.body?.getReader()
            if (!reader) throw new Error('No response body')

            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                resetIdleTimer()

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue
                    const data = line.slice(6).trim()

                    if (data === '[DONE]') {
                        cleanup()
                        onDone()
                        return
                    }

                    try {
                        const parsed = JSON.parse(data)
                        if (parsed.text) onChunk(parsed.text)
                        if (parsed.error) {
                            cleanup()
                            onError(new Error(parsed.error))
                            return
                        }
                    } catch {
                        // skip malformed chunk
                    }
                }
            }

            cleanup()
            onDone()
        } catch (error) {
            cleanup()
            if (aborted) return // already surfaced via timeout error
            if ((error as { name?: string })?.name === 'AbortError') return
            onError(error instanceof Error ? error : new Error('Unknown error'))
        }
    }

    void run()

    return {
        abort: () => {
            aborted = true
            cleanup()
            controller.abort()
        },
    }
}

