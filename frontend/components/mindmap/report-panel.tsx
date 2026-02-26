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
import { generateReport } from "@/lib/api"
import { MindmapNode, ReportRequest } from "@/types/mindmap"

interface ReportPanelProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    rootNode: MindmapNode | null
    topic: string
    frameworkId: string
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
    const contentRef = useRef<HTMLDivElement>(null)

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

    const handleGenerate = useCallback(async () => {
        if (!rootNode) return

        setMarkdown("")
        setIsGenerating(true)
        setIsDone(false)

        const request: ReportRequest = {
            topic,
            framework_id: frameworkId,
            mindmap_tree: rootNode,
            language: "Korean",
        }

        await generateReport(
            request,
            (chunk) => {
                setMarkdown((prev) => prev + chunk)
            },
            () => {
                setIsGenerating(false)
                setIsDone(true)
            },
            (error) => {
                setIsGenerating(false)
                setMarkdown((prev) => prev + `\n\n---\n\n⚠️ 오류 발생: ${error.message}`)
            }
        )
    }, [rootNode, topic, frameworkId])

    // Auto-generate when panel opens
    useEffect(() => {
        if (open && !isGenerating && !isDone && !markdown) {
            handleGenerate()
        }
    }, [open, isGenerating, isDone, markdown, handleGenerate])

    // Reset state when panel closes
    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            setMarkdown("")
            setIsDone(false)
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
                            <p className="text-sm">기획서를 생성하고 있습니다...</p>
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
                            <span className="text-xs">생성 중...</span>
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
