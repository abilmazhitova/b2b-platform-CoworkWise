/** Имя района из API (как в GeoJSON name) → slug для ?district= и /geo/districts/ */
export function districtNameToSlug(name: string): string | undefined {
    const n = (name || "").trim().toLowerCase()
    const map: Record<string, string> = {
        almaly: "almaly",
        auezov: "auezov",
        bostandyq: "bostandyk",
        bostandyk: "bostandyk",
        medeu: "medeu",
        turksib: "turksib",
        zhetysu: "zhetysu",
        alatau: "alatau",
        nauryzbay: "nauryzbay",
    }
    return map[n]
}
