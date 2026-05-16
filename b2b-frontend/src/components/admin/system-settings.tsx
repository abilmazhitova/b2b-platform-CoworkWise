"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Settings, Lock } from "lucide-react"
import { useT } from "@/lib/lang-store"

export function SystemSettings() {
    const t = useT()
    const s = t.admin.settings

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        {s.title}
                    </CardTitle>
                    <CardDescription>{s.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="app-name">{s.appName}</Label>
                        <Input id="app-name" defaultValue="CoworkWise" />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="timezone">{s.timezone}</Label>
                        <Select defaultValue="almaty">
                            <SelectTrigger id="timezone">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="almaty">Asia/Almaty (GMT+6)</SelectItem>
                                <SelectItem value="astana">Asia/Astana (GMT+6)</SelectItem>
                                <SelectItem value="moscow">Europe/Moscow (GMT+3)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="language">{s.language}</Label>
                        <Select defaultValue="en">
                            <SelectTrigger id="language">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="ru">Русский</SelectItem>
                                <SelectItem value="kk">Қазақша</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Lock className="h-5 w-5" />
                        {s.securityTitle}
                    </CardTitle>
                    <CardDescription>{s.securityDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>{s.sessionTimeout}</Label>
                            <p className="text-sm text-muted-foreground">{s.sessionTimeoutDesc}</p>
                        </div>
                        <Select defaultValue="30">
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="15">{s.min15}</SelectItem>
                                <SelectItem value="30">{s.min30}</SelectItem>
                                <SelectItem value="60">{s.hour1}</SelectItem>
                                <SelectItem value="never">{s.never}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label>{s.apiAccess}</Label>
                            <p className="text-sm text-muted-foreground">{s.apiAccessDesc}</p>
                        </div>
                        <Switch defaultChecked />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}