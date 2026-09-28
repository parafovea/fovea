/**
 * Dialog for configuring object detection with persona-based or manual queries.
 * Supports persona ontology-based query building with 16 configurable options.
 */

import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePersonas } from '@store/queries'
import { useAnnotationUiStore } from '@store/zustand'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

/**
 * Detection query options for persona-based detection.
 */
export interface DetectionQueryOptions {
  includeEntityTypes?: boolean
  includeEntityGlosses?: boolean
  includeEventTypes?: boolean
  includeEventGlosses?: boolean
  includeRoleTypes?: boolean
  includeRoleGlosses?: boolean
  includeRelationTypes?: boolean
  includeRelationGlosses?: boolean
  includeEntityInstances?: boolean
  includeEntityInstanceGlosses?: boolean
  includeEventInstances?: boolean
  includeEventInstanceGlosses?: boolean
  includeLocationInstances?: boolean
  includeLocationInstanceGlosses?: boolean
  includeTimeInstances?: boolean
  includeTimeInstanceGlosses?: boolean
}

/**
 * Request payload for object detection.
 */
export type TrackingModel = 'samurai' | 'sam2long' | 'sam2' | 'yolo11seg'

export interface DetectionRequest {
  videoId: string
  personaId?: string
  manualQuery?: string
  queryOptions?: DetectionQueryOptions
  frameNumbers?: number[]
  confidenceThreshold?: number
  enableTracking?: boolean
  trackingModel?: TrackingModel
  trackSingleObject?: boolean
}

/**
 * Props for DetectionDialog component.
 */
export interface DetectionDialogProps {
  open: boolean
  onClose: () => void
  onDetect: (request: DetectionRequest) => void
  videoId: string
  currentTime: number
  duration: number
  fps: number
  isLoading?: boolean
  error?: string | null
}

/**
 * Dialog for configuring object detection with persona-based or manual queries.
 * Provides UI for selecting detection parameters and query building options.
 *
 * @param props - Component properties
 * @returns DetectionDialog component
 */
