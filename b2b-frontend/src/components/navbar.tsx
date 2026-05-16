"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { MapPin, BarChart3, Settings, User, LogOut, Sun, Moon, Languages } from "lucide-react"
import { useAuthStore } from "@/lib/store"
import { useLangStore, useT } from "@/lib/lang-store"
import { type Lang } from "@/lib/translations"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const LANGS: { value: Lang; label: string }[] = [
    { value: "en", label: "English" },
    { value: "ru", label: "Русский" },
    { value: "kk", label: "Қазақша" },
]

export function Navbar() {
    const pathname = usePathname()
    const router = useRouter()
    const { user, logout } = useAuthStore()
    const { theme, setTheme } = useTheme()
    const { lang, setLang } = useLangStore()
    const t = useT()

    const navigation = [
        { name: t.nav.map, href: "/map", icon: MapPin },
        { name: t.nav.analysis, href: "/analysis", icon: BarChart3 },
        ...(user?.role === "admin" ? [{ name: t.nav.admin, href: "/admin", icon: Settings }] : []),
        { name: t.nav.profile, href: "/profile", icon: User },
    ]

    return (
        <nav className="border-b border-border bg-card">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">
                    <div className="flex items-center gap-8">
                        <Link href="/map" className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                                <MapPin className="h-5 w-5 text-primary-foreground" />
                            </div>
                            <span className="text-xl font-bold text-foreground">CoworkWise</span>
                        </Link>

                        <div className="hidden md:flex md:gap-1">
                            {navigation.map((item) => {
                                const Icon = item.icon
                                const isActive = pathname === item.href
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                            isActive
                                                ? "bg-primary text-primary-foreground"
                                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                        )}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {item.name}
                                    </Link>
                                )
                            })}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Language switcher */}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-9 w-9" title="Language">
                                    <Languages className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {LANGS.map((l) => (
                                    <DropdownMenuItem
                                        key={l.value}
                                        onClick={() => setLang(l.value)}
                                        className={cn(lang === l.value && "font-semibold")}
                                    >
                                        {l.label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Theme toggle */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                            title={theme === "dark" ? "Light mode" : "Dark mode"}
                        >
                            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </Button>

                        {user && (
                            <>
                                <span className="hidden md:block text-sm text-muted-foreground">{user.email}</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { logout(); router.push("/login") }}
                                    className="flex items-center gap-2"
                                >
                                    <LogOut className="h-4 w-4" />
                                    <span className="hidden sm:inline">{t.nav.logout}</span>
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    )
}