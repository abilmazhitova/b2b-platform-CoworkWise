"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { useAuthStore } from "@/lib/store"
import { Mail, Shield, Save, LogOut } from "lucide-react"
import { api } from "@/lib/api"
import { useT } from "@/lib/lang-store"

interface BackendUser {
    id: number
    email: string
    full_name: string | null
    is_admin: boolean
}

function toFrontendUser(u: BackendUser) {
    return {
        id: String(u.id),
        email: u.email,
        name: u.full_name || u.email,
        role: (u.is_admin ? "admin" : "user") as "admin" | "user",
    }
}

export default function ProfilePage() {
    const router = useRouter()
    const t = useT()
    const p = t.profile
    const { user, token, logout, setUser } = useAuthStore()
    const [fullName, setFullName] = useState(user?.name ?? "")
    const [email, setEmail] = useState(user?.email ?? "")
    const [profileSaving, setProfileSaving] = useState(false)
    const [profileError, setProfileError] = useState<string | null>(null)
    const [profileSuccess, setProfileSuccess] = useState(false)
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [passwordSaving, setPasswordSaving] = useState(false)
    const [passwordError, setPasswordError] = useState<string | null>(null)
    const [passwordSuccess, setPasswordSuccess] = useState(false)

    useEffect(() => {
        if (user) { setFullName(user.name); setEmail(user.email) }
    }, [user])

    const handleLogout = () => { logout(); router.push("/login") }

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault()
        setProfileError(null)
        setProfileSuccess(false)
        setProfileSaving(true)
        try {
            const payload: { full_name: string | null; email?: string } = { full_name: fullName.trim() || null }
            if (email.trim()) payload.email = email.trim()
            const { data } = await api.patch<BackendUser>("/auth/me", payload)
            if (token) setUser(toFrontendUser(data), token)
            setProfileSuccess(true)
        } catch (err: unknown) {
            const msg = err && typeof err === "object" && "response" in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : null
            setProfileError(typeof msg === "string" ? msg : "Failed to update profile")
        } finally {
            setProfileSaving(false)
        }
    }

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setPasswordError(null)
        setPasswordSuccess(false)
        if (newPassword !== confirmPassword) { setPasswordError(p.passwordMismatch); return }
        if (newPassword.length < 6) { setPasswordError(p.passwordTooShort); return }
        setPasswordSaving(true)
        try {
            await api.post("/auth/change-password", { current_password: currentPassword, new_password: newPassword })
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
            setPasswordSuccess(true)
        } catch (err: unknown) {
            const msg = err && typeof err === "object" && "response" in err
                ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                : null
            setPasswordError(typeof msg === "string" ? msg : "Failed to update password")
        } finally {
            setPasswordSaving(false)
        }
    }

    return (
        <div className="flex h-screen flex-col">
            <Navbar />
            <main className="flex-1 overflow-y-auto bg-muted/30">
                <div className="mx-auto max-w-3xl p-6 space-y-6">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex items-start gap-6">
                                <Avatar className="h-24 w-24">
                                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                                        {user?.name.split(" ").map((n) => n[0]).join("")}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                    <div className="flex items-center gap-3">
                                        <h1 className="text-2xl font-bold">{user?.name}</h1>
                                        <Badge variant={user?.role === "admin" ? "default" : "secondary"} className="gap-1">
                                            {user?.role === "admin" && <Shield className="h-3 w-3" />}
                                            {user?.role === "admin" ? t.common.admin : t.common.user}
                                        </Badge>
                                    </div>
                                    <p className="mt-1 text-muted-foreground flex items-center gap-2">
                                        <Mail className="h-4 w-4" />
                                        {user?.email}
                                    </p>
                                    <div className="mt-4">
                                        <Button variant="outline" onClick={handleLogout} className="gap-2 bg-transparent">
                                            <LogOut className="h-4 w-4" />
                                            {t.nav.logout}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{p.infoTitle}</CardTitle>
                            <CardDescription>{p.infoDesc}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSaveProfile} className="space-y-6">
                                {profileError && (
                                    <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{profileError}</div>
                                )}
                                {profileSuccess && (
                                    <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                                        {p.profileUpdated}
                                    </div>
                                )}
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="name">{p.fullName}</Label>
                                        <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="email">{p.email}</Label>
                                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <Button type="button" variant="outline" onClick={() => { setFullName(user?.name ?? ""); setEmail(user?.email ?? "") }}>
                                        {t.common.cancel}
                                    </Button>
                                    <Button type="submit" className="gap-2" disabled={profileSaving}>
                                        {profileSaving ? p.saving : <><Save className="h-4 w-4" />{t.common.save}</>}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{p.passwordTitle}</CardTitle>
                            <CardDescription>{p.passwordDesc}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleChangePassword} className="space-y-4">
                                {passwordError && (
                                    <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{passwordError}</div>
                                )}
                                {passwordSuccess && (
                                    <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                                        {p.passwordUpdated}
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label htmlFor="current-password">{p.currentPassword}</Label>
                                    <Input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="new-password">{p.newPassword}</Label>
                                    <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="confirm-password">{p.confirmPassword}</Label>
                                    <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                                </div>
                                <Button type="submit" disabled={passwordSaving}>
                                    {passwordSaving ? p.updating : p.updatePassword}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}