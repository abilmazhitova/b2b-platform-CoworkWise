"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts"
import { TrendingUp } from "lucide-react"
import { api } from "@/lib/api"
import { Loader2 } from "lucide-react"
import { useT } from "@/lib/lang-store"

interface ForecastPoint {
    month: string
    actual: number | null
    predicted: number
    lower?: number | null
    upper?: number | null
}

interface ForecastDistrictItem {
    district: string
    growth_trend: number
    infra_strength: number
    competition: number
    forecast_score: number
    category: string
    recommendation: string
}

interface ForecastPayload {
    series: ForecastPoint[]
    districts: ForecastDistrictItem[]
}

export function ForecastView() {
    const t = useT()
    const f = t.analysis.forecast
    const [payload, setPayload] = useState<ForecastPayload | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        api.get<ForecastPayload | ForecastPoint[]>("/analysis/forecast")
            .then(({ data }) => {
                if (Array.isArray(data)) setPayload({ series: data, districts: [] })
                else setPayload(data)
            })
            .catch(() => setError("Failed to load forecast"))
            .finally(() => setLoading(false))
    }, [])

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

    const forecastData = payload?.series ?? []
    const districtForecast = payload?.districts ?? []

    if (forecastData.length === 0 && districtForecast.length === 0) {
        return <p className="text-muted-foreground">{f.noData}</p>
    }

    const growthPct =
        forecastData.length >= 2 && forecastData[0].actual != null
            ? Math.round(
                  ((forecastData[forecastData.length - 1].predicted - forecastData[0].actual) /
                      (forecastData[0].actual || 1)) * 1000,
              ) / 10
            : 0

    return (
        <div className="space-y-6">
            {forecastData.length >= 2 && (
                <Card className="max-w-xs">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{f.projectedGrowth}</CardTitle>
                        <TrendingUp className="h-4 w-4 text-secondary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {`${growthPct >= 0 ? "+" : ""}${growthPct}%`}
                        </div>
                        <p className="text-xs text-muted-foreground">{f.projectedGrowthDesc}</p>
                    </CardContent>
                </Card>
            )}

            {forecastData.length > 0 ? (
                <Card>
                    <CardHeader>
                        <CardTitle>{f.monthlyTrendTitle}</CardTitle>
                        <CardDescription>{f.monthlyTrendDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={400}>
                            <LineChart data={forecastData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                                <XAxis dataKey="month" className="text-xs" />
                                <YAxis
                                    className="text-xs"
                                    tickFormatter={(v) =>
                                        typeof v === "number" && v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}M` : String(v)
                                    }
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: "hsl(var(--card))",
                                        border: "1px solid hsl(var(--border))",
                                        borderRadius: "var(--radius)",
                                    }}
                                    formatter={(value: number | string) =>
                                        typeof value === "number" ? value.toLocaleString() : value
                                    }
                                />
                                <Legend />
                                <Line type="monotone" dataKey="lower" stroke="#94a3b8" strokeWidth={1} dot={false} name="Lower band" connectNulls />
                                <Line type="monotone" dataKey="upper" stroke="#cbd5e1" strokeWidth={1} dot={false} name="Upper band" connectNulls />
                                <Line type="monotone" dataKey="actual" stroke="#0891b2" strokeWidth={2} dot={{ fill: "#0891b2", r: 4 }} name="Actual" connectNulls={false} />
                                <Line type="monotone" dataKey="predicted" stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4" dot={{ fill: "#2563eb", r: 4 }} name="Predicted" connectNulls />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>{f.monthlyTrendTitle}</CardTitle>
                        <CardDescription>{f.noMonthlyData}</CardDescription>
                    </CardHeader>
                </Card>
            )}

            {districtForecast.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>{f.districtTitle}</CardTitle>
                        <CardDescription>{f.districtDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left text-muted-foreground">
                                        <th className="pb-2 pr-4 font-medium">{f.colDistrict}</th>
                                        <th className="pb-2 pr-4 font-medium">{f.colCategory}</th>
                                        <th className="pb-2 pr-4 font-medium">{f.colScore}</th>
                                        <th className="pb-2 font-medium">{f.colNote}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {districtForecast.map((row) => (
                                        <tr key={row.district} className="border-b border-border/60">
                                            <td className="py-3 pr-4 font-medium">{row.district}</td>
                                            <td className="py-3 pr-4">{row.category}</td>
                                            <td className="py-3 pr-4 tabular-nums">{row.forecast_score}</td>
                                            <td className="py-3 text-muted-foreground">{row.recommendation}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}