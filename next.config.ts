import type { NextConfig } from "next"

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
}

export default nextConfig
