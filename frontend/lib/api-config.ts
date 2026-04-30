/**
 * Single source of truth for the backend API base URL.
 * Reads NEXT_PUBLIC_API_URL at build time. In production builds the
 * env var must be set — otherwise the user's browser would silently
 * call localhost. In development we fall back to localhost:8000.
 */

const FALLBACK_DEV_URL = 'http://localhost:8000'

function resolveApiBaseUrl(): string {
    const envUrl = process.env.NEXT_PUBLIC_API_URL
    if (envUrl && envUrl.length > 0) return envUrl.replace(/\/+$/, '')

    if (process.env.NODE_ENV === 'production') {
        if (typeof window !== 'undefined') {
            console.error(
                '[MindBusiness] NEXT_PUBLIC_API_URL is not set. ' +
                    'The app cannot reach the backend. Configure this env var in your deployment.'
            )
        }
        // Return empty string so requests fail fast with a clear network error
        // instead of silently hitting localhost from the user's browser.
        return ''
    }

    return FALLBACK_DEV_URL
}

export const API_BASE_URL = resolveApiBaseUrl()

export function isApiConfigured(): boolean {
    return API_BASE_URL.length > 0
}
