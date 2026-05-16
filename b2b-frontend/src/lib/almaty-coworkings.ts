export interface RealCoworkingPoint {
    id: string
    name: string
    lat: number
    lng: number
}

import osmCoworkings from "@/data/almaty-coworkings.osm.json"

export const ALMATY_COWORKINGS: RealCoworkingPoint[] = osmCoworkings as RealCoworkingPoint[]
