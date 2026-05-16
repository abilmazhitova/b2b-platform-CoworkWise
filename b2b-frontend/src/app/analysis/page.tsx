"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CompareView } from "@/components/analysis/compare-view"
import { RecommendationsView } from "@/components/analysis/recommendations-view"
import { ForecastView } from "@/components/analysis/forecast-view"
import { SavedPlacesView } from "@/components/analysis/saved-places-view"
import { useT } from "@/lib/lang-store"

export default function AnalysisPage() {
    const searchParams = useSearchParams()
    const t = useT()
    const [activeTab, setActiveTab] = useState("compare")

    useEffect(() => {
        const tab = searchParams.get("tab")
        if (tab === "compare" || tab === "recommendations" || tab === "saved" || tab === "forecast") {
            setActiveTab(tab)
        }
    }, [searchParams])

    return (
        <div className="flex h-screen flex-col">
            <Navbar />
            <main className="flex-1 overflow-y-auto bg-muted/30">
                <div className="mx-auto max-w-7xl p-6 space-y-6">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">{t.analysis.title}</h1>
                        <p className="mt-2 text-muted-foreground">{t.analysis.description}</p>
                    </div>

                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <TabsList className="grid w-full max-w-2xl grid-cols-2 sm:grid-cols-4">
                            <TabsTrigger value="compare">{t.analysis.tabs.compare}</TabsTrigger>
                            <TabsTrigger value="recommendations">{t.analysis.tabs.recommendations}</TabsTrigger>
                            <TabsTrigger value="saved">{t.analysis.tabs.saved}</TabsTrigger>
                            <TabsTrigger value="forecast">{t.analysis.tabs.forecast}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="compare" className="mt-6">
                            <CompareView />
                        </TabsContent>
                        <TabsContent value="recommendations" className="mt-6">
                            <RecommendationsView />
                        </TabsContent>
                        <TabsContent value="saved" className="mt-6">
                            <SavedPlacesView />
                        </TabsContent>
                        <TabsContent value="forecast" className="mt-6">
                            <ForecastView />
                        </TabsContent>
                    </Tabs>
                </div>
            </main>
        </div>
    )
}