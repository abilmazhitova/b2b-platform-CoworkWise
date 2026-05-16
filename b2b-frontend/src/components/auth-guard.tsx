"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAuthStore } from "@/lib/store"

const PROTECTED_PATHS = ["/map", "/analysis", "/admin", "/profile"]
const PUBLIC_PATHS = ["/login", "/register"]

export function AuthGuard({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const router = useRouter()
    const { token, isAuthenticated, fetchMe } = useAuthStore()
    const [authChecked, setAuthChecked] = useState(false)

    const isProtected = pathname && PROTECTED_PATHS.some((p) => pathname.startsWith(p))
    const isPublic = pathname && PUBLIC_PATHS.some((p) => pathname === p)
    const isAdminPath = pathname?.startsWith("/admin")
    const isAdmin = useAuthStore((s) => s.user?.role === "admin")

    useEffect(() => {
        let cancelled = false
        const run = async () => {
            const storedToken = typeof window !== "undefined" ? localStorage.getItem("token") : null
            if (storedToken && !isAuthenticated) {
                const ok = await fetchMe()
                if (cancelled) return
                if (!ok) setAuthChecked(true)
            }
            if (!cancelled) setAuthChecked(true)
        }
        run()
        return () => {
            cancelled = true
        }
    }, [fetchMe, isAuthenticated])

    useEffect(() => {
        if (!authChecked) return
        if (isProtected && !isAuthenticated) {
            router.replace("/login")
            return
        }
        if (isAdminPath && isAuthenticated && !isAdmin) {
            router.replace("/map")
            return
        }
        if (isPublic && isAuthenticated) {
            router.replace("/map")
        }
    }, [authChecked, isProtected, isPublic, isAuthenticated, isAdminPath, isAdmin, router])

    if (!authChecked && isProtected) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <p className="text-muted-foreground">Loading...</p>
            </div>
        )
    }

    return <>{children}</>
}
