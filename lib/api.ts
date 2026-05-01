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

// ── Async Job API (Fire-and-Poll for /generate, resumable SSE for /report) ───
//
// These endpoints decouple the LLM call from the HTTP request lifecycle, so
// closing the tab, backgrounding the app, or losing the network mid-call no
// longer wastes the result. The synchronous generateMindmap / generateReport
// below remain for backward compatibility but new code should prefer these.

interface JobCreated {
    job_id: string
    kind: 'generate' | 'report'
    status: 'queued'
}

export interface JobState {
    kind: 'generate' | 'report'
    status: 'queued' | 'running' | 'done' | 'error'
    created_at?: string
    updated_at?: string
    error?: string
    /** Present only when status === 'done' for generate jobs. */
    result?: GenerateResponse
}

/** Start a mindmap generation job. Returns the job_id immediately (~1s). */
export async function startGenerateJob(
    topic: string,
    frameworkId: string,
    language: string = 'Korean',
    intentMode: string = 'creation'
): Promise<string> {
    const res = await fetch(`${API_BASE_URL}/api/v1/jobs/generate`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({
            topic,
            framework_id: frameworkId,
            language,
            intent_mode: intentMode,
        }),
    })
    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`startGenerateJob failed: ${errorText}`)
    }
    const data: JobCreated = await res.json()
    return data.job_id
}

/** One-shot job state fetch. */
export async function getJob(jobId: string): Promise<JobState> {
    const res = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}`, {
        headers: getApiHeaders(),
    })
    if (!res.ok) throw new Error(`getJob failed: ${res.statusText}`)
    return await res.json()
}

/**
 * Poll a job until it reaches a terminal state. Returns an `abort` handle so
 * the caller can stop polling on unmount. The promise resolves with the final
 * JobState (status === 'done' | 'error') or rejects on network/abort.
 */
export function pollJob(
    jobId: string,
    options?: {
        intervalMs?: number
        maxDurationMs?: number
        onState?: (state: JobState) => void
    }
): { abort: () => void; result: Promise<JobState> } {
    const intervalMs = options?.intervalMs ?? 1500
    const maxDurationMs = options?.maxDurationMs ?? 5 * 60 * 1000 // 5 min cap
    const startedAt = Date.now()
    let timer: ReturnType<typeof setTimeout> | null = null
    let aborted = false

    const result = new Promise<JobState>((resolve, reject) => {
        const tick = async () => {
            if (aborted) {
                reject(new Error('aborted'))
                return
            }
            try {
                const state = await getJob(jobId)
                options?.onState?.(state)
                if (state.status === 'done' || state.status === 'error') {
                    resolve(state)
                    return
                }
                if (Date.now() - startedAt > maxDurationMs) {
                    reject(new Error('pollJob timeout'))
                    return
                }
                timer = setTimeout(tick, intervalMs)
            } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)))
            }
        }
        // Fire first poll on next tick so the caller can attach onState first.
        timer = setTimeout(tick, 0)
    })

    return {
        abort: () => {
            aborted = true
            if (timer) clearTimeout(timer)
        },
        result,
    }
}

/** Start a report job. Returns the job_id; the caller then opens the SSE stream. */
export async function startReportJob(request: ReportRequest): Promise<string> {
    const res = await fetch(`${API_BASE_URL}/api/v1/jobs/report`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify(request),
    })
    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`startReportJob failed: ${errorText}`)
    }
    const data: JobCreated = await res.json()
    return data.job_id
}

export type ReportPhase = 'researching' | 'writing'

/**
 * Open a resumable SSE stream for a report job.
 *
 * `cursor` lets a reconnecting client resume from the chunk it last received,
 * so a network blip / refresh / device switch can pick up mid-report.
 *
 * The backend now interleaves two kinds of envelopes on the same cursor
 * stream: phase markers (`{type: "phase", phase: "researching"|"writing"}`)
 * and text chunks (`{type: "text", text: "..."}`). `onPhase` lets the UI
 * show "수집 중" vs "작성 중" without polling a side channel.
 */
export function streamReportJob(
    jobId: string,
    onChunk: (text: string, cursor: number) => void,
    onDone: () => void,
    onError: (error: Error) => void,
    options?: {
        cursor?: number
        idleTimeoutMs?: number
        onPhase?: (phase: ReportPhase, cursor: number) => void
    }
): { abort: () => void } {
    const controller = new AbortController()
    const idleTimeoutMs = options?.idleTimeoutMs ?? 90_000
    const initialCursor = options?.cursor ?? 0
    let idleTimer: ReturnType<typeof setTimeout> | null = null
    let aborted = false

    const resetIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = setTimeout(() => {
            aborted = true
            controller.abort()
            onError(new Error('Report stream idle timeout'))
        }, idleTimeoutMs)
    }

    const cleanup = () => {
        if (idleTimer) clearTimeout(idleTimer)
        idleTimer = null
    }

    const run = async () => {
        try {
            resetIdleTimer()
            const url = `${API_BASE_URL}/api/v1/jobs/${jobId}/stream?cursor=${initialCursor}`
            const res = await fetch(url, {
                headers: getApiHeaders(),
                signal: controller.signal,
            })

            if (!res.ok) throw new Error(`stream failed: ${res.statusText}`)

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
                        const parsed = JSON.parse(data) as {
                            type?: 'text' | 'phase'
                            text?: string
                            phase?: ReportPhase
                            cursor?: number
                            error?: string
                        }
                        if (parsed.error) {
                            cleanup()
                            onError(new Error(parsed.error))
                            return
                        }
                        const cursor = parsed.cursor ?? 0
                        if (parsed.type === 'phase' && parsed.phase) {
                            options?.onPhase?.(parsed.phase, cursor)
                        } else if (parsed.text !== undefined) {
                            // type === "text" or legacy untyped envelope
                            onChunk(parsed.text, cursor)
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
            if (aborted) return
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

/**
 * @deprecated Synchronous SSE — kept for backward compatibility only. New
 * callers should use `startReportJob` + `streamReportJob` for resumability.
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

