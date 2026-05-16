"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, Users, Heart, Check, CircleAlert, Building2 } from "lucide-react"
import { useSavedPlacesStore } from "@/lib/saved-places-store"
import { api } from "@/lib/api"
import { districtNameToSlug } from "@/lib/districts"
import { useMapStore } from "@/lib/store"
import { Loader2 } from "lucide-react"
import { useT } from "@/lib/lang-store"

interface Recommendation {
    id: string
    location: string
    district: string
    score: number
    rating: string
    reasons: string[]
    metrics: { footfall?: number; competition?: number; rent?: number; growth?: string }
    lat: number
    lng: number
}

function districtLabel(district: string) {
    const d = (district || "").trim()
    if (!d || d === "—") return "City (outside named districts)"
    if (/district$/i.test(d)) return d
    return `${d} District`
}

function extractZidFromLocation(location: string): string | null {
    const m = (location || "").match(/ZID\s*(\d+)/i)
    return m ? m[1] : null
}

function timeOfDayToParams(timeOfDay: string): { time_hour_from?: number; time_hour_to?: number } {
    switch (timeOfDay) {
        case "morning": return { time_hour_from: 6, time_hour_to: 11 }
        case "afternoon": return { time_hour_from: 12, time_hour_to: 17 }
        case "evening": return { time_hour_from: 18, time_hour_to: 23 }
        default: return {}
    }
}

function recommendationDisplayTitle(rec: Recommendation, rank: number): string {
    const d = (rec.district || "").trim()
    if (d && d !== "—") return `${districtLabel(rec.district)} · ${rank}`
    return `Recommended area · ${rank}`
}

