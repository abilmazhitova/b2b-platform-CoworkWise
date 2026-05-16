"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"
import { api } from "@/lib/api"
import { Loader2 } from "lucide-react"
import { useMapStore } from "@/lib/store"
import { districtNameToSlug } from "@/lib/districts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useSavedPlacesStore } from "@/lib/saved-places-store"
import { useT } from "@/lib/lang-store"

interface CompareItem {
    id?: string
    location: string
    footfall: number
    coworkings: number
    competition: number
    avgRent?: number
    district?: string
    zone_id?: string
}

function timeOfDayToParams(timeOfDay: string): { time_hour_from?: number; time_hour_to?: number } {
    switch (timeOfDay) {
        case "morning": return { time_hour_from: 6, time_hour_to: 11 }
        case "afternoon": return { time_hour_from: 12, time_hour_to: 17 }
        case "evening": return { time_hour_from: 18, time_hour_to: 23 }
        default: return {}
    }
}

// Median commercial rent tg/m²/month by district (Krisha.kz 2026-05)
const DISTRICT_RENT: Record<string, number> = {
    Almaly: 9000, Auezov: 7500, Bostandyq: 12100, Medeu: 12000,
    Turksib: 5000, Zhetysu: 6667, Alatau: 6000, Nauryzbay: 4615,
}
const RENT_MIN = 4615
const RENT_MAX = 12100

function rentForDistrict(district: string | undefined): number {
    if (!district) return 0
    const d = district.replace(/\s*district$/i, "").trim()
    return DISTRICT_RENT[d] ?? 0
}

function decisionScore(item: CompareItem): number {
    const footfall = item.footfall || 0
    const compPenalty = (item.competition || item.coworkings || 0) * 3500
    const rent = item.avgRent || 0
    // Rent penalty: up to 25% of footfall for the most expensive district
    const rentNorm = rent > 0 ? Math.min(1, Math.max(0, (rent - RENT_MIN) / (RENT_MAX - RENT_MIN))) : 0
    const rentPenalty = Math.round(footfall * 0.25 * rentNorm)
    return Math.round(footfall - compPenalty - rentPenalty)
}

function splitTitle(full: string): { title: string; sub: string } {
    const parts = full.split("·")
    if (parts.length >= 2) return { title: parts[0].trim(), sub: parts.slice(1).join("·").trim() }
    const g = full.match(/^Grid\s+(\d+)\s*$/i)
    if (g) return { title: "Telecom cell", sub: `ZID ${g[1]}` }
    return { title: full.trim(), sub: "" }
}

type BarTooltipPayload = CompareItem & { shortLabel?: string }

function FootTrafficBarTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: BarTooltipPayload }> }) {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload
    if (!row) return null
    return (
        <div className="z-50 min-w-[200px] rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg">
            <p className="font-semibold leading-snug">{row.location}</p>
            <p className="mt-1">
                <span className="text-muted-foreground">Footfall</span>
                <span className="ml-1 font-medium tabular-nums">{row.footfall.toLocaleString()}</span>
            </p>
        </div>
    )
}

