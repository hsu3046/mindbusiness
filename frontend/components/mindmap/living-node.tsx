"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MindmapNode } from "@/types/mindmap"
import { springTransition } from "@/lib/animations"
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, SparklesIcon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { useState } from "react"
import { cn } from "@/lib/utils"

interface LivingNodeProps {
    node: MindmapNode
    variant?: 'idle' | 'active' | 'whisper'
    onExpand?: () => void
    onDrillDown?: () => void
    isExpanding?: boolean
    showExpandButton?: boolean
}

const semanticColors: Record<string, string> = {
    persona: "bg-blue-100 text-blue-700 border-blue-200",
    action: "bg-green-100 text-green-700 border-green-200",
    metric: "bg-purple-100 text-purple-700 border-purple-200",
    risk: "bg-red-100 text-red-700 border-red-200",
    default: "bg-slate-100 text-slate-700 border-slate-200",
}

export function LivingNode({
    node,
    variant = 'idle',
    onExpand,
    onDrillDown,
    isExpanding = false,
    showExpandButton = true,
}: LivingNodeProps) {
    const [isOpen, setIsOpen] = useState(false)

    const hasChildren = node.children && node.children.length > 0
    const semanticColor = semanticColors[node.semantic_type || 'default'] || semanticColors.default

    const handleHeaderClick = () => {
        if (hasChildren && onDrillDown) {
            onDrillDown()
        } else {
            setIsOpen(!isOpen)
        }
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={springTransition}
            className={cn(
                "group",
                variant === 'whisper' && "whisper-glow"
            )}
        >
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <Card
                    className={cn(
                        "transition-all duration-300 bg-white/80 backdrop-blur-md border border-white/30",
                        "hover:shadow-lg hover:scale-[1.01]",
                        variant === 'active' && "ring-2 ring-indigo-500/50",
                        variant === 'whisper' && "border-indigo-300"
                    )}
                >
                    {/* Header as Trigger */}
                    <CollapsibleTrigger
                        className="w-full"
                        onClick={handleHeaderClick}
                    >
                        <CardHeader className="cursor-pointer p-4 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                                <motion.div
                                    animate={{ rotate: isOpen ? 90 : 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="text-slate-400" />
                                </motion.div>

                                <div className="flex-1 text-left">
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-base font-medium text-slate-700 group-hover:text-indigo-600 transition-colors">
                                            {node.label}
                                        </CardTitle>

                                        {node.semantic_type && (
                                            <Badge variant="outline" className={cn("text-xs", semanticColor)}>
                                                {node.semantic_type}
                                            </Badge>
                                        )}

                                        {hasChildren && (
                                            <span className="text-xs text-slate-400">
                                                ({node.children.length})
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {variant === 'whisper' && (
                                    <HugeiconsIcon icon={SparklesIcon} size={16} className="text-indigo-500 animate-pulse" />
                                )}
                            </div>
                        </CardHeader>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                        <AnimatePresence>
                            {isOpen && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <CardContent className="pt-0 pb-4 px-4">
                                        {node.description && (
                                            <CardDescription className="text-sm text-slate-500 mb-3">
                                                {node.description}
                                            </CardDescription>
                                        )}

                                        {/* Attributes */}
                                        {node.attributes && Object.keys(node.attributes).length > 0 && (
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                {Object.entries(node.attributes).map(([key, value]) => (
                                                    <span
                                                        key={key}
                                                        className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded"
                                                    >
                                                        {key}: {String(value)}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex gap-2">
                                            {showExpandButton && onExpand && !hasChildren && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        onExpand()
                                                    }}
                                                    disabled={isExpanding}
                                                    className="text-xs"
                                                >
                                                    {isExpanding ? (
                                                        <>
                                                            <motion.div
                                                                animate={{ rotate: 360 }}
                                                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                            >
                                                                <HugeiconsIcon icon={SparklesIcon} size={12} className="mr-1" />
                                                            </motion.div>
                                                            생성 중...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <HugeiconsIcon icon={PlusSignIcon} size={12} className="mr-1" />
                                                            확장하기
                                                        </>
                                                    )}
                                                </Button>
                                            )}

                                            {hasChildren && onDrillDown && (
                                                <Button
                                                    size="sm"
                                                    variant="default"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        onDrillDown()
                                                    }}
                                                    className="text-xs bg-indigo-600 hover:bg-indigo-700"
                                                >
                                                    <HugeiconsIcon icon={ArrowRight01Icon} size={12} className="mr-1" />
                                                    들어가기 ({node.children.length})
                                                </Button>
                                            )}
                                        </div>
                                    </CardContent>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </CollapsibleContent>
                </Card>
            </Collapsible>
        </motion.div>
    )
}
