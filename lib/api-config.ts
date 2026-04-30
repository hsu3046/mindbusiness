/**
 * Single source of truth for the backend API base URL.
 *
 * Default deployment is same-origin (Vercel monorepo: Next.js + Python
 * serverless functions in the same project). The frontend just calls
 * `/api/v1/...` and Vercel rewrites it to the Python function.
 *
 * For split deployments (frontend on one host, backend on another) set
 * NEXT_PUBLIC_API_URL to the absolute backend URL.
 */

function resolveApiBaseUrl(): string {
    const envUrl = process.env.NEXT_PUBLIC_API_URL
    if (envUrl && envUrl.length > 0) return envUrl.replace(/\/+$/, '')
    // Empty string → fetch('/api/...') resolves against the page origin.
    return ''
}

export const API_BASE_URL = resolveApiBaseUrl()

export function isApiConfigured(): boolean {
    // Same-origin (empty base) is a valid configuration.
    return true
}
