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
 * The mindmap is auto-persisted to tree-cache on every mutation and
 * surfaces in the home page's "최근 마인드맵" list. The dialog copy
 * names that list so users know where to find the map again — and warns
 * that browser data isn't permanent (Safari ITP wipes after 7 days, any
 * browser may evict under storage pressure), nudging them toward the
 * download button for anything important.
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
                <span className="text-sm font-medium">메인으로</span>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-white">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-slate-900">
                        메인으로 돌아갈까요?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-slate-500 break-keep leading-relaxed">
                        지금까지 작성한 아이디어는 <strong>최근 아이디어 리스트</strong>
                        에서 다시 열 수 있어요.
                        <br />
                        브라우저에 저장되는 방식이라 데이터가 정리되거나 1주일 이상
                        접속하지 않으면 사라질 수 있으니, 중요한 아이디어는{" "}
                        <strong>다운로드 버튼</strong>으로 백업해 두세요.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel className="min-w-[100px]">
                        취소
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={() => router.push("/")}
                        className="min-w-[160px]"
                    >
                        메인으로
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
