"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { MapPin, Sun, Moon, Languages } from "lucide-react"
import axios from "axios"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuthStore } from "@/lib/store"
import { useLangStore, useT } from "@/lib/lang-store"
import { type Lang } from "@/lib/translations"
import { cn } from "@/lib/utils"

const LANGS: { value: Lang; label: string }[] = [
    { value: "en", label: "English" },
    { value: "ru", label: "Русский" },
    { value: "kk", label: "Қазақша" },
]

export default function LoginPage() {
    const router = useRouter()
    const login = useAuthStore((state) => state.login)
    const t = useT()
    const a = t.auth
    const { lang, setLang } = useLangStore()
    const { theme, setTheme } = useTheme()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")
    const [showForgotNote, setShowForgotNote] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError("")
        try {
            await login(email, password)
            router.push("/map")
        } catch (err: unknown) {
            const message =
                axios.isAxiosError(err) && err.response?.data?.detail
                    ? typeof err.response.data.detail === "string"
                        ? err.response.data.detail
                        : "Invalid email or password"
                    : "Login failed. Try again."
            setError(message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
            {/* Top-right controls */}
            <div className="fixed top-4 right-4 flex items-center gap-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-9 w-9 bg-card">
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
                <Button
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 bg-card"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
            </div>

            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="space-y-4 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
                        <MapPin className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <div>
                        <CardTitle className="text-3xl font-bold">CoworkWise</CardTitle>
                        <CardDescription className="mt-2 text-base">{a.tagline}</CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder={a.emailPlaceholder}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="h-11"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="h-11"
                            />
                        </div>
                        {error && (
                            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                        )}
                        <Button
                            type="submit"
                            className="w-full h-11 font-medium"
                            disabled={isLoading}
                        >
                            {isLoading ? a.signingIn : a.signIn}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full h-11 font-medium bg-transparent"
                            onClick={() => router.push("/register")}
                        >
                            {a.register}
                        </Button>
                    </form>

                    <div className="mt-6 text-center text-sm text-muted-foreground">
                        <button
                            type="button"
                            onClick={() => setShowForgotNote((v) => !v)}
                            className="text-primary hover:underline font-medium"
                        >
                            {a.forgotPassword}
                        </button>
                        {showForgotNote && (
                            <p className="mt-2 text-xs text-muted-foreground">{a.forgotPasswordNote}</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}