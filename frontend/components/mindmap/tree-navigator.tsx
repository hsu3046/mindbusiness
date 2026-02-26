"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MindmapNode } from "@/types/mindmap"
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, PlusSignIcon, SparklesIcon } from '@hugeicons/core-free-icons'
import { useState } from "react"
import { cn } from "@/lib/utils"

interface TreeNavigatorProps {
    node: MindmapNode
    level?: number
    onExpand?: (node: MindmapNode) => void
    onSelect?: (node: MindmapNode) => void
    expandingNodeId?: string | null
    selectedNodeId?: string | null
}

const semanticColors: Record<string, string> = {
    persona: "text-blue-600",
    action: "text-green-600",
    metric: "text-purple-600",
    risk: "text-red-600",
    default: "text-slate-600",
}

export function TreeNavigator({
    node,
    level = 0,
    onExpand,
    onSelect,
    expandingNodeId,
    selectedNodeId,
}: TreeNavigatorProps) {
    const [isOpen, setIsOpen] = useState(level < 2) // Auto-expand first 2 levels

    const hasChildren = node.children && node.children.length > 0
    const isExpanding = expandingNodeId === node.id
    const isSelected = selectedNodeId === node.id
    const semanticColor = semanticColors[node.semantic_type || 'default'] || semanticColors.default

    const paddingLeft = level * 16

    return (
        <div className="w-full">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <div
                    className={cn(
                        "flex items-center gap-1 py-1.5 px-2 rounded-md transition-colors group",
                        "hover:bg-slate-100",
                        isSelected && "bg-indigo-50 ring-1 ring-indigo-200"
                    )}
                    style={{ paddingLeft: `${paddingLeft}px` }}
                >
                    {/* Expand/Collapse Trigger */}
                    <CollapsibleTrigger
                        className="h-6 w-6 p-0 flex items-center justify-center hover:bg-slate-200 rounded"
                        disabled={!hasChildren}
                    >
                        {hasChildren ? (
                            <motion.div
                                animate={{ rotate: isOpen ? 90 : 0 }}
                                transition={{ duration: 0.15 }}
                            >
                                <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="text-slate-400" />
                            </motion.div>
                        ) : (
                            <div className="h-4 w-4" /> // Spacer
                        )}
                    </CollapsibleTrigger>

                    {/* Node Label */}
                    <button
                        type="button"
                        className={cn(
                            "flex-1 text-left text-sm font-medium transition-colors",
                            semanticColor,
                            "hover:text-indigo-600",
                            isSelected && "text-indigo-700"
                        )}
                        onClick={() => onSelect?.(node)}
                    >
                        {node.label}
                    </button>

                    {/* Children Count */}
                    {hasChildren && (
                        <span className="text-xs text-slate-400 mr-1">
                            {node.children.length}
                        </span>
                    )}

                    {/* Semantic Badge */}
                    {node.semantic_type && level > 0 && (
                        <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            {node.semantic_type}
                        </Badge>
                    )}

                    {/* Expand Button (for leaf nodes) */}
                    {!hasChildren && onExpand && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => onExpand(node)}
                            disabled={isExpanding}
                        >
                            {isExpanding ? (
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                >
                                    <HugeiconsIcon icon={SparklesIcon} size={12} className="text-indigo-500" />
                                </motion.div>
                            ) : (
                                <HugeiconsIcon icon={PlusSignIcon} size={12} className="text-slate-400 hover:text-indigo-500" />
                            )}
                        </Button>
                    )}
                </div>

                {/* Children */}
                <CollapsibleContent>
                    <AnimatePresence>
                        {isOpen && hasChildren && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.15 }}
                                className="border-l border-slate-200 ml-4"
                            >
                                {node.children.map((child) => (
                                    <TreeNavigator
                                        key={child.id}
                                        node={child}
                                        level={level + 1}
                                        onExpand={onExpand}
                                        onSelect={onSelect}
                                        expandingNodeId={expandingNodeId}
                                        selectedNodeId={selectedNodeId}
                                    />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </CollapsibleContent>
            </Collapsible>
        </div>
    )
}
