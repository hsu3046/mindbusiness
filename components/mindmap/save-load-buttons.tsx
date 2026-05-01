"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import {
    Download04Icon,
    Upload04Icon,
    ArrowDown01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMindmapStore } from "@/stores/mindmap-store"
import {
    downloadAsFile,
    parseByFilename,
    safeFilename,
    treeToJSON,
    treeToOPML,
} from "@/lib/mindmap-format"
import type { MindmapNode } from "@/types/mindmap"

interface SaveLoadButtonsProps {
    /** Hides the Save dropdown when there's nothing to save (e.g., on the home page). */
    showSave?: boolean
    /** Override the post-load destination. Default: navigate to /map with the loaded topic+framework. */
    onLoadOverride?: (parsed: {
        topic: string
        framework_id: string
        root: MindmapNode
    }) => void
}

/**
 * Save / Load buttons for the mindmap tree.
 *
 * Save → dropdown with OPML / JSON.
 * Load → file picker (auto-detects OPML vs JSON by extension).
 *
 * When loading from the home page, navigates the user to /map. When
 * loading from inside /map (or via `onLoadOverride`) it just swaps the
 * tree in-place via the Zustand store.
 */
export function SaveLoadButtons({
    showSave = true,
    onLoadOverride,
}: SaveLoadButtonsProps) {
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Pull what we need from the store separately so a load can run
    // even when there's no active tree yet (home page case).
    const rootNode = useMindmapStore((s) => s.rootNode)
    const topic = useMindmapStore((s) => s.topic)
    const setRootNode = useMindmapStore((s) => s.setRootNode)
    const setTopic = useMindmapStore((s) => s.setTopic)

    const handleSave = (format: "json" | "opml") => {
        if (!rootNode) {
            toast.error("저장할 마인드맵이 없습니다.")
            return
        }
        // We don't track frameworkId in the store today — recover it from
        // the URL when we're inside /map. Empty → "LOGIC" as a safe default.
        const frameworkId =
            typeof window !== "undefined"
                ? new URL(window.location.href).searchParams.get("framework") || "LOGIC"
                : "LOGIC"
        const labelForFile = topic || rootNode.label || "mindmap"

        const content =
            format === "json"
                ? treeToJSON(labelForFile, frameworkId, rootNode)
                : treeToOPML(labelForFile, frameworkId, rootNode)
        const mime = format === "json" ? "application/json" : "text/xml"
        downloadAsFile(safeFilename(labelForFile, format), content, mime)
        toast.success(`${format.toUpperCase()} 파일로 저장했어요`)
    }

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        // Reset the input so re-uploading the same file still triggers onChange.
        e.target.value = ""
        if (!file) return

        try {
            const content = await file.text()
            const parsed = parseByFilename(file.name, content)
            if (onLoadOverride) {
                onLoadOverride(parsed)
                toast.success("마인드맵을 불러왔어요")
                return
            }
            // Default: load into store + navigate to /map.
            setTopic(parsed.topic)
            setRootNode(parsed.root)
            router.push(
                `/map?topic=${encodeURIComponent(parsed.topic)}&framework=${encodeURIComponent(
                    parsed.framework_id,
                )}&loaded=1`,
            )
            toast.success("마인드맵을 불러왔어요")
        } catch (err) {
            toast.error("파일을 읽을 수 없어요", {
                description: err instanceof Error ? err.message : "알 수 없는 오류",
            })
        }
    }

    return (
        <div className="flex items-center gap-2">
            {showSave && (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-1.5"
                            />
                        }
                    >
                        <HugeiconsIcon icon={Download04Icon} size={16} />
                        <span className="text-sm font-medium">저장</span>
                        <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[180px]">
                        <DropdownMenuItem onClick={() => handleSave("opml")}>
                            <span className="font-mono text-xs text-slate-400">.opml</span>
                            <span className="ml-2 text-sm">다른 도구로 가져가기</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleSave("json")}>
                            <span className="font-mono text-xs text-slate-400">.json</span>
                            <span className="ml-2 text-sm">백업 / 복원용</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5"
            >
                <HugeiconsIcon icon={Upload04Icon} size={16} />
                <span className="text-sm font-medium">불러오기</span>
            </Button>
            <input
                ref={fileInputRef}
                type="file"
                accept=".opml,.json,.xml"
                onChange={handleFileChange}
                className="hidden"
                aria-hidden="true"
            />
        </div>
    )
}
