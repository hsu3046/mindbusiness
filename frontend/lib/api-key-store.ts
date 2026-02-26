/**
 * API Key Store — manages user's Gemini API key in localStorage.
 * BYOK (Bring Your Own Key) pattern for open-source deployment.
 */

const STORAGE_KEY = 'mindbusiness_gemini_api_key'

export function getApiKey(): string | null {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(STORAGE_KEY)
}

export function setApiKey(key: string): void {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, key)
}

export function clearApiKey(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
}

export function hasApiKey(): boolean {
    return !!getApiKey()
}

/**
 * Returns common headers for API calls, including API key if available.
 */
export function getApiHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    }
    const apiKey = getApiKey()
    if (apiKey) {
        headers['X-API-Key'] = apiKey
    }
    return headers
}

/**
 * Dispatch a custom event to open the API Key settings dialog.
 */
export function openApiKeySettings(): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('open-api-key-settings'))
}

// Server key cache — preloaded at app startup
let _serverHasKey = false
let _serverKeyChecked = false

/**
 * Preload server key status — call once at app init.
 * Runs in background, does not block UI.
 */
export function preloadServerKeyStatus(): void {
    if (_serverKeyChecked || typeof window === 'undefined') return
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(3000) })
        .then(res => res.json())
        .then(data => {
            _serverHasKey = data.has_server_key ?? false
            _serverKeyChecked = true
        })
        .catch(() => {
            _serverHasKey = false
            _serverKeyChecked = true
        })
}

/**
 * Check if any API key is available — SYNCHRONOUS, no network delay.
 */
export function isAnyKeyAvailable(): boolean {
    if (hasApiKey()) return true
    return _serverHasKey
}

/**
 * Whether server has its own key (for dialog display).
 */
export function serverHasKey(): boolean {
    return _serverHasKey
}
