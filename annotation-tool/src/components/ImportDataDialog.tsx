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
} from '@mui/icons-material'
import { api } from '../services/api'
import { ImportOptions, ImportPreview, ImportResult, Conflict } from '../models/types'
import ImportResultDialog from './ImportResultDialog'

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
