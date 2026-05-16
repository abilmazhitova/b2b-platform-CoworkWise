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

export default function RegisterPage() {
    const router = useRouter()
    const register = useAuthStore((state) => state.register)
    const t = useT()
    const a = t.auth
    const { lang, setLang } = useLangStore()
    const { theme, setTheme } = useTheme()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [fullName, setFullName] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError("")
        if (password !== confirmPassword) { setError(a.passwordMismatch); return }
        if (password.length < 6) { setError(a.passwordTooShort); return }
        setIsLoading(true)
        try {
            await register(email, password, fullName || undefined)
            router.push("/map")
        } catch (err: unknown) {
            const message =
                axios.isAxiosError(err) && err.response?.data?.detail
                    ? typeof err.response.data.detail === "string"
                        ? err.response.data.detail
                        : "Registration failed."
                    : "Registration failed. Please try again."
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
                        <CardTitle className="text-3xl font-bold">{a.createAccount}</CardTitle>
                        <CardDescription className="mt-2 text-base">{a.createAccountDesc}</CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="fullName">{a.fullName}</Label>
                            <Input
                                id="fullName"
                                type="text"
                                placeholder={a.fullNamePlaceholder}
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="h-11"
                            />
                        </div>
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
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">{a.confirmPassword}</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="h-11"
                            />
                        </div>
                        {error && (
                            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
                        )}
                        <Button type="submit" className="w-full h-11 font-medium" disabled={isLoading}>
                            {isLoading ? a.signingUp : a.signUp}
                        </Button>
                    </form>

                    <div className="mt-6 text-center text-sm text-muted-foreground">
                        <p>
                            {a.alreadyHaveAccount}{" "}
                            <button
                                type="button"
                                onClick={() => router.push("/login")}
                                className="text-primary hover:underline font-medium"
                            >
                                {a.signIn}
                            </button>
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}