"use client"

import { useRef, useEffect, useState, ReactNode } from "react"
import { motion } from "framer-motion"
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight02Icon, AiIdeaIcon, AiSearch02Icon, JusticeScale01Icon, Flag01Icon } from '@hugeicons/core-free-icons'
import { openApiKeySettings } from "@/lib/api-key-store"

// Intent Mode 타입 정의
type IntentMode = 'creation' | 'diagnosis' | 'choice' | 'strategy'

interface IntentOption {
    id: IntentMode
    label: string
    icon: typeof AiIdeaIcon
    question: ReactNode
}

// Intent 선택지 정의
const INTENT_OPTIONS: IntentOption[] = [
    {
        id: 'creation',
        label: '기획과 구상',
        icon: AiIdeaIcon,
        question: (
            <>
                어떤 <strong className="font-semibold text-slate-800">아이디어</strong>를<br />
                <strong className="font-semibold text-slate-800">구체적 계획</strong>으로 만들고 싶으세요?
            </>
        )
    },
    {
        id: 'diagnosis',
        label: '문제와 해결',
        icon: AiSearch02Icon,
        question: (
            <>
                지금 겪고 계신 어떤 <strong className="font-semibold text-slate-800">문제의<br />원인</strong>을 찾고 싶으세요?
            </>
        )
    },
    {
        id: 'choice',
        label: '선택과 결정',
        icon: JusticeScale01Icon,
        question: (
            <>
                어떤 선택지들 중에서<br /><strong className="font-semibold text-slate-800">최선의 결정</strong>을 내리고 싶으세요?
            </>
        )
    },
    {
        id: 'strategy',
        label: '전략과 점검',
        icon: Flag01Icon,
        question: (
            <>
                앞으로의 어떤 <strong className="font-semibold text-slate-800">목표</strong>를 세우거나<br /><strong className="font-semibold text-slate-800">회고</strong>하고 싶으세요?
            </>
        )
    }
]

interface HeroInputProps {
    topic: string
    onTopicChange: (value: string) => void
    onSubmit: () => void
    intentMode: IntentMode
    onIntentModeChange: (mode: IntentMode) => void
    /** API 키 미설정 에러 메시지 (외부에서 주입) */
    apiKeyError?: string
    onApiKeyErrorClear?: () => void
}

// IntentMode 타입 export
export type { IntentMode }

/**
 * 1차 방어선: Code-Level Filtering
 * 무의미한 입력을 AI에게 보내기 전에 차단
 */
function validateInput(text: string): { isValid: boolean; reason: string } {
    const trimmed = text.trim()

    // 1. 최소 길이 체크 (공백 제외)
    const cleanText = trimmed.replace(/\s+/g, "")
    if (cleanText.length < 10) {
        return { isValid: false, reason: "minimum_length" }
    }

    // 2. 반복 문자 체크 (동일 문자 5회 이상 연속)
    const repeatPattern = /(.)\1{4,}/
    if (repeatPattern.test(cleanText)) {
        return { isValid: false, reason: "repeated_chars" }
    }

    // 3. 문자 다양성 체크 (사용된 문자 종류가 5개 미만)
    const uniqueChars = new Set(cleanText.replace(/[^a-zA-Z가-힣0-9]/g, ""))
    if (uniqueChars.size < 5) {
        return { isValid: false, reason: "low_diversity" }
    }

    // 4. 의미 있는 단어 체크 (최소 3글자 연속 비공백)
    if (!/\S{3,}/.test(trimmed)) {
        return { isValid: false, reason: "no_words" }
    }

    return { isValid: true, reason: "valid" }
}

// 에러 메시지 매핑
const ERROR_MESSAGES: Record<string, string> = {
    minimum_length: "조금 더 구체적으로 알려주세요.",
    repeated_chars: "당신의 진짜 아이디어를 들려주세요.",
    low_diversity: "당신의 진짜 아이디어를 들려주세요.",
    no_words: "조금 더 구체적으로 알려주세요.",
}

