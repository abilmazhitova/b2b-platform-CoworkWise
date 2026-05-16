"use client"

import { Suspense } from "react"
import { Navbar } from "@/components/navbar"
import { MapFilters } from "@/components/map-filters"
import { MapView } from "@/components/map-view"

export default function MapPage() {
    return (
        <div className="flex h-screen flex-col">
            <Navbar />
            <div className="flex flex-1 overflow-hidden">
                <aside className="w-80 border-r border-border bg-card p-4 overflow-y-auto">
                    <MapFilters />
                </aside>
                <main className="flex-1">
                    <Suspense
                        fallback={
                            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                                Loading map…
                            </div>
                        }
                    >
                        <MapView />
                    </Suspense>
                </main>
            </div>
        </div>
    )
}
