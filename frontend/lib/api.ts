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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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

    if (!res.ok) {
        // 에러 응답에서 detail 파싱 시도
        try {
            const errorData = await res.json()
            // FastAPI의 HTTPException detail 구조
            const detail = errorData.detail
            if (detail && isAPIError(detail)) {
                throw { ...detail, isAPIError: true }
            }
            throw new Error(detail?.message || `Smart classification failed: ${res.statusText}`)
        } catch (e) {
            if ((e as any).isAPIError) throw e
            throw new Error(`Smart classification failed: ${res.statusText}`)
        }
    }

    return await res.json()
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
 */
export async function generateReport(
    request: ReportRequest,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (error: Error) => void
): Promise<void> {
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/generate-report`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify(request)
        })

        if (!res.ok) {
            throw new Error(`Report generation failed: ${res.statusText}`)
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // Parse SSE lines
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim()

                    if (data === '[DONE]') {
                        onDone()
                        return
                    }

                    try {
                        const parsed = JSON.parse(data)
                        if (parsed.text) {
                            onChunk(parsed.text)
                        }
                        if (parsed.error) {
                            onError(new Error(parsed.error))
                            return
                        }
                    } catch {
                        // Skip malformed JSON
                    }
                }
            }
        }

        onDone()
    } catch (error) {
        onError(error instanceof Error ? error : new Error('Unknown error'))
    }
}

