import { create } from "zustand"
import { api } from "./api"

interface User {
    id: string
    email: string
    name: string
    role: "admin" | "user"
}

interface AuthState {
    user: User | null
    token: string | null
    isAuthenticated: boolean
    login: (email: string, password: string) => Promise<void>
    register: (email: string, password: string, fullName?: string) => Promise<void>
    logout: () => void
    setUser: (user: User, token: string) => void
    fetchMe: () => Promise<boolean>
}

/** Точки «сессии» в режиме Compare на карте (без сохранения в список). */
export interface SessionComparePoint {
    id: string
    lat: number
    lng: number
    district?: string
    density?: number
    competition?: number
}

const SESSION_COMPARE_MAX = 8

function nearSameCoord(a: number, b: number, eps = 1e-5) {
    return Math.abs(a - b) < eps
}

interface MapState {
    center: [number, number]
    zoom: number
    selectedDistrict: string | null
    radius: number
    timeOfDay: string
    /** Зелёные пронумерованные маркеры ML-рекомендаций на карте */
    showRecommendationPins: boolean
    /** Временные точки для быстрого сравнения на карте (режим Compare). */
    sessionComparePoints: SessionComparePoint[]
    setCenter: (center: [number, number]) => void
    setZoom: (zoom: number) => void
    setSelectedDistrict: (district: string | null) => void
    setRadius: (radius: number) => void
    setTimeOfDay: (time: string) => void
    setShowRecommendationPins: (show: boolean) => void
    addSessionComparePoint: (lat: number, lng: number) => { ok: true; id: string } | { ok: false; reason: "duplicate" | "max" }
    updateSessionComparePoint: (id: string, patch: Partial<Omit<SessionComparePoint, "id" | "lat" | "lng">>) => void
    removeSessionComparePoint: (id: string) => void
    clearSessionCompare: () => void
}

function mapBackendUser(backendUser: { id: number; email: string; full_name: string | null; is_admin: boolean }): User {
    return {
        id: String(backendUser.id),
        email: backendUser.email,
        name: backendUser.full_name || backendUser.email,
        role: backendUser.is_admin ? "admin" : "user",
    }
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    token: null,
    isAuthenticated: false,
    login: async (email: string, password: string) => {
        const { data } = await api.post<{ access_token: string; user: { id: number; email: string; full_name: string | null; is_admin: boolean } }>("/auth/login", { email, password })
        const user = mapBackendUser(data.user)
        const token = data.access_token
        set({ user, token, isAuthenticated: true })
        localStorage.setItem("token", token)
    },
    fetchMe: async () => {
        const token = localStorage.getItem("token")
        if (!token) return false
        try {
            const { data } = await api.get<{ id: number; email: string; full_name: string | null; is_admin: boolean }>("/auth/me")
            set({ user: mapBackendUser(data), token, isAuthenticated: true })
            return true
        } catch {
            localStorage.removeItem("token")
            set({ user: null, token: null, isAuthenticated: false })
            return false
        }
    },
    register: async (email: string, password: string, fullName?: string) => {
        await api.post("/auth/register", { email, password, full_name: fullName || null })
        const { data } = await api.post<{ access_token: string; user: { id: number; email: string; full_name: string | null; is_admin: boolean } }>("/auth/login", {
            email,
            password,
        })
        const user = mapBackendUser(data.user)
        const token = data.access_token
        set({ user, token, isAuthenticated: true })
        localStorage.setItem("token", token)
    },
    logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
        localStorage.removeItem("token")
    },
    setUser: (user: User, token: string) => {
        set({ user, token, isAuthenticated: true })
    },
}))

export const useMapStore = create<MapState>((set, get) => ({
    center: [43.222, 76.8512], // Central Almaty coordinates
    zoom: 12,
    selectedDistrict: null,
    radius: 1000,
    timeOfDay: "all",
    showRecommendationPins: true,
    sessionComparePoints: [],
    setCenter: (center) => set({ center }),
    setZoom: (zoom) => set({ zoom }),
    setSelectedDistrict: (district) => set({ selectedDistrict: district }),
    setRadius: (radius) => set({ radius }),
    setTimeOfDay: (time) => set({ timeOfDay: time }),
    setShowRecommendationPins: (show) => set({ showRecommendationPins: show }),
    addSessionComparePoint: (lat, lng) => {
        const list = get().sessionComparePoints
        if (list.length >= SESSION_COMPARE_MAX) return { ok: false, reason: "max" }
        const dup = list.some((x) => nearSameCoord(x.lat, lat) && nearSameCoord(x.lng, lng))
        if (dup) return { ok: false, reason: "duplicate" }
        const id = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        const next: SessionComparePoint = { id, lat, lng }
        set({ sessionComparePoints: [...list, next] })
        return { ok: true, id }
    },
    updateSessionComparePoint: (id, patch) =>
        set({
            sessionComparePoints: get().sessionComparePoints.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }),
    removeSessionComparePoint: (id) =>
        set({ sessionComparePoints: get().sessionComparePoints.filter((p) => p.id !== id) }),
    clearSessionCompare: () => set({ sessionComparePoints: [] }),
}))
