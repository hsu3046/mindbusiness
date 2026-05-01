"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { AiIdeaIcon, Clock01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { listRecentMaps, clearTree, type RecentMapEntry } from "@/lib/tree-cache"

const COLLAPSED_LIMIT = 5

/** Best-effort: ask the browser to keep our origin's data through eviction. */
function requestPersistence() {
    if (typeof navigator === "undefined") return
    const storage = navigator.storage
    if (!storage || typeof storage.persist !== "function") return
    // Fire-and-forget. Safari ignores this; Chrome/FF may grant it. Either
    // way, calling is free and we don't surface the result to the user.
    storage.persist().catch(() => {})
}

/** "방금 전" / "3시간 전" / "2025-05-01" — short Korean relative-time. */
function formatRelativeTime(ms: number): string {
    const diff = Date.now() - ms
    const min = 60_000
    const hour = 60 * min
    const day = 24 * hour

    if (diff < min) return "방금 전"
    if (diff < hour) return `${Math.floor(diff / min)}분 전`
    if (diff < day) return `${Math.floor(diff / hour)}시간 전`
    if (diff < 7 * day) return `${Math.floor(diff / day)}일 전`

    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Recent maps list for the home page.
 *
 * localStorage entries are scanned on mount; nothing is rendered when the
 * list is empty so first-time users still see the bare hero input. Click
 * → re-opens the map at `/map?id=...&framework=...`. Trash icon →
 * AlertDialog confirm → removes the entry.
 *
 * Note: localStorage is best-effort persistence. Safari ITP wipes
 * script-writable storage after 7 days of no interaction, and any
 * browser may evict under storage pressure. We try `navigator.storage
 * .persist()` once on mount but don't promise the user anything beyond
 * "we'll keep your maps here while we can — download OPML for safekeeping."
 */
export function RecentMapsList() {
    const router = useRouter()
    const [maps, setMaps] = useState<RecentMapEntry[] | null>(null)
    const [expanded, setExpanded] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<RecentMapEntry | null>(null)

    useEffect(() => {
        // One-shot hydration from localStorage, not a subscription — running
        // this in render would cause SSR/CSR hydration mismatch (server has
        // no localStorage, client does). useSyncExternalStore would over-
        // engineer this for a list that only changes when the user clicks
        // a delete button on this same component.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMaps(listRecentMaps())
        requestPersistence()
    }, [])

    if (maps === null) return null
    if (maps.length === 0) return null

    const visible = expanded ? maps : maps.slice(0, COLLAPSED_LIMIT)
    const hasMore = maps.length > COLLAPSED_LIMIT

    const handleOpen = (m: RecentMapEntry) => {
        router.push(
            `/map?id=${m.id}&framework=${encodeURIComponent(m.frameworkId)}`,
        )
    }

    const confirmDelete = () => {
        if (!pendingDelete) return
        clearTree(pendingDelete.id)
        setMaps((prev) => prev?.filter((m) => m.id !== pendingDelete.id) ?? null)
        toast.success("아이디어를 삭제했어요")
        setPendingDelete(null)
    }

    return (
        <div className="mt-10 w-full max-w-lg md:max-w-xl">
            <h2 className="mb-2 px-1 text-xs font-medium tracking-wide text-slate-400">
                최근 아이디어
            </h2>

            <ul>
                {visible.map((m) => (
                    <li
                        key={m.id}
                        className="group flex items-center gap-2"
                    >
                        <button
                            type="button"
                            onClick={() => handleOpen(m)}
                            className="flex-1 min-w-0 truncate py-1.5 text-left text-sm text-slate-700 transition-colors hover:text-indigo-600"
                        >
                            <span
                                className="mr-2 text-base leading-none text-indigo-500"
                                aria-hidden="true"
                            >
                                •
                            </span>
                            {m.title}
                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-slate-400 align-middle">
                                <HugeiconsIcon icon={Clock01Icon} size={12} />
                                {formatRelativeTime(m.lastUpdated)}
                                <span aria-hidden="true" className="mx-0.5">·</span>
                                <HugeiconsIcon icon={AiIdeaIcon} size={12} />
                                {m.nodeCount}개 아이디어
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setPendingDelete(m)}
                            className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                            aria-label={`${m.title} 삭제`}
                        >
                            <HugeiconsIcon icon={Delete02Icon} size={14} />
                        </button>
                    </li>
                ))}
            </ul>

            {hasMore && (
                <div className="mt-3 flex justify-center">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpanded((v) => !v)}
                        className="text-xs text-slate-500"
                    >
                        {expanded ? "접기" : `${maps.length - COLLAPSED_LIMIT}개 더 보기`}
                    </Button>
                </div>
            )}

            {/* Persistence caveat — keeps the auto-save promise honest.
                Browsers can evict localStorage (Safari: 7-day ITP, others:
                storage pressure), so users should know to download OPML
                if a map matters. */}
            <p className="mt-3 px-1 text-[11px] leading-relaxed text-slate-400 break-keep">
                브라우저 데이터가 정리되거나 1주일 이상 접속하지 않으면 사라질 수
                있으니, 중요한 아이디어는{" "}
                <strong className="font-medium text-slate-500">다운로드</strong>{" "}
                버튼으로 백업해 두세요.
            </p>

            <AlertDialog
                open={pendingDelete !== null}
                onOpenChange={(open) => !open && setPendingDelete(null)}
            >
                <AlertDialogContent className="bg-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-900">
                            이 아이디어를 삭제할까요?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-500 break-keep leading-relaxed">
                            <strong className="text-slate-700">
                                &ldquo;{pendingDelete?.title}&rdquo;
                            </strong>
                            을(를) 영구적으로 삭제합니다. 다시 복구할 수 없으니,
                            보관이 필요하면 먼저 다운로드해 주세요.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="min-w-[100px]">
                            취소
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="min-w-[160px] bg-rose-600 hover:bg-rose-700 border-rose-600 hover:border-rose-700 text-white shadow-md"
                        >
                            삭제
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
