"use client"

import { motion } from "framer-motion"
import { HugeiconsIcon } from '@hugeicons/react'
import { Loading03Icon } from '@hugeicons/core-free-icons'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ClarificationOption } from "@/types/mindmap"

interface FrameworkSelectorProps {
    topic: string
    options: ClarificationOption[]
    onSelect: (value: string, frameworkId?: string) => void
}

export function FrameworkSelector({ topic, options, onSelect }: FrameworkSelectorProps) {
    return (
        <div className="relative flex flex-col items-center">
            {/* Root Node */}
            <motion.div
                layoutId="root-container"
                className="relative z-20 flex min-w-[280px] flex-col items-center justify-center rounded-2xl bg-white px-8 py-6 shadow-[0_20px_50px_rgb(0,0,0,0.1)] ring-1 ring-slate-100 mb-12"
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
            >
                <div className="mb-2 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                    Project Root
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{topic}</h2>
                <div className="mt-2 text-xs text-indigo-500 flex items-center gap-1">
                    <HugeiconsIcon icon={Loading03Icon} size={12} /> 어떤 관점으로 분석할까요?
                </div>
            </motion.div>

            {/* Framework Options */}
            <motion.div
                className="grid grid-cols-1 md:grid-cols-3 gap-4"
                initial="hidden"
                animate="visible"
                variants={{
                    visible: { transition: { staggerChildren: 0.1 } }
                }}
            >
                {options.map((option) => (
                    <motion.div
                        key={option.value}
                        variants={{
                            hidden: { opacity: 0, y: 20, scale: 0.8 },
                            visible: { opacity: 1, y: 0, scale: 1 }
                        }}
                        transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    >
                        <Card
                            className="w-[220px] hover:ring-2 hover:ring-indigo-500/30 hover:shadow-lg transition-all cursor-pointer bg-white/80 backdrop-blur group"
                            onClick={() => onSelect(option.value, option.framework_id)}
                        >
                            <CardHeader className="p-4">
                                <CardTitle className="text-sm font-medium text-slate-600 group-hover:text-indigo-600 transition-colors">
                                    {option.label}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <span className="text-xs text-slate-400 group-hover:text-indigo-400 transition-colors">
                                    {option.framework_id ? `${option.framework_id} Framework` : '선택하기'}
                                </span>
                            </CardContent>
                        </Card>
                    </motion.div>
                ))}
            </motion.div>

            {/* Connecting Lines (SVG) */}
            <svg className="absolute top-[100px] left-1/2 -translate-x-1/2 -z-10 w-[600px] h-[60px] pointer-events-none">
                <motion.path
                    d={`M300 0 L300 40 ${options.length >= 2 ? 'L100 40 L100 60 M300 40 L500 40 L500 60' : ''} M300 40 L300 60`}
                    stroke="#e2e8f0"
                    strokeWidth="2"
                    fill="none"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                />
            </svg>
        </div>
    )
}
