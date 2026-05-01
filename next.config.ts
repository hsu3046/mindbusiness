import type { NextConfig } from "next"

const LOCAL_BACKEND_URL =
    process.env.LOCAL_BACKEND_URL || "http://localhost:8000"

const nextConfig: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    experimental: {
        // Trim icon/animation libraries from the client bundle.
        optimizePackageImports: [
            "lucide-react",
            "@hugeicons/react",
            "framer-motion",
        ],
    },
    /**
     * Dev-only proxy: forward `/api/*` to the local FastAPI server so the
     * frontend can keep calling same-origin paths during development —
     * matching how Vercel rewrites them in production. No-op in build /
     * production (Vercel's `rewrites` in vercel.json takes over there).
     */
    async rewrites() {
        if (process.env.NODE_ENV !== "development") return []
        return [
            {
                source: "/api/:path*",
                destination: `${LOCAL_BACKEND_URL}/api/:path*`,
            },
        ]
    },
}

export default nextConfig
