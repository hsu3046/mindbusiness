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
import { getApiHeaders, hasApiKey, isServerKeyChecked, serverHasKey } from './api-key-store'
import { API_BASE_URL } from './api-config'

/**
 * 사용자 친화적 에러. UI에서 이 인스턴스를 잡으면 토스트에 메시지 그대로 노출 +
 * `kind`로 추가 액션(예: 설정 열기) 결정 가능.
 */
export class FriendlyApiError extends Error {
    kind: 'no_key' | 'invalid_key' | 'rate_limit' | 'timeout' | 'validation' | 'server' | 'network'
    retry: boolean
    constructor(message: string, kind: FriendlyApiError['kind'], retry: boolean = false) {
        super(message)
        this.name = 'FriendlyApiError'
        this.kind = kind
        this.retry = retry
    }
}

/**
 * 백엔드 에러 응답 JSON `{detail: {error, message, retry}}` 형태를 파싱해
 * 사용자 메시지로 변환. status별 케이스 + 메시지 sniff로 API 키 누락 감지.
 */
async function classifyExpandError(res: Response): Promise<FriendlyApiError> {
    let detail: { error?: string; message?: string; retry?: boolean } | null = null
    try {
        const body = await res.json()
        detail = body?.detail ?? null
    } catch {
        // 파싱 실패 — status만으로 판단
    }

    if (res.status === 401) {
        // 백엔드가 401 을 두 케이스에 사용:
        //   - missing_api_key: 키 자체가 없음 → "키 필요" + 설정 열기
        //   - invalid (default): 키는 있는데 거부됨 → "키 확인" + 설정 열기
        // detail.error 로 분기 (없으면 invalid 로 가정).
        if (detail?.error === 'missing_api_key') {
            return new FriendlyApiError(
                detail.message || 'AI 확장을 사용하려면 Gemini API 키가 필요해요.',
                'no_key'
            )
        }
        return new FriendlyApiError(
            'API 키가 유효하지 않아요. 우상단 설정에서 다시 확인해주세요.',
            'invalid_key'
        )
    }
    if (res.status === 408) {
        return new FriendlyApiError(
            detail?.message || 'AI 응답이 너무 오래 걸려요. 잠시 후 다시 시도해주세요.',
            'timeout',
            true
        )
    }
    if (res.status === 429) {
        return new FriendlyApiError(
            '요청이 너무 잦아요. 1분쯤 기다린 뒤 다시 시도해주세요.',
            'rate_limit',
            true
        )
    }
    if (res.status === 400) {
        return new FriendlyApiError(
            detail?.message || '확장할 수 없는 노드예요.',
            'validation'
        )
    }

    // 500 catch-all — 메시지에 인증 관련 키워드가 있으면 API 키 문제로 추정
    const msg = `${detail?.message || ''} ${detail?.error || ''} ${res.statusText || ''}`
    const looksLikeAuth = /api.?key|authent|unauth|credential|permission|forbidden|invalid.?key/i.test(msg)
    if (looksLikeAuth) {
        return new FriendlyApiError(
            'Gemini API 키가 없거나 잘못됐어요. 우상단 설정에서 키를 입력해주세요.',
            'no_key'
        )
    }

    return new FriendlyApiError(
        detail?.message || 'AI 확장에 실패했어요. 잠시 후 다시 시도해주세요.',
        'server',
        detail?.retry ?? false
    )
}

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

    // 사전 점검: 사용자 키도 없고, 서버 키 preload 가 끝났는데도 없을 때
    // 만 즉시 안내. preload 가 아직 안 끝난 경우 (false positive 위험)는
    // 그냥 호출 진행 — 백엔드가 실제로 키 없으면 401/permanent_auth 로
    // 응답하고 그 경로에서 친절 메시지가 노출됨.
    if (!hasApiKey() && isServerKeyChecked() && !serverHasKey()) {
        throw new FriendlyApiError(
            'AI 확장을 사용하려면 Gemini API 키가 필요해요. 우상단 설정에서 키를 입력해주세요.',
            'no_key'
        )
    }

    let res: Response
    try {
        res = await fetch(`${API_BASE_URL}/api/v1/expand`, {
            method: 'POST',
            headers: getApiHeaders(),
            body: JSON.stringify(request)
        })
    } catch {
        throw new FriendlyApiError(
            '서버에 연결할 수 없어요. 네트워크 상태를 확인해주세요.',
            'network',
            true
        )
    }

    if (!res.ok) {
        throw await classifyExpandError(res)
    }

    const data = await res.json() as ExpandResponse & {
        error?: string | null
        error_kind?: string | null
    }

    // 200 OK이지만 백엔드가 에러로 분류한 케이스 — error/error_kind 채워서 옴.
    // (자동 재시도까지 백엔드가 했는데도 실패한 경우. 프론트는 사용자에게
    //  명확히 알리고 retry 여부는 error_kind에 따라 결정.)
    if (data.error && data.error_kind) {
        const kindToFriendly: Record<string, FriendlyApiError> = {
            permanent_validation: new FriendlyApiError(data.error, 'validation'),
            permanent_auth: new FriendlyApiError(
                'API 키가 유효하지 않아요. 우상단 설정에서 다시 확인해주세요.',
                'invalid_key'
            ),
            permanent_quota: new FriendlyApiError(
                '요청이 너무 잦아요. 1분쯤 기다린 뒤 다시 시도해주세요.',
                'rate_limit',
                true
            ),
            transient_parse: new FriendlyApiError(
                'AI 응답을 해석하지 못했어요. 다시 시도해주세요.',
                'server',
                true
            ),
            transient_api: new FriendlyApiError(
                'AI가 응답하지 않아요. 잠시 후 다시 시도해주세요.',
                'server',
                true
            ),
            unknown: new FriendlyApiError(
                'AI 확장에 실패했어요. 다시 시도해주세요.',
                'server',
                true
            ),
        }
        throw kindToFriendly[data.error_kind] ?? new FriendlyApiError(data.error, 'server', true)
    }

    return data
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

