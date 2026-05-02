"use client"

import { useRef } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { HugeiconsIcon } from "@hugeicons/react"
import { Download04Icon, Upload04Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import { useMindmapStore } from "@/stores/mindmap-store"
import { generateMindmapId } from "@/lib/tree-cache"
import {
    downloadAsFile,
    parseByFilename,
    safeFilename,
    treeToOPML,
} from "@/lib/mindmap-format"
import type { MindmapNode } from "@/types/mindmap"

interface SaveLoadButtonsProps {
    /** Hides the Save button when there's nothing to save (e.g., on the home page). */
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
 * Save → downloads an OPML file (lossless via `_`-prefix user attributes;
 *        also opens cleanly in third-party mindmap apps).
 * Load → file picker; auto-detects by extension and still accepts legacy
 *        JSON exports for backward-compat.
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
    const setMindmapId = useMindmapStore((s) => s.setMindmapId)
    const setFrameworkId = useMindmapStore((s) => s.setFrameworkId)

    const handleSave = () => {
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

        // OPML round-trips every MindmapNode field via `_`-prefix user
        // attributes, so a single format covers both interop with other
        // mindmap apps and re-import into this one — no need to make the
        // user pick.
        const content = treeToOPML(labelForFile, frameworkId, rootNode)
        downloadAsFile(safeFilename(labelForFile, "opml"), content, "text/xml")
        toast.success("마인드맵을 저장했어요")
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
            // Default: assign a fresh id, seed store, navigate to /map?id=.
            // setRootNode triggers persistTree() which writes the imported
            // tree to localStorage under the new id, so a refresh on the
            // /map page will recover it from cache. Order matters: set the
            // framework + topic first so the persistTree() inside
            // setRootNode picks them up and the recent-maps list renders
            // the correct framework badge / re-open URL.
            const newId = generateMindmapId()
            setMindmapId(newId)
            setFrameworkId(parsed.framework_id)
            setTopic(parsed.topic)
            setRootNode(parsed.root)
            router.push(
                `/map?id=${newId}&framework=${encodeURIComponent(
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
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSave}
                    className="flex items-center gap-1.5"
                >
                    <HugeiconsIcon icon={Download04Icon} size={16} />
                    <span className="text-sm font-medium">저장하기</span>
                </Button>
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
