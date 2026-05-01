/**
 * Mindmap export / import — JSON (lossless) + OPML 2.0 (interoperable).
 *
 * JSON keeps every field of MindmapNode round-trip safe; OPML stores our
 * custom fields as `_`-prefixed user attributes on `<outline>` elements,
 * which is allowed by the OPML 2.0 spec and lets a re-import recover the
 * full tree even if a third-party tool round-trips through the same file.
 *
 * The exported envelope is versioned (`version: 1`) so future schema
 * changes can be migrated safely.
 */

import type { MindmapNode } from "@/types/mindmap"

interface MindmapExportEnvelope {
    version: 1
    topic: string
    framework_id: string
    exported_at: string
    root: MindmapNode
}

export interface ParsedMindmap {
    topic: string
    framework_id: string
    root: MindmapNode
}

// ── JSON ────────────────────────────────────────────────────────────────────

export function treeToJSON(topic: string, frameworkId: string, root: MindmapNode): string {
    const env: MindmapExportEnvelope = {
        version: 1,
        topic,
        framework_id: frameworkId,
        exported_at: new Date().toISOString(),
        root,
    }
    return JSON.stringify(env, null, 2)
}

export function jsonToTree(content: string): ParsedMindmap {
    let parsed: unknown
    try {
        parsed = JSON.parse(content)
    } catch (err) {
        throw new Error(`JSON 파싱 실패: ${err instanceof Error ? err.message : "알 수 없는 오류"}`)
    }
    if (typeof parsed !== "object" || parsed === null) {
        throw new Error("올바른 JSON 마인드맵 파일이 아닙니다.")
    }
    const env = parsed as Partial<MindmapExportEnvelope>
    if (env.version !== 1) {
        throw new Error(`지원하지 않는 파일 버전: ${env.version}`)
    }
    if (!env.root || !env.root.id || env.root.label === undefined) {
        throw new Error("최상위 아이디어 정보가 없습니다.")
    }
    return {
        topic: env.topic ?? "불러온 마인드맵",
        framework_id: env.framework_id ?? "LOGIC",
        root: env.root,
    }
}

// ── OPML 2.0 ────────────────────────────────────────────────────────────────
// Standard <head>/<title>/<dateCreated> only. Our domain fields ride on
// `<outline>` user attributes (prefixed `_` per OPML 2.0 convention for
// implementation-specific data).

const xmlEscape = (s: string): string =>
    s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")

