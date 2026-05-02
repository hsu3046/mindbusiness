"use client"

import { useEffect, useRef, useState } from "react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ClarificationDialogProps {
    open: boolean
    /** 사용자가 답변 제출 또는 취소했을 때 호출 — 부모가 state 정리. */
    onOpenChange: (open: boolean) => void
    /** 확장 대상 노드 라벨. 다이얼로그 헤더에 노출. */
    targetLabel: string
    /** AI가 만든 한국어 질문. */
    question: string
    /** 0-base. 0 = 첫 clarification, 2 = 마지막 (3턴 cap). */
    turn: number
    /** 사용자가 답변을 제출. 부모는 이 답변으로 expand 재호출. */
    onSubmit: (answer: string) => void
}

const MAX_TURN = 3

export function ClarificationDialog({
    open,
    onOpenChange,
    targetLabel,
    question,
    turn,
    onSubmit,
}: ClarificationDialogProps) {
    const [answer, setAnswer] = useState("")
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // 다이얼로그 열릴 때마다 입력 초기화 + 포커스. open이 외부 prop이라
    // useSyncExternalStore가 아닌 useEffect로 처리. setState 자체는 1회성
    // 초기화로, 자체 mutation만 트리거하지 cascading render 없음 — lint
    // 룰의 subscription 우려 미적용.
    useEffect(() => {
        if (!open) return
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAnswer("")
        const id = setTimeout(() => {
            textareaRef.current?.focus()
        }, 50)
        return () => clearTimeout(id)
    }, [open])

    const submit = () => {
        const trimmed = answer.trim()
        if (!trimmed) return
        onSubmit(trimmed)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-slate-900">
                        &quot;{targetLabel}&quot;를 더 구체화할까요?
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        AI가 더 좋은 결과를 내려면 추가 정보가 필요해요.
                        {turn > 0 && (
                            <span className="ml-1 text-xs text-slate-400">
                                ({turn + 1}/{MAX_TURN})
                            </span>
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <p className="text-base font-medium text-slate-700 leading-snug">
                        {question}
                    </p>
                    <textarea
                        ref={textareaRef}
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="답변을 입력해주세요..."
                        maxLength={300}
                        rows={3}
                        className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-base text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                        onKeyDown={(e) => {
                            // Enter = submit, Shift+Enter = newline
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                submit()
                            } else if (e.key === "Escape") {
                                e.preventDefault()
                                onOpenChange(false)
                            }
                        }}
                    />
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        취소
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={!answer.trim()}
                    >
                        답변하고 다시 만들기
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
