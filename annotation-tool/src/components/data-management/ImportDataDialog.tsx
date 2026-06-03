import { useState, useCallback, useEffect } from 'react'
import {
  Upload,
  FileText,
  AlertTriangle,
  CircleAlert,
  X,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'
import { Progress } from '@/components/ui/progress'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import { api } from '@services/api'
import { ImportOptions, ImportPreview, ImportResult, Conflict } from '@models/types'
import { ImportResultDialog, shouldShowOrphanSkippedBanner } from './ImportResultDialog'
import { ExpandableJsonViewer } from '@components/shared/ExpandableJsonViewer'

/**
 * Props for the ImportDataDialog component.
 *
 * @param open - Whether the dialog is open
 * @param onClose - Callback when dialog is closed
 * @param onImportComplete - Optional callback when import completes successfully
 */
interface ImportDataDialogProps {
  open: boolean
  onClose: () => void
  onImportComplete?: (result: ImportResult) => void
}

/**
 * ImportDataDialog component for importing annotations from JSON Lines files.
 * Provides file upload, preview with conflict detection, interactive conflict resolution,
 * and import execution with progress feedback.
 *
 * @param props - Component props
 * @returns Import dialog component
 */
export function ImportDataDialog({ open, onClose, onImportComplete }: ImportDataDialogProps): JSX.Element {
  // File management
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)

  // Preview state
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Conflict resolution
  const [conflictResolutions, setConflictResolutions] = useState<Map<string, string>>(new Map())

  // Import options
  const [options, setOptions] = useState<ImportOptions>({
    conflictResolution: {
      personas: 'skip',
      worldObjects: 'skip',
      missingDependencies: 'skip-item',
      duplicateIds: 'preserve-id',
      sequences: {
        duplicateSequenceIds: 'skip',
        overlappingFrameRanges: 'fail-import',
        interpolationConflicts: 'use-existing'
      }
    },
    scope: {
      includePersonas: true,
      includeWorldState: true,
      includeAnnotations: true,
    },
    validation: {
      strictMode: false,
      validateReferences: true,
      validateSequenceIntegrity: true,
      validateInterpolationTypes: true,
      validateBoundingBoxRanges: true,
      recomputeInterpolation: false,
    },
    transaction: {
      atomic: true,
    },
  })

  // Import execution
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [resultDialogOpen, setResultDialogOpen] = useState(false)

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setFile(null)
      setPreview(null)
      setPreviewError(null)
      setConflictResolutions(new Map())
      setResult(null)
    }
  }, [open])

  /**
   * Check if the preview contains foreign (cross-user) data.
   */
  const hasForeignData = (previewData: ImportPreview): boolean => {
    return previewData.conflicts.some(c => c.ownedByImporter === false)
  }

  /**
   * Get default resolution for a conflict type.
   * Foreign data defaults to 'create-new' so the import creates copies.
   */
  const getDefaultResolution = (conflict: Conflict): string => {
    if (conflict.ownedByImporter === false) {
      return 'create-new'
    }

    switch (conflict.type) {
      case 'duplicate-sequence':
        return 'skip'
      case 'overlapping-frames':
        return 'fail-import'
      case 'interpolation-conflict':
        return 'use-existing'
      case 'missing-dependency':
        return 'skip-item'
      case 'duplicate-persona':
      case 'duplicate-object':
      case 'duplicate-summary':
      case 'duplicate-claim':
      case 'duplicate-claim-relation':
      case 'id-conflict':
        return 'skip'
      default:
        return 'skip'
    }
  }

  /**
   * Handle file selection (from input or drag-and-drop).
   */
  const handleFileSelected = useCallback(async (selectedFile: File) => {
    setFile(selectedFile)
    setPreviewError(null)

    setPreviewing(true)
    try {
      const previewData = await api.previewImport(selectedFile)
      setPreview(previewData)

      const resolutions = new Map<string, string>()
      for (const conflict of previewData.conflicts) {
        resolutions.set(conflict.originalId, getDefaultResolution(conflict))
      }
      setConflictResolutions(resolutions)
    } catch (error: unknown) {
      console.error('Preview failed:', error)
      let message = 'Failed to preview file'
      if (error instanceof Error) {
        message = error.message
      }
      if (typeof error === 'object' && error !== null && 'response' in error) {
        const response = (error as { response?: { data?: { message?: string } } }).response
        if (response?.data?.message) {
          message = response.data.message
        }
      }
      setPreviewError(message)
    } finally {
      setPreviewing(false)
    }
  }, [])

  /**
   * Handle drag events.
   */
  const handleDragEnter = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      const droppedFile = files[0]
      if (droppedFile.name.endsWith('.jsonl')) {
        handleFileSelected(droppedFile)
      } else {
        setPreviewError('Only .jsonl files are accepted')
      }
    }
  }

  /**
   * Handle file input change.
   */
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0]
      if (selectedFile.name.endsWith('.jsonl')) {
        handleFileSelected(selectedFile)
      } else {
        setPreviewError('Only .jsonl files are accepted')
      }
    }
  }

  /**
   * Remove selected file.
   */
  const handleRemoveFile = (): void => {
    setFile(null)
    setPreview(null)
    setPreviewError(null)
    setConflictResolutions(new Map())
  }

  /**
   * Update conflict resolution strategy for a single conflict.
   */
  const updateConflictResolution = (conflictId: string, resolution: string): void => {
    setConflictResolutions(prev => {
      const newMap = new Map(prev)
      newMap.set(conflictId, resolution)
      return newMap
    })
  }

  /**
   * Apply a resolution strategy to all conflicts of a given type.
   */
  const applyToAllConflicts = (conflicts: Conflict[], resolution: string) => {
    setConflictResolutions(prev => {
      const newMap = new Map(prev)
      for (const conflict of conflicts) {
        newMap.set(conflict.originalId, resolution)
      }
      return newMap
    })
  }

  /**
   * Check if all conflicts are resolved.
   */
  const allConflictsResolved = (): boolean => {
    if (!preview) return true

    for (const conflict of preview.conflicts) {
      const resolution = conflictResolutions.get(conflict.originalId)
      if (!resolution || resolution === 'fail-import') {
        return false
      }
    }
    return true
  }

  /**
   * Build import options from current state.
   */
  const buildImportOptions = (): ImportOptions => {
    const sequenceResolutions = {
      duplicateSequenceIds: 'skip' as ImportOptions['conflictResolution']['sequences']['duplicateSequenceIds'],
      overlappingFrameRanges: 'fail-import' as ImportOptions['conflictResolution']['sequences']['overlappingFrameRanges'],
      interpolationConflicts: 'use-existing' as ImportOptions['conflictResolution']['sequences']['interpolationConflicts'],
    }

    if (preview) {
      const sequenceConflicts = preview.conflicts.filter(c => c.type === 'duplicate-sequence')
      const overlappingConflicts = preview.conflicts.filter(c => c.type === 'overlapping-frames')
      const interpolationConflicts = preview.conflicts.filter(c => c.type === 'interpolation-conflict')

      if (sequenceConflicts.length > 0) {
        sequenceResolutions.duplicateSequenceIds = (conflictResolutions.get(sequenceConflicts[0].originalId) || 'skip') as typeof sequenceResolutions.duplicateSequenceIds
      }
      if (overlappingConflicts.length > 0) {
        sequenceResolutions.overlappingFrameRanges = (conflictResolutions.get(overlappingConflicts[0].originalId) || 'fail-import') as typeof sequenceResolutions.overlappingFrameRanges
      }
      if (interpolationConflicts.length > 0) {
        sequenceResolutions.interpolationConflicts = (conflictResolutions.get(interpolationConflicts[0].originalId) || 'use-existing') as typeof sequenceResolutions.interpolationConflicts
      }
    }

    return {
      ...options,
      conflictResolution: {
        ...options.conflictResolution,
        sequences: sequenceResolutions,
      }
    }
  }

  /**
   * Execute import.
   */
  const handleImport = async (): Promise<void> => {
    if (!file) return

    const importOptions = buildImportOptions()

    setImporting(true)
    try {
      const importResult = await api.uploadImportFile(file, importOptions)
      setResult(importResult)

      // Open the result dialog whenever there is something the user
      // needs to see: outright failure, or success-with-skipped-orphans
      // (the latter is the "Completed with Warnings" / orphan-skipped
      // banner case — without surfacing it, dropped annotations are
      // silently masked behind a success toast).
      if (importResult.success && !shouldShowOrphanSkippedBanner(importResult)) {
        toast.success(`Import successful: ${importResult.summary.importedItems.annotations} annotations imported`)
        onImportComplete?.(importResult)
        setTimeout(() => onClose(), 1500)
      } else {
        if (!importResult.success) {
          toast.error(`Import failed: ${importResult.errors.length} errors`)
        }
        onImportComplete?.(importResult)
        setResultDialogOpen(true)
      }
    } catch (error: unknown) {
      console.error('Import failed:', error)
      let errorMessage = 'Unknown error'
      if (error instanceof Error) {
        errorMessage = error.message
      }
      if (typeof error === 'object' && error !== null && 'response' in error) {
        const response = (error as { response?: { data?: { message?: string } } }).response
        if (response?.data?.message) {
          errorMessage = response.data.message
        }
      }
      toast.error(`Import failed: ${errorMessage}`)
    } finally {
      setImporting(false)
    }
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

  /**
   * Get resolution options for a conflict type.
   */
  const getResolutionOptions = (conflictType: Conflict['type']): Array<{ value: string; label: string }> => {
    switch (conflictType) {
      case 'duplicate-persona':
        return [
          { value: 'skip', label: 'Skip (keep existing)' },
          { value: 'replace', label: 'Replace with imported' },
          { value: 'merge', label: 'Merge fields' },
          { value: 'create-new', label: 'Create as new copy' },
        ]
      case 'duplicate-object':
        return [
          { value: 'skip', label: 'Skip (keep existing)' },
          { value: 'replace', label: 'Replace with imported' },
          { value: 'merge-assignments', label: 'Merge assignments' },
          { value: 'create-new', label: 'Create as new copy' },
        ]
      case 'duplicate-summary':
      case 'duplicate-claim':
      case 'duplicate-claim-relation':
        return [
          { value: 'skip', label: 'Skip (keep existing)' },
          { value: 'create-new', label: 'Create as new copy' },
        ]
      case 'duplicate-sequence':
        return [
          { value: 'skip', label: 'Skip (keep existing)' },
          { value: 'replace', label: 'Replace with imported' },
          { value: 'merge-keyframes', label: 'Merge keyframes' },
          { value: 'create-new', label: 'Create as new annotation' },
        ]
      case 'overlapping-frames':
        return [
          { value: 'split-ranges', label: 'Split into ranges' },
          { value: 'extend-range', label: 'Extend existing range' },
          { value: 'replace-overlap', label: 'Replace overlapping frames' },
          { value: 'fail-import', label: 'Fail import' },
        ]
      case 'interpolation-conflict':
        return [
          { value: 'use-imported', label: 'Use imported interpolation' },
          { value: 'use-existing', label: 'Keep existing interpolation' },
          { value: 'fail-import', label: 'Fail import' },
        ]
      case 'missing-dependency':
        return [
          { value: 'skip-item', label: 'Skip this item' },
          { value: 'create-placeholder', label: 'Create placeholder' },
          { value: 'fail-import', label: 'Fail import' },
        ]
      default:
        return [
          { value: 'skip', label: 'Skip' },
        ]
    }
  }

  /**
   * Render conflict item.
   */
  const renderConflict = (conflict: Conflict): JSX.Element => {
    const resolution = conflictResolutions.get(conflict.originalId)
    const resolutionOptions = getResolutionOptions(conflict.type)

    return (
      <div key={conflict.originalId} className="mb-4">
        <p className="mb-2 text-sm">
          <strong>Line {conflict.line}:</strong> {conflict.details}
          {conflict.frameRange && (
            <span className="ml-2 text-xs text-muted-foreground">
              (Frames {conflict.frameRange.start}-{conflict.frameRange.end})
            </span>
          )}
          {conflict.interpolationType && (
            <span className="ml-2 text-xs text-muted-foreground">
              (Type: {conflict.interpolationType})
            </span>
          )}
        </p>
        <RadioGroup
          value={resolution}
          onValueChange={(value) => updateConflictResolution(conflict.originalId, value)}
        >
          {resolutionOptions.map(opt => (
            <div key={opt.value} className="flex items-center gap-2">
              <RadioGroupItem value={opt.value} />
              <Label className="text-sm font-normal">{opt.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    )
  }

  /**
   * Group conflicts by type.
   */
  const groupConflictsByType = (conflicts: Conflict[]): Map<Conflict['type'], Conflict[]> => {
    const grouped = new Map<Conflict['type'], Conflict[]>()
    for (const conflict of conflicts) {
      const existing = grouped.get(conflict.type) || []
      grouped.set(conflict.type, [...existing, conflict])
    }
    return grouped
  }

  /**
   * Get friendly name for conflict type.
   */
  const getConflictTypeName = (type: Conflict['type']): string => {
    switch (type) {
      case 'duplicate-sequence': return 'Duplicate Sequences'
      case 'overlapping-frames': return 'Overlapping Frame Ranges'
      case 'interpolation-conflict': return 'Interpolation Conflicts'
      case 'missing-dependency': return 'Missing Dependencies'
      case 'duplicate-persona': return 'Duplicate Personas'
      case 'duplicate-object': return 'Duplicate Objects'
      case 'duplicate-summary': return 'Duplicate Summaries'
      case 'duplicate-claim': return 'Duplicate Claims'
      case 'duplicate-claim-relation': return 'Duplicate Claim Relations'
      case 'id-conflict': return 'ID Conflicts'
      default: return 'Other Conflicts'
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => { if (!isOpen) onClose() }}
      >
        <DialogContent data-tour-id="import-dialog" className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Data</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-6 pt-2">
            {/* Import Progress */}
            {importing && <Progress value={null} />}

            {/* Information Banner */}
            <Alert>
              <Info className="size-4" />
              <AlertDescription>
                Upload a JSON Lines (.jsonl) file exported from FOVEA. Expand the section below for format details and examples.
              </AlertDescription>
            </Alert>

            {/* Format Documentation Accordion */}
            <Accordion>
              <AccordionItem value="format-spec">
                <AccordionTrigger>
                  Format Specification & Example
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-col gap-6">
                    {/* Overview */}
                    <div className="rounded-md border-l-4 border-primary bg-muted/50 p-4">
                      <p className="text-sm font-medium">
                        JSON Lines format with one object per line. Each line must contain a{' '}
                        <code className="rounded bg-black/10 px-1.5 py-0.5 text-xs">type</code> field and corresponding{' '}
                        <code className="rounded bg-black/10 px-1.5 py-0.5 text-xs">data</code> object.
                      </p>
                    </div>

                    {/* Example */}
                    <div>
                      <div className="mb-2 flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" />
                        <h4 className="text-sm font-bold">
                          Realistic Example: Container Ship Tracking
                        </h4>
                      </div>
                      <p className="mb-2 block text-xs text-muted-foreground">
                        Based on "Imports/Exports Analyst" persona tracking a cargo ship arrival with containers
                      </p>
                      <ExpandableJsonViewer
                        data={{
                          type: "annotation",
                          data: {
                            id: "7f8d9c2b-4a1e-4d6f-9c8b-2e5a1f3d7c4b",
                            videoId: "f3e2d1c0-5b4a-3c2d-1e0f-9a8b7c6d5e4f",
                            annotationType: "type",
                            personaId: "a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d",
                            typeCategory: "entity",
                            typeId: "container_ship",
                            boundingBoxSequence: {
                              boxes: [
                                {
                                  x: 245, y: 180, width: 420, height: 285,
                                  frameNumber: 0, isKeyframe: true, confidence: 0.98,
                                  metadata: {
                                    shipName: "MSC MEDITERRANEAN", imo: "9876543",
                                    callSign: "3FQM7", flag: "Panama",
                                    vesselLength: 366, vesselBeam: 51,
                                    dwt: 140000, teu: 13800
                                  }
                                },
                                { x: 320, y: 195, width: 450, height: 310, frameNumber: 120, isKeyframe: true, confidence: 0.99 },
                                { x: 410, y: 210, width: 485, height: 335, frameNumber: 240, isKeyframe: true, confidence: 0.97 },
                                {
                                  x: 520, y: 225, width: 515, height: 360,
                                  frameNumber: 360, isKeyframe: true, confidence: 0.98,
                                  metadata: {
                                    containersDischarged: 247, containersLoaded: 189,
                                    netMovement: -58, estimatedDepartureTime: "2025-01-15T18:30:00Z"
                                  }
                                }
                              ],
                              interpolationSegments: [
                                { startFrame: 0, endFrame: 120, type: "ease-in-out" },
                                { startFrame: 120, endFrame: 240, type: "linear" },
                                { startFrame: 240, endFrame: 360, type: "ease-out" }
                              ],
                              visibilityRanges: [{ startFrame: 0, endFrame: 360, visible: true }],
                              trackId: 1, trackingSource: "manual", trackingConfidence: 0.98,
                              totalFrames: 361, keyframeCount: 4, interpolatedFrameCount: 357
                            },
                            confidence: 0.98,
                            notes: "Container ship MSC MEDITERRANEAN arriving at berth 12 for discharge/load operations.",
                            metadata: {
                              vesselData: {
                                shipType: "Container Ship", operator: "Mediterranean Shipping Company",
                                buildYear: 2018, port: "Long Beach", terminal: "Pacific Container Terminal",
                                berth: "PCT-12", arrivalTime: "2025-01-15T08:45:00Z",
                                berthingDuration: 12, operationType: "discharge-load"
                              }
                            },
                            createdBy: "analyst_maritime_ops_01",
                            createdAt: "2025-01-15T09:15:23Z",
                            updatedAt: "2025-01-15T14:35:47Z"
                          }
                        }}
                        initialCollapsed={true}
                      />
                    </div>

                    {/* Field Descriptions */}
                    <div>
                      <h4 className="mb-4 text-sm font-bold">
                        Key Field Descriptions
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="rounded-md border bg-card p-4">
                          <p className="mb-2 text-sm font-medium">
                            <code className="rounded bg-black/10 px-1.5 py-0.5 text-xs">annotationType</code>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            "type" assigns a persona's ontology type to a video region. "object" links to an existing world entity, event, or location.
                          </p>
                        </div>
                        <div className="rounded-md border bg-card p-4">
                          <p className="mb-2 text-sm font-medium">
                            <code className="rounded bg-black/10 px-1.5 py-0.5 text-xs">boxes</code>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Keyframe positions defining bounding box movement. Only boxes marked isKeyframe:true are stored; intermediate frames are interpolated.
                          </p>
                        </div>
                        <div className="rounded-md border bg-card p-4">
                          <p className="mb-2 text-sm font-medium">
                            <code className="rounded bg-black/10 px-1.5 py-0.5 text-xs">interpolationSegments</code>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Controls how boxes move between keyframes. Linear for constant motion, ease-in/out for acceleration/deceleration, bezier for custom curves.
                          </p>
                        </div>
                        <div className="rounded-md border bg-card p-4">
                          <p className="mb-2 text-sm font-medium">
                            <code className="rounded bg-black/10 px-1.5 py-0.5 text-xs">visibilityRanges</code>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Defines when the annotation is visible. Supports gaps for objects that leave and re-enter the frame (e.g., occlusion).
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Footer Note */}
                    <Alert>
                      <AlertDescription>
                        <strong>Tip:</strong> Export a sample file using the Export button to examine the complete structure with all supported fields.
                      </AlertDescription>
                    </Alert>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* File Upload Area */}
            <div>
              <Label className="mb-2">Select File</Label>
              {!file ? (
                <div
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "mt-2 cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                    dragActive
                      ? "border-primary bg-muted/50"
                      : "border-border bg-card hover:border-primary hover:bg-muted/50"
                  )}
                  onClick={() => document.getElementById('import-file-input')?.click()}
                >
                  <Upload className="mx-auto mb-4 size-12 text-muted-foreground" />
                  <p className="text-sm">
                    Drag and drop a .jsonl file here
                  </p>
                  <p className="text-sm text-muted-foreground">
                    or click to browse
                  </p>
                  <input
                    id="import-file-input"
                    type="file"
                    accept=".jsonl"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-3 rounded-lg border bg-card p-3">
                  <FileText className="size-5 text-primary" />
                  <div className="flex-1">
                    <p className="text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={handleRemoveFile}>
                    <X className="size-4" />
                  </Button>
                </div>
              )}

              {file && file.size > 50 * 1024 * 1024 && (
                <Alert className="mt-2">
                  <AlertTriangle className="size-4" />
                  <AlertDescription>
                    Large file ({formatBytes(file.size)}). Import may take several minutes.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            {/* Preview Error */}
            {previewError && (
              <Alert variant="destructive">
                <CircleAlert className="size-4" />
                <AlertDescription>{previewError}</AlertDescription>
              </Alert>
            )}

            {/* Previewing Indicator */}
            {previewing && (
              <div className="flex items-center gap-3">
                <Spinner />
                <p className="text-sm">Analyzing file...</p>
              </div>
            )}

            {/* Preview Section */}
            {preview && !previewing && (
              <>
                <Separator />

                {/* Item Counts */}
                <div>
                  <h3 className="mb-3 text-sm font-medium">Preview</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-2xl font-bold text-primary">{preview.counts.annotations}</p>
                      <p className="text-xs text-muted-foreground">Annotations</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-2xl font-bold text-primary">{preview.counts.totalKeyframes}</p>
                      <p className="text-xs text-muted-foreground">Keyframes</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-2xl font-bold text-primary">{preview.counts.singleKeyframeSequences}</p>
                      <p className="text-xs text-muted-foreground">Single-frame</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-lg font-semibold">{preview.counts.personas}</p>
                      <p className="text-xs text-muted-foreground">Personas</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-lg font-semibold">{preview.counts.entities}</p>
                      <p className="text-xs text-muted-foreground">Entities</p>
                    </div>
                    <div className="rounded-lg border bg-card p-3 text-center">
                      <p className="text-lg font-semibold">{preview.counts.events}</p>
                      <p className="text-xs text-muted-foreground">Events</p>
                    </div>
                  </div>
                </div>

                {/* Warnings */}
                {preview.warnings.length > 0 && (
                  <Alert>
                    <AlertTriangle className="size-4" />
                    <AlertDescription>
                      <h4 className="mb-1 text-sm font-medium">Warnings ({preview.warnings.length})</h4>
                      {preview.warnings.map((warning, idx) => (
                        <p key={idx} className="text-xs">{warning}</p>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Conflicts */}
                {preview.conflicts.length > 0 && (
                  <div>
                    {hasForeignData(preview) && (
                      <Alert className="mb-3">
                        <Info className="size-4" />
                        <AlertDescription>
                          This file contains data from another user. Conflicting items
                          default to &quot;Create as new copy&quot; so they are imported with new
                          IDs under your account.
                        </AlertDescription>
                      </Alert>
                    )}

                    <Alert className="mb-3">
                      <AlertTriangle className="size-4" />
                      <AlertDescription>
                        {preview.conflicts.length} conflict{preview.conflicts.length !== 1 ? 's' : ''} detected.
                        Please select resolution strategies below.
                      </AlertDescription>
                    </Alert>

                    <Accordion
                      defaultValue={Array.from(groupConflictsByType(preview.conflicts).entries())
                        .filter(([, conflicts]) => conflicts.length <= 10)
                        .map(([type]) => type)}
                    >
                      {Array.from(groupConflictsByType(preview.conflicts)).map(([type, conflicts]) => (
                        <AccordionItem key={type} value={type}>
                          <AccordionTrigger>
                            {getConflictTypeName(type)} ({conflicts.length})
                          </AccordionTrigger>
                          <AccordionContent>
                            {conflicts.length > 1 && (
                              <div className="mb-3 border-b pb-3">
                                <p className="mb-2 text-xs text-muted-foreground">
                                  Apply to all {conflicts.length} items:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {getResolutionOptions(type).map(opt => (
                                    <Button
                                      key={opt.value}
                                      size="sm"
                                      variant="outline"
                                      onClick={() => applyToAllConflicts(conflicts, opt.value)}
                                    >
                                      {opt.label}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}
                            {conflicts.map(renderConflict)}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                )}

                <Separator />

                {/* Import Options */}
                <div>
                  <h3 className="mb-3 text-sm font-medium">Import Options</h3>

                  <div className="flex flex-col gap-4">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">Scope</Label>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={options.scope.includePersonas}
                        onCheckedChange={(checked) => setOptions({
                          ...options,
                          scope: { ...options.scope, includePersonas: !!checked }
                        })}
                      />
                      <Label className="font-normal">Import Personas</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={options.scope.includeWorldState}
                        onCheckedChange={(checked) => setOptions({
                          ...options,
                          scope: { ...options.scope, includeWorldState: !!checked }
                        })}
                      />
                      <Label className="font-normal">Import World State</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={options.scope.includeAnnotations}
                        onCheckedChange={(checked) => setOptions({
                          ...options,
                          scope: { ...options.scope, includeAnnotations: !!checked }
                        })}
                      />
                      <Label className="font-normal">Import Annotations</Label>
                    </div>

                    <Label className="mt-2 text-xs font-semibold uppercase text-muted-foreground">Validation</Label>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={options.validation.strictMode}
                        onCheckedChange={(checked) => setOptions({
                          ...options,
                          validation: { ...options.validation, strictMode: !!checked }
                        })}
                      />
                      <Label className="font-normal">Strict Mode (fail on warnings)</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={options.validation.validateReferences}
                        onCheckedChange={(checked) => setOptions({
                          ...options,
                          validation: { ...options.validation, validateReferences: !!checked }
                        })}
                      />
                      <Label className="font-normal">Validate References</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={options.validation.validateSequenceIntegrity}
                        onCheckedChange={(checked) => setOptions({
                          ...options,
                          validation: { ...options.validation, validateSequenceIntegrity: !!checked }
                        })}
                      />
                      <Label className="font-normal">Validate Sequence Integrity</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={options.validation.validateBoundingBoxRanges}
                        onCheckedChange={(checked) => setOptions({
                          ...options,
                          validation: { ...options.validation, validateBoundingBoxRanges: !!checked }
                        })}
                      />
                      <Label className="font-normal">Validate Bounding Box Ranges</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={options.validation.recomputeInterpolation}
                        onCheckedChange={(checked) => setOptions({
                          ...options,
                          validation: { ...options.validation, recomputeInterpolation: !!checked }
                        })}
                      />
                      <Label className="font-normal">Recompute Interpolation</Label>
                    </div>

                    <Label className="mt-2 text-xs font-semibold uppercase text-muted-foreground">Transaction</Label>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={options.transaction.atomic}
                        onCheckedChange={(checked) => setOptions({
                          ...options,
                          transaction: { ...options.transaction, atomic: !!checked }
                        })}
                      />
                      <Label className="font-normal">Atomic (all-or-nothing)</Label>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={importing}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={!file || previewing || importing || !allConflictsResolved()}
            >
              {importing ? 'Importing...' : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Result Dialog */}
      <ImportResultDialog
        open={resultDialogOpen}
        result={result}
        onClose={() => {
          setResultDialogOpen(false)
          onClose()
        }}
      />
    </>
  )
}
