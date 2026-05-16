"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMapStore } from "@/lib/store"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/api"
import { MapPin, X, Users, Building2, Coffee, Heart, Check, CircleAlert } from "lucide-react"
import { useSavedPlacesStore } from "@/lib/saved-places-store"
import { districtNameToSlug } from "@/lib/districts"
import { ALMATY_COWORKINGS } from "@/lib/almaty-coworkings"

interface DescribePointResponse {
    location: { lat: number; lon: number }
    district: string
    radius_m: number
    density: number
    competition: number
    infra_summary: Record<string, number>
    infra_examples: Record<string, Array<{ lat: number; lon: number }>>
    status: string
}

interface HeatmapPoint {
    lat: number
    lng: number
    intensity: number
}

interface ApiRecommendation {
    id: string
    district: string
    score: number
    lat: number
    lng: number
}

interface RecPin {
    id: string
    rank: number
    lat: number
    lng: number
    score: number
    district?: string
}

type MapMode = "explore" | "compare"

interface GridWithActivity {
    id: number
    zid_number: number
    lat_bot_left: number
    long_bot_left: number
    lat_bot_right: number
    long_bot_right: number
    lat_top_right: number
    long_top_right: number
    activity: number
}

function gridsToHeatmap(grids: GridWithActivity[]): HeatmapPoint[] {
    if (grids.length === 0) return []
    const maxActivity = Math.max(...grids.map((g) => g.activity), 1)
    return grids.map((g) => {
        const lat = (g.lat_bot_left + g.lat_top_right) / 2
        const lng = (g.long_bot_left + g.long_top_right) / 2
        const intensity = maxActivity > 0 ? Math.min(1, g.activity / maxActivity) : 0
        return { lat, lng, intensity }
    })
}

function timeOfDayToParams(timeOfDay: string): { time_hour_from?: number; time_hour_to?: number } {
    switch (timeOfDay) {
        case "morning":
            return { time_hour_from: 6, time_hour_to: 11 }
        case "afternoon":
            return { time_hour_from: 12, time_hour_to: 17 }
        case "evening":
            return { time_hour_from: 18, time_hour_to: 23 }
        default:
            return {}
    }
}

// Convert lat/lng to pixel coordinates
function latLngToPixel(
    lat: number,
    lng: number,
    zoom: number,
    centerLat: number,
    centerLng: number,
    width: number,
    height: number,
) {
    const scale = 256 * Math.pow(2, zoom)
    const worldX = (lng + 180) * (scale / 360)
    const worldY = scale / 2 - (scale * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / (2 * Math.PI)

    const centerWorldX = (centerLng + 180) * (scale / 360)
    const centerWorldY =
        scale / 2 - (scale * Math.log(Math.tan(Math.PI / 4 + (centerLat * Math.PI) / 360))) / (2 * Math.PI)

    return {
        x: worldX - centerWorldX + width / 2,
        y: worldY - centerWorldY + height / 2,
    }
}

// Convert pixel (click) to lat/lng
function pixelToLatLng(
    pixelX: number,
    pixelY: number,
    zoom: number,
    centerLat: number,
    centerLng: number,
    width: number,
    height: number,
): { lat: number; lng: number } {
    const scale = 256 * Math.pow(2, zoom)
    const centerWorldX = (centerLng + 180) * (scale / 360)
    const centerWorldY =
        scale / 2 - (scale * Math.log(Math.tan(Math.PI / 4 + (centerLat * Math.PI) / 360))) / (2 * Math.PI)
    const worldX = pixelX - width / 2 + centerWorldX
    const worldY = pixelY - height / 2 + centerWorldY
    const lng = (worldX * 360) / scale - 180
    const lat =
        (360 / Math.PI) *
        (Math.atan(Math.exp(((scale / 2 - worldY) * 2 * Math.PI) / scale)) - Math.PI / 4)
    return { lat, lng }
}

function getTileUrl(x: number, y: number, zoom: number): string {
    return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
}

function latLngToTile(lat: number, lng: number, zoom: number) {
    const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom))
    const y = Math.floor(
        ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
        Math.pow(2, zoom),
    )
    return { x, y }
}

