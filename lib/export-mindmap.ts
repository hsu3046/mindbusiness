/**
 * Mindmap → SVG export (Phase 1 of vector export).
 *
 * Reuses `calculateD3Layout` to get the same x/y positions and bezier edges
 * the canvas renders, then composes an inline SVG. Output is a single self-
 * contained string — no external assets, no images. Korean labels rely on
 * system / browser font fallback (Pretendard if installed, else sans-serif).
 *
 * For true cross-tool font fidelity (PDF with embedded Pretendard) see
 * `export-mindmap-pdf.ts` — bypasses svg2pdf and renders directly via jsPDF
 * primitives so Korean is selectable + visually correct.
 */

import { calculateD3Layout } from '@/lib/d3-layout'
import { getCachedWidth } from '@/lib/d3-layout'
import type { MindmapNode } from '@/types/mindmap'

// 캔버스 노드 내부 패딩 — Tailwind `px-4 py-3` 와 일치.
const NODE_PADDING_X = 16
const NODE_PADDING_Y = 12
// `leading-snug` ≈ 1.375. 라벨 줄바꿈 시 줄 높이.
const LINE_HEIGHT_RATIO = 1.375
// 캔버스의 라벨 span `max-w-[280px]` — 이 폭을 넘으면 줄바꿈 발생.
const LABEL_MAX_WIDTH = 280
// SVG viewBox 의 outer padding.
const PADDING = 80

export interface ExportNodeStyle {
    fill: string
    textColor: string
    strokeColor: string
    strokeWidth: number
}

/**
 * Mirrors `getLevelStyle` in mindmap-canvas. Kept separate to avoid coupling
 * the canvas component to export.
 */
function getExportStyle(level: number): ExportNodeStyle {
    if (level === 0) return { fill: '#1e293b', textColor: '#ffffff', strokeColor: 'transparent', strokeWidth: 0 }
    if (level === 1) return { fill: '#475569', textColor: '#ffffff', strokeColor: 'transparent', strokeWidth: 0 }
    if (level === 2) return { fill: '#94a3b8', textColor: '#ffffff', strokeColor: 'transparent', strokeWidth: 0 }
    if (level === 3) return { fill: '#cbd5e1', textColor: '#1e293b', strokeColor: 'transparent', strokeWidth: 0 }
    if (level === 4) return { fill: '#e2e8f0', textColor: '#334155', strokeColor: 'transparent', strokeWidth: 0 }
    // L5+: border-only nodes
    let bw: number
    if (level === 5) bw = 3
    else if (level === 6) bw = 2
    else if (level === 7) bw = 1.5
    else bw = 1
    return { fill: 'transparent', textColor: '#475569', strokeColor: '#64748b', strokeWidth: bw }
}

/** Escape XML special characters in label text. */
function xmlEscape(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
}

/**
 * 한 글자의 추정 너비 (px). 캔버스의 calculateWidth 와 동일한 휴리스틱:
 * 한글/CJK = 1em, ASCII/라틴 = 0.55em.
 */
function charWidth(ch: string, fontSize: number): number {
    const code = ch.charCodeAt(0)
    if ((code >= 0xAC00 && code <= 0xD7AF) || (code >= 0x4E00 && code <= 0x9FFF)) {
        return fontSize  // Korean syllable / CJK ideograph
    }
    return fontSize * 0.55  // ASCII / Latin
}

/**
 * 라벨을 maxLineWidth 안에 들어가도록 그리디 줄바꿈. break-words 처럼
 * 단어 경계 없이 글자 단위로 자른다 — 한국어 라벨에 적합.
 */
function wrapLabel(label: string, maxLineWidth: number, fontSize: number): string[] {
    const lines: string[] = []
    let currentLine = ''
    let currentWidth = 0
    for (const ch of label) {
        const w = charWidth(ch, fontSize)
        // \n 은 명시적 줄바꿈
        if (ch === '\n') {
            lines.push(currentLine)
            currentLine = ''
            currentWidth = 0
            continue
        }
        if (currentWidth + w > maxLineWidth && currentLine) {
            lines.push(currentLine)
            currentLine = ch
            currentWidth = w
        } else {
            currentLine += ch
            currentWidth += w
        }
    }
    if (currentLine) lines.push(currentLine)
    return lines.length > 0 ? lines : ['']
}

/**
 * Build a single bezier path between two node centers, matching React Flow's
 * default horizontal bezier shape.
 */
function bezierPath(sx: number, sy: number, tx: number, ty: number): string {
    const dx = tx - sx
    const cx1 = sx + dx * 0.5
    const cy1 = sy
    const cx2 = tx - dx * 0.5
    const cy2 = ty
    return `M ${sx},${sy} C ${cx1},${cy1} ${cx2},${cy2} ${tx},${ty}`
}

