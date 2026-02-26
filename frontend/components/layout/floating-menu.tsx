"use client"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { HugeiconsIcon } from '@hugeicons/react'
import { Download01Icon, Clock01Icon, Settings01Icon, Login01Icon, Moon01Icon, Sun01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons'
import { useTheme } from "next-themes"

interface FloatingMenuProps {
    onExport?: () => void
    onHistory?: () => void
    onSettings?: () => void
    onLogin?: () => void
}

export function FloatingMenu({
    onExport,
    onHistory,
    onSettings,
    onLogin,
}: FloatingMenuProps) {
    const { theme, setTheme } = useTheme()

    return (
        <div className="fixed top-4 right-4 z-50">
            <DropdownMenu>
                <DropdownMenuTrigger
                    className="h-10 w-10 rounded-full bg-white/80 backdrop-blur-md shadow-lg border border-white/30 hover:bg-white hover:shadow-xl transition-all flex items-center justify-center cursor-pointer"
                >
                    <HugeiconsIcon icon={MoreHorizontalIcon} size={20} className="text-slate-600" />
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="text-xs text-slate-400">
                        메뉴
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    <DropdownMenuItem onClick={onExport} className="cursor-pointer">
                        <HugeiconsIcon icon={Download01Icon} size={16} className="mr-2" />
                        <span>내보내기</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={onHistory} className="cursor-pointer">
                        <HugeiconsIcon icon={Clock01Icon} size={16} className="mr-2" />
                        <span>히스토리</span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        className="cursor-pointer"
                    >
                        {theme === 'dark' ? (
                            <>
                                <HugeiconsIcon icon={Sun01Icon} size={16} className="mr-2" />
                                <span>라이트 모드</span>
                            </>
                        ) : (
                            <>
                                <HugeiconsIcon icon={Moon01Icon} size={16} className="mr-2" />
                                <span>다크 모드</span>
                            </>
                        )}
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={onSettings} className="cursor-pointer">
                        <HugeiconsIcon icon={Settings01Icon} size={16} className="mr-2" />
                        <span>설정</span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem onClick={onLogin} className="cursor-pointer">
                        <HugeiconsIcon icon={Login01Icon} size={16} className="mr-2" />
                        <span>로그인</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