function drawRingPath(
    ctx: CanvasRenderingContext2D,
    ring: number[][],
    zoom: number,
    centerLat: number,
    centerLng: number,
    width: number,
    height: number,
) {
    if (ring.length < 2) return
    ctx.beginPath()
    for (let k = 0; k < ring.length; k++) {
        const lon = ring[k][0]
        const lat = ring[k][1]
        const p = latLngToPixel(lat, lon, zoom, centerLat, centerLng, width, height)
        if (k === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
    }
    ctx.closePath()
}

function drawDistrictOnCanvas(
    ctx: CanvasRenderingContext2D,
    geometry: { type: string; coordinates: unknown },
    zoom: number,
    centerLat: number,
    centerLng: number,
    width: number,
    height: number,
) {
    ctx.strokeStyle = "rgba(37, 99, 235, 0.92)"
    ctx.fillStyle = "rgba(37, 99, 235, 0.07)"
    ctx.lineWidth = 2.5
    ctx.setLineDash([8, 5])
    if (geometry.type === "Polygon") {
        const rings = geometry.coordinates as number[][][]
        const outer = rings[0]
        drawRingPath(ctx, outer, zoom, centerLat, centerLng, width, height)
        ctx.fill()
        ctx.stroke()
    } else if (geometry.type === "MultiPolygon") {
        const polys = geometry.coordinates as number[][][][]
        for (const poly of polys) {
            const outer = poly[0]
            drawRingPath(ctx, outer, zoom, centerLat, centerLng, width, height)
            ctx.fill()
            ctx.stroke()
        }
    }
    ctx.setLineDash([])
}

export function MapView() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const searchParams = useSearchParams()
    const {
        center,
        zoom,
        setZoom,
        setCenter,
        setSelectedDistrict,
        timeOfDay,
        radius: filterRadius,
        selectedDistrict,
        showRecommendationPins,
        setShowRecommendationPins,
        sessionComparePoints,
        addSessionComparePoint,
        updateSessionComparePoint,
        removeSessionComparePoint,
        clearSessionCompare,
    } = useMapStore()
    const addSavedPlace = useSavedPlacesStore((s) => s.addPlace)
    const districtQuery =
        selectedDistrict && selectedDistrict !== "all" ? selectedDistrict : undefined
    const radiusM = Math.min(2000, Math.max(25, filterRadius))
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
    const [tiles, setTiles] = useState<Array<{ x: number; y: number; url: string; offsetX: number; offsetY: number }>>([])
    const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([])
    const [recommendationPins, setRecommendationPins] = useState<RecPin[]>([])
    const [selectedRecPin, setSelectedRecPin] = useState<RecPin | null>(null)
    const [recsLoading, setRecsLoading] = useState(false)
    const [gridsLoading, setGridsLoading] = useState(true)
    const [pointInfo, setPointInfo] = useState<DescribePointResponse | null>(null)
    const [pointLoading, setPointLoading] = useState(false)
    const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lon: number } | null>(null)
    const [districtGeometry, setDistrictGeometry] = useState<{
        type: string
        coordinates: unknown
    } | null>(null)
    /** Центр ячейки из «View on Map» (рекомендация / ссылка) — не путать с районом целиком. */
    const [linkedFocus, setLinkedFocus] = useState<{ lat: number; lng: number } | null>(null)
    const [saveHint, setSaveHint] = useState<string | null>(null)
    const [recSaveHint, setRecSaveHint] = useState<string | null>(null)
    const [recSaveState, setRecSaveState] = useState<"idle" | "saved" | "duplicate">("idle")
    const [selectedRecPulse, setSelectedRecPulse] = useState(0)
    const [mapMode, setMapMode] = useState<MapMode>("explore")
    const [showRealCoworkings, setShowRealCoworkings] = useState(true)
    const [onboardingVisible, setOnboardingVisible] = useState(false)
    const [saveToast, setSaveToast] = useState<null | { text: string; kind: "success" | "warning" }>(null)
    /** После Proceed в режиме Compare — id лучшей точки сессии (подсветка на карте). */
    const [compareSessionWinnerId, setCompareSessionWinnerId] = useState<string | null>(null)
    const prevCompareModeRef = useRef(false)
    const [dragging, setDragging] = useState(false)
    const dragRef = useRef<{
        active: boolean
        startClientX: number
        startClientY: number
        startCenter: [number, number]
        suppressClick: boolean
    }>({
        active: false,
        startClientX: 0,
        startClientY: 0,
        startCenter: [center[0], center[1]],
        suppressClick: false,
    })
    /** Накопление wheel — один «шаг» зума только после заметной прокрутки (меньше резких скачков). */
    const wheelAccumRef = useRef(0)

    useEffect(() => {
        const lat = searchParams.get("lat")
        const lng = searchParams.get("lng")
        const dSlug = searchParams.get("district")
        if (dSlug) setSelectedDistrict(dSlug)
        if (lat && lng) {
            const la = parseFloat(lat)
            const lo = parseFloat(lng)
            if (!Number.isNaN(la) && !Number.isNaN(lo)) {
                setLinkedFocus({ lat: la, lng: lo })
                setCenter([la, lo])
                setZoom(16)
                setSelectedPoint({ lat: la, lon: lo })
            }
        } else {
            setLinkedFocus(null)
        }
    }, [searchParams, setCenter, setZoom, setSelectedDistrict])

    // If user changes radius after selecting a point, re-run describe_point for that same point.
    useEffect(() => {
        if (!selectedPoint) return
        let cancelled = false
        setPointLoading(true)
        api.get<DescribePointResponse>("/analysis/describe_point", {
            params: {
                lat: Math.round(selectedPoint.lat * 1e6) / 1e6,
                lon: Math.round(selectedPoint.lon * 1e6) / 1e6,
                radius_m: radiusM,
            },
        })
            .then(({ data }) => {
                if (!cancelled) setPointInfo(data)
            })
            .catch(() => {
                if (!cancelled) setPointInfo(null)
            })
            .finally(() => {
                if (!cancelled) setPointLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [selectedPoint, radiusM])

    useEffect(() => {
        if (!districtQuery) {
            setDistrictGeometry(null)
            return
        }
        let cancelled = false
        api.get<{ geometry: { type: string; coordinates: unknown } }>(`/geo/districts/${districtQuery}`)
            .then(({ data }) => {
                if (!cancelled) setDistrictGeometry(data.geometry)
            })
            .catch(() => {
                if (!cancelled) setDistrictGeometry(null)
            })
        return () => {
            cancelled = true
        }
    }, [districtQuery])

    // Load grids with activity from API
    useEffect(() => {
        let cancelled = false
        setGridsLoading(true)
        const params = timeOfDayToParams(timeOfDay)
        const query = new URLSearchParams()
        if (params.time_hour_from != null) query.set("time_hour_from", String(params.time_hour_from))
        if (params.time_hour_to != null) query.set("time_hour_to", String(params.time_hour_to))
        if (districtQuery) query.set("district", districtQuery)
        const url = `/telecom/grids/with_activity${query.toString() ? `?${query}` : ""}`
        api.get<GridWithActivity[]>(url)
            .then(({ data }) => {
                if (!cancelled) setHeatmapData(gridsToHeatmap(data))
            })
            .catch(() => {
                if (!cancelled) setHeatmapData([])
            })
            .finally(() => {
                if (!cancelled) setGridsLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [timeOfDay, districtQuery])

    useEffect(() => {
        if (!selectedRecPin) return
        const stillExists = recommendationPins.some((p) => p.id === selectedRecPin.id)
        if (!stillExists) {
            setSelectedRecPin(null)
            setRecSaveHint(null)
        }
    }, [recommendationPins, selectedRecPin])

    useEffect(() => {
        if (!selectedRecPin) {
            setSelectedRecPulse(0)
            return
        }
        let raf = 0
        const started = performance.now()
        const animate = (now: number) => {
            const t = (now - started) / 1000
            setSelectedRecPulse(t)
            raf = requestAnimationFrame(animate)
        }
        raf = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(raf)
    }, [selectedRecPin])

    useEffect(() => {
        if (!saveToast) return
        const t = window.setTimeout(() => setSaveToast(null), 2600)
        return () => window.clearTimeout(t)
    }, [saveToast])

    useEffect(() => {
        if (typeof window === "undefined") return
        const seen = window.localStorage.getItem("coworkwise-map-onboarding-seen")
        if (!seen) setOnboardingVisible(true)
    }, [])

    useEffect(() => {
        if (mapMode === "compare" && !showRecommendationPins) {
            setShowRecommendationPins(true)
        }
    }, [mapMode, showRecommendationPins, setShowRecommendationPins])

    useEffect(() => {
        if (mapMode === "compare") {
            setSelectedPoint(null)
            setPointInfo(null)
            setSaveHint(null)
        }
    }, [mapMode])

    useEffect(() => {
        const nowCompare = mapMode === "compare"
        if (prevCompareModeRef.current && !nowCompare) {
            clearSessionCompare()
            setCompareSessionWinnerId(null)
        }
        prevCompareModeRef.current = nowCompare
    }, [mapMode, clearSessionCompare])

    // ML recommendations (same time slice as heatmap) — маркеры топ-мест на карте
    useEffect(() => {
        let cancelled = false
        setRecsLoading(true)
        const timeParams = timeOfDayToParams(timeOfDay)
        api.get<ApiRecommendation[]>("/analysis/recommendations", {
            params: {
                limit: 15,
                ...(timeParams.time_hour_from != null ? { time_hour_from: timeParams.time_hour_from } : {}),
                ...(timeParams.time_hour_to != null ? { time_hour_to: timeParams.time_hour_to } : {}),
            },
        })
            .then(({ data }) => {
                if (cancelled) return
                let rows = data || []
                if (districtQuery) {
                    const inDistrict = rows.filter((r) => districtNameToSlug(r.district) === districtQuery)
                    rows = inDistrict.length > 0 ? inDistrict : rows
                }
                setRecommendationPins(
                    rows.map((r, i) => ({
                        id: r.id,
                        rank: i + 1,
                        lat: r.lat,
                        lng: r.lng,
                        score: r.score,
                        district: r.district,
                    })),
                )
            })
            .catch(() => {
                if (!cancelled) setRecommendationPins([])
            })
            .finally(() => {
                if (!cancelled) setRecsLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [timeOfDay, districtQuery])

    // Update dimensions on resize
    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight,
                })
            }
        }

        updateDimensions()
        window.addEventListener("resize", updateDimensions)
        return () => window.removeEventListener("resize", updateDimensions)
    }, [])

    useEffect(() => {
        const centerTile = latLngToTile(center[0], center[1], zoom)
        const tilesNeeded: Array<{ x: number; y: number; url: string; offsetX: number; offsetY: number }> = []

        // Smooth panning: use exact center in world pixels (not just tile index)
        const scale = 256 * Math.pow(2, zoom)
        const centerWorldX = (center[1] + 180) * (scale / 360)
        const centerWorldY =
            scale / 2 - (scale * Math.log(Math.tan(Math.PI / 4 + (center[0] * Math.PI) / 360))) / (2 * Math.PI)

        // Calculate how many tiles we need to cover the viewport
        const tilesX = Math.ceil(dimensions.width / 256) + 2
        const tilesY = Math.ceil(dimensions.height / 256) + 2

        const startX = centerTile.x - Math.floor(tilesX / 2)
        const startY = centerTile.y - Math.floor(tilesY / 2)

        for (let i = 0; i < tilesX; i++) {
            for (let j = 0; j < tilesY; j++) {
                const tileX = startX + i
                const tileY = startY + j
                const maxTile = Math.pow(2, zoom)

                // Wrap tiles horizontally, skip invalid vertical tiles
                if (tileY >= 0 && tileY < maxTile) {
                    const wrappedX = ((tileX % maxTile) + maxTile) % maxTile
                    tilesNeeded.push({
                        x: wrappedX,
                        y: tileY,
                        url: getTileUrl(wrappedX, tileY, zoom),
                        // Use unwrapped tileX for continuous panning math
                        offsetX: tileX * 256 - centerWorldX,
                        offsetY: tileY * 256 - centerWorldY,
                    })
                }
            }
        }

        setTiles(tilesNeeded)
    }, [center, zoom, dimensions])

    // Draw heatmap on canvas
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        // Clear canvas
        ctx.clearRect(0, 0, dimensions.width, dimensions.height)

        // Draw heatmap points (from API or empty)
        heatmapData.forEach((point) => {
            const pos = latLngToPixel(point.lat, point.lng, zoom, center[0], center[1], dimensions.width, dimensions.height)

            // Create radial gradient for each point
            const radius = 80 * point.intensity
            const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, radius)

            // Color gradient based on intensity (blue -> cyan -> yellow)
            if (point.intensity < 0.5) {
                const t = point.intensity * 2
                gradient.addColorStop(0, `rgba(37, 99, 235, ${0.6 * point.intensity})`) // blue
                gradient.addColorStop(0.5, `rgba(34, 211, 238, ${0.4 * point.intensity})`) // cyan
                gradient.addColorStop(1, "rgba(37, 99, 235, 0)")
            } else {
                const t = (point.intensity - 0.5) * 2
                gradient.addColorStop(0, `rgba(250, 204, 21, ${0.7 * point.intensity})`) // yellow
                gradient.addColorStop(0.5, `rgba(34, 211, 238, ${0.5 * point.intensity})`) // cyan
                gradient.addColorStop(1, "rgba(34, 211, 238, 0)")
            }

            ctx.fillStyle = gradient
            ctx.fillRect(pos.x - radius, pos.y - radius, radius * 2, radius * 2)
        })

        if (districtGeometry) {
            drawDistrictOnCanvas(ctx, districtGeometry, zoom, center[0], center[1], dimensions.width, dimensions.height)
        }

        // Recommended locations (ML top picks) — зелёные кружки с рангом
        if (showRecommendationPins) {
            for (const pin of recommendationPins) {
                const pos = latLngToPixel(pin.lat, pin.lng, zoom, center[0], center[1], dimensions.width, dimensions.height)
                const isSelected = selectedRecPin?.id === pin.id
                ctx.save()
                ctx.shadowColor = "rgba(0,0,0,0.2)"
                ctx.shadowBlur = 5
                if (isSelected) {
                    // Strong halo so the chosen marker remains obvious even under heatmap colors.
                    const pulse = 0.5 + 0.5 * Math.sin(selectedRecPulse * Math.PI * 2 * 1.2)
                    const pulseRadius = 22 + pulse * 6
                    const pulseAlpha = 0.16 + pulse * 0.14
                    ctx.beginPath()
                    ctx.arc(pos.x, pos.y, pulseRadius, 0, 2 * Math.PI)
                    ctx.fillStyle = `rgba(16, 185, 129, ${pulseAlpha.toFixed(3)})`
                    ctx.fill()
                    ctx.beginPath()
                    ctx.arc(pos.x, pos.y, pulseRadius - 4, 0, 2 * Math.PI)
                    ctx.strokeStyle = "rgba(255,255,255,0.95)"
                    ctx.lineWidth = 2.5
                    ctx.stroke()
                }
                ctx.beginPath()
                ctx.arc(pos.x, pos.y, 15, 0, 2 * Math.PI)
                ctx.fillStyle = "#059669"
                ctx.fill()
                ctx.shadowColor = "transparent"
                ctx.strokeStyle = "rgba(255,255,255,0.95)"
                ctx.lineWidth = 2
                ctx.stroke()
                ctx.font = "bold 12px ui-sans-serif, system-ui, sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillStyle = "#ffffff"
                ctx.fillText(String(pin.rank), pos.x, pos.y + 0.5)
                ctx.restore()
            }
        }

        // Session compare pins (temporary picks — tap again on pin to remove)
        if (mapMode === "compare" && sessionComparePoints.length > 0) {
            for (let i = 0; i < sessionComparePoints.length; i++) {
                const p = sessionComparePoints[i]
                const pos = latLngToPixel(p.lat, p.lng, zoom, center[0], center[1], dimensions.width, dimensions.height)
                const isWinner = compareSessionWinnerId === p.id
                ctx.save()
                if (isWinner) {
                    ctx.beginPath()
                    ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI)
                    ctx.strokeStyle = "rgba(234, 179, 8, 0.95)"
                    ctx.lineWidth = 3
                    ctx.stroke()
                }
                ctx.shadowColor = "rgba(0,0,0,0.18)"
                ctx.shadowBlur = 4
                ctx.beginPath()
                ctx.arc(pos.x, pos.y, 11, 0, 2 * Math.PI)
                ctx.fillStyle = "#7e22ce"
                ctx.fill()
                ctx.shadowColor = "transparent"
                ctx.strokeStyle = "rgba(255,255,255,0.95)"
                ctx.lineWidth = 2
                ctx.stroke()
                ctx.font = "bold 10px ui-sans-serif, system-ui, sans-serif"
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillStyle = "#ffffff"
                ctx.fillText(String(i + 1), pos.x, pos.y + 0.5)
                ctx.restore()
            }
        }

        // Real coworkings layer (curated Almaty places) as map-pin icons.
        if (showRealCoworkings) {
            for (const cw of ALMATY_COWORKINGS) {
                const pos = latLngToPixel(cw.lat, cw.lng, zoom, center[0], center[1], dimensions.width, dimensions.height)
                ctx.save()
                ctx.shadowColor = "rgba(0,0,0,0.18)"
                ctx.shadowBlur = 4
                ctx.beginPath()
                ctx.arc(pos.x, pos.y - 6, 7.5, 0, 2 * Math.PI)
                ctx.fillStyle = "#dc2626"
                ctx.fill()
                ctx.beginPath()
                ctx.moveTo(pos.x - 5, pos.y - 1)
                ctx.lineTo(pos.x + 5, pos.y - 1)
                ctx.lineTo(pos.x, pos.y + 10)
                ctx.closePath()
                ctx.fillStyle = "#dc2626"
                ctx.fill()
                ctx.shadowColor = "transparent"
                ctx.beginPath()
                ctx.arc(pos.x, pos.y - 6, 2.2, 0, 2 * Math.PI)
                ctx.fillStyle = "#ffffff"
                ctx.fill()
                ctx.restore()
            }
        }

        // Deep link from Analysis: exact recommended cell center (orange pin — район на карте только контекст)
        if (linkedFocus) {
            const pos = latLngToPixel(
                linkedFocus.lat,
                linkedFocus.lng,
                zoom,
                center[0],
                center[1],
                dimensions.width,
                dimensions.height,
            )
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, 16, 0, 2 * Math.PI)
            ctx.strokeStyle = "#ea580c"
            ctx.lineWidth = 3
            ctx.stroke()
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, 7, 0, 2 * Math.PI)
            ctx.fillStyle = "#ea580c"
            ctx.fill()
            ctx.strokeStyle = "#ffffff"
            ctx.lineWidth = 2
            ctx.stroke()
        }

        // Selected point: marker + radius circle (when pointInfo is set)
        if (pointInfo?.location) {
            const lat = pointInfo.location.lat
            const lon = pointInfo.location.lon
            const rM = pointInfo.radius_m ?? 500
            const centerPx = latLngToPixel(lat, lon, zoom, center[0], center[1], dimensions.width, dimensions.height)

            // Circle: approximate 500m (or radius_m) in lat/lng, then to pixels
            const degPerMeterLat = 1 / 111320
            const degPerMeterLon = 1 / (111320 * Math.cos((lat * Math.PI) / 180))
            const points: { x: number; y: number }[] = []
            for (let i = 0; i <= 36; i++) {
                const angle = (2 * Math.PI * i) / 36
                const latI = lat + rM * degPerMeterLat * Math.cos(angle)
                const lonI = lon + rM * degPerMeterLon * Math.sin(angle)
                const p = latLngToPixel(latI, lonI, zoom, center[0], center[1], dimensions.width, dimensions.height)
                points.push(p)
            }
            ctx.beginPath()
            ctx.moveTo(points[0].x, points[0].y)
            points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y))
            ctx.closePath()
            ctx.strokeStyle = "hsl(var(--primary))"
            ctx.lineWidth = 2
            ctx.setLineDash([6, 4])
            ctx.stroke()
            ctx.setLineDash([])

            // Marker: filled circle at clicked point
            ctx.beginPath()
            ctx.arc(centerPx.x, centerPx.y, 10, 0, 2 * Math.PI)
            ctx.fillStyle = "hsl(var(--primary))"
            ctx.fill()
            ctx.strokeStyle = "hsl(var(--background))"
            ctx.lineWidth = 2
            ctx.stroke()

            // Infrastructure examples (small markers) — show a few POIs as icons/dots
            const typeStyle: Record<string, { color: string; label: string }> = {
                university: { color: "#7c3aed", label: "U" },
                mall: { color: "#0ea5e9", label: "M" },
                cafe: { color: "#a16207", label: "C" },
                restaurant: { color: "#b91c1c", label: "R" },
                gym: { color: "#059669", label: "G" },
                metro: { color: "#2563eb", label: "Ⓜ" },
                bus_stop: { color: "#334155", label: "B" },
                coworking: { color: "#111827", label: "Co" },
            }

            const examples = pointInfo.infra_examples || {}
            for (const [t, pts] of Object.entries(examples)) {
                const style = typeStyle[t] ?? { color: "#64748b", label: t.slice(0, 1).toUpperCase() }
                for (const p of pts) {
                    const pos = latLngToPixel(p.lat, p.lon, zoom, center[0], center[1], dimensions.width, dimensions.height)
                    // dot (high-contrast: light fill + colored border + dark text)
                    ctx.save()
                    ctx.shadowColor = "rgba(0,0,0,0.25)"
                    ctx.shadowBlur = 6
                    ctx.shadowOffsetX = 0
                    ctx.shadowOffsetY = 2
                    ctx.beginPath()
                    ctx.arc(pos.x, pos.y, 7, 0, 2 * Math.PI)
                    ctx.fillStyle = "rgba(255,255,255,0.95)"
                    ctx.fill()
                    ctx.shadowColor = "transparent"
                    ctx.strokeStyle = style.color
                    ctx.lineWidth = 2
                    ctx.stroke()
                    // label
                    ctx.font = "10px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial"
                    ctx.textAlign = "center"
                    ctx.textBaseline = "middle"
                    ctx.fillStyle = "#0f172a"
                    ctx.fillText(style.label, pos.x, pos.y + 0.5)
                    ctx.restore()
                }
            }
        }
    }, [
        center,
        zoom,
        dimensions,
        heatmapData,
        pointInfo,
        districtGeometry,
        linkedFocus,
        showRecommendationPins,
        recommendationPins,
        selectedRecPin,
        selectedRecPulse,
        sessionComparePoints,
        compareSessionWinnerId,
        mapMode,
        showRealCoworkings,
    ])

    const handleZoomIn = () => {
        setZoom(Math.min(zoom + 1, 18))
    }

    const handleMapClick = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (dragRef.current.suppressClick || dragRef.current.active) {
                dragRef.current.suppressClick = false
                return
            }
            const target = e.currentTarget
            const rect = target.getBoundingClientRect()
            const pixelX = e.clientX - rect.left
            const pixelY = e.clientY - rect.top

            // If user clicks a green recommendation marker, open matching row in Analysis.
            if (showRecommendationPins && recommendationPins.length > 0) {
                const hit = recommendationPins.find((pin) => {
                    const pos = latLngToPixel(pin.lat, pin.lng, zoom, center[0], center[1], dimensions.width, dimensions.height)
                    const dx = pixelX - pos.x
                    const dy = pixelY - pos.y
                    return dx * dx + dy * dy <= 18 * 18
                })
                if (hit) {
                    setSelectedRecPin(hit)
                    setRecSaveHint(null)
                    setRecSaveState("idle")
                    return
                }
            }

            if (selectedRecPin) {
                setSelectedRecPin(null)
                setRecSaveHint(null)
                setRecSaveState("idle")
            }

            const { lat, lng } = pixelToLatLng(
                pixelX,
                pixelY,
                zoom,
                center[0],
                center[1],
                dimensions.width,
                dimensions.height,
            )
            const latR = Math.round(lat * 1e6) / 1e6
            const lngR = Math.round(lng * 1e6) / 1e6

            if (mapMode === "compare") {
                const hitSession = [...sessionComparePoints]
                    .reverse()
                    .find((sp) => {
                        const pos = latLngToPixel(
                            sp.lat,
                            sp.lng,
                            zoom,
                            center[0],
                            center[1],
                            dimensions.width,
                            dimensions.height,
                        )
                        const dx = pixelX - pos.x
                        const dy = pixelY - pos.y
                        return dx * dx + dy * dy <= 17 * 17
                    })
                if (hitSession) {
                    removeSessionComparePoint(hitSession.id)
                    setCompareSessionWinnerId(null)
                    return
                }

                const res = addSessionComparePoint(latR, lngR)
                if (!res.ok) {
                    setSaveToast({
                        text: res.reason === "max" ? "Maximum 8 spots on the map." : "This spot is already marked.",
                        kind: "warning",
                    })
                    return
                }
                setCompareSessionWinnerId(null)
                const pointId = res.id
                api.get<DescribePointResponse>("/analysis/describe_point", {
                    params: { lat: latR, lon: lngR, radius_m: radiusM },
                })
                    .then(({ data }) => {
                        updateSessionComparePoint(pointId, {
                            district: data.district,
                            density: data.density,
                            competition: data.competition,
                        })
                    })
                    .catch(() => {
                        /* keep coords only; Proceed still uses zeros */
                    })
                return
            }

            setSelectedPoint({ lat: latR, lon: lngR })
        },
        [
            zoom,
            center,
            dimensions,
            showRecommendationPins,
            recommendationPins,
            selectedRecPin,
            mapMode,
            sessionComparePoints,
            addSessionComparePoint,
            removeSessionComparePoint,
            updateSessionComparePoint,
            radiusM,
        ],
    )

    const dismissOnboarding = useCallback(() => {
        setOnboardingVisible(false)
        if (typeof window !== "undefined") {
            window.localStorage.setItem("coworkwise-map-onboarding-seen", "1")
        }
    }, [])

    const handleSessionProceed = useCallback(() => {
        if (sessionComparePoints.length < 2) return
        const ranked = [...sessionComparePoints]
            .map((p) => ({
                ...p,
                score: Math.round((p.density ?? 0) - (p.competition ?? 0) * 3500),
            }))
            .sort((a, b) => b.score - a.score)
        const best = ranked[0]
        if (!best) return
        setCompareSessionWinnerId(best.id)
        setCenter([best.lat, best.lng])
    }, [sessionComparePoints, setCenter])

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            // Left click only
            if (e.button !== 0) return
            const target = e.currentTarget
            target.focus?.()
            dragRef.current.active = true
            dragRef.current.startClientX = e.clientX
            dragRef.current.startClientY = e.clientY
            dragRef.current.startCenter = [center[0], center[1]]
            dragRef.current.suppressClick = false
            setDragging(true)
        },
        [center],
    )

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!dragRef.current.active) return
            const target = e.currentTarget
            const rect = target.getBoundingClientRect()
            const dx = e.clientX - dragRef.current.startClientX
            const dy = e.clientY - dragRef.current.startClientY
            if (Math.abs(dx) + Math.abs(dy) > 6) {
                dragRef.current.suppressClick = true
            }

            const startCenter = dragRef.current.startCenter
            const startPxX = dragRef.current.startClientX - rect.left
            const startPxY = dragRef.current.startClientY - rect.top
            const nowPxX = e.clientX - rect.left
            const nowPxY = e.clientY - rect.top

            const startLL = pixelToLatLng(startPxX, startPxY, zoom, startCenter[0], startCenter[1], dimensions.width, dimensions.height)
            const nowLL = pixelToLatLng(nowPxX, nowPxY, zoom, startCenter[0], startCenter[1], dimensions.width, dimensions.height)

            const nextCenter: [number, number] = [
                startCenter[0] + (startLL.lat - nowLL.lat),
                startCenter[1] + (startLL.lng - nowLL.lng),
            ]
            setCenter(nextCenter)
        },
        [zoom, dimensions, setCenter],
    )

    const endDrag = useCallback(() => {
        dragRef.current.active = false
        setDragging(false)
    }, [])

    const handleZoomOut = () => {
        setZoom(Math.max(zoom - 1, 3))
    }

    const handleWheel = useCallback((e: WheelEvent) => {
        e.preventDefault()
        const threshold = 110
        wheelAccumRef.current += e.deltaY
        if (Math.abs(wheelAccumRef.current) < threshold) return
        const direction = wheelAccumRef.current > 0 ? -1 : 1
        wheelAccumRef.current = 0
        const currentZoom = useMapStore.getState().zoom
        setZoom(Math.min(18, Math.max(3, currentZoom + direction)))
    }, [setZoom])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        el.addEventListener("wheel", handleWheel, { passive: false })
        return () => el.removeEventListener("wheel", handleWheel)
    }, [handleWheel])

    const selectedRecPinPos = selectedRecPin
        ? latLngToPixel(
              selectedRecPin.lat,
              selectedRecPin.lng,
              zoom,
              center[0],
              center[1],
              dimensions.width,
              dimensions.height,
          )
        : null
    const popoverLeft = selectedRecPinPos
        ? Math.min(Math.max(12, selectedRecPinPos.x - 144), Math.max(12, dimensions.width - 300))
        : 12
    const popoverTop = selectedRecPinPos
        ? Math.min(Math.max(12, selectedRecPinPos.y - 180), Math.max(12, dimensions.height - 220))
        : 12
    const connector = selectedRecPinPos
        ? {
              fromX: popoverLeft + 144,
              fromY: popoverTop + 180,
              toX: selectedRecPinPos.x,
              toY: selectedRecPinPos.y,
          }
        : null
    const connectorLength = connector
        ? Math.hypot(connector.toX - connector.fromX, connector.toY - connector.fromY)
        : 0
    const connectorAngleDeg = connector
        ? (Math.atan2(connector.toY - connector.fromY, connector.toX - connector.fromX) * 180) / Math.PI
        : 0
    const sessionWinner = compareSessionWinnerId
        ? sessionComparePoints.find((p) => p.id === compareSessionWinnerId)
        : null

    return (
        <div ref={containerRef} className="relative h-full w-full bg-muted overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
                {tiles.map((tile, idx) => (
                    <img
                        key={`${tile.x}-${tile.y}-${zoom}`}
                        src={tile.url || "/placeholder.svg"}
                        alt=""
                        className="absolute"
                        style={{
                            width: "256px",
                            height: "256px",
                            left: `calc(50% + ${tile.offsetX}px)`,
                            top: `calc(50% + ${tile.offsetY}px)`,
                            transform: "translate(-50%, -50%)",
                        }}
                        crossOrigin="anonymous"
                    />
                ))}
            </div>

            {/* Heatmap canvas */}
            <canvas
                ref={canvasRef}
                width={dimensions.width}
                height={dimensions.height}
                className="absolute inset-0 pointer-events-none"
                style={{ mixBlendMode: "multiply" }}
            />

            {/* Click overlay: click on map → describe_point (zoom via wheel on container) */}
            <div
                className={`absolute inset-0 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
                onClick={handleMapClick}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
                aria-label={mapMode === "compare" ? "Click map to mark compare spots" : "Click to get location info"}
            />

            {/* Map info */}
            <div className="absolute top-4 left-4 bg-card/95 backdrop-blur border border-border rounded-lg px-4 py-2 shadow-lg max-w-xs">
                <div className="text-sm font-medium">Almaty, Kazakhstan</div>
                <div className="text-xs text-muted-foreground">Zoom: {zoom}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                        size="sm"
                        variant={mapMode === "explore" ? "default" : "outline"}
                        onClick={() => setMapMode("explore")}
                    >
                        Explore
                    </Button>
                    <Button
                        size="sm"
                        variant={mapMode === "compare" ? "default" : "outline"}
                        onClick={() => setMapMode("compare")}
                    >
                        Compare
                    </Button>
                    <Button
                        size="sm"
                        variant={showRealCoworkings ? "default" : "outline"}
                        onClick={() => setShowRealCoworkings((v) => !v)}
                    >
                        Coworkings
                    </Button>
                </div>
                {mapMode === "compare" && (
                    <div className="text-xs text-muted-foreground mt-1">
                        Click the map to add purple pins (tap a pin to remove). Then use <strong>Proceed</strong> below — full
                        table is in Analysis → Compare.
                    </div>
                )}
                {districtQuery && (
                    <div className="text-xs text-primary mt-1 font-medium">
                        Filter: district ({districtQuery}) — blue dashed line = admin boundary
                    </div>
                )}
                {linkedFocus && (
                    <div className="text-xs text-orange-600 dark:text-orange-400 mt-1 font-medium">
                        Orange pin = this recommendation&apos;s grid cell (center), not the whole district.
                    </div>
                )}
                {recsLoading && <div className="text-xs text-muted-foreground mt-1">Loading recommendations…</div>}
                {!recsLoading && recommendationPins.length > 0 && showRecommendationPins && mapMode !== "compare" && (
                    <div className="text-xs text-muted-foreground mt-1">
                        Showing {recommendationPins.length} recommended cells (green #1–#{recommendationPins.length}) — toggle in
                        Filters sidebar.
                    </div>
                )}
                {!recsLoading && recommendationPins.length === 0 && (
                    <div className="text-xs text-amber-800 dark:text-amber-200 mt-1">
                        No recommendation pins — check login token and Analysis API, or rebuild frontend image (
                        <code className="text-[10px]">docker compose up --build</code>).
                    </div>
                )}
                {gridsLoading && <div className="text-xs text-muted-foreground mt-1">Loading heatmap…</div>}
                {!gridsLoading && heatmapData.length === 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                        No cells in this slice — check district filter and that data/districts.geojson exists on the API
                        server.
                    </div>
                )}
            </div>

            {onboardingVisible && (
                <div className="absolute inset-0 z-40 bg-black/45 backdrop-blur-[1px]">
                    <div className="absolute left-1/2 top-1/2 w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-4 shadow-2xl">
                        <h3 className="text-base font-semibold">Quick start: compare places in 3 steps</h3>
                        <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <li>1) Use Explore or switch to Compare on the map.</li>
                            <li>2) In Compare: click several spots, press Proceed to see the top pick.</li>
                            <li>3) Open Analysis → Compare for the full breakdown (or save points for later).</li>
                        </ol>
                        <div className="mt-3 flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={dismissOnboarding}>
                                Got it
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => {
                                    setMapMode("compare")
                                    dismissOnboarding()
                                }}
                            >
                                Open Compare mode
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Heatmap legend */}
            <div className="absolute top-4 right-4 bg-card/95 backdrop-blur border border-border rounded-lg px-3 py-2 shadow-lg">
                    <div className="text-xs font-medium text-foreground">Heatmap</div>
                    <div className="mt-1 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">Low</span>
                        <div
                            className="h-2 w-24 rounded-full"
                            style={{
                                background:
                                    "linear-gradient(90deg, rgba(37,99,235,0.0) 0%, rgba(37,99,235,0.65) 30%, rgba(34,211,238,0.7) 55%, rgba(250,204,21,0.85) 100%)",
                            }}
                        />
                        <span className="text-[10px] text-muted-foreground">High</span>
                    </div>
                    <div className="mt-1 text-[10px] text-muted-foreground">Activity intensity (est.)</div>
                    <div className="mt-2 text-[10px] text-muted-foreground border-t border-border pt-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-600 mr-1 align-middle" />
                        Green numbers = ML-ranked cells for current time slice
                    </div>
                    {mapMode === "compare" && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                            Purple numbers = spots you marked for this session (not saved yet).
                        </div>
                    )}
                    {showRealCoworkings && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                            Red pin icons = real coworking locations in Almaty (reference layer).
                        </div>
                    )}
                </div>

            {/* Recommendation marker popover */}
            {selectedRecPin && selectedRecPinPos && (
                <>
                    {connector && connectorLength > 8 && (
                        <div
                            className="absolute z-10 pointer-events-none"
                            style={{
                                left: connector.fromX,
                                top: connector.fromY,
                                width: connectorLength,
                                height: 2,
                                transformOrigin: "0 50%",
                                transform: `rotate(${connectorAngleDeg}deg)`,
                                background: "linear-gradient(90deg, rgba(16,185,129,0.55), rgba(16,185,129,0.9))",
                            }}
                        />
                    )}
                    <Card
                        className="absolute z-20 w-72 border bg-card/95 backdrop-blur shadow-lg"
                        style={{
                            left: popoverLeft,
                            top: popoverTop,
                        }}
                    >
                        <CardHeader className="pb-2 pt-3 px-3 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-sm">
                                Recommendation #{selectedRecPin.rank}
                                <span className="ml-2 text-muted-foreground font-normal">Score {selectedRecPin.score}/100</span>
                            </CardTitle>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => {
                                    setSelectedRecPin(null)
                                    setRecSaveHint(null)
                                    setRecSaveState("idle")
                                }}
                                aria-label="Close recommendation popover"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 space-y-2">
                            <p className="text-xs text-muted-foreground leading-snug">
                                Selected green marker. Open matching row in Analysis or save this spot for side-by-side comparison.
                            </p>
                            <div className="grid gap-2">
                                <Button
                                    size="sm"
                                    onClick={() =>
                                        router.push(
                                            `/analysis?tab=recommendations&focus_rec=${encodeURIComponent(selectedRecPin.id)}`,
                                        )
                                    }
                                >
                                    Open in Recommendations
                                </Button>
                                <Button
                                    variant={recSaveState === "saved" ? "default" : "secondary"}
                                    size="sm"
                                    className={`transition-all ${
                                        recSaveState === "saved"
                                            ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                                            : recSaveState === "duplicate"
                                              ? "border border-amber-300 text-amber-700 dark:text-amber-300"
                                              : ""
                                    }`}
                                    onClick={() => {
                                        const res = addSavedPlace({
                                            lat: selectedRecPin.lat,
                                            lng: selectedRecPin.lng,
                                            label: `Recommendation #${selectedRecPin.rank}`,
                                            district: selectedRecPin.district || "Unknown district",
                                            activityScore: selectedRecPin.score,
                                            source: "recommendation",
                                        })
                                        const state = res.ok ? "saved" : "duplicate"
                                        setRecSaveState(state)
                                    setSaveToast({
                                        text: res.ok ? "Saved to compare list." : "Already in saved list.",
                                        kind: res.ok ? "success" : "warning",
                                    })
                                        setRecSaveHint(
                                            res.ok ? "Saved — open Analysis → Saved to compare." : "This place is already saved.",
                                        )
                                        window.setTimeout(() => setRecSaveState("idle"), 2200)
                                    }}
                                >
                                    {recSaveState === "saved" ? (
                                        <>
                                            <Check className="h-4 w-4 mr-1" />
                                            Saved
                                        </>
                                    ) : recSaveState === "duplicate" ? (
                                        <>
                                            <CircleAlert className="h-4 w-4 mr-1" />
                                            Already saved
                                        </>
                                    ) : (
                                        "Save to compare"
                                    )}
                                </Button>
                            </div>
                            {recSaveHint && <p className="text-xs text-muted-foreground">{recSaveHint}</p>}
                        </CardContent>
                    </Card>
                </>
            )}

            <div className="absolute bottom-6 right-6 flex flex-col gap-2">
                <Button size="icon" variant="secondary" onClick={handleZoomIn} className="shadow-lg">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                        <line x1="11" y1="8" x2="11" y2="14" />
                        <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                </Button>
                <Button size="icon" variant="secondary" onClick={handleZoomOut} className="shadow-lg">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                        <line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                </Button>
                <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => {
                        setZoom(12)
                    }}
                    className="shadow-lg"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                    </svg>
                </Button>
            </div>

            {/* Point info popup (click on map) */}
            {(pointLoading || pointInfo) && mapMode !== "compare" && (
                <Card className="absolute bottom-6 left-4 w-full max-w-sm shadow-lg border bg-card/95 backdrop-blur">
                    <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-base flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            {pointLoading ? "Loading…" : "Location"}
                        </CardTitle>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                                setPointInfo(null)
                                setSaveHint(null)
                                setSaveToast(null)
                            }}
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </CardHeader>
                    {pointInfo && (
                        <CardContent className="px-4 pb-4 space-y-3">
                            <div className="text-sm">
                                <span className="font-medium text-muted-foreground">District</span>
                                <p className="font-medium flex items-center gap-1">
                                    <Building2 className="h-3.5 w-3" />
                                    {pointInfo.district}
                                </p>
                            </div>
                            <div className="flex gap-4 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Density</span>
                                    <p className="font-medium flex items-center gap-1">
                                        <Users className="h-3.5 w-3" />
                                        {pointInfo.density.toLocaleString()}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Competition</span>
                                    <p className="font-medium">{pointInfo.competition} coworkings</p>
                                </div>
                            </div>
                            {Object.keys(pointInfo.infra_summary).length > 0 && (
                                <div className="text-sm">
                                    <span className="text-muted-foreground flex items-center gap-1">
                                        <Coffee className="h-3.5 w-3" />
                                        Nearby ({pointInfo.radius_m} m)
                                    </span>
                                    <p className="font-medium mt-0.5">
                                        {Object.entries(pointInfo.infra_summary)
                                            .map(([t, n]) => `${t.replace("_", " ")}: ${n}`)
                                            .join(" · ")}
                                    </p>
                                </div>
                            )}
                            <Button
                                variant="secondary"
                                size="sm"
                                className="w-full gap-2"
                                type="button"
                                onClick={() => {
                                    const label =
                                        pointInfo.district === "Outside city"
                                            ? `Pin ${pointInfo.location.lat.toFixed(4)}, ${pointInfo.location.lon.toFixed(4)}`
                                            : `${pointInfo.district} · map pin`
                                    const res = addSavedPlace({
                                        lat: pointInfo.location.lat,
                                        lng: pointInfo.location.lon,
                                        label,
                                        district: pointInfo.district,
                                        activityScore: pointInfo.density,
                                        coworkingCount: pointInfo.competition,
                                        source: "map",
                                    })
                                    setSaveToast({
                                        text: res.ok ? "Saved point to compare list." : "Point already saved.",
                                        kind: res.ok ? "success" : "warning",
                                    })
                                    setSaveHint(res.ok ? "Saved — open Analysis → Saved to compare." : "This pin is already saved.")
                                    setTimeout(() => setSaveHint(null), 3500)
                                }}
                            >
                                <Heart className="h-4 w-4" />
                                Save to compare
                            </Button>
                            {saveHint && <p className="text-xs text-muted-foreground">{saveHint}</p>}
                        </CardContent>
                    )}
                </Card>
            )}

            {mapMode === "compare" && (sessionComparePoints.length > 0 || sessionWinner) && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[min(96vw,28rem)]">
                    <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
                        {!sessionWinner ? (
                            <>
                                <span className="text-sm text-muted-foreground">
                                    Marked: <strong className="text-foreground">{sessionComparePoints.length}</strong>
                                </span>
                                <Button
                                    size="sm"
                                    disabled={sessionComparePoints.length < 2}
                                    onClick={handleSessionProceed}
                                >
                                    Proceed
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        clearSessionCompare()
                                        setCompareSessionWinnerId(null)
                                    }}
                                >
                                    Clear
                                </Button>
                            </>
                        ) : (
                            <>
                                <span className="text-sm">
                                    <span className="text-muted-foreground">Top pick:</span>{" "}
                                    <strong className="truncate max-w-[12rem] sm:max-w-[16rem] inline-block align-bottom">
                                        {sessionWinner.district && sessionWinner.district !== "Outside city"
                                            ? sessionWinner.district
                                            : `Pin ${sessionWinner.lat.toFixed(4)}, ${sessionWinner.lng.toFixed(4)}`}
                                    </strong>
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        if (!sessionWinner) return
                                        setCenter([sessionWinner.lat, sessionWinner.lng])
                                    }}
                                >
                                    Focus
                                </Button>
                                <Button size="sm" onClick={() => router.push("/analysis?tab=compare&scope=session")}>
                                    Full Compare
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setCompareSessionWinnerId(null)}>
                                    Back
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Save feedback toast with CTA */}
            {saveToast && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-40">
                    <div
                        className={`rounded-lg border px-3 py-2 shadow-lg backdrop-blur text-sm flex items-center gap-3 ${
                            saveToast.kind === "success"
                                ? "bg-emerald-50/95 border-emerald-300 text-emerald-800"
                                : "bg-amber-50/95 border-amber-300 text-amber-800"
                        }`}
                    >
                        <span>{saveToast.text}</span>
                        <Button size="sm" variant="outline" className="h-7 text-xs bg-transparent" onClick={() => router.push("/analysis?tab=saved")}>
                            Compare now
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
