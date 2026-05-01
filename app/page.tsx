"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { smartClassify } from "@/lib/api"
import { LOADING_QUOTES, LoadingQuote } from "@/lib/framework-templates"
import { generateMindmapId } from "@/lib/tree-cache"
import { toast } from "sonner"
import { HeroInput, LoadingScreen, IntentMode, RecentMapsList } from "@/components/landing"
import { SaveLoadButtons } from "@/components/mindmap/save-load-buttons"
import { DottedGlowBackground } from "@/components/ui/dotted-glow-background"
import { ConversationMessage, SmartClassifyResponse, isAPIError } from "@/types/mindmap"
import { isAnyKeyAvailable, openApiKeySettings } from "@/lib/api-key-store"
import { useMindmapStore } from "@/stores/mindmap-store"
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight02Icon, SparklesIcon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'

type Step = "input" | "loading" | "question" | "generating"

export default function HomePage() {
    const router = useRouter()
    // Pre-seed the store before navigating so /map can pick up identity
    // (id + topic), the freshly-classified DNA, and the chosen intent —
    // no URL params needed beyond the short ?id=.
    const setStoreMindmapId = useMindmapStore((s) => s.setMindmapId)
    const setStoreTopic = useMindmapStore((s) => s.setTopic)
    const setStoreContextVector = useMindmapStore((s) => s.setContextVector)
    const setStoreIntentMode = useMindmapStore((s) => s.setIntentMode)
    const [step, setStep] = useState<Step>("input")
    const [topic, setTopic] = useState("")
    const [intentMode, setIntentMode] = useState<IntentMode>('creation')
    const [loadingQuote, setLoadingQuote] = useState<LoadingQuote>(LOADING_QUOTES[0])

    // Smart Question Flow 상태
    const [turnNumber, setTurnNumber] = useState(1)
    const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([])
    const [currentQuestion, setCurrentQuestion] = useState<string>("")
    const [questionExamples, setQuestionExamples] = useState<string>("")
    const [fillInMessage, setFillInMessage] = useState<string>("")
    const [apiKeyError, setApiKeyError] = useState<string>("")

    // Refined Summary: AI가 누적 정보를 기반으로 생성한 정제된 타이틀
    const [refinedSummary, setRefinedSummary] = useState<string>("")

    // Track pending navigation timeout so we can cancel on unmount.
    const pendingNavTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => {
        if (pendingNavTimer.current) clearTimeout(pendingNavTimer.current)
    }, [])

    // 로딩 시 명언 랜덤 전환
    useEffect(() => {
        if (step !== "loading" && step !== "generating") return
        const interval = setInterval(() => {
            const randomIndex = Math.floor(Math.random() * LOADING_QUOTES.length)
            setLoadingQuote(LOADING_QUOTES[randomIndex])
        }, 6000)  // 6초마다 변경 (더 천천히)
        return () => clearInterval(interval)
    }, [step])

    const handleSubmit = async () => {
        if (!topic.trim()) return

        // 🔑 API 키 체크: 키가 없으면 설정 창으로 유도
        const keyAvailable = isAnyKeyAvailable()
        if (!keyAvailable) {
            setApiKeyError("API Key를 설정해주세요.")
            openApiKeySettings()
            return
        }
        setApiKeyError("")

        // 이전 질문 상태 초기화 (화면 전환 시 이전 질문이 보이는 현상 방지)
        setCurrentQuestion("")
        setQuestionExamples("")
        setStep("loading")

        try {
            const result: SmartClassifyResponse = await smartClassify({
                user_input: topic,
                user_language: "Korean",
                turn_number: turnNumber,
                intent_mode: intentMode,
                conversation_history: conversationHistory
            })

            // Stash DNA + intent in the store so /map's expand flow can use
            // them. Done on every action path (ask_question / generate /
            // fill_and_generate) — the user's intent is the same regardless
            // of whether the AI needs another turn.
            if (result.context_vector) {
                setStoreContextVector(result.context_vector)
            }
            setStoreIntentMode(intentMode)

            if (result.action === "ask_question" && result.question) {
                // DNA summary 저장 (AI가 누적 정보 기반으로 생성한 정제된 타이틀)
                if (result.context_vector?.summary) {
                    setRefinedSummary(result.context_vector.summary)
                }

                // 다음 질문 표시
                setConversationHistory([
                    ...conversationHistory,
                    { role: "user", content: topic },
                    { role: "assistant", content: result.question, question_type: result.question_type }
                ])
                setCurrentQuestion(result.question)
                setQuestionExamples(result.question_examples || "")
                setTurnNumber(turnNumber + 1)
                setTopic("")  // 입력창 비우기
                setStep("question")
            }
            else if (result.action === "fill_and_generate") {
                // DNA summary 저장
                const finalSummary = result.context_vector?.summary || refinedSummary || topic
                setRefinedSummary(finalSummary)

                // L1 Labels를 localStorage에 저장 (skeleton 대체)
                if (result.l1_labels) {
                    localStorage.setItem('mindmap_l1_labels', JSON.stringify(result.l1_labels))
                }

                // Auto Fill-in 메시지 표시 후 생성
                setFillInMessage(result.fill_in_message || "마인드맵을 작성 중입니다...")
                setStep("generating")
                if (pendingNavTimer.current) clearTimeout(pendingNavTimer.current)
                pendingNavTimer.current = setTimeout(() => {
                    pendingNavTimer.current = null
                    const framework = result.selected_framework_id || "LEAN"
                    const id = generateMindmapId()
                    setStoreMindmapId(id)
                    setStoreTopic(finalSummary)
                    router.push(`/map?id=${id}&framework=${framework}&intent=${intentMode}`)
                }, 1500)
            }
            else {
                // 바로 생성
                const finalSummary = result.context_vector?.summary || refinedSummary || topic
                const framework = result.selected_framework_id || "LEAN"

                // L1 Labels를 localStorage에 저장 (skeleton 대체)
                if (result.l1_labels) {
                    localStorage.setItem('mindmap_l1_labels', JSON.stringify(result.l1_labels))
                }

                const id = generateMindmapId()
                setStoreMindmapId(id)
                setStoreTopic(finalSummary)
                router.push(`/map?id=${id}&framework=${framework}&intent=${intentMode}`)
            }
        } catch (error: unknown) {
            // API 에러 응답인지 확인 (api.ts에서 throw된 객체)
            const apiError = error as { isAPIError?: boolean; error?: string; message?: string; retry?: boolean }

            if (apiError.isAPIError) {
                // 타임아웃 에러
                if (apiError.error?.includes('timeout')) {
                    toast.error("시간 초과", {
                        description: apiError.message || "잠시 후 다시 시도해주세요.",
                        action: apiError.retry ? {
                            label: "다시 시도",
                            onClick: () => handleSubmit()
                        } : undefined
                    })
                } else {
                    // 기타 API 에러
                    toast.error("오류 발생", {
                        description: apiError.message || "알 수 없는 오류가 발생했습니다."
                    })
                }
            } else {
                const errorMsg = error instanceof Error ? error.message : "알 수 없는 오류"
                // API 키 미설정 감지
                if (errorMsg.includes('API key') || errorMsg.includes('api_key') || errorMsg.includes('500')) {
                    toast.error("API 키가 필요합니다", {
                        description: "우하단 ⚙️ 아이콘을 클릭하여 Gemini API 키를 설정해주세요.",
                        duration: 8000,
                    })
                } else {
                    toast.error("분석 실패", {
                        description: errorMsg
                    })
                }
            }
            setStep("input")
        }
    }

    return (
        <main className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900 py-12">
            {/* Background Pattern */}
            <DottedGlowBackground
                className="pointer-events-none z-0"
                gap={24}
                radius={1}
                color="rgba(148, 163, 184, 0.6)"
                glowColor="rgba(99, 102, 241, 0.8)"
                opacity={1}
                speedScale={1}
            />

            {/* Content */}
            <div className="relative z-10 w-full max-w-2xl px-4">
                <AnimatePresence mode="wait">
                    {step === "input" && (
                        <motion.div
                            key="input-wrapper"
                            initial={{ opacity: 1 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center"
                        >
                            <HeroInput
                                topic={topic}
                                onTopicChange={setTopic}
                                onSubmit={handleSubmit}
                                intentMode={intentMode}
                                onIntentModeChange={setIntentMode}
                                apiKeyError={apiKeyError}
                                onApiKeyErrorClear={() => setApiKeyError("")}
                            />
                            {/* Secondary actions: 자유 시작 + 불러오기 — outline 버튼 통일,
                                자유 시작은 indigo accent로 시선 유도 (메인 input의 focus 색과 호응) */}
                            <div className="mt-6 flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const id = generateMindmapId()
                                        setStoreMindmapId(id)
                                        setStoreTopic("새 아이디어")
                                        router.push(
                                            `/map?id=${id}&framework=LOGIC&intent=creation&free=1`,
                                        )
                                    }}
                                    className="flex items-center gap-1.5 border-indigo-200 text-indigo-600 bg-white/60 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700"
                                >
                                    <HugeiconsIcon icon={SparklesIcon} size={16} />
                                    <span className="text-sm font-medium">자유롭게 시작</span>
                                </Button>
                                <SaveLoadButtons showSave={false} />
                            </div>
                            <RecentMapsList />
                        </motion.div>
                    )}

                    {step === "loading" && (
                        <LoadingScreen
                            topic={refinedSummary || topic}
                            loadingQuote={loadingQuote}
                        />
                    )}

                    {step === "question" && (
                        <motion.div
                            key="question"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="flex flex-col items-center gap-8"
                        >
                            {/* 질문 텍스트 (심플하게) */}
                            <div className="text-center space-y-3 max-w-md md:max-w-2xl mx-auto px-4">
                                <p className="text-lg md:text-xl font-medium text-slate-700 break-keep text-balance leading-relaxed">
                                    {currentQuestion}
                                </p>
                                {questionExamples && (
                                    <p className="text-sm text-slate-400 break-keep text-balance leading-relaxed">
                                        {questionExamples}
                                    </p>
                                )}
                            </div>

                            {/* 입력창 - HeroInput과 동일한 스타일 */}
                            <div className="w-full max-w-lg md:max-w-xl">
                                <div className="group relative overflow-hidden rounded-2xl md:rounded-3xl bg-white/70 backdrop-blur-sm p-1 md:p-2 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-slate-200 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:ring-slate-300">
                                    <textarea
                                        className="w-full min-h-[130px] md:min-h-[150px] resize-none overflow-hidden bg-transparent px-5 py-4 md:px-8 md:py-6 text-lg md:text-xl text-slate-800 placeholder:text-slate-300 focus:outline-none"
                                        placeholder=""
                                        value={topic}
                                        onChange={(e) => {
                                            if (e.target.value.length <= 300) {
                                                setTopic(e.target.value)
                                            }
                                            // Auto-resize
                                            e.target.style.height = 'auto'
                                            e.target.style.height = `${e.target.scrollHeight}px`
                                        }}
                                        onKeyDown={(e) => {
                                            // Enter = 줄바꾼 (기본 동작), Shift+Enter = 전송
                                            if (e.key === "Enter" && e.shiftKey) {
                                                e.preventDefault()
                                                // 유효성 검사: 최소 10자 + 최소 3글자 연속 비공백
                                                const trimmed = topic.trim()
                                                if (trimmed.length >= 10 && /\S{3,}/.test(trimmed)) {
                                                    handleSubmit()
                                                }
                                            }
                                        }}
                                        maxLength={300}
                                    />

                                    {/* 하단 바: 글자수 + 버튼 - 메인화면과 동일 */}
                                    <div className="flex items-center justify-between px-4 pb-3">
                                        <span className={`text-xs transition-opacity duration-300 ${topic.length > 0 ? 'opacity-100 text-slate-300' : 'opacity-0'}`}>
                                            {topic.length}/300
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleSubmit}
                                            disabled={!(topic.trim().length >= 10 && /\S{3,}/.test(topic.trim()))}
                                            className={`rounded-lg p-2 text-white transition-all ${(topic.trim().length >= 10 && /\S{3,}/.test(topic.trim()))
                                                ? 'bg-slate-900 hover:scale-105 active:scale-95'
                                                : 'bg-slate-300 cursor-not-allowed'
                                                }`}
                                        >
                                            <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {step === "generating" && (
                        <motion.div
                            key="generating"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="flex flex-col items-center gap-6"
                        >
                            <div className="rounded-2xl bg-white px-8 py-6 shadow-lg ring-1 ring-slate-100">
                                <p className="text-lg font-medium text-slate-800">
                                    {fillInMessage}
                                </p>
                            </div>
                            <div className="text-center space-y-1">
                                <p className="text-slate-600 italic break-keep text-balance">
                                    &ldquo;{loadingQuote.text}&rdquo;
                                </p>
                                <p className="text-sm text-slate-400">
                                    — {loadingQuote.author}
                                </p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </main>
    )
}