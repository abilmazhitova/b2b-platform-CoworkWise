import { create } from "zustand"
import { persist } from "zustand/middleware"

export type SavedPlaceSource = "map" | "recommendation"

export interface SavedPlace {
    id: string
    lat: number
    lng: number
    label: string
    district: string
    /** Плотность с карты или estimated footfall с рекомендаций */
    activityScore?: number
    coworkingCount?: number
    source: SavedPlaceSource
    savedAt: number
}

function nearSame(a: number, b: number, eps = 1e-5) {
    return Math.abs(a - b) < eps
}

interface SavedPlacesState {
    places: SavedPlace[]
    addPlace: (p: Omit<SavedPlace, "id" | "savedAt">) => { ok: true; id: string } | { ok: false; reason: "duplicate" }
    removePlace: (id: string) => void
    clearAll: () => void
}

export const useSavedPlacesStore = create<SavedPlacesState>()(
    persist(
        (set, get) => ({
            places: [],
            addPlace: (p) => {
                const dup = get().places.some((x) => nearSame(x.lat, p.lat) && nearSame(x.lng, p.lng))
                if (dup) return { ok: false, reason: "duplicate" }
                const id = `sp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
                const next: SavedPlace = {
                    ...p,
                    id,
                    savedAt: Date.now(),
                }
                set({ places: [...get().places, next] })
                return { ok: true, id }
            },
            removePlace: (id) => set({ places: get().places.filter((x) => x.id !== id) }),
            clearAll: () => set({ places: [] }),
        }),
        { name: "coworkwise-saved-places" },
    ),
)
