"use client"

import { Suspense } from "react"
import MapPageContent from "./map-page-content"
import { Skeleton } from "@/components/ui/skeleton"

export default function MapPage() {
    return (
        <Suspense fallback={<MapPageSkeleton />}>
            <MapPageContent />
        </Suspense>
    )
}

function MapPageSkeleton() {
    return (
        <main className="min-h-screen p-4 md:p-8">
            <div className="max-w-4xl mx-auto space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        </main>
    )
}
