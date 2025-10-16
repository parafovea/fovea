import { useState, useCallback, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  LinearProgress,
  Divider,
  FormGroup,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  IconButton,
  Snackbar,
} from '@mui/material'
import {
  CloudUpload as UploadIcon,
  InsertDriveFile as FileIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
} from '@mui/icons-material'
import { api } from '../services/api'
import { ImportOptions, ImportPreview, ImportResult, Conflict } from '../models/types'
import ImportResultDialog from './ImportResultDialog'
import ExpandableJsonViewer from './shared/ExpandableJsonViewer'

/**
 * @interface ImportDataDialogProps
 * @description Props for the ImportDataDialog component.
 * @property open - Whether the dialog is open
 * @property onClose - Callback when dialog is closed
 * @property onImportComplete - Optional callback when import completes successfully
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
export default function ImportDataDialog({ open, onClose, onImportComplete }: ImportDataDialogProps) {
  // File management
  const [file, setFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)

  // Preview state
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Conflict resolution
  const [conflictResolutions, setConflictResolutions] = useState<Map<string, string>>(new Map())

  // Notifications
  const [notification, setNotification] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error' | 'info' | 'warning'
  }>({ open: false, message: '', severity: 'success' })

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
      // Reset all state when closing
      setFile(null)
      setPreview(null)
      setPreviewError(null)
      setConflictResolutions(new Map())
      setResult(null)
    }
  }, [open])

  /**
   * Get default resolution for a conflict type.
   */
  const getDefaultResolution = (conflictType: Conflict['type']): string => {
    switch (conflictType) {
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

    // Auto-preview
    setPreviewing(true)
    try {
      const previewData = await api.previewImport(selectedFile)
      setPreview(previewData)

      // Initialize conflict resolutions with defaults
      const resolutions = new Map<string, string>()
      for (const conflict of previewData.conflicts) {
        resolutions.set(conflict.originalId, getDefaultResolution(conflict.type))
      }
      setConflictResolutions(resolutions)
    } catch (error: any) {
      console.error('Preview failed:', error)
      setPreviewError(error.response?.data?.message || error.message || 'Failed to preview file')
    } finally {
      setPreviewing(false)
    }
  }, [])

  /**
   * Handle drag events.
   */
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
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
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  const handleRemoveFile = () => {
    setFile(null)
    setPreview(null)
    setPreviewError(null)
    setConflictResolutions(new Map())
  }

  /**
   * Update conflict resolution strategy.
   */
  const updateConflictResolution = (conflictId: string, resolution: string) => {
    setConflictResolutions(prev => {
      const newMap = new Map(prev)
      newMap.set(conflictId, resolution)
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
      duplicateSequenceIds: 'skip' as any,
      overlappingFrameRanges: 'fail-import' as any,
      interpolationConflicts: 'use-existing' as any,
    }

    // Group conflicts by type and use most common resolution
    if (preview) {
      const sequenceConflicts = preview.conflicts.filter(c => c.type === 'duplicate-sequence')
      const overlappingConflicts = preview.conflicts.filter(c => c.type === 'overlapping-frames')
      const interpolationConflicts = preview.conflicts.filter(c => c.type === 'interpolation-conflict')

      if (sequenceConflicts.length > 0) {
        sequenceResolutions.duplicateSequenceIds = conflictResolutions.get(sequenceConflicts[0].originalId) || 'skip'
      }
      if (overlappingConflicts.length > 0) {
        sequenceResolutions.overlappingFrameRanges = conflictResolutions.get(overlappingConflicts[0].originalId) || 'fail-import'
      }
      if (interpolationConflicts.length > 0) {
        sequenceResolutions.interpolationConflicts = conflictResolutions.get(interpolationConflicts[0].originalId) || 'use-existing'
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
  const handleImport = async () => {
    if (!file) return

    const importOptions = buildImportOptions()

    setImporting(true)
    try {
      const importResult = await api.uploadImportFile(file, importOptions)
      setResult(importResult)

      if (importResult.success) {
        setNotification({
          open: true,
          message: `Import successful: ${importResult.summary.importedItems.annotations} annotations imported`,
          severity: 'success'
        })

        onImportComplete?.(importResult)

        // Close dialog after short delay
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setNotification({
          open: true,
          message: `Import failed: ${importResult.errors.length} errors`,
          severity: 'error'
        })

        // Open result dialog to show details
        setResultDialogOpen(true)
      }
    } catch (error: any) {
      console.error('Import failed:', error)
      setNotification({
        open: true,
        message: `Import failed: ${error.response?.data?.message || error.message || 'Unknown error'}`,
        severity: 'error'
      })
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
  const renderConflict = (conflict: Conflict) => {
    const resolution = conflictResolutions.get(conflict.originalId)
    const options = getResolutionOptions(conflict.type)

    return (
      <Box key={conflict.originalId} sx={{ mb: 2 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          <strong>Line {conflict.line}:</strong> {conflict.details}
          {conflict.frameRange && (
            <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
              (Frames {conflict.frameRange.start}-{conflict.frameRange.end})
            </Typography>
          )}
          {conflict.interpolationType && (
            <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
              (Type: {conflict.interpolationType})
            </Typography>
          )}
        </Typography>
        <RadioGroup
          value={resolution}
          onChange={(e) => updateConflictResolution(conflict.originalId, e.target.value)}
        >
          {options.map(opt => (
            <FormControlLabel
              key={opt.value}
              value={opt.value}
              control={<Radio size="small" />}
              label={opt.label}
            />
          ))}
        </RadioGroup>
      </Box>
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
      case 'id-conflict': return 'ID Conflicts'
      default: return 'Other Conflicts'
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Import Data</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
            {/* Import Progress */}
            {importing && <LinearProgress />}

            {/* Information Banner */}
            <Alert severity="info" icon={<InfoIcon />}>
              <Typography variant="body2">
                Upload a JSON Lines (.jsonl) file exported from FOVEA. Expand the section below for format details and examples.
              </Typography>
            </Alert>

            {/* Format Documentation Accordion */}
            <Accordion>
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  bgcolor: 'action.hover',
                  '&:hover': { bgcolor: 'action.selected' }
                }}
              >
                <Typography variant="subtitle2">
                  Format Specification & Example
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ bgcolor: 'background.default' }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {/* Overview */}
                  <Paper sx={{ p: 2, bgcolor: 'primary.50', borderLeft: 3, borderColor: 'primary.main' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                      JSON Lines format with one object per line. Each line must contain a <code style={{ bgcolor: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: 3 }}>type</code> field and corresponding <code style={{ bgcolor: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: 3 }}>data</code> object.
                    </Typography>
                  </Paper>

                  {/* Example */}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <FileIcon color="action" fontSize="small" />
                      <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                        Realistic Example: Container Ship Tracking
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                      Based on "Imports/Exports Analyst" persona tracking a cargo ship arrival with containers
                    </Typography>
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
                                x: 245,
                                y: 180,
                                width: 420,
                                height: 285,
                                frameNumber: 0,
                                isKeyframe: true,
                                confidence: 0.98,
                                metadata: {
                                  shipName: "MSC MEDITERRANEAN",
                                  imo: "9876543",
                                  callSign: "3FQM7",
                                  flag: "Panama",
                                  vesselLength: 366,
                                  vesselBeam: 51,
                                  dwt: 140000,
                                  teu: 13800
                                }
                              },
                              {
                                x: 320,
                                y: 195,
                                width: 450,
                                height: 310,
                                frameNumber: 120,
                                isKeyframe: true,
                                confidence: 0.99
                              },
                              {
                                x: 410,
                                y: 210,
                                width: 485,
                                height: 335,
                                frameNumber: 240,
                                isKeyframe: true,
                                confidence: 0.97
                              },
                              {
                                x: 520,
                                y: 225,
                                width: 515,
                                height: 360,
                                frameNumber: 360,
                                isKeyframe: true,
                                confidence: 0.98,
                                metadata: {
                                  containersDischarged: 247,
                                  containersLoaded: 189,
                                  netMovement: -58,
                                  estimatedDepartureTime: "2025-01-15T18:30:00Z"
                                }
                              }
                            ],
                            interpolationSegments: [
                              {
                                startFrame: 0,
                                endFrame: 120,
                                type: "ease-in-out"
                              },
                              {
                                startFrame: 120,
                                endFrame: 240,
                                type: "linear"
                              },
                              {
                                startFrame: 240,
                                endFrame: 360,
                                type: "ease-out"
                              }
                            ],
                            visibilityRanges: [
                              {
                                startFrame: 0,
                                endFrame: 360,
                                visible: true
                              }
                            ],
                            trackId: 1,
                            trackingSource: "manual",
                            trackingConfidence: 0.98,
                            totalFrames: 361,
                            keyframeCount: 4,
                            interpolatedFrameCount: 357
                          },
                          confidence: 0.98,
                          notes: "Container ship MSC MEDITERRANEAN arriving at berth 12 for discharge/load operations. Ship approached from southwest channel, berthed at 08:45 UTC. Gantry cranes 3, 4, and 5 assigned for operations. Weather conditions: clear, wind 8 knots NE.",
                          metadata: {
                            vesselData: {
                              shipType: "Container Ship",
                              operator: "Mediterranean Shipping Company",
                              buildYear: 2018,
                              port: "Long Beach",
                              terminal: "Pacific Container Terminal",
                              berth: "PCT-12",
                              arrivalTime: "2025-01-15T08:45:00Z",
                              berthingDuration: 12,
                              operationType: "discharge-load"
                            },
                            cargoOperations: {
                              containersOnBoard: 8543,
                              containerTypes: {
                                "20ft": 3245,
                                "40ft": 4812,
                                "40ft_hc": 486
                              },
                              refrigeratedContainers: 842,
                              hazmatContainers: 67,
                              companiesObserved: [
                                "MAERSK",
                                "MSC",
                                "CMA CGM",
                                "COSCO",
                                "EVERGREEN",
                                "HAPAG-LLOYD",
                                "ONE"
                              ],
                              loadingEquipment: [
                                "Gantry Crane 3",
                                "Gantry Crane 4",
                                "Gantry Crane 5"
                              ]
                            },
                            weatherConditions: {
                              visibility: "excellent",
                              windSpeed: 8,
                              windDirection: "NE",
                              temperature: 18,
                              seaState: "calm"
                            }
                          },
                          createdBy: "analyst_maritime_ops_01",
                          createdAt: "2025-01-15T09:15:23Z",
                          updatedAt: "2025-01-15T14:35:47Z"
                        }
                      }}
                      initialCollapsed={true}
                    />
                  </Box>

                  {/* Field Descriptions */}
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 2 }}>
                      Key Field Descriptions
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Paper sx={{ p: 2, height: '100%', bgcolor: 'background.paper' }}>
                          <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                            <code style={{ bgcolor: 'action.selected', padding: '2px 6px', borderRadius: 3 }}>annotationType</code>
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            "type" assigns a persona's ontology type to a video region. "object" links to an existing world entity, event, or location.
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6}>
                        <Paper sx={{ p: 2, height: '100%', bgcolor: 'background.paper' }}>
                          <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                            <code style={{ bgcolor: 'action.selected', padding: '2px 6px', borderRadius: 3 }}>boxes</code>
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Keyframe positions defining bounding box movement. Only boxes marked isKeyframe:true are stored; intermediate frames are interpolated.
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6}>
                        <Paper sx={{ p: 2, height: '100%', bgcolor: 'background.paper' }}>
                          <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                            <code style={{ bgcolor: 'action.selected', padding: '2px 6px', borderRadius: 3 }}>interpolationSegments</code>
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Controls how boxes move between keyframes. Linear for constant motion, ease-in/out for acceleration/deceleration, bezier for custom curves.
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6}>
                        <Paper sx={{ p: 2, height: '100%', bgcolor: 'background.paper' }}>
                          <Typography variant="body2" sx={{ fontWeight: 'medium', mb: 1 }}>
                            <code style={{ bgcolor: 'action.selected', padding: '2px 6px', borderRadius: 3 }}>visibilityRanges</code>
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Defines when the annotation is visible. Supports gaps for objects that leave and re-enter the frame (e.g., occlusion).
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>
                  </Box>

                  {/* Footer Note */}
                  <Alert severity="success" variant="outlined" sx={{ borderRadius: 1 }}>
                    <Typography variant="caption">
                      <strong>Tip:</strong> Export a sample file using the Export button to examine the complete structure with all supported fields.
                    </Typography>
                  </Alert>
                </Box>
              </AccordionDetails>
            </Accordion>

            {/* File Upload Area */}
            <Box>
              <FormLabel component="legend">Select File</FormLabel>
              {!file ? (
                <Paper
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  sx={{
                    mt: 1,
                    p: 4,
                    border: dragActive ? '2px dashed' : '2px dashed',
                    borderColor: dragActive ? 'primary.main' : 'divider',
                    backgroundColor: dragActive ? 'action.hover' : 'background.paper',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s',
                    '&:hover': {
                      backgroundColor: 'action.hover',
                      borderColor: 'primary.main',
                    }
                  }}
                  onClick={() => document.getElementById('import-file-input')?.click()}
                >
                  <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
                  <Typography variant="body1" gutterBottom>
                    Drag and drop a .jsonl file here
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    or click to browse
                  </Typography>
                  <input
                    id="import-file-input"
                    type="file"
                    accept=".jsonl"
                    style={{ display: 'none' }}
                    onChange={handleFileInputChange}
                  />
                </Paper>
              ) : (
                <Paper sx={{ mt: 1, p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <FileIcon color="primary" />
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography variant="body2">{file.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatBytes(file.size)}
                    </Typography>
                  </Box>
                  <IconButton onClick={handleRemoveFile} size="small">
                    <CloseIcon />
                  </IconButton>
                </Paper>
              )}

              {file && file.size > 50 * 1024 * 1024 && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Large file ({formatBytes(file.size)}). Import may take several minutes.
                </Alert>
              )}
            </Box>

            {/* Preview Error */}
            {previewError && (
              <Alert severity="error" icon={<ErrorIcon />}>
                {previewError}
              </Alert>
            )}

            {/* Previewing Indicator */}
            {previewing && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <CircularProgress size={24} />
                <Typography variant="body2">Analyzing file...</Typography>
              </Box>
            )}

            {/* Preview Section */}
            {preview && !previewing && (
              <>
                <Divider />

                {/* Item Counts */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Preview
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h4" color="primary">{preview.counts.annotations}</Typography>
                        <Typography variant="caption">Annotations</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h4" color="primary">{preview.counts.totalKeyframes}</Typography>
                        <Typography variant="caption">Keyframes</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h4" color="primary">{preview.counts.singleKeyframeSequences}</Typography>
                        <Typography variant="caption">Single-frame</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h6">{preview.counts.personas}</Typography>
                        <Typography variant="caption">Personas</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h6">{preview.counts.entities}</Typography>
                        <Typography variant="caption">Entities</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={4}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h6">{preview.counts.events}</Typography>
                        <Typography variant="caption">Events</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </Box>

                {/* Warnings */}
                {preview.warnings.length > 0 && (
                  <Alert severity="warning" icon={<WarningIcon />}>
                    <Typography variant="subtitle2" gutterBottom>Warnings ({preview.warnings.length})</Typography>
                    {preview.warnings.map((warning, idx) => (
                      <Typography key={idx} variant="caption" component="div">
                        {warning}
                      </Typography>
                    ))}
                  </Alert>
                )}

                {/* Conflicts */}
                {preview.conflicts.length > 0 && (
                  <Box>
                    <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
                      {preview.conflicts.length} conflict{preview.conflicts.length !== 1 ? 's' : ''} detected.
                      Please select resolution strategies below.
                    </Alert>

                    {Array.from(groupConflictsByType(preview.conflicts)).map(([type, conflicts]) => (
                      <Accordion key={type} defaultExpanded>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Typography>
                            {getConflictTypeName(type)} ({conflicts.length})
                          </Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                          {conflicts.map(renderConflict)}
                        </AccordionDetails>
                      </Accordion>
                    ))}
                  </Box>
                )}

                <Divider />

                {/* Import Options */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Import Options
                  </Typography>

                  <FormGroup>
                    <FormLabel component="legend" sx={{ mt: 1 }}>Scope</FormLabel>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={options.scope.includePersonas}
                          onChange={(e) => setOptions({
                            ...options,
                            scope: { ...options.scope, includePersonas: e.target.checked }
                          })}
                        />
                      }
                      label="Import Personas"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={options.scope.includeWorldState}
                          onChange={(e) => setOptions({
                            ...options,
                            scope: { ...options.scope, includeWorldState: e.target.checked }
                          })}
                        />
                      }
                      label="Import World State"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={options.scope.includeAnnotations}
                          onChange={(e) => setOptions({
                            ...options,
                            scope: { ...options.scope, includeAnnotations: e.target.checked }
                          })}
                        />
                      }
                      label="Import Annotations"
                    />

                    <FormLabel component="legend" sx={{ mt: 2 }}>Validation</FormLabel>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={options.validation.strictMode}
                          onChange={(e) => setOptions({
                            ...options,
                            validation: { ...options.validation, strictMode: e.target.checked }
                          })}
                        />
                      }
                      label="Strict Mode (fail on warnings)"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={options.validation.validateReferences}
                          onChange={(e) => setOptions({
                            ...options,
                            validation: { ...options.validation, validateReferences: e.target.checked }
                          })}
                        />
                      }
                      label="Validate References"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={options.validation.validateSequenceIntegrity}
                          onChange={(e) => setOptions({
                            ...options,
                            validation: { ...options.validation, validateSequenceIntegrity: e.target.checked }
                          })}
                        />
                      }
                      label="Validate Sequence Integrity"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={options.validation.validateBoundingBoxRanges}
                          onChange={(e) => setOptions({
                            ...options,
                            validation: { ...options.validation, validateBoundingBoxRanges: e.target.checked }
                          })}
                        />
                      }
                      label="Validate Bounding Box Ranges"
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={options.validation.recomputeInterpolation}
                          onChange={(e) => setOptions({
                            ...options,
                            validation: { ...options.validation, recomputeInterpolation: e.target.checked }
                          })}
                        />
                      }
                      label="Recompute Interpolation"
                    />

                    <FormLabel component="legend" sx={{ mt: 2 }}>Transaction</FormLabel>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={options.transaction.atomic}
                          onChange={(e) => setOptions({
                            ...options,
                            transaction: { ...options.transaction, atomic: e.target.checked }
                          })}
                        />
                      }
                      label="Atomic (all-or-nothing)"
                    />
                  </FormGroup>
                </Box>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            variant="contained"
            disabled={!file || previewing || importing || !allConflictsResolved()}
          >
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Notification Snackbar */}
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={() => setNotification({ ...notification, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setNotification({ ...notification, open: false })}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>

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