export function RecommendationsView() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const t = useT()
    const r = t.analysis.recommendations
    const addSavedPlace = useSavedPlacesStore((s) => s.addPlace)
    const timeOfDay = useMapStore((s) => s.timeOfDay)
    const selectedDistrict = useMapStore((s) => s.selectedDistrict)
    const [recommendations, setRecommendations] = useState<Recommendation[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [saveStateById, setSaveStateById] = useState<Record<string, "saved" | "duplicate">>({})
    const [focusedRecommendationId, setFocusedRecommendationId] = useState<string | null>(null)
    const [saveToast, setSaveToast] = useState<null | { text: string; kind: "success" | "warning" }>(null)
    const [copyDoneById, setCopyDoneById] = useState<Record<string, boolean>>({})

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        const timeParams = timeOfDayToParams(timeOfDay)
        api.get<Recommendation[]>("/analysis/recommendations", {
            params: {
                limit: 15,
                ...(timeParams.time_hour_from != null ? { time_hour_from: timeParams.time_hour_from } : {}),
                ...(timeParams.time_hour_to != null ? { time_hour_to: timeParams.time_hour_to } : {}),
            },
        })
            .then(({ data }) => {
                if (cancelled) return
                let rows = data || []
                if (selectedDistrict) {
                    const inDistrict = rows.filter((x) => districtNameToSlug(x.district) === selectedDistrict)
                    rows = inDistrict.length > 0 ? inDistrict : rows
                }
                setRecommendations(rows)
            })
            .catch(() => { if (!cancelled) setError("Failed to load recommendations") })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [timeOfDay, selectedDistrict])

    useEffect(() => {
        const focusId = searchParams.get("focus_rec")
        if (!focusId || recommendations.length === 0) return
        const exists = recommendations.some((x) => x.id === focusId)
        if (!exists) return
        setFocusedRecommendationId(focusId)
        document.getElementById(`recommendation-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
        const t = window.setTimeout(() => setFocusedRecommendationId((curr) => (curr === focusId ? null : curr)), 2400)
        return () => window.clearTimeout(t)
    }, [searchParams, recommendations])

    useEffect(() => {
        if (!saveToast) return
        const timer = window.setTimeout(() => setSaveToast(null), 2500)
        return () => window.clearTimeout(timer)
    }, [saveToast])

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }
    if (error) {
        return <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
    }
    if (recommendations.length === 0) {
        return <p className="text-muted-foreground">{r.noData}</p>
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{r.title}</CardTitle>
                    <CardDescription>{r.description}</CardDescription>
                </CardHeader>
            </Card>

            <div className="space-y-4">
                {recommendations.map((rec, index) => {
                    const rank = index + 1
                    const zid = extractZidFromLocation(rec.location)
                    return (
                        <Card
                            id={`recommendation-${rec.id}`}
                            key={rec.id}
                            className={`overflow-hidden transition-shadow ${focusedRecommendationId === rec.id ? "ring-2 ring-emerald-500 shadow-lg shadow-emerald-500/20" : ""}`}
                        >
                            <CardHeader className="bg-muted/50">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="secondary" className="bg-primary text-primary-foreground">#{rank}</Badge>
                                            <div>
                                                <CardTitle className="text-xl">{recommendationDisplayTitle(rec, rank)}</CardTitle>
                                                <p className="text-xs text-muted-foreground font-normal mt-1">
                                                    {zid ? `${r.zidLabel} ${zid}` : rec.location}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right space-y-1">
                                        <div className="inline-flex flex-col items-end rounded-md border border-border bg-muted/50 px-2 py-1">
                                            <span className="text-xs text-muted-foreground">{r.modelScore}</span>
                                            <span className="text-2xl font-bold tabular-nums">{rec.score}/100</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground max-w-[14rem]">{rec.rating}</p>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-6">
                                <div className="grid gap-6 md:grid-cols-2">
                                    <div>
                                        <h4 className="mb-3 font-semibold">{r.advantages}</h4>
                                        <ul className="space-y-2">
                                            {(rec.reasons || []).map((reason, i) => (
                                                <li key={i} className="flex items-start gap-2 text-sm">
                                                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0" />
                                                    <span className="text-muted-foreground">{reason}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div>
                                        <h4 className="mb-3 font-semibold">{r.metrics}</h4>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4 text-primary" />
                                                    <span className="text-sm">{r.estimatedFootfall}</span>
                                                </div>
                                                <span className="font-semibold">{(rec.metrics?.footfall ?? 0).toLocaleString()}</span>
                                            </div>
                                            {(rec.metrics?.rent ?? 0) > 0 && (
                                                <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                                                    <div className="flex items-center gap-2">
                                                        <Building2 className="h-4 w-4 text-muted-foreground" />
                                                        <span className="text-sm">{r.rent}</span>
                                                    </div>
                                                    <span className="font-semibold">
                                                        {(rec.metrics.rent!).toLocaleString()} {r.rentUnit}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                                                <div className="flex items-center gap-2">
                                                    <TrendingUp className="h-4 w-4 text-secondary" />
                                                    <span className="text-sm">{r.growth}</span>
                                                </div>
                                                <span className="font-semibold">{rec.metrics?.growth ?? "—"}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                                    <Button
                                        className="flex-1 min-w-[140px]"
                                        type="button"
                                        onClick={() => {
                                            const slug = districtNameToSlug(rec.district)
                                            const base = `/map?lat=${encodeURIComponent(String(rec.lat))}&lng=${encodeURIComponent(String(rec.lng))}`
                                            router.push(slug ? `${base}&district=${encodeURIComponent(slug)}` : base)
                                        }}
                                    >
                                        {r.viewOnMap}
                                    </Button>
                                    <Button
                                        variant={saveStateById[rec.id] === "saved" ? "default" : "secondary"}
                                        className={`flex-1 min-w-[140px] gap-2 transition-all ${
                                            saveStateById[rec.id] === "saved" ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                                            : saveStateById[rec.id] === "duplicate" ? "border border-amber-300 text-amber-700 dark:text-amber-300" : ""
                                        }`}
                                        type="button"
                                        onClick={() => {
                                            const res = addSavedPlace({
                                                lat: rec.lat, lng: rec.lng,
                                                label: recommendationDisplayTitle(rec, rank),
                                                district: districtLabel(rec.district),
                                                activityScore: rec.metrics?.footfall,
                                                coworkingCount: rec.metrics?.competition,
                                                source: "recommendation",
                                            })
                                            const state = res.ok ? "saved" : "duplicate"
                                            setSaveStateById((prev) => ({ ...prev, [rec.id]: state }))
                                            setSaveToast({ text: res.ok ? r.savedToast : r.duplicateToast, kind: res.ok ? "success" : "warning" })
                                            window.setTimeout(() => {
                                                setSaveStateById((prev) => { const next = { ...prev }; delete next[rec.id]; return next })
                                            }, 2200)
                                        }}
                                    >
                                        {saveStateById[rec.id] === "saved" ? <><Check className="h-4 w-4" />{r.saved}</>
                                         : saveStateById[rec.id] === "duplicate" ? <><CircleAlert className="h-4 w-4" />{r.alreadySaved}</>
                                         : <><Heart className="h-4 w-4" />{r.saveToCompare}</>}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        className={`flex-1 min-w-[140px] gap-2 bg-transparent transition-all ${copyDoneById[rec.id] ? "border-emerald-500 text-emerald-700 dark:text-emerald-400" : ""}`}
                                        type="button"
                                        onClick={() => {
                                            const text = [
                                                `CoworkWise — ${recommendationDisplayTitle(rec, rank)}`,
                                                zid ? `ZID: ${zid}` : rec.location,
                                                `District: ${districtLabel(rec.district)}`,
                                                `Score: ${rec.score} (${rec.rating})`,
                                                `Footfall: ${rec.metrics?.footfall ?? "—"}`,
                                                `Growth: ${rec.metrics?.growth ?? "—"}`,
                                                `Reasons: ${(rec.reasons || []).join("; ")}`,
                                            ].join("\n")
                                            void navigator.clipboard.writeText(text).then(() => {
                                                setCopyDoneById((prev) => ({ ...prev, [rec.id]: true }))
                                                window.setTimeout(() => setCopyDoneById((prev) => { const n = { ...prev }; delete n[rec.id]; return n }), 2000)
                                            })
                                        }}
                                    >
                                        {copyDoneById[rec.id] ? <><Check className="h-4 w-4" />Copied</> : r.copySummary}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {saveToast && (
                <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
                    <div className={`rounded-lg border px-3 py-2 shadow-lg backdrop-blur text-sm flex items-center gap-3 ${
                        saveToast.kind === "success" ? "bg-emerald-50/95 border-emerald-300 text-emerald-800" : "bg-amber-50/95 border-amber-300 text-amber-800"
                    }`}>
                        <span>{saveToast.text}</span>
                        <Button size="sm" variant="outline" className="h-7 text-xs bg-transparent" onClick={() => router.push("/analysis?tab=saved")}>
                            {r.compareNow}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}