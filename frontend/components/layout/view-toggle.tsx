"use client"

import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from '@hugeicons/react'
import { GridViewIcon, GitBranchIcon, HierarchyIcon } from '@hugeicons/core-free-icons'
import { cn } from "@/lib/utils"

type ViewMode = 'card' | 'tree' | 'mindmap'

interface ViewToggleProps {
    viewMode: ViewMode
    onViewChange: (mode: ViewMode) => void
}

export function ViewToggle({ viewMode, onViewChange }: ViewToggleProps) {
    return (
        <div className="flex gap-1 bg-white/80 backdrop-blur-md rounded-lg p-1 shadow-sm border border-white/30">
            <Button
                variant={viewMode === 'mindmap' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewChange('mindmap')}
                className={cn(
                    "transition-all",
                    viewMode === 'mindmap' && "bg-indigo-600 hover:bg-indigo-700 text-white"
                )}
            >
                <HugeiconsIcon icon={HierarchyIcon} size={16} className="mr-1" />
                맵
            </Button>
            <Button
                variant={viewMode === 'card' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewChange('card')}
                className={cn(
                    "transition-all",
                    viewMode === 'card' && "bg-indigo-600 hover:bg-indigo-700 text-white"
                )}
            >
                <HugeiconsIcon icon={GridViewIcon} size={16} className="mr-1" />
                카드
            </Button>
            <Button
                variant={viewMode === 'tree' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewChange('tree')}
                className={cn(
                    "transition-all",
                    viewMode === 'tree' && "bg-indigo-600 hover:bg-indigo-700 text-white"
                )}
            >
                <HugeiconsIcon icon={GitBranchIcon} size={16} className="mr-1" />
                트리
            </Button>
        </div>
    )
}
