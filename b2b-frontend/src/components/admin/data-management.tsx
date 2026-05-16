"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Upload, Layers, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { useT } from "@/lib/lang-store"

const dataLayers = [
    { id: "1", name: "Footfall Heatmap", type: "Heatmap", status: "active" },
    { id: "2", name: "Coworking Locations", type: "Points", status: "active" },
    { id: "3", name: "Public Transport", type: "Lines", status: "active" },
    { id: "4", name: "Business Districts", type: "Polygons", status: "inactive" },
]

export function DataManagement() {
    const t = useT()
    const d = t.admin.data
    const [layers, setLayers] = useState(dataLayers)
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [monthLabel, setMonthLabel] = useState("")
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleUploadSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!uploadFile || !monthLabel.trim()) return
        setUploadError(null)
        setUploadSuccess(null)
        setUploading(true)
        try {
            const formData = new FormData()
            formData.append("file", uploadFile)
            const { data } = await api.post<{ message?: string; month?: string }>(
                `/telecom/upload?month_label=${encodeURIComponent(monthLabel.trim())}`,
                formData,
            )
            setUploadSuccess(data.message || `Uploaded. Month: ${data.month || monthLabel}`)
            setUploadFile(null)
            setMonthLabel("")
            if (fileInputRef.current) fileInputRef.current.value = ""
        } catch (err: unknown) {
            const msg =
                err && typeof err === "object" && "response" in err
                    ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                    : null
            setUploadError(typeof msg === "string" ? msg : "Upload failed")
        } finally {
            setUploading(false)
        }
    }

    const toggleLayer = (id: string) => {
        setLayers(layers.map((layer) =>
            layer.id === id ? { ...layer, status: layer.status === "active" ? "inactive" : "active" } : layer,
        ))
    }

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{d.title}</CardTitle>
                    <CardDescription>{d.description}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {layers.map((layer) => (
                            <div key={layer.id} className="flex items-center justify-between rounded-lg border p-4">
                                <div className="flex items-center gap-4">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                                        <Layers className="h-6 w-6 text-primary" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-semibold">{layer.name}</h4>
                                        <Badge variant="outline">{layer.type}</Badge>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id={`layer-${layer.id}`}
                                        checked={layer.status === "active"}
                                        onCheckedChange={() => toggleLayer(layer.id)}
                                    />
                                    <Label htmlFor={`layer-${layer.id}`} className="cursor-pointer">
                                        {layer.status === "active" ? t.common.enabled : t.common.disabled}
                                    </Label>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Card id="upload-data-card">
                <CardHeader>
                    <CardTitle>{d.uploadTitle}</CardTitle>
                    <CardDescription>{d.uploadDesc}</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleUploadSubmit} className="space-y-4">
                        {uploadError && (
                            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                                {uploadError}
                            </div>
                        )}
                        {uploadSuccess && (
                            <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
                                {uploadSuccess}
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="month-label">{d.monthLabel}</Label>
                            <Input
                                id="month-label"
                                placeholder={d.monthPlaceholder}
                                value={monthLabel}
                                onChange={(e) => setMonthLabel(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{d.fileLabel}</Label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx"
                                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                                className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground"
                            />
                        </div>
                        <Button type="submit" disabled={uploading || !uploadFile || !monthLabel.trim()} className="gap-2">
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            {uploading ? t.common.uploading : t.common.upload}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}