import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MindmapNode } from "@/types/mindmap"
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'

interface DrillDownCardProps {
    node: MindmapNode
    onExpand: () => void
    showExpandButton?: boolean
}

export function DrillDownCard({ node, onExpand, showExpandButton = true }: DrillDownCardProps) {
    const hasChildren = node.children && node.children.length > 0

    return (
        <Card className="hover:border-emerald-500 transition-all duration-200 cursor-pointer hover:shadow-md">
            <CardHeader>
                <div className="flex justify-between items-start gap-3">
                    <CardTitle className="text-lg font-semibold flex-1">
                        {node.label}
                    </CardTitle>
                    {node.semantic_type && (
                        <Badge variant={getSemanticVariant(node.semantic_type)} className="shrink-0">
                            {getSemanticLabel(node.semantic_type)}
                        </Badge>
                    )}
                </div>
                {node.description && (
                    <CardDescription className="mt-2 text-sm">
                        {node.description}
                    </CardDescription>
                )}
            </CardHeader>

            {showExpandButton && (
                <CardContent>
                    <Button
                        onClick={onExpand}
                        className="w-full bg-emerald-600 hover:bg-emerald-700"
                        disabled={!hasChildren}
                    >
                        {hasChildren ? (
                            <>
                                확장하기
                                <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="ml-2" />
                            </>
                        ) : (
                            'AI가 하위 항목 생성 →'
                        )}
                    </Button>
                </CardContent>
            )}
        </Card>
    )
}

function getSemanticVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
        finance: "default",     // emerald (기본 테마)
        action: "secondary",    // 회색
        risk: "destructive",    // 빨간색
        persona: "outline",     // 테두리만
        resource: "secondary",
        metric: "outline"
    }
    return variants[type] || "outline"
}

function getSemanticLabel(type: string): string {
    const labels: Record<string, string> = {
        finance: "재무",
        action: "실행",
        risk: "리스크",
        persona: "고객",
        resource: "자원",
        metric: "지표",
        other: "기타"
    }
    return labels[type] || type
}
