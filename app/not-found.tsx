import Link from "next/link"

export default function NotFound() {
    return (
        <main className="flex min-h-screen w-full items-center justify-center bg-slate-50 px-4">
            <div className="max-w-md text-center">
                <p className="text-xs uppercase tracking-widest text-slate-400">404</p>
                <h1 className="mt-2 text-2xl font-semibold text-slate-800">페이지를 찾을 수 없습니다</h1>
                <p className="mt-3 text-sm text-slate-500 break-keep">
                    요청하신 주소가 변경되었거나 더 이상 존재하지 않습니다.
                </p>
                <Link
                    href="/"
                    className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 active:scale-95"
                >
                    홈으로 돌아가기
                </Link>
            </div>
        </main>
    )
}