export function treeToOPML(topic: string, frameworkId: string, root: MindmapNode): string {
    const renderNode = (node: MindmapNode, indent: string): string => {
        const attrs: string[] = [`text="${xmlEscape(node.label || "")}"`]
        attrs.push(`_id="${xmlEscape(node.id)}"`)
        if (node.type) attrs.push(`_type="${xmlEscape(node.type)}"`)
        if (node.description) attrs.push(`_description="${xmlEscape(node.description)}"`)
        if (node.semantic_type) attrs.push(`_semantic_type="${xmlEscape(node.semantic_type)}"`)
        if (typeof node.importance === "number") attrs.push(`_importance="${node.importance}"`)

        const children = node.children ?? []
        if (children.length === 0) {
            return `${indent}<outline ${attrs.join(" ")}/>`
        }
        const childXml = children.map((c) => renderNode(c, indent + "  ")).join("\n")
        return `${indent}<outline ${attrs.join(" ")}>\n${childXml}\n${indent}</outline>`
    }

    // The framework_id rides on the root outline as a user attribute so
    // the OPML head stays spec-compliant (head only takes standard fields).
    // _export_version is the migration anchor for future schema changes —
    // opmlToTree() can branch on it the way the JSON envelope used to.
    const rootAttrs: string[] = [
        `text="${xmlEscape(root.label || topic)}"`,
        `_id="${xmlEscape(root.id)}"`,
        `_framework_id="${xmlEscape(frameworkId)}"`,
        `_topic="${xmlEscape(topic)}"`,
        `_export_version="1"`,
    ]
    if (root.type) rootAttrs.push(`_type="${xmlEscape(root.type)}"`)
    if (root.description) rootAttrs.push(`_description="${xmlEscape(root.description)}"`)
    if (root.semantic_type) rootAttrs.push(`_semantic_type="${xmlEscape(root.semantic_type)}"`)
    if (typeof root.importance === "number") rootAttrs.push(`_importance="${root.importance}"`)

    const children = root.children ?? []
    const rootEl =
        children.length === 0
            ? `    <outline ${rootAttrs.join(" ")}/>`
            : `    <outline ${rootAttrs.join(" ")}>\n${children
                  .map((c) => renderNode(c, "      "))
                  .join("\n")}\n    </outline>`

    return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${xmlEscape(topic)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${rootEl}
  </body>
</opml>
`
}

export function opmlToTree(content: string): ParsedMindmap {
    if (typeof window === "undefined") {
        throw new Error("OPML 파싱은 브라우저에서만 지원됩니다.")
    }
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, "application/xml")
    const parserError = doc.querySelector("parsererror")
    if (parserError) {
        throw new Error("올바른 OPML(XML) 파일이 아닙니다.")
    }

    const head = doc.querySelector("head")
    const titleFromHead = head?.querySelector("title")?.textContent?.trim() || ""

    const body = doc.querySelector("body")
    if (!body) throw new Error("OPML body 태그가 없습니다.")

    // The first `<outline>` inside <body> is treated as the root.
    const rootEl = body.querySelector(":scope > outline")
    if (!rootEl) throw new Error("OPML에 outline 요소가 없습니다.")

    // Recover topic + framework_id either from root attributes (our format)
    // or fall back to head <title> + LOGIC (OPML from another tool).
    const topic = rootEl.getAttribute("_topic") || titleFromHead || "불러온 마인드맵"
    const framework_id = rootEl.getAttribute("_framework_id") || "LOGIC"

    let counter = 0
    const fallbackId = () => `imported-${Date.now()}-${counter++}`

    const parseNode = (el: Element): MindmapNode => {
        const importanceRaw = el.getAttribute("_importance")
        const importance = importanceRaw ? Number(importanceRaw) : undefined
        const semanticTypeAttr = el.getAttribute("_semantic_type")

        const node: MindmapNode = {
            id: el.getAttribute("_id") || fallbackId(),
            label: el.getAttribute("text") || "",
            type: el.getAttribute("_type") || "default",
            children: [],
        }
        const desc = el.getAttribute("_description")
        if (desc) node.description = desc
        if (semanticTypeAttr) {
            // Cast through the union — OPML may carry an unknown value if hand-edited;
            // we accept whatever string is there since downstream code tolerates it.
            node.semantic_type = semanticTypeAttr as MindmapNode["semantic_type"]
        }
        if (importance !== undefined && Number.isFinite(importance)) {
            const clamped = Math.max(1, Math.min(5, Math.round(importance)))
            node.importance = clamped as MindmapNode["importance"]
        }
        const childOutlines = Array.from(el.children).filter((c) => c.tagName === "outline")
        node.children = childOutlines.map(parseNode)
        return node
    }

    return { topic, framework_id, root: parseNode(rootEl) }
}

// ── File helpers ────────────────────────────────────────────────────────────

export function downloadAsFile(filename: string, content: string, mime: string): void {
    if (typeof window === "undefined") return
    const blob = new Blob([content], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

/** Pick parser based on filename extension. Falls back to JSON. */
export function parseByFilename(filename: string, content: string): ParsedMindmap {
    const lower = filename.toLowerCase()
    if (lower.endsWith(".opml") || lower.endsWith(".xml")) {
        return opmlToTree(content)
    }
    return jsonToTree(content)
}

/** Sanitize a label for use as a download filename. */
export function safeFilename(label: string, ext: string): string {
    const cleaned = label
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 80)
    return `${cleaned || "mindmap"}.${ext}`
}
