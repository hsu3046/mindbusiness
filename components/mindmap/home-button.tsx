"use client"

import { useRouter } from "next/navigation"
import { HugeiconsIcon } from "@hugeicons/react"
import { Home01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

/**
 * Home / back-to-main button with a confirmation step.
 *
 * The mindmap is auto-persisted to tree-cache on every mutation, so going
 * back doesn't actually lose anything — the dialog copy says so explicitly
 * to keep the user from feeling like they need to "save first".
 */
export function HomeButton() {
    const router = useRouter()

    return (
        <AlertDialog>
            <AlertDialogTrigger
                render={
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1.5"
                        title="메인으로"
                    />
                }
            >
                <HugeiconsIcon icon={Home01Icon} size={16} />
                <span className="text-sm font-medium">메인</span>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-white">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-slate-900">
                        메인으로 돌아갈까요?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-500 break-keep leading-relaxed">
                        지금까지 작성한 마인드맵은 자동으로 저장되어, 같은 주제로 다시 들어오면
                        이어서 편집할 수 있어요. 다른 곳에서도 보관하려면 우상단 <strong>저장</strong>{" "}
                        버튼으로 OPML/JSON 파일을 받아두는 걸 권장해요.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction onClick={() => router.push("/")}>
                        메인으로
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
