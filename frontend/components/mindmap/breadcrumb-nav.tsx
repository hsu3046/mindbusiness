"use client"

import Link from "next/link"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'

interface BreadcrumbNavProps {
    contextPath: string[]
}

export function BreadcrumbNav({ contextPath }: BreadcrumbNavProps) {
    return (
        <Breadcrumb className="mb-6">
            <BreadcrumbList>
                <BreadcrumbItem>
                    <Link href="/" className="text-emerald-600 hover:text-emerald-700 text-sm">
                        Home
                    </Link>
                </BreadcrumbItem>

                {contextPath.length > 0 && <BreadcrumbSeparator><HugeiconsIcon icon={ArrowRight01Icon} size={16} /></BreadcrumbSeparator>}

                {contextPath.map((label, index) => (
                    <div key={index} className="flex items-center gap-2">
                        {index === contextPath.length - 1 ? (
                            <BreadcrumbItem>
                                <BreadcrumbPage className="font-semibold text-sm">{label}</BreadcrumbPage>
                            </BreadcrumbItem>
                        ) : (
                            <>
                                <BreadcrumbItem>
                                    <span className="max-w-[150px] truncate text-sm text-muted-foreground">
                                        {label}
                                    </span>
                                </BreadcrumbItem>
                                <BreadcrumbSeparator><HugeiconsIcon icon={ArrowRight01Icon} size={16} /></BreadcrumbSeparator>
                            </>
                        )}
                    </div>
                ))}
            </BreadcrumbList>
        </Breadcrumb>
    )
}
