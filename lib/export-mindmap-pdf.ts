/**
 * Mindmap → PDF (vector) export — Phase 2 (rev 2).
 *
 * 직접 jsPDF 그리기 — svg2pdf 의 한글 font matching 이슈를 우회. 우리 layout
 * 모델(buildExportModel)을 그대로 jsPDF.rect / lines / text 로 그림.
 *
 * 폰트 임베딩 흐름:
 *   1. /fonts/Pretendard-Regular.ttf (static, 2.9 MB) lazy fetch + base64
 *   2. addFileToVFS + addFont('Pretendard') 등록
 *   3. setFont('Pretendard') 활성화
 *   4. text() 가 한글 cmap 으로 정상 렌더 + selectable
 *
 * 폰트 등록/임베딩 실패 시 graceful fallback — Helvetica 로 진행.
 * 텍스트는 그대로 PDF 안에 텍스트로 남아 selectable / searchable.
 */

import type { MindmapNode } from '@/types/mindmap'
import {
    buildExportModel,
    getExportLevelStyle,
    type PositionedNode,
} from '@/lib/export-mindmap'

const FONT_URL = '/fonts/Pretendard-Regular.ttf'
const FONT_NAME = 'Pretendard'
const FONT_FILENAME = 'Pretendard-Regular.ttf'

// 폰트 base64 모듈 캐시 — 한 세션에서 한 번만 fetch.
let _fontBase64Cache: string | null = null

async function loadPretendardBase64(): Promise<string> {
    if (_fontBase64Cache) return _fontBase64Cache
    const res = await fetch(FONT_URL)
    if (!res.ok) {
        throw new Error(`Pretendard 폰트를 다운로드할 수 없어요 (${res.status})`)
    }
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    const chunkSize = 0x8000
    let binary = ''
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(
            null,
            // @ts-expect-error — Uint8Array slice is fine for fromCharCode
            bytes.subarray(i, i + chunkSize),
        )
    }
    _fontBase64Cache = btoa(binary)
    return _fontBase64Cache
}

// VB → mm 변환 비율. 약 0.35mm/unit (= ~100dpi) — 큰 트리도 한 페이지에.
const SCALE = 0.35
const LINE_HEIGHT_RATIO = 1.375

// jsPDF.rect/lines/text 의 좌표 시스템과 mm 단위 변환 유틸
type Pdf = import('jspdf').jsPDF

function vb2mm(v: number): number {
    return v * SCALE
}

/**
 * 노드 본체 (rect or stroke-only) 를 그림.
 */
function drawNode(pdf: Pdf, node: PositionedNode, originX: number, originY: number): void {
    const style = getExportLevelStyle(node.level)
    const x = vb2mm(node.x - originX)
    const y = vb2mm(node.y - originY)
    const w = vb2mm(node.width)
    const h = vb2mm(node.height)
    const r = vb2mm(9)

    if (style.strokeWidth > 0) {
        // Border-only (L5+)
        pdf.setDrawColor(style.strokeColor)
        pdf.setLineWidth(vb2mm(style.strokeWidth))
        pdf.roundedRect(x, y, w, h, r, r, 'S')  // stroke only
    } else if (style.fill !== 'transparent') {
        // Fill (L0-L4)
        pdf.setFillColor(style.fill)
        pdf.roundedRect(x, y, w, h, r, r, 'F')  // fill only
    }
}

/**
 * Bezier edge — jsPDF 가 직접 cubic bezier 지원. lines() 는 한 시작점에서
 * 여러 베지어를 이어 그리는 API.
 */
