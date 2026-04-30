"use client"

import { useEffect } from "react"

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error(error)
    }, [error])

    return (
        <main className="flex min-h-screen w-full items-center justify-center bg-slate-50 px-4">
            <div className="max-w-md text-center">
                <h1 className="text-2xl font-semibold text-slate-800">문제가 발생했습니다</h1>
                <p className="mt-3 text-sm text-slate-500 break-keep">
                    잠시 후 다시 시도해 주세요. 문제가 계속되면 페이지를 새로고침해 주세요.
                </p>
                {error.digest && (
                    <p className="mt-2 text-xs text-slate-400 font-mono">ref: {error.digest}</p>
                )}
                <button
                    onClick={reset}
                    className="mt-6 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 active:scale-95"
                >
                    다시 시도
                </button>
            </div>
        </main>
    )
}
