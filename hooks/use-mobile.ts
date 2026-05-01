"use client"

import { useSyncExternalStore } from "react"

const MOBILE_BREAKPOINT = 768

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(callback: () => void) {
    if (typeof window === "undefined") return () => undefined
    const mql = window.matchMedia(QUERY)
    mql.addEventListener("change", callback)
    return () => mql.removeEventListener("change", callback)
}

function getSnapshot(): boolean {
    if (typeof window === "undefined") return false
    return window.matchMedia(QUERY).matches
}

function getServerSnapshot(): boolean {
    return false
}

export function useIsMobile(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
