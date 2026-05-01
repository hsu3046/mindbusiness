"use client"

import { useState, useEffect, useCallback } from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { HugeiconsIcon } from "@hugeicons/react"
import { Settings02Icon, CheckmarkCircle02Icon, Alert02Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { getApiKey, setApiKey, clearApiKey, preloadServerKeyStatus, serverHasKey, subscribeServerKeyStatus } from "@/lib/api-key-store"
import { API_BASE_URL } from "@/lib/api-config"
import { toast } from "sonner"

interface ApiKeyDialogProps {
    /** External trigger to open the dialog (e.g., when API call fails) */
    forceOpen?: boolean
    onOpenChange?: (open: boolean) => void
}

export function ApiKeyDialog({ forceOpen, onOpenChange }: ApiKeyDialogProps) {
    const [open, setOpen] = useState(false)
    const [inputKey, setInputKey] = useState("")
    const [savedKey, setSavedKey] = useState<string | null>(null)
    const [isValidating, setIsValidating] = useState(false)
    const [isValid, setIsValid] = useState<boolean | null>(null)
    const [hasServerKeyState, setHasServerKeyState] = useState(false)

    // Load saved key and preload server key status on mount
    useEffect(() => {
        setSavedKey(getApiKey())
        setHasServerKeyState(serverHasKey())
        preloadServerKeyStatus()
        const unsubscribe = subscribeServerKeyStatus(() => {
            setHasServerKeyState(serverHasKey())
        })
        return unsubscribe
    }, [])

    // Handle external force open
    useEffect(() => {
        if (forceOpen) {
            setOpen(true)
        }
    }, [forceOpen])

    // Listen for custom event to open dialog (e.g., when API call fails due to missing key)
    useEffect(() => {
        const handler = () => setOpen(true)
        window.addEventListener('open-api-key-settings', handler)
        return () => window.removeEventListener('open-api-key-settings', handler)
    }, [])

    const handleOpenChange = useCallback((newOpen: boolean) => {
        setOpen(newOpen)
        onOpenChange?.(newOpen)
    }, [onOpenChange])

    const validateKey = async () => {
        if (!inputKey.trim()) return
        setIsValidating(true)
        setIsValid(null)

        try {
            const res = await fetch(`${API_BASE_URL}/api/v1/validate-key`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': inputKey.trim(),
                },
            })

            if (res.ok) {
                setIsValid(true)
                setApiKey(inputKey.trim())
                setSavedKey(inputKey.trim())
                toast.success("API 키가 저장되었습니다.")
                // Close dialog after a brief delay
                setTimeout(() => handleOpenChange(false), 500)
            } else {
                setIsValid(false)
                toast.error("유효하지 않은 API 키입니다.")
            }
        } catch {
            setIsValid(false)
            toast.error("검증 실패. 백엔드 서버를 확인해주세요.")
        } finally {
            setIsValidating(false)
        }
    }

    const handleRemoveKey = () => {
        clearApiKey()
        setSavedKey(null)
        setInputKey("")
        setIsValid(null)
        toast.info("API 키가 삭제되었습니다.")
    }

    // Mask key for display
    const maskedKey = savedKey
        ? `${savedKey.slice(0, 6)}${"•".repeat(20)}${savedKey.slice(-4)}`
        : null

    const needsKey = !savedKey && !hasServerKeyState

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            {/* Trigger: fixed bottom-right icon */}
            <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
                {/* Arrow label — only when key is missing */}
                {needsKey && (
                    <div className="flex items-center gap-1.5 animate-fade-slide">
                        <span className="text-xs text-amber-500/80 font-medium whitespace-nowrap">
                            API Key 설정
                        </span>
                        <svg
                            width="20" height="14" viewBox="0 0 20 14"
                            className="text-amber-400/70"
                            fill="none" stroke="currentColor" strokeWidth="1.5"
                            strokeLinecap="round" strokeLinejoin="round"
                        >
                            <path d="M1 7h16M13 1l5 6-5 6" />
                        </svg>
                    </div>
                )}
                <DialogTrigger
                    render={
                        <button
                            className={`p-2.5 rounded-full transition-all duration-200 backdrop-blur-sm ${needsKey
                                ? 'bg-amber-50/90 text-amber-500 hover:text-amber-600 hover:bg-amber-100 ring-1 ring-amber-200/60 animate-scale-pulse'
                                : 'bg-white/60 text-slate-400 hover:text-slate-600 hover:bg-white/80 ring-1 ring-slate-200/50'
                                }`}
                            title="API Key Settings"
                        />
                    }
                >
                    <HugeiconsIcon
                        icon={needsKey ? Alert02Icon : Settings02Icon}
                        size={18}
                        strokeWidth={1.5}
                    />
                </DialogTrigger>
            </div>

            <DialogContent className="bg-white">
                <DialogHeader>
                    <DialogTitle className="text-slate-900">API Key Settings</DialogTitle>
                    <DialogDescription>
                        Google Gemini API 키를 설정하세요.{" "}
                        <a
                            href="https://aistudio.google.com/app/apikey"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-500 hover:text-indigo-600"
                        >
                            키 발급하기 →
                        </a>
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Server key status */}
                    {hasServerKeyState && (
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} />
                            <span>서버에 기본 API 키가 설정되어 있습니다. 개인 키를 설정하면 우선 사용됩니다.</span>
                        </div>
                    )}

                    {/* Current key display */}
                    {savedKey && (
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
                            <div className="flex items-center gap-2">
                                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} className="text-emerald-500" />
                                <code className="text-xs text-slate-500 font-mono">{maskedKey}</code>
                            </div>
                            <button
                                onClick={handleRemoveKey}
                                className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                title="키 삭제"
                            >
                                <HugeiconsIcon icon={Delete02Icon} size={14} />
                            </button>
                        </div>
                    )}

                    {/* Input */}
                    <div className="flex gap-2">
                        <Input
                            type="password"
                            placeholder="AIzaSy..."
                            value={inputKey}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputKey(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === 'Enter') validateKey()
                            }}
                            className="flex-1 text-base font-mono"
                        />
                        <Button
                            onClick={validateKey}
                            disabled={!inputKey.trim() || isValidating}
                            size="sm"
                        >
                            {isValidating ? "검증 중..." : "저장"}
                        </Button>
                    </div>

                    {/* Validation feedback */}
                    {isValid === false && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                            <HugeiconsIcon icon={Alert02Icon} size={12} />
                            유효하지 않은 API 키입니다. 다시 확인해주세요.
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <p className="text-[10px] text-slate-300 text-center w-full">
                        키는 브라우저 localStorage에만 저장됩니다 · 서버에 저장되지 않음
                    </p>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