export function DetectionDialog({
  open,
  onClose,
  onDetect,
  videoId,
  currentTime,
  duration,
  fps,
  isLoading = false,
  error = null,
}: DetectionDialogProps) {
  const dialogAnchorRef = useTourAnchor('detect-dialog')
  const runButtonAnchorRef = useTourAnchor('detect-dialog-run-button')
  const selectedPersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)
  const { data: personas = [] } = usePersonas()

  const [queryMode, setQueryMode] = useState<'persona' | 'manual'>('persona')
  const [manualQuery, setManualQuery] = useState('')
  const [frameMode, setFrameMode] = useState<'current' | 'range' | 'all'>('current')
  const [frameStart, setFrameStart] = useState(0)
  const [frameEnd, setFrameEnd] = useState(0)
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.3)

  // Tracking options
  const [enableTracking, setEnableTracking] = useState(false)
  const [trackingModel, setTrackingModel] = useState<TrackingModel>('samurai')
  const [trackSingleObject, setTrackSingleObject] = useState(false)

  // Query options state (default: only entity types, no glosses)
  const [queryOptions, setQueryOptions] = useState<DetectionQueryOptions>({
    includeEntityTypes: true,
    includeEntityGlosses: false,
    includeEventTypes: false,
    includeEventGlosses: false,
    includeRoleTypes: false,
    includeRoleGlosses: false,
    includeRelationTypes: false,
    includeRelationGlosses: false,
    includeEntityInstances: false,
    includeEntityInstanceGlosses: false,
    includeEventInstances: false,
    includeEventInstanceGlosses: false,
    includeLocationInstances: false,
    includeLocationInstanceGlosses: false,
    includeTimeInstances: false,
    includeTimeInstanceGlosses: false,
  })

  useEffect(() => {
    if (open) {
      const currentFrame = Math.floor(currentTime * fps)
      setFrameStart(currentFrame)
      setFrameEnd(Math.min(currentFrame + fps * 5, Math.floor(duration * fps)))
    }
  }, [open, currentTime, duration, fps])

  const handleOptionChange = (option: keyof DetectionQueryOptions, value: boolean) => {
    setQueryOptions(prev => ({ ...prev, [option]: value }))
  }

  const handleDetect = () => {
    let frameNumbers: number[] | undefined

    if (frameMode === 'current') {
      const currentFrame = Math.floor(currentTime * fps)
      frameNumbers = [currentFrame]
    } else if (frameMode === 'range') {
      frameNumbers = []
      for (let i = frameStart; i <= frameEnd; i++) {
        frameNumbers.push(i)
      }
    }

    const request: DetectionRequest = {
      videoId,
      frameNumbers,
      confidenceThreshold,
      enableTracking: enableTracking && frameMode !== 'current',
      trackingModel: enableTracking ? trackingModel : undefined,
      trackSingleObject: enableTracking ? trackSingleObject : undefined,
    }

    if (queryMode === 'persona') {
      request.personaId = selectedPersonaId || undefined
      request.queryOptions = queryOptions
    } else {
      request.manualQuery = manualQuery
    }

    onDetect(request)
  }

  const selectedPersona = personas.find(p => p.id === selectedPersonaId)
  const canDetect = queryMode === 'manual' ? manualQuery.trim().length > 0 : Boolean(selectedPersonaId)

  return (
    <Dialog open={open} onOpenChange={(val) => { if (!val) onClose() }}>
      <DialogContent className="sm:max-w-2xl" ref={dialogAnchorRef}>
        <DialogHeader>
          <DialogTitle>Detect Objects</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 mt-2">
          {/* Query Mode Selection */}
          <div>
            <Tabs value={queryMode} onValueChange={(v) => setQueryMode(v as 'persona' | 'manual')}>
              <TabsList className="mb-4">
                <TabsTrigger value="persona">Use Persona Ontology</TabsTrigger>
                <TabsTrigger value="manual">Manual Query</TabsTrigger>
              </TabsList>

              <TabsContent value="persona">
                {!selectedPersonaId && (
                  <Alert className="mb-4">
                    <AlertDescription>
                      Please select a persona first to use ontology-based detection
                    </AlertDescription>
                  </Alert>
                )}

                {selectedPersona && (
                  <div className="mb-4">
                    <p className="text-sm font-medium">
                      Selected Persona: {selectedPersona.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedPersona.role} - {selectedPersona.informationNeed}
                    </p>
                  </div>
                )}

                {/* Query Options */}
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium mb-4">
                    Query Building Options
                  </p>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    {/* Ontology Types */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        Ontology Types
                      </p>
                      {([
                        ['includeEntityTypes', 'Entity Types'],
                        ['includeEntityGlosses', 'Entity Glosses'],
                        ['includeEventTypes', 'Event Types'],
                        ['includeEventGlosses', 'Event Glosses'],
                        ['includeRoleTypes', 'Role Types'],
                        ['includeRoleGlosses', 'Role Glosses'],
                        ['includeRelationTypes', 'Relation Types'],
                        ['includeRelationGlosses', 'Relation Glosses'],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 py-1 cursor-pointer">
                          <Checkbox
                            checked={queryOptions[key]}
                            onCheckedChange={(checked) => handleOptionChange(key, checked === true)}
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>

                    {/* World State Instances */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        World State Instances
                      </p>
                      {([
                        ['includeEntityInstances', 'Entity Instances'],
                        ['includeEntityInstanceGlosses', 'Entity Instance Glosses'],
                        ['includeEventInstances', 'Event Instances'],
                        ['includeEventInstanceGlosses', 'Event Instance Glosses'],
                        ['includeLocationInstances', 'Location Instances'],
                        ['includeLocationInstanceGlosses', 'Location Instance Glosses'],
                        ['includeTimeInstances', 'Time Instances'],
                        ['includeTimeInstanceGlosses', 'Time Instance Glosses'],
                      ] as const).map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2 py-1 cursor-pointer">
                          <Checkbox
                            checked={queryOptions[key]}
                            onCheckedChange={(checked) => handleOptionChange(key, checked === true)}
                          />
                          <span className="text-sm">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="manual">
                <div>
                  <Label htmlFor="detection-query" className="mb-2">Detection Query</Label>
                  <Input
                    id="detection-query"
                    placeholder="e.g., person, vehicle, baseball"
                    value={manualQuery}
                    onChange={(e) => setManualQuery(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Describe what you want to detect in the video
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <Separator />

          {/* Frame Selection */}
          <div>
            <Label className="mb-2">Frame Selection</Label>
            <Select value={frameMode} onValueChange={(v) => setFrameMode(v as 'current' | 'range' | 'all')}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">Current Frame Only</SelectItem>
                <SelectItem value="range">Frame Range</SelectItem>
                <SelectItem value="all">All Frames</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {frameMode === 'range' && (
            <div className="flex gap-4">
              <div className="flex-1">
                <Label htmlFor="frame-start" className="mb-2">Start Frame</Label>
                <Input
                  id="frame-start"
                  type="number"
                  value={frameStart}
                  onChange={(e) => setFrameStart(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="frame-end" className="mb-2">End Frame</Label>
                <Input
                  id="frame-end"
                  type="number"
                  value={frameEnd}
                  onChange={(e) => setFrameEnd(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          )}

          {/* Confidence Threshold */}
          <div>
            <p className="text-sm mb-2">
              Confidence Threshold: {confidenceThreshold.toFixed(2)}
            </p>
            <Slider
              value={[confidenceThreshold]}
              onValueChange={(values) => setConfidenceThreshold((values as readonly number[])[0])}
              min={0.1}
              max={1.0}
              step={0.05}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>0.1</span>
              <span>0.5</span>
              <span>1.0</span>
            </div>
          </div>

          {/* Tracking Configuration */}
          {frameMode !== 'current' && (
            <>
              <Separator />
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={enableTracking}
                    onCheckedChange={(checked) => setEnableTracking(checked === true)}
                  />
                  <span className="text-sm font-medium">Enable Tracking</span>
                </label>
                <p className="text-xs text-muted-foreground ml-6">
                  Track objects across frames using automation
                </p>
              </div>

              {enableTracking && (
                <div className="flex flex-col gap-4">
                  <div>
                    <Label className="mb-2">Tracking Model</Label>
                    <Select value={trackingModel} onValueChange={(v) => setTrackingModel(v as TrackingModel)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="samurai">SAMURAI (Recommended)</SelectItem>
                        <SelectItem value="sam2long">SAM2Long (Long videos)</SelectItem>
                        <SelectItem value="sam2">SAM2 (Fast)</SelectItem>
                        <SelectItem value="yolo11seg">YOLO11n-seg (Segmentation)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={trackSingleObject}
                      onCheckedChange={(checked) => setTrackSingleObject(checked === true)}
                    />
                    <span className="text-sm">Track Single Object Only</span>
                  </label>

                  <Alert>
                    <AlertDescription>
                      Tracking will generate candidate annotations that you can preview and accept/reject.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                Detection failed: {error}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleDetect}
            disabled={isLoading || !canDetect}
            ref={runButtonAnchorRef}
          >
            {isLoading ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            {isLoading ? 'Detecting...' : 'Run Detection'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
