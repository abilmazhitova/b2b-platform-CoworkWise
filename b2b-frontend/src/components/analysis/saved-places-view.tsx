"use client"

import Link from "next/link"
import { MapPin, Trash2, ArrowLeftRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useSavedPlacesStore } from "@/lib/saved-places-store"
import { districtNameToSlug } from "@/lib/districts"
import { useMemo, useState } from "react"
import { useT } from "@/lib/lang-store"

function mapHref(lat: number, lng: number, district: string) {
    const slug = districtNameToSlug(district.replace(/district/gi, "").trim())
    const base = `/map?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
    return slug ? `${base}&district=${encodeURIComponent(slug)}` : base
}

export function SavedPlacesView() {
    const t = useT()
    const s = t.analysis.saved
    const places = useSavedPlacesStore((st) => st.places)
    const removePlace = useSavedPlacesStore((st) => st.removePlace)
    const clearAll = useSavedPlacesStore((st) => st.clearAll)
    const [sourceFilter, setSourceFilter] = useState<"all" | "recommendation" | "map">("all")

    const filteredPlaces = useMemo(() => {
        if (sourceFilter === "all") return places
        return places.filter((p) => p.source === sourceFilter)
    }, [places, sourceFilter])

    const sortedByActivity = [...filteredPlaces].sort((a, b) => (b.activityScore ?? 0) - (a.activityScore ?? 0))
    const sortedByCowork = [...filteredPlaces].sort((a, b) => (a.coworkingCount ?? 0) - (b.coworkingCount ?? 0))
    const topActivity = sortedByActivity[0]
    const lowestRivalry = sortedByCowork[0]

    if (places.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>{s.title}</CardTitle>
                    <CardDescription>{s.description}</CardDescription>
                </CardHeader>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/analysis?tab=compare">{s.compare}</Link>
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => clearAll()}>
                        {s.clearAll}
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {(["all", "recommendation", "map"] as const).map((filter) => (
                    <Button
                        key={filter}
                        size="sm"
                        variant={sourceFilter === filter ? "default" : "outline"}
                        onClick={() => setSourceFilter(filter)}
                    >
                        {filter === "all" ? s.filterAll : filter === "recommendation" ? s.filterRec : s.filterMap}
                        {" "}({filter === "all" ? places.length : places.filter((p) => p.source === filter).length})
                    </Button>
                ))}
            </div>

            {(topActivity || lowestRivalry) && filteredPlaces.length >= 2 && (
                <div className="grid gap-4 md:grid-cols-2">
                    {topActivity && (
                        <Card className="border-primary/30">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <ArrowLeftRight className="h-4 w-4" />
                                    {s.strongestActivity}
                                </CardTitle>
                                <CardDescription>{topActivity.label}</CardDescription>
                            </CardHeader>
                            <CardContent className="text-sm space-y-1">
                                <p>{s.score}: <span className="font-semibold tabular-nums">{(topActivity.activityScore ?? 0).toLocaleString()}</span></p>
                                <p className="text-muted-foreground">{topActivity.district}</p>
                            </CardContent>
                        </Card>
                    )}
                    {lowestRivalry && (
                        <Card className="border-emerald-600/30">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <ArrowLeftRight className="h-4 w-4" />
                                    {s.lowestRivalry}
                                </CardTitle>
                                <CardDescription>{lowestRivalry.label}</CardDescription>
                            </CardHeader>
                            <CardContent className="text-sm space-y-1">
                                <p>{s.coworkingsMetric}: <span className="font-semibold tabular-nums">{lowestRivalry.coworkingCount ?? "—"}</span></p>
                                <p className="text-muted-foreground">{lowestRivalry.district}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle>{s.tableTitle} ({filteredPlaces.length})</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b text-left text-muted-foreground">
                                <th className="pb-2 pr-3 font-medium">{s.colLabel}</th>
                                <th className="pb-2 pr-3 font-medium">{s.colDistrict}</th>
                                <th className="pb-2 pr-3 font-medium">{s.colActivity}</th>
                                <th className="pb-2 pr-3 font-medium">{s.colCoworkings}</th>
                                <th className="pb-2 pr-3 font-medium">{s.colSource}</th>
                                <th className="pb-2 font-medium w-28" />
                            </tr>
                        </thead>
                        <tbody>
                            {filteredPlaces.map((p) => (
                                <tr key={p.id} className="border-b border-border/60">
                                    <td className="py-2 pr-3 font-medium">{p.label}</td>
                                    <td className="py-2 pr-3">{p.district}</td>
                                    <td className="py-2 pr-3 tabular-nums">{(p.activityScore ?? 0).toLocaleString()}</td>
                                    <td className="py-2 pr-3 tabular-nums">{p.coworkingCount ?? "—"}</td>
                                    <td className="py-2 pr-3 capitalize text-muted-foreground">{p.source}</td>
                                    <td className="py-2">
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                                <Link href={mapHref(p.lat, p.lng, p.district)} aria-label="Open on map">
                                                    <MapPin className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removePlace(p.id)} aria-label="Remove">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    )
}