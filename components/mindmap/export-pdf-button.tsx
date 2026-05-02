"use client"

import { useState } from "react"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { File02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { useMindmapStore } from "@/stores/mindmap-store"
import { safeFilename } from "@/lib/mindmap-format"

/**
 * Export the current mindmap as a vector PDF with embedded Pretendard.
 *
 * Heavy bits (jspdf + 2.9MB Pretendard TTF) are dynamic-imported on
 * click so they don't bloat the initial bundle. First click downloads the
 * font (browser-cached afterward); subsequent clicks reuse the cache.
 */
export function ExportPdfButton() {
    const rootNode = useMindmapStore((s) => s.rootNode)
    const topic = useMindmapStore((s) => s.topic)
    const [busy, setBusy] = useState(false)

    const handleClick = async () => {
        if (!rootNode) {
            toast.error("저장할 마인드맵이 없어요.")
            return
        }
        if (busy) return
        setBusy(true)
        const t = toast.loading("PDF 생성 중...")
        try {
            const { downloadAsPDF } = await import("@/lib/export-mindmap-pdf")
            const labelForFile = topic || rootNode.label || "mindmap"
            await downloadAsPDF(rootNode, safeFilename(labelForFile, "pdf"))
            toast.success("PDF로 저장되었어요.", { id: t })
        } catch (err) {
            console.error(err)
            toast.error("PDF 저장 실패", {
                id: t,
                description: err instanceof Error ? err.message : "알 수 없는 오류",
            })
        } finally {
            setBusy(false)
        }
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={busy}
            title="PDF (벡터, 한글 임베딩) 로 저장"
            className="flex items-center gap-1.5"
        >
            <HugeiconsIcon icon={File02Icon} size={16} />
            <span className="text-sm">PDF 저장</span>
        </Button>
    )
}
