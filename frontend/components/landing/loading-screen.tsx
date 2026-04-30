"use client"

import { motion, AnimatePresence } from "framer-motion"
import { LoadingQuote } from "@/lib/framework-templates"

interface LoadingScreenProps {
    topic: string
    loadingQuote: LoadingQuote
}

export function LoadingScreen({ topic, loadingQuote }: LoadingScreenProps) {
    // 글자수에 따른 3단계 폰트 사이즈
    const getFontSizeClass = (text: string) => {
        const length = text.length
        if (length <= 40) return "text-2xl md:text-3xl"  // 짧은 텍스트
        if (length <= 80) return "text-xl md:text-2xl"   // 중간 길이
        return "text-lg md:text-xl"                       // 긴 텍스트
    }

    return (
        <motion.div
            key="loading-stage"
            layoutId="root-container"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center gap-12"
        >
            {/* 사용자 입력 텍스트 (글자수에 따라 폰트 크기 조절) */}
            <h2 className={`${getFontSizeClass(topic)} font-semibold text-slate-800 text-center break-keep text-balance max-w-xl`}>
                {topic}
            </h2>

            {/* 로딩 스피너 + 명언 */}
            <div className="flex flex-col items-center gap-6 max-w-lg">
                {/* Ripple Loader */}
                <div className="ripple-loader">
                    <span></span>
                    <span></span>
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={loadingQuote.text}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.6 }}
                        className="text-center space-y-2"
                    >
                        <p className="text-slate-500 italic break-keep text-balance leading-relaxed">
                            &ldquo;{loadingQuote.text}&rdquo;
                        </p>
                        <p className="text-sm text-slate-400">
                            — {loadingQuote.author}
                        </p>
                    </motion.div>
                </AnimatePresence>
            </div>
        </motion.div>
    )
}