export function CompareView() {
    const searchParams = useSearchParams()
    const t = useT()
    const c = t.analysis.compare
    const timeOfDay = useMapStore((s) => s.timeOfDay)
    const selectedDistrict = useMapStore((s) => s.selectedDistrict)
    const sessionComparePoints = useMapStore((s) => s.sessionComparePoints)
    const savedPlaces = useSavedPlacesStore((s) => s.places)
    const [comparisonData, setComparisonData] = useState<CompareItem[]>([])
    const [scope, setScope] = useState<"saved" | "model" | "session">("model")
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        const timeParams = timeOfDayToParams(timeOfDay)
        api.get<CompareItem[]>("/analysis/compare", {
            params: {
                limit: 10,
                ...(timeParams.time_hour_from != null ? { time_hour_from: timeParams.time_hour_from } : {}),
                ...(timeParams.time_hour_to != null ? { time_hour_to: timeParams.time_hour_to } : {}),
            },
        })
            .then(({ data }) => {
                if (cancelled) return
                let rows = data || []
                if (selectedDistrict) {
                    const inDistrict = rows.filter((r) => districtNameToSlug(r.district || "") === selectedDistrict)
                    rows = inDistrict.length > 0 ? inDistrict : rows
                }
                setComparisonData(rows)
            })
            .catch(() => { if (!cancelled) setError("Failed to load comparison data") })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [timeOfDay, selectedDistrict])

    useEffect(() => {
        const reqScope = searchParams.get("scope")
        if (reqScope === "session" && sessionComparePoints.length >= 2) { setScope("session"); return }
        if (reqScope === "saved" && savedPlaces.length >= 2) { setScope("saved"); return }
        if (reqScope === "model") { setScope("model"); return }
        if (sessionComparePoints.length >= 2) setScope("session")
        else if (savedPlaces.length >= 2) setScope("saved")
        else setScope("model")
    }, [savedPlaces.length, sessionComparePoints.length, searchParams])

    const rankedModel = [...comparisonData]
        .map((x, i) => ({ ...x, id: x.zone_id ? String(x.zone_id) : `model-${i}`, decisionScore: decisionScore(x) }))
        .sort((a, b) => b.decisionScore - a.decisionScore)

    const rankedSaved = [...savedPlaces]
        .map((p) => {
            const coworkings = p.coworkingCount ?? 0
            const rent = rentForDistrict(p.district)
            const footfall = p.activityScore ?? 0
            const comp = Math.min(10, coworkings)
            return { id: p.id, location: p.label, district: p.district, footfall, coworkings, competition: comp, avgRent: rent, zone_id: "", decisionScore: decisionScore({ location: p.label, footfall, coworkings, competition: comp, avgRent: rent }) }
        })
        .sort((a, b) => b.decisionScore - a.decisionScore)

    const rankedSession = [...sessionComparePoints]
        .map((p) => {
            const coworkings = p.competition ?? 0
            const loc = p.district && p.district !== "Outside city" ? `${p.district} · map pin` : `Pin ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`
            const rent = rentForDistrict(p.district)
            const footfall = p.density ?? 0
            const comp = Math.min(10, coworkings)
            return { id: p.id, location: loc, district: p.district || "—", footfall, coworkings, competition: comp, avgRent: rent, zone_id: "", decisionScore: decisionScore({ location: loc, footfall, coworkings, competition: comp, avgRent: rent }) }
        })
        .sort((a, b) => b.decisionScore - a.decisionScore)

    const data = scope === "saved" ? rankedSaved : scope === "session" ? rankedSession : rankedModel
    const bestNow = data[0]
    const bestBalanced = data
        .map((x) => ({ ...x, balanceScore: Math.round((x.footfall || 0) * 0.6 - (x.competition || x.coworkings || 0) * 0.4 * 10000) }))
        .sort((a, b) => b.balanceScore - a.balanceScore)[0]
    const highestRisk = [...data].sort((a, b) => (b.competition || b.coworkings || 0) - (a.competition || a.coworkings || 0))[0]

    if (loading) {
        return (
            <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <p className="text-sm font-medium">{t.common.loading}</p>
                </div>
            </div>
        )
    }
    if (error) {
        return <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
    }
    if (scope === "model" && comparisonData.length === 0) {
        return <p className="text-muted-foreground">{c.noGridData}</p>
    }
    if (scope === "saved" && savedPlaces.length < 2) {
        return <p className="text-muted-foreground">{c.tableSavedDesc}</p>
    }
    if (scope === "session" && sessionComparePoints.length < 2) {
        return (
            <p className="text-muted-foreground">
                {c.sessionHint}{" "}
                <Link href="/map" className="underline font-medium text-foreground">{c.goToMap}</Link>
                {", "}{c.sessionHint2}
            </p>
        )
    }

    const scopeLabel = scope === "session" ? c.tableSession : scope === "saved" ? c.tableSaved : c.tableTitle
    const scopeDesc = scope === "session" ? c.tableSessionDesc : scope === "saved" ? c.tableSavedDesc : c.tableDesc

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">{c.calculationTitle}</CardTitle>
                    <CardDescription>{c.calculationDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant={scope === "session" ? "default" : "outline"} onClick={() => setScope("session")} disabled={sessionComparePoints.length < 2}>
                            {c.scopeSession} ({sessionComparePoints.length})
                        </Button>
                        <Button size="sm" variant={scope === "saved" ? "default" : "outline"} onClick={() => setScope("saved")} disabled={savedPlaces.length < 2}>
                            {c.scopeSaved} ({savedPlaces.length})
                        </Button>
                        <Button size="sm" variant={scope === "model" ? "default" : "outline"} onClick={() => setScope("model")}>
                            {c.scopeModel} ({rankedModel.length})
                        </Button>
                    </div>
                    {scope === "model" && (
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/map">{c.openMap}</Link>
                        </Button>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-emerald-600/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{c.metricBestNow}</CardTitle>
                        <CardDescription>{c.metricBestNowDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm">
                        <p className="font-medium">{bestNow?.district || bestNow?.location || "—"}</p>
                        <p className="text-muted-foreground">{c.decisionScore}: {bestNow?.decisionScore?.toLocaleString() ?? "—"}</p>
                    </CardContent>
                </Card>
                <Card className="border-primary/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{c.metricBalanced}</CardTitle>
                        <CardDescription>{c.metricBalancedDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm">
                        <p className="font-medium">{bestBalanced?.district || bestBalanced?.location || "—"}</p>
                        <p className="text-muted-foreground">{c.balanceScore}: {bestBalanced?.balanceScore?.toLocaleString() ?? "—"}</p>
                    </CardContent>
                </Card>
                <Card className="border-amber-500/30">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">{c.metricRisk}</CardTitle>
                        <CardDescription>{c.metricRiskDesc}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm">
                        <p className="font-medium">{highestRisk?.district || highestRisk?.location || "—"}</p>
                        <p className="text-muted-foreground">{c.competition}: {highestRisk ? (highestRisk.competition || highestRisk.coworkings || 0) : "—"}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{scopeLabel}</CardTitle>
                    <CardDescription>{scopeDesc}</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-muted-foreground">
                                <th className="pb-2 pr-3 font-medium">{c.colRank}</th>
                                <th className="pb-2 pr-3 font-medium">{c.colDistrict}</th>
                                <th className="pb-2 pr-3 font-medium">{c.colFootfall}</th>
                                <th className="pb-2 pr-3 font-medium">{c.colCoworkings}</th>
                                <th className="pb-2 pr-3 font-medium">{c.colCompetition}</th>
                                <th className="pb-2 pr-3 font-medium">{c.colRent}</th>
                                <th className="pb-2 font-medium">{c.colScore}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((location, idx) => {
                                const { title, sub } = splitTitle(location.location)
                                const rowKey = location.id ?? `${location.location}-${idx}`
                                return (
                                    <tr key={rowKey} className="border-b border-border/60">
                                        <td className="py-2 pr-3 font-medium">
                                            {idx + 1} {idx === 0 && <Badge className="ml-1 bg-emerald-600">Top</Badge>}
                                        </td>
                                        <td className="py-2 pr-3">
                                            <div className="font-medium">{title}</div>
                                            <div className="text-xs text-muted-foreground">{sub || `Cell ${location.zone_id || "—"}`}</div>
                                        </td>
                                        <td className="py-2 pr-3 tabular-nums">{location.footfall.toLocaleString()}</td>
                                        <td className="py-2 pr-3 tabular-nums">{location.coworkings}</td>
                                        <td className="py-2 pr-3 tabular-nums">{location.competition}/10</td>
                                        <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                                            {location.avgRent ? location.avgRent.toLocaleString() : "—"}
                                        </td>
                                        <td className="py-2 tabular-nums font-semibold">{location.decisionScore.toLocaleString()}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{c.chartTitle}</CardTitle>
                    <CardDescription>{c.chartDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={data.map((x, i) => ({ ...x, shortLabel: (x.district || "").slice(0, 10) || `Z${(x.zone_id || String(i)).slice(-6)}` }))}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                            <XAxis dataKey="shortLabel" className="text-xs" interval={0} angle={-25} textAnchor="end" height={70} />
                            <YAxis className="text-xs" tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : String(v))} />
                            <Tooltip content={<FootTrafficBarTooltip />} cursor={false} wrapperStyle={{ zIndex: 50, outline: "none" }} />
                            <Legend />
                            <Bar dataKey="footfall" fill="#6366f1" name={c.colFootfall} radius={[6, 6, 0, 0]} maxBarSize={48} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    )
}