export function HeroInput({ topic, onTopicChange, onSubmit, intentMode, onIntentModeChange, apiKeyError, onApiKeyErrorClear }: HeroInputProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const [isShaking, setIsShaking] = useState(false)
    const [errorMessage, setErrorMessage] = useState("")

    // 현재 선택된 Intent의 질문 텍스트
    const currentIntent = INTENT_OPTIONS.find(opt => opt.id === intentMode)!

    // 버튼 활성화 조건: 10자 이상이면 활성화
    const isButtonEnabled = topic.trim().length >= 10

    // 필터 통과 조건 (무의미한 입력 차단)
    const validation = validateInput(topic)

    // Auto-resize textarea based on content
    const adjustTextareaHeight = () => {
        const textarea = textareaRef.current
        if (textarea) {
            textarea.style.height = 'auto'
            textarea.style.height = `${textarea.scrollHeight}px`
        }
    }

    useEffect(() => {
        adjustTextareaHeight()
    }, [topic])

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault()

        // 버튼이 활성화되지 않으면 무시
        if (!isButtonEnabled) return

        if (validation.isValid) {
            setErrorMessage("")
            onSubmit()
        } else {
            // 파터 통과 실패: Shake & Stay 애니메이션 (진행 불가)
            setIsShaking(true)
            setErrorMessage(ERROR_MESSAGES[validation.reason] || "")

            // 애니메이션 후 상태 리셋
            setTimeout(() => setIsShaking(false), 500)
        }
    }

    return (
        <motion.div
            key="input-stage"
            layoutId="root-container"
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{
                duration: 0.8,
                ease: [0.25, 0.46, 0.45, 0.94],
                delay: 0.1
            }}
            className="flex flex-col items-center"
        >
            {/* Intent Mode Selector */}
            <div className="mb-8 grid grid-cols-2 md:flex md:flex-wrap md:justify-center gap-2">
                {INTENT_OPTIONS.map((option) => (
                    <button
                        key={option.id}
                        onClick={() => onIntentModeChange(option.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${intentMode === option.id
                            ? 'bg-slate-800 text-white shadow-md'
                            : 'bg-white/60 text-slate-600 hover:bg-white/80 hover:text-slate-800 border border-slate-200'
                            }`}
                    >
                        <HugeiconsIcon icon={option.icon} size={16} className="w-[16px] shrink-0" />
                        <span>{option.label}</span>
                    </button>
                ))}
            </div>

            {/* Dynamic Title based on Intent */}
            <motion.h1
                key={intentMode}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="mb-4 text-center text-2xl font-light tracking-tight text-slate-700 md:text-3xl px-4"
            >
                {currentIntent.question}
            </motion.h1>

            {/* Textarea Form with Shake Animation */}
            <motion.form
                onSubmit={handleSubmit}
                className="relative w-full max-w-lg md:max-w-xl"
                animate={isShaking ? { x: [-6, 6, -6, 6, -3, 3, 0] } : {}}
                transition={{ duration: 0.6, ease: "easeInOut" }}
            >
                <div className={`group relative overflow-hidden rounded-2xl md:rounded-3xl bg-white/70 backdrop-blur-sm p-1 md:p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] ${isShaking
                    ? 'ring-2 ring-slate-400'
                    : 'ring-1 ring-slate-200 hover:ring-slate-300'
                    }`}>
                    <textarea
                        ref={textareaRef}
                        placeholder=""
                        className="w-full min-h-[130px] md:min-h-[150px] max-h-[320px] resize-none overflow-y-auto bg-transparent px-5 py-4 md:px-8 md:py-6 text-lg md:text-xl text-slate-800 placeholder:text-slate-300 focus:outline-none"
                        value={topic}
                        onChange={(e) => {
                            if (e.target.value.length <= 300) {
                                onTopicChange(e.target.value)
                                // 타이핑 시 에러 메시지 클리어
                                if (errorMessage) setErrorMessage("")
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.shiftKey) {
                                e.preventDefault()
                                handleSubmit()
                            }
                        }}
                        maxLength={300}
                    />

                    {/* Bottom Bar */}
                    <div className="flex items-center justify-between px-4 pb-3">
                        <span className={`text-xs transition-opacity duration-300 ${topic.length > 0 ? 'opacity-100 text-slate-300' : 'opacity-0'}`}>
                            {topic.length}/300
                        </span>

                        <motion.button
                            type="submit"
                            disabled={!isButtonEnabled}
                            className={`rounded-lg p-2 text-white transition-all ${isButtonEnabled
                                ? 'bg-slate-900 hover:scale-105 active:scale-95 group-focus-within:bg-indigo-600'
                                : 'bg-slate-300 cursor-not-allowed'
                                }`}
                            whileTap={isButtonEnabled ? { scale: 0.95 } : {}}
                        >
                            <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
                        </motion.button>
                    </div>
                </div>
            </motion.form>

            {/* Error Message */}
            <motion.p
                initial={{ opacity: 0, y: -5 }}
                animate={{
                    opacity: (errorMessage || apiKeyError) ? 1 : 0,
                    y: (errorMessage || apiKeyError) ? 0 : -5
                }}
                transition={{ duration: 0.3 }}
                className={`mt-4 text-sm font-medium ${apiKeyError ? 'text-red-500 cursor-pointer hover:text-red-600' : 'text-slate-500'
                    }`}
                onClick={apiKeyError ? () => {
                    openApiKeySettings()
                    onApiKeyErrorClear?.()
                } : undefined}
            >
                {apiKeyError || errorMessage || " "}
            </motion.p>
        </motion.div>
    )
}
