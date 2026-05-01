"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import ReactMarkdown from "react-markdown"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetClose,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { Download04Icon, Loading03Icon, AiChat02Icon, NoteIcon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { startReportJob, streamReportJob, type ReportPhase } from "@/lib/api"
import { MindmapNode, ReportRequest } from "@/types/mindmap"

// Lightweight phase → user-facing label mapping. Kept inline (no i18n yet)
// and intentionally muted text — the panel design avoids emoji/heavy colors.
const PHASE_LABELS: Record<ReportPhase, string> = {
    researching: "최신 자료를 수집하고 있어요",
    writing: "기획서를 작성하고 있어요",
}

interface ReportPanelProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    rootNode: MindmapNode | null
    topic: string
    frameworkId: string
}

// sessionStorage keys for resuming across reloads / device switches.
const REPORT_JOB_KEY = "mindbusiness_report_job"

interface PersistedReportJob {
    jobId: string
    cursor: number
    markdown: string
    topicSig: string  // topic|framework — invalidates cache when inputs change
}

function loadPersisted(topicSig: string): PersistedReportJob | null {
    if (typeof window === "undefined") return null
    try {
        const raw = sessionStorage.getItem(REPORT_JOB_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as PersistedReportJob
        if (parsed.topicSig !== topicSig) return null
        return parsed
    } catch {
        return null
    }
}

function savePersisted(state: PersistedReportJob) {
    if (typeof window === "undefined") return
    try {
        sessionStorage.setItem(REPORT_JOB_KEY, JSON.stringify(state))
    } catch {
        // sessionStorage can fail in private mode — ignore, resumability is best-effort.
    }
}

function clearPersisted() {
    if (typeof window === "undefined") return
    try {
        sessionStorage.removeItem(REPORT_JOB_KEY)
    } catch {
        // ignore
    }
}

export function ReportPanel({
    open,
    onOpenChange,
    rootNode,
    topic,
    frameworkId,
}: ReportPanelProps) {
    const [markdown, setMarkdown] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [isDone, setIsDone] = useState(false)
    const [phase, setPhase] = useState<ReportPhase | null>(null)
    const contentRef = useRef<HTMLDivElement>(null)

    // Active SSE controller — abort on close/unmount/regenerate
    const activeStreamRef = useRef<{ abort: () => void } | null>(null)
    // Strict-mode guard — prevent double generate on remount during dev
    const inFlightRef = useRef(false)
    // Track current job_id and cursor for sessionStorage persistence.
    const jobIdRef = useRef<string | null>(null)
    const cursorRef = useRef(0)

    // Responsive side detection
    const [sheetSide, setSheetSide] = useState<"right" | "bottom">("right")

    useEffect(() => {
        const checkSize = () => {
            setSheetSide(window.innerWidth < 768 ? "bottom" : "right")
        }
        checkSize()
        window.addEventListener("resize", checkSize)
        return () => window.removeEventListener("resize", checkSize)
    }, [])

    // Auto-scroll to bottom during streaming
    useEffect(() => {
        if (isGenerating && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight
        }
    }, [markdown, isGenerating])

    const topicSig = `${topic}|${frameworkId}`

    /** Stream from an existing job_id, resuming at `cursor`. */
    const attachStream = useCallback(
        (jobId: string, startCursor: number, startingMarkdown: string) => {
            activeStreamRef.current?.abort()
            activeStreamRef.current = null
            inFlightRef.current = true

            jobIdRef.current = jobId
            cursorRef.current = startCursor
            setMarkdown(startingMarkdown)
            setIsGenerating(true)
            setIsDone(false)
            // On resume we don't know the last phase yet; the next phase
            // marker pushed by the producer will overwrite this within a
            // few hundred ms, so default to "researching" for the empty
            // state and let the SSE stream correct it.
            setPhase(startCursor === 0 ? "researching" : null)

            activeStreamRef.current = streamReportJob(
                jobId,
                (chunk, cursor) => {
                    cursorRef.current = cursor
                    setMarkdown((prev) => {
                        const next = prev + chunk
                        savePersisted({ jobId, cursor, markdown: next, topicSig })
                        return next
                    })
                },
                () => {
                    inFlightRef.current = false
                    activeStreamRef.current = null
                    setIsGenerating(false)
                    setIsDone(true)
                    setPhase(null)
                    clearPersisted()
                },
                (error) => {
                    inFlightRef.current = false
                    activeStreamRef.current = null
                    setIsGenerating(false)
                    setPhase(null)
                    setMarkdown((prev) => prev + `\n\n---\n\n⚠️ 오류 발생: ${error.message}`)
                    clearPersisted()
                },
                {
                    cursor: startCursor,
                    onPhase: (next) => setPhase(next),
                }
            )
        },
        [topicSig]
    )

    /** Kick off a brand-new report job. */
    const handleGenerate = useCallback(async () => {
        if (!rootNode) return
        // Abort any in-flight stream before starting a new one
        activeStreamRef.current?.abort()
        activeStreamRef.current = null
        clearPersisted()
        jobIdRef.current = null
        cursorRef.current = 0
        inFlightRef.current = true

        setMarkdown("")
        setIsGenerating(true)
        setIsDone(false)
        setPhase("researching")

        const request: ReportRequest = {
            topic,
            framework_id: frameworkId,
            mindmap_tree: rootNode,
            language: "Korean",
        }

        try {
            const jobId = await startReportJob(request)
            attachStream(jobId, 0, "")
        } catch (error) {
            inFlightRef.current = false
            setIsGenerating(false)
            setPhase(null)
            setMarkdown(
                `\n\n⚠️ 오류 발생: ${error instanceof Error ? error.message : "알 수 없는 오류"}`
            )
        }
    }, [rootNode, topic, frameworkId, attachStream])

    // Auto-generate when panel opens (strict-mode safe via inFlightRef).
    // If sessionStorage holds an in-progress job for the same inputs, resume
    // from its cursor instead of starting fresh.
    useEffect(() => {
        if (!open || inFlightRef.current || isDone || markdown) return
        // attachStream / handleGenerate kick off async network work and only
        // call setState from inside the streaming callback — that's the
        // pattern the rule's docs explicitly allow ("subscribe for updates
        // from some external system"). Disable the stricter heuristic here.
        const persisted = loadPersisted(topicSig)
        if (persisted) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            attachStream(persisted.jobId, persisted.cursor, persisted.markdown)
        } else {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            void handleGenerate()
        }
    }, [open, isDone, markdown, handleGenerate, attachStream, topicSig])

    // Cleanup on unmount — kill any active stream
    useEffect(() => {
        return () => {
            activeStreamRef.current?.abort()
            activeStreamRef.current = null
            inFlightRef.current = false
        }
    }, [])

    // Reset state when panel closes. Keep sessionStorage so the user can
    // reopen and resume; only clear when explicitly done or regenerated.
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            activeStreamRef.current?.abort()
            activeStreamRef.current = null
            inFlightRef.current = false
            setMarkdown("")
            setIsDone(false)
            setIsGenerating(false)
            setPhase(null)
        }
        onOpenChange(newOpen)
    }

    const handleDownload = useCallback(() => {
        if (!markdown) return

        const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${topic}_기획서.md`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }, [markdown, topic])

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent
                side={sheetSide}
                showCloseButton={false}
                className={`flex flex-col p-0 gap-0 ${sheetSide === "bottom"
                        ? "h-[50vh] max-h-[50vh] rounded-t-2xl"
                        : "w-full sm:max-w-[640px]"
                    }`}
            >
                {/* Header */}
                <SheetHeader className="px-6 py-4 border-b border-slate-200 shrink-0">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <HugeiconsIcon icon={NoteIcon} size={20} />
                            기획서 작성
                        </SheetTitle>
                        <div className="flex items-center gap-2">
                            {isDone && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDownload}
                                    className="flex items-center gap-1.5"
                                >
                                    <HugeiconsIcon icon={Download04Icon} size={16} />
                                    다운로드
                                </Button>
                            )}
                            {isDone && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleGenerate}
                                    className="flex items-center gap-1.5"
                                >
                                    <HugeiconsIcon icon={AiChat02Icon} size={16} color="#ff5757" />
                                    재생성
                                </Button>
                            )}
                            <SheetClose
                                render={
                                    <Button variant="ghost" size="icon-sm" />
                                }
                            >
                                <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={2} />
                            </SheetClose>
                        </div>
                    </div>
                </SheetHeader>

                {/* Content - Markdown Rendering */}
                <div
                    ref={contentRef}
                    className="flex-1 overflow-y-auto px-6 py-4"
                >
                    {isGenerating && !markdown && (
                        <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400">
                            <HugeiconsIcon icon={Loading03Icon} size={32} className="animate-spin text-indigo-500" />
                            <p className="text-sm">
                                {phase ? PHASE_LABELS[phase] : "기획서를 준비하고 있어요"}
                            </p>
                        </div>
                    )}

                    {markdown && (
                        <div className="prose prose-slate prose-sm max-w-none
                            prose-headings:text-slate-800
                            prose-h1:text-xl prose-h1:font-bold prose-h1:border-b prose-h1:pb-2 prose-h1:mb-4
                            prose-h2:text-lg prose-h2:font-semibold prose-h2:mt-6 prose-h2:mb-3
                            prose-h3:text-base prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-2
                            prose-p:text-slate-600 prose-p:leading-relaxed
                            prose-li:text-slate-600
                            prose-strong:text-slate-800
                            prose-hr:my-4
                        ">
                            <ReactMarkdown>{markdown}</ReactMarkdown>
                        </div>
                    )}

                    {/* Streaming indicator */}
                    {isGenerating && markdown && (
                        <div className="flex items-center gap-2 mt-4 text-indigo-500">
                            <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />
                            <span className="text-xs">
                                {phase ? PHASE_LABELS[phase] : "생성 중..."}
                            </span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {isDone && (
                    <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
                        <p className="text-xs text-slate-400 text-center">
                            AI가 생성한 기획서입니다. 내용을 검토 후 활용해주세요.
                        </p>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
