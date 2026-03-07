import { useState, useEffect, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { usePersonas, useVideos } from '@store/queries'
import { api } from '@services/api'
import { ExportOptions, ExportStats, VideoMetadata } from '@models/types'

/**
 * Props for the ExportDialog component.
 *
 * @param open - Whether the dialog is open
 * @param onClose - Callback when dialog is closed
 */
interface ExportDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Check if any data exists in export stats.
 */
function hasAnyData(stats: ExportStats | null): boolean {
  if (!stats) return false
  return (
    stats.personaCount > 0 ||
    stats.ontologyCount > 0 ||
    stats.entityCount > 0 ||
    stats.eventCount > 0 ||
    stats.timeCount > 0 ||
    stats.summaryCount > 0 ||
    stats.claimCount > 0 ||
    stats.annotationCount > 0
  )
}

/**
 * Exports personas, ontologies, world state, summaries, claims, and annotations.
 * Provides options for keyframes-only vs. fully interpolated export,
 * and filtering by persona and video for annotations.
 *
 * @param props - Component props
 * @returns Export dialog component
 */
export function ExportDialog({ open, onClose }: ExportDialogProps): JSX.Element {
  const { data: personas = [] } = usePersonas()
  const { data: videos = [] } = useVideos()

  const [includeInterpolated, setIncludeInterpolated] = useState(false)
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([])
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([])
  const [selectedAnnotationTypes, setSelectedAnnotationTypes] = useState<('type' | 'object')[]>([])
  const [exportStats, setExportStats] = useState<ExportStats | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [videoFilterExpanded, setVideoFilterExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Load export statistics from the backend.
   */
  const loadExportStats = useCallback(async () => {
    setIsLoadingStats(true)
    setError(null)

    try {
      const options: ExportOptions = {
        includeInterpolated,
        personaIds: selectedPersonaIds.length > 0 ? selectedPersonaIds : undefined,
        videoIds: selectedVideoIds.length > 0 ? selectedVideoIds : undefined,
        annotationTypes: selectedAnnotationTypes.length > 0 ? selectedAnnotationTypes : undefined,
      }

      const stats = await api.getExportStats(options)
      setExportStats(stats)
    } catch (err: unknown) {
      console.error('Failed to load export stats:', err)
      setError(err instanceof Error ? err.message : 'Failed to load export statistics')
    } finally {
      setIsLoadingStats(false)
    }
  }, [includeInterpolated, selectedPersonaIds, selectedVideoIds, selectedAnnotationTypes])

  useEffect(() => {
    if (open) {
      loadExportStats()
    }
  }, [open, loadExportStats])

  /**
   * Perform the export and trigger download.
   */
  const handleExport = async (): Promise<void> => {
    setIsExporting(true)
    setError(null)

    try {
      const options: ExportOptions = {
        includeInterpolated,
        personaIds: selectedPersonaIds.length > 0 ? selectedPersonaIds : undefined,
        videoIds: selectedVideoIds.length > 0 ? selectedVideoIds : undefined,
        annotationTypes: selectedAnnotationTypes.length > 0 ? selectedAnnotationTypes : undefined,
      }

      await api.exportAnnotations(options)
      onClose()
    } catch (err: unknown) {
      console.error('Export failed:', err)
      let message = 'Export failed'
      if (err instanceof Error) {
        message = err.message
      }
      if (typeof err === 'object' && err !== null && 'response' in err) {
        const response = (err as { response?: { data?: { message?: string } } }).response
        if (response?.data?.message) {
          message = response.data.message
        }
      }
      setError(message)
    } finally {
      setIsExporting(false)
    }
  }

  /**
   * Toggle persona selection.
   */
  const togglePersona = (personaId: string): void => {
    setSelectedPersonaIds(prev =>
      prev.includes(personaId)
        ? prev.filter(id => id !== personaId)
        : [...prev, personaId]
    )
  }

  /**
   * Toggle video selection.
   */
  const toggleVideo = (videoId: string): void => {
    setSelectedVideoIds(prev =>
      prev.includes(videoId)
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    )
  }

  /**
   * Toggle annotation type selection.
   */
  const toggleAnnotationType = (type: 'type' | 'object'): void => {
    setSelectedAnnotationTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  /**
   * Format bytes to human-readable size.
   */
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose() }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Export All Data</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-2">
          {/* Export Mode */}
          <div>
            <Label className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Export Mode</Label>
            <div className="flex flex-col gap-3 mt-2">
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={!includeInterpolated}
                  onCheckedChange={(checked) => setIncludeInterpolated(!checked)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-semibold">Export keyframes only (recommended)</p>
                  <p className="text-xs text-muted-foreground">
                    Smaller file size, preserves author intent, allows re-interpolation
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={includeInterpolated}
                  onCheckedChange={(checked) => setIncludeInterpolated(!!checked)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-semibold">Include all interpolated frames</p>
                  <p className="text-xs text-muted-foreground">
                    Larger file (up to 100x), useful for debugging or external tools
                  </p>
                </div>
              </div>
            </div>

            {includeInterpolated && (
              <Alert className="mt-3">
                <AlertDescription>
                  File size can be 100x larger with interpolated frames. Consider exporting keyframes-only unless you need all frames.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          {/* Filter Annotations by Persona */}
          <div>
            <Label className="mb-1">Filter Annotations by Persona (optional)</Label>
            <p className="mb-2 text-xs text-muted-foreground">
              Leave empty to export all annotations. Other data types are always fully exported.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {personas.map(persona => (
                <button
                  key={persona.id}
                  type="button"
                  onClick={() => togglePersona(persona.id)}
                  className={cn(
                    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedPersonaIds.includes(persona.id)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  )}
                >
                  {persona.name}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Annotations by Video */}
          <div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-medium"
                onClick={() => setVideoFilterExpanded(prev => !prev)}
              >
                {videoFilterExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                Filter Annotations by Video (optional)
              </button>
              {selectedVideoIds.length > 0 && (
                <Badge variant="default">{selectedVideoIds.length}</Badge>
              )}
            </div>
            {videoFilterExpanded && (
              <div className="mt-2">
                <p className="mb-2 text-xs text-muted-foreground">
                  Leave empty to export annotations for all videos
                </p>
                <div className="flex flex-wrap gap-2">
                  {videos.map((video: VideoMetadata) => (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => toggleVideo(video.id)}
                      className={cn(
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        selectedVideoIds.includes(video.id)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      )}
                    >
                      {video.title || video.id}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Filter Annotations by Type */}
          <div>
            <Label className="mb-1">Filter Annotations by Type (optional)</Label>
            <p className="mb-2 text-xs text-muted-foreground">
              Leave empty to export all annotation types
            </p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={() => toggleAnnotationType('type')}
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selectedAnnotationTypes.includes('type')
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted"
                )}
              >
                Type Annotations
              </button>
              <button
                type="button"
                onClick={() => toggleAnnotationType('object')}
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selectedAnnotationTypes.includes('object')
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted"
                )}
              >
                Object Annotations
              </button>
            </div>
          </div>

          <Separator />

          {/* Export Statistics */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Export Statistics</h3>

            {isLoadingStats && (
              <div className="flex items-center gap-2">
                <Spinner />
                <p className="text-sm text-muted-foreground">Calculating...</p>
              </div>
            )}

            {!isLoadingStats && exportStats && (
              <div className="flex flex-col gap-4">
                {/* Personas & Ontologies */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Personas & Ontologies</p>
                  <div className="mt-1 space-y-1">
                    <div className="flex justify-between py-0.5 text-sm">
                      <span>Personas</span>
                      <span className="text-muted-foreground">
                        {exportStats.systemPersonaCount > 0
                          ? `${exportStats.personaCount - exportStats.systemPersonaCount} user-created, ${exportStats.systemPersonaCount} system-generated`
                          : exportStats.personaCount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between py-0.5 text-sm">
                      <span>Ontology Types</span>
                      <span className="text-muted-foreground">
                        {exportStats.entityTypeCount} entity, {exportStats.eventTypeCount} event, {exportStats.roleTypeCount} role, {exportStats.relationTypeCount} relation
                      </span>
                    </div>
                  </div>
                </div>

                {/* World State */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">World State</p>
                  <div className="mt-1 space-y-1">
                    <div className="flex justify-between py-0.5 text-sm">
                      <span>Objects</span>
                      <span className="text-muted-foreground">
                        {exportStats.entityCount} entities, {exportStats.eventCount} events, {exportStats.timeCount} times
                      </span>
                    </div>
                    {(exportStats.entityCollectionCount > 0 || exportStats.eventCollectionCount > 0 || exportStats.timeCollectionCount > 0) && (
                      <div className="flex justify-between py-0.5 text-sm">
                        <span>Collections</span>
                        <span className="text-muted-foreground">
                          {exportStats.entityCollectionCount} entity, {exportStats.eventCollectionCount} event, {exportStats.timeCollectionCount} time
                        </span>
                      </div>
                    )}
                    {exportStats.worldRelationCount > 0 && (
                      <div className="flex justify-between py-0.5 text-sm">
                        <span>Relations</span>
                        <span className="text-muted-foreground">{exportStats.worldRelationCount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Summaries & Claims */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Summaries & Claims</p>
                  <div className="mt-1 space-y-1">
                    <div className="flex justify-between py-0.5 text-sm">
                      <span>Summaries</span>
                      <span className="text-muted-foreground">{exportStats.summaryCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-0.5 text-sm">
                      <span>Claims</span>
                      <span className="text-muted-foreground">{exportStats.claimCount.toLocaleString()}</span>
                    </div>
                    {exportStats.claimRelationCount > 0 && (
                      <div className="flex justify-between py-0.5 text-sm">
                        <span>Claim Relations</span>
                        <span className="text-muted-foreground">{exportStats.claimRelationCount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Annotations */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Annotations</p>
                  <div className="mt-1 space-y-1">
                    <div className="flex justify-between py-0.5 text-sm">
                      <span>Annotations</span>
                      <span className="text-muted-foreground">{exportStats.annotationCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between py-0.5 text-sm">
                      <span>Keyframes</span>
                      <span className="text-muted-foreground">{exportStats.keyframeCount.toLocaleString()}</span>
                    </div>
                    {includeInterpolated && (
                      <div className="flex justify-between py-0.5 text-sm">
                        <span>Interpolated Frames</span>
                        <span className="text-muted-foreground">{exportStats.interpolatedFrameCount.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Total Size */}
                <div className="border-t pt-3">
                  <p className="text-sm">
                    <strong>Estimated File Size:</strong> {formatBytes(exportStats.totalSize)}
                  </p>
                </div>
              </div>
            )}

            {!isLoadingStats && exportStats && !hasAnyData(exportStats) && (
              <Alert className="mt-2">
                <AlertDescription>No data to export.</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Export Progress */}
          {isExporting && (
            <div>
              <p className="mb-2 text-sm">Exporting data...</p>
              <Progress value={null} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || isLoadingStats || !hasAnyData(exportStats)}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