export interface PositionedNode {
    id: string
    x: number
    y: number
    width: number
    height: number
    level: number
    side: 'left' | 'right' | 'center'
    label: string
    labelLines: string[]  // 줄바꿈 후 라인들
    fontSize: number
}

/**
 * Convert React Flow node objects from `calculateD3Layout` into a flat list
 * with width/height resolved, label extracted, and label pre-wrapped to
 * multiple lines so the SVG box can size to fit the actual content.
 */
function flattenNodes(rfNodes: ReadonlyArray<{ id: string; position: { x: number; y: number }; data: Record<string, unknown> }>): PositionedNode[] {
    return rfNodes.map((n) => {
        const data = n.data as { label?: string; level?: number; side?: 'left' | 'right' | 'center'; node?: { id: string; label: string } }
        const level = data.level ?? 0
        const isRoot = level === 0
        const labelRaw = (data.label ?? data.node?.label ?? '').trim()
        const label = labelRaw || '(빈 아이디어)'
        const fontSize = isRoot ? 16 : 14
        const layoutWidth = getCachedWidth(n.id, label, isRoot)

        // 라벨이 wrap될 수 있는 max width: 캔버스의 label span max-w-[280px] 와 동일.
        // 그러나 layout이 더 좁은 폭(짧은 라벨)을 줬다면 그걸 따름.
        const labelMaxWidth = Math.min(LABEL_MAX_WIDTH, layoutWidth - NODE_PADDING_X * 2)
        const labelLines = wrapLabel(label, labelMaxWidth, fontSize)

        // 노드 너비: 줄바꿈 후 라벨이 차지하는 실제 너비 + 패딩. 짧은 라벨은
        // 좁은 노드, 긴 라벨은 max(280)+padding=312 까지. 단, layout이 잡은
        // layoutWidth 보다 좁아지지 않도록(엣지 끝점이 layoutWidth 기준)
        // max() 로 하한 잠금.
        let widestLine = 0
        for (const line of labelLines) {
            let lineWidth = 0
            for (const ch of line) lineWidth += charWidth(ch, fontSize)
            if (lineWidth > widestLine) widestLine = lineWidth
        }
        const contentWidth = Math.min(widestLine, labelMaxWidth)
        const visualWidth = Math.max(contentWidth + NODE_PADDING_X * 2, layoutWidth)

        // 높이: 라인 개수 기반 + py-3 패딩.
        const lineHeight = fontSize * LINE_HEIGHT_RATIO
        const visualHeight = labelLines.length * lineHeight + NODE_PADDING_Y * 2

        return {
            id: n.id,
            x: n.position.x,
            y: n.position.y,
            width: visualWidth,
            height: visualHeight,
            level,
            side: data.side ?? 'center',
            label,
            labelLines,
            fontSize,
        }
    })
}

/**
 * Build a fully resolved layout model (positions, sizes, label lines, edge
 * endpoints) — the raw shape SVG / PDF renderers both consume.
 *
 * Exporting this lets the PDF path bypass svg2pdf font matching entirely
 * and call jsPDF primitives directly with our own Pretendard.
 */
export interface ExportEdge {
    sourceId: string
    targetId: string
    sx: number
    sy: number
    tx: number
    ty: number
}

export interface ExportModel {
    nodes: PositionedNode[]
    edges: ExportEdge[]
    viewBox: { x: number; y: number; width: number; height: number }
}

export function buildExportModel(rootNode: MindmapNode): ExportModel {
    const result = calculateD3Layout(rootNode, () => {})
    const nodes = flattenNodes(result.nodes)
    const nodeById = new Map<string, PositionedNode>(nodes.map((n) => [n.id, n]))

    // Bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
        minX = Math.min(minX, n.x)
        minY = Math.min(minY, n.y)
        maxX = Math.max(maxX, n.x + n.width)
        maxY = Math.max(maxY, n.y + n.height)
    }
    if (!isFinite(minX)) {
        return {
            nodes: [],
            edges: [],
            viewBox: { x: 0, y: 0, width: 100, height: 100 },
        }
    }

    // Edges with resolved endpoints
    const edges: ExportEdge[] = []
    for (const e of result.edges) {
        const src = nodeById.get(e.source)
        const tgt = nodeById.get(e.target)
        if (!src || !tgt) continue
        const childSide = tgt.side
        let sx: number, sy: number, tx: number, ty: number
        if (childSide === 'right') {
            sx = src.x + src.width
            sy = src.y + src.height / 2
            tx = tgt.x
            ty = tgt.y + tgt.height / 2
        } else if (childSide === 'left') {
            sx = src.x
            sy = src.y + src.height / 2
            tx = tgt.x + tgt.width
            ty = tgt.y + tgt.height / 2
        } else {
            sx = src.x + src.width / 2
            sy = src.y + src.height / 2
            tx = tgt.x + tgt.width / 2
            ty = tgt.y + tgt.height / 2
        }
        edges.push({ sourceId: e.source, targetId: e.target, sx, sy, tx, ty })
    }

    return {
        nodes,
        edges,
        viewBox: {
            x: minX - PADDING,
            y: minY - PADDING,
            width: (maxX - minX) + PADDING * 2,
            height: (maxY - minY) + PADDING * 2,
        },
    }
}