function drawEdge(
    pdf: Pdf,
    sx: number, sy: number, tx: number, ty: number,
    originX: number, originY: number,
): void {
    const x1 = vb2mm(sx - originX)
    const y1 = vb2mm(sy - originY)
    const x2 = vb2mm(tx - originX)
    const y2 = vb2mm(ty - originY)
    const dx = x2 - x1
    // Control point 50% offset — React Flow default bezier 와 동일
    const c1x = x1 + dx * 0.5
    const c1y = y1
    const c2x = x2 - dx * 0.5
    const c2y = y2

    pdf.setDrawColor('#cbd5e1')
    pdf.setLineWidth(vb2mm(1.5))
    // jsPDF.lines(linesArr, startX, startY, scale, style, closed)
    // lines: [[c1x-x1, c1y-y1, c2x-x1, c2y-y1, x2-x1, y2-y1]] for one bezier
    pdf.lines(
        [[c1x - x1, c1y - y1, c2x - x1, c2y - y1, x2 - x1, y2 - y1]],
        x1, y1, [1, 1], 'S', false,
    )
}

/**
 * 노드의 라벨을 multi-line tspan 처럼 그림. 캔버스의 leading-snug + py-3
 * 패딩을 미러.
 */
function drawNodeText(
    pdf: Pdf,
    node: PositionedNode,
    originX: number, originY: number,
    fontReady: boolean,
): void {
    const style = getExportLevelStyle(node.level)
    pdf.setTextColor(style.textColor)
    pdf.setFontSize(node.fontSize * SCALE * 2.83)  // mm → pt: 1mm ≈ 2.83pt

    // 폰트 활성화 — fontReady 가 true 면 Pretendard, 아니면 default(Helvetica).
    if (fontReady) {
        pdf.setFont(FONT_NAME, 'normal')
    }

    const lineHeightMm = vb2mm(node.fontSize * LINE_HEIGHT_RATIO)
    // 노드 내부 패딩 12 (py-3) → mm
    const paddingTop = vb2mm(12)
    // 첫 라인 baseline (jsPDF text 는 baseline 기준)
    // baseline ≈ top + 라인높이 * 0.78 (대략)
    const firstBaselineY = vb2mm(node.y - originY) + paddingTop + lineHeightMm * 0.78
    const cx = vb2mm(node.x - originX) + vb2mm(node.width) / 2

    node.labelLines.forEach((line, i) => {
        const ly = firstBaselineY + i * lineHeightMm
        pdf.text(line, cx, ly, { align: 'center' })
    })
}

/**
 * 메인 — PDF 생성 + 다운로드.
 */
export async function downloadAsPDF(rootNode: MindmapNode, filename: string): Promise<void> {
    const { jsPDF } = await import('jspdf')
    const model = buildExportModel(rootNode)

    const pageW = vb2mm(model.viewBox.width)
    const pageH = vb2mm(model.viewBox.height)
    const orientation = pageW >= pageH ? 'landscape' : 'portrait'

    const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: [pageW, pageH],
        compress: true,
    })

    // 폰트 임베딩 — 실패해도 진행 (Helvetica 폴백, 한글은 깨지지만 텍스트는
    // 텍스트로 유지돼 selectable / searchable).
    let fontReady = false
    try {
        const fontBase64 = await loadPretendardBase64()
        pdf.addFileToVFS(FONT_FILENAME, fontBase64)
        pdf.addFont(FONT_FILENAME, FONT_NAME, 'normal')
        if (pdf.getFontList()[FONT_NAME]) {
            pdf.setFont(FONT_NAME, 'normal')
            fontReady = true
        }
    } catch (err) {
        console.warn('[export-pdf] font embed skipped:', err)
    }

    // 흰 배경 (인쇄용)
    pdf.setFillColor('#ffffff')
    pdf.rect(0, 0, pageW, pageH, 'F')

    const ox = model.viewBox.x
    const oy = model.viewBox.y

    // Edges (먼저 그려서 노드 뒤에 깔림)
    for (const e of model.edges) {
        drawEdge(pdf, e.sx, e.sy, e.tx, e.ty, ox, oy)
    }

    // Nodes — body 먼저, text 나중 (text가 위에 보이도록)
    for (const n of model.nodes) {
        drawNode(pdf, n, ox, oy)
    }
    for (const n of model.nodes) {
        drawNodeText(pdf, n, ox, oy, fontReady)
    }

    // 다운로드
    const blob = pdf.output('blob') as Blob
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
