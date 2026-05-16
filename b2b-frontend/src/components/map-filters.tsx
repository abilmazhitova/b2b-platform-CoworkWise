"use client"

import { useEffect, useState } from "react"
import { Sliders, MapPin, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { useMapStore } from "@/lib/store"
import { api } from "@/lib/api"
import { useT } from "@/lib/lang-store"

interface GridWithActivity {
    id: number
    activity: number
}

function timeOfDayToParams(timeOfDay: string): { time_hour_from?: number; time_hour_to?: number } {
    switch (timeOfDay) {
        case "morning": return { time_hour_from: 6, time_hour_to: 11 }
        case "afternoon": return { time_hour_from: 12, time_hour_to: 17 }
        case "evening": return { time_hour_from: 18, time_hour_to: 23 }
        default: return {}
    }
}

const DISTRICT_VALUES = [
    "all", "almaly", "auezov", "bostandyk", "medeu", "turksib", "zhetysu", "alatau", "nauryzbay",
]
const DISTRICT_LABELS: Record<string, string> = {
    all: "", almaly: "Almaly", auezov: "Auezov", bostandyk: "Bostandyq",
    medeu: "Medeu", turksib: "Turksib", zhetysu: "Zhetysu", alatau: "Alatau", nauryzbay: "Nauryzbay",
}

export function MapFilters() {
    const t = useT()
    const f = t.map.filters
    const { selectedDistrict, radius, timeOfDay, setSelectedDistrict, setRadius, setTimeOfDay, showRecommendationPins, setShowRecommendationPins } = useMapStore()
    const districtQuery = selectedDistrict && selectedDistrict !== "all" ? selectedDistrict : undefined
    const [grids, setGrids] = useState<GridWithActivity[]>([])
    const [statsLoading, setStatsLoading] = useState(true)

    useEffect(() => {
        const params = timeOfDayToParams(timeOfDay)
        const query = new URLSearchParams()
        if (params.time_hour_from != null) query.set("time_hour_from", String(params.time_hour_from))
        if (params.time_hour_to != null) query.set("time_hour_to", String(params.time_hour_to))
        if (districtQuery) query.set("district", districtQuery)
        const url = `/telecom/grids/with_activity${query.toString() ? `?${query}` : ""}`
        setStatsLoading(true)
        api.get<GridWithActivity[]>(url)
            .then(({ data }) => setGrids(data))
            .catch(() => setGrids([]))
            .finally(() => setStatsLoading(false))
    }, [timeOfDay, districtQuery])

    const totalGrids = grids.length
    const withActivity = grids.filter((g) => g.activity > 0).length
    const avgActivity = totalGrids > 0 ? Math.round((grids.reduce((s, g) => s + g.activity, 0) / totalGrids) * 10) / 10 : 0
    const hotZones = totalGrids > 0 ? grids.filter((g) => g.activity >= Math.max(...grids.map((x) => x.activity)) * 0.5).length : 0

    const timeOptions = [
        { value: "all", label: f.timeAll },
        { value: "morning", label: f.timeMorning },
        { value: "afternoon", label: f.timeAfternoon },
        { value: "evening", label: f.timeEvening },
    ]

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Sliders className="h-5 w-5" />
                    {f.title}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="district" className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {f.district}
                    </Label>
                    <Select value={selectedDistrict || "all"} onValueChange={(v) => setSelectedDistrict(v === "all" ? null : v)}>
                        <SelectTrigger id="district">
                            <SelectValue placeholder={f.districtPlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                            {DISTRICT_VALUES.map((v) => (
                                <SelectItem key={v} value={v}>
                                    {v === "all" ? f.districtAll : DISTRICT_LABELS[v]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-3">
                    <Label htmlFor="radius">{f.radius}: {radius}m</Label>
                    <Slider id="radius" min={25} max={2000} step={25} value={[radius]} onValueChange={(v) => setRadius(v[0])} className="w-full" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>25m</span>
                        <span>2km</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="time" className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        {f.timeOfDay}
                    </Label>
                    <Select value={timeOfDay} onValueChange={setTimeOfDay}>
                        <SelectTrigger id="time">
                            <SelectValue placeholder={f.timePlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                            {timeOptions.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-3 py-3">
                    <Switch
                        id="show-rec-pins"
                        checked={showRecommendationPins}
                        onCheckedChange={(c) => setShowRecommendationPins(Boolean(c))}
                        className="mt-0.5 shrink-0"
                    />
                    <div className="space-y-1 min-w-0">
                        <Label htmlFor="show-rec-pins" className="text-sm font-medium cursor-pointer leading-snug">
                            {f.showML}
                        </Label>
                        <p className="text-xs text-muted-foreground leading-snug">{f.showMLDesc}</p>
                    </div>
                </div>

                <div className="pt-4 border-t space-y-2">
                    {districtQuery && !statsLoading && totalGrids === 0 && (
                        <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 rounded-md p-2">
                            {f.noGridsInDistrict}
                        </p>
                    )}
                    {statsLoading ? (
                        <div className="text-sm text-muted-foreground">{f.statsLoading}</div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">{f.gridCells}</span>
                                <span className="font-semibold">{totalGrids}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">{f.withActivity}</span>
                                <span className="font-semibold">{withActivity}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">{f.avgActivity}</span>
                                <span className="font-semibold">{avgActivity}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">{f.hotZones}</span>
                                <span className="font-semibold">{hotZones}</span>
                            </div>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}