/** Mirror of getExportStyle for external use (PDF renderer). */
export function getExportLevelStyle(level: number): ExportNodeStyle {
    return getExportStyle(level)
}

/**
 * Build the SVG document as a string.
 */
export function treeToSVG(rootNode: MindmapNode): string {
    // Layout — onExpand is unused in pure-data path
    const result = calculateD3Layout(rootNode, () => {})
    const nodes = flattenNodes(result.nodes)

    // Map for fast position lookup by id (edges reference ids)
    const nodeById = new Map<string, PositionedNode>(nodes.map((n) => [n.id, n]))

    // Bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of nodes) {
        minX = Math.min(minX, n.x)
        minY = Math.min(minY, n.y)
        maxX = Math.max(maxX, n.x + n.width)
        maxY = Math.max(maxY, n.y + n.height)
    }
    if (!isFinite(minX)) {
        // No nodes — empty SVG
        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"></svg>`
    }
    const vbX = minX - PADDING
    const vbY = minY - PADDING
    const vbW = (maxX - minX) + PADDING * 2
    const vbH = (maxY - minY) + PADDING * 2

    // ─── Edges (bezier paths) ─────────────────────────────────────────────
    const edgeSvg: string[] = []
    for (const edge of result.edges) {
        const src = nodeById.get(edge.source)
        const tgt = nodeById.get(edge.target)
        if (!src || !tgt) continue

        // Determine which sides the edge attaches to. Right children: source's
        // right edge → target's left edge. Left children: source's left → target's
        // right. Root → child uses the child's side.
        const childSide = tgt.side
        let sx: number, sy: number, tx: number, ty: number
        if (childSide === 'right') {
            sx = src.x + src.width
            sy = src.y + src.height / 2
            tx = tgt.x
            ty = tgt.y + tgt.height / 2
        } else if (childSide === 'left') {
            sx = src.x
            sy = src.y + src.height / 2
            tx = tgt.x + tgt.width
            ty = tgt.y + tgt.height / 2
        } else {
            // Fallback — straight line center to center
            sx = src.x + src.width / 2
            sy = src.y + src.height / 2
            tx = tgt.x + tgt.width / 2
            ty = tgt.y + tgt.height / 2
        }

        edgeSvg.push(
            `<path d="${bezierPath(sx, sy, tx, ty)}" fill="none" stroke="#cbd5e1" stroke-width="1.5" />`,
        )
    }

    // ─── Nodes (rect + multi-line text) ───────────────────────────────────
    const nodeSvg: string[] = []
    for (const n of nodes) {
        const style = getExportStyle(n.level)
        const radius = 9
        const fontWeight = 600
        const lineHeight = n.fontSize * LINE_HEIGHT_RATIO

        const rect =
            style.strokeWidth > 0
                ? `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${radius}" ry="${radius}" fill="${style.fill}" stroke="${style.strokeColor}" stroke-width="${style.strokeWidth}" />`
                : `<rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${radius}" ry="${radius}" fill="${style.fill}" />`

        // Text — multi-line via <tspan>. 첫 라인의 y는 노드 상단 + py-3 패딩
        // 으로 잡고, 이후 라인은 dy=lineHeight 로 누적. dominant-baseline=
        // hanging 으로 y 가 라인의 top 으로 해석되도록.
        const cx = n.x + n.width / 2
        const firstLineTop = n.y + NODE_PADDING_Y + (lineHeight * 0.15)  // 미세 baseline 보정

        const tspans = n.labelLines
            .map((line, i) => {
                const dy = i === 0 ? '0' : `${lineHeight}`
                return `<tspan x="${cx}" dy="${dy}">${xmlEscape(line)}</tspan>`
            })
            .join('')

        const text = `<text x="${cx}" y="${firstLineTop}" text-anchor="middle" dominant-baseline="hanging" font-size="${n.fontSize}" font-weight="${fontWeight}" fill="${style.textColor}">${tspans}</text>`

        nodeSvg.push(rect + text)
    }

    // Assemble
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" font-family="Pretendard, 'Apple SD Gothic Neo', system-ui, -apple-system, sans-serif">
  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#ffffff" />
  <g class="edges">
    ${edgeSvg.join('\n    ')}
  </g>
  <g class="nodes">
    ${nodeSvg.join('\n    ')}
  </g>
</svg>`
}

/**
 * Trigger a browser download of the SVG.
 */
export function downloadAsSVG(rootNode: MindmapNode, filename: string): void {
    const svg = treeToSVG(rootNode)
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.svg') ? filename : `${filename}.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
