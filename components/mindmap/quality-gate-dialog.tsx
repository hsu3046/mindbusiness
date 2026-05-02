"use client"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { MindmapNode } from "@/types/mindmap"

interface QualityGateDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    targetLabel: string
    /** AI가 만든 자식 미리보기 — 사용자에게 보여주고 수락/재시도 결정. */
    previewChildren: MindmapNode[]
    /** 0..1. 0이면 "측정 안 됨" 으로 처리. */
    confidence: number
    /** [그대로 추가] — previewChildren 을 그대로 트리에 합류. */
    onAccept: () => void
    /** [다시 시도] — 같은 노드로 expand 재호출. */
    onRetry: () => void
}

export function QualityGateDialog({
    open,
    onOpenChange,
    targetLabel,
    previewChildren,
    confidence,
    onAccept,
    onRetry,
}: QualityGateDialogProps) {
    const childCount = previewChildren.length
    const confidencePct = Math.round(confidence * 100)
    // confidence가 정확히 0이면 AI가 안 채운 것 — "측정 안 됨" 으로 표기
    const showConfidence = confidence > 0

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-slate-900">
                        결과가 빈약합니다
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        &quot;{targetLabel}&quot;에 대한 AI 응답이 충분하지 않아요.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                        <span>
                            자식 노드 <strong className="text-slate-800">{childCount}개</strong>
                        </span>
                        {showConfidence && (
                            <span>
                                · 신뢰도 <strong className="text-slate-800">{confidencePct}%</strong>
                            </span>
                        )}
                    </div>

                    {childCount > 0 && (
                        <div className="rounded-md bg-slate-50 px-3 py-2 max-h-48 overflow-y-auto">
                            <p className="text-xs text-slate-500 mb-1.5">미리보기</p>
                            <ul className="space-y-1">
                                {previewChildren.map((c) => (
                                    <li
                                        key={c.id}
                                        className="text-sm text-slate-700"
                                    >
                                        · {c.label}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {childCount === 0 && (
                        <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-500">
                            AI가 아무 자식도 만들지 못했어요.
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        취소
                    </Button>
                    <Button
                        variant="outline"
                        onClick={onRetry}
                    >
                        다시 시도
                    </Button>
                    {childCount > 0 && (
                        <Button onClick={onAccept}>
                            그대로 추가
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
