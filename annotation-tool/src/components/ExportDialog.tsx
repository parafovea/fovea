import { useState, useEffect, useCallback } from 'react'
import { useSelector } from 'react-redux'
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
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  FormGroup,
  FormLabel,
} from '@mui/material'
import { RootState } from '../store/store'
import { api } from '../services/api'
import { ExportOptions, ExportStats, VideoMetadata } from '../models/types'

/**
 * @interface ExportDialogProps
 * @description Props for the ExportDialog component.
 * @property open - Whether the dialog is open
 * @property onClose - Callback when dialog is closed
 */
interface ExportDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * ExportDialog component for exporting annotations with bounding box sequences.
 * Provides options for keyframes-only vs. fully interpolated export,
 * filtering by persona and video, and displays size estimation.
 *
 * @param props - Component props
 * @returns Export dialog component
 */
export default function ExportDialog({ open, onClose }: ExportDialogProps) {
  const { personas } = useSelector((state: RootState) => state.persona)
  const videos = useSelector((state: RootState) => state.videos.videos)

  const [includeInterpolated, setIncludeInterpolated] = useState(false)
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>([])
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>([])
  const [selectedAnnotationTypes, setSelectedAnnotationTypes] = useState<('type' | 'object')[]>([])
  const [exportStats, setExportStats] = useState<ExportStats | null>(null)
  const [isLoadingStats, setIsLoadingStats] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
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
    } catch (err: any) {
      console.error('Failed to load export stats:', err)
      setError(err.message || 'Failed to load export statistics')
    } finally {
      setIsLoadingStats(false)
    }
  }, [includeInterpolated, selectedPersonaIds, selectedVideoIds, selectedAnnotationTypes])

  // Load export statistics when options change
  useEffect(() => {
    if (open) {
      loadExportStats()
    }
  }, [open, loadExportStats])

  /**
   * Perform the export and trigger download.
   */
  const handleExport = async () => {
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
    } catch (err: any) {
      console.error('Export failed:', err)
      setError(err.response?.data?.message || err.message || 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  /**
   * Toggle persona selection.
   */
  const togglePersona = (personaId: string) => {
    setSelectedPersonaIds(prev =>
      prev.includes(personaId)
        ? prev.filter(id => id !== personaId)
        : [...prev, personaId]
    )
  }

  /**
   * Toggle video selection.
   */
  const toggleVideo = (videoId: string) => {
    setSelectedVideoIds(prev =>
      prev.includes(videoId)
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    )
  }

  /**
   * Toggle annotation type selection.
   */
  const toggleAnnotationType = (type: 'type' | 'object') => {
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
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>Export Annotations</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          {/* Export Mode */}
          <Box>
            <FormLabel component="legend">Export Mode</FormLabel>
            <FormGroup>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={!includeInterpolated}
                    onChange={(e) => setIncludeInterpolated(!e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">
                      <strong>Export keyframes only (recommended)</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Smaller file size, preserves author intent, allows re-interpolation
                    </Typography>
                  </Box>
                }
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeInterpolated}
                    onChange={(e) => setIncludeInterpolated(e.target.checked)}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">
                      <strong>Include all interpolated frames</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Larger file (up to 100x), useful for debugging or external tools
                    </Typography>
                  </Box>
                }
              />
            </FormGroup>

            {includeInterpolated && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                File size can be 100x larger with interpolated frames. Consider exporting keyframes-only unless you need all frames.
              </Alert>
            )}
          </Box>

          <Divider />

          {/* Filter by Persona */}
          <Box>
            <FormLabel component="legend">Filter by Persona (optional)</FormLabel>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Leave empty to export all personas
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              {personas.map(persona => (
                <Chip
                  key={persona.id}
                  label={persona.name}
                  onClick={() => togglePersona(persona.id)}
                  color={selectedPersonaIds.includes(persona.id) ? 'primary' : 'default'}
                  variant={selectedPersonaIds.includes(persona.id) ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
          </Box>

          {/* Filter by Video */}
          <Box>
            <FormLabel component="legend">Filter by Video (optional)</FormLabel>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Leave empty to export all videos
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              {videos.map((video: VideoMetadata) => (
                <Chip
                  key={video.id}
                  label={video.title || video.id}
                  onClick={() => toggleVideo(video.id)}
                  color={selectedVideoIds.includes(video.id) ? 'primary' : 'default'}
                  variant={selectedVideoIds.includes(video.id) ? 'filled' : 'outlined'}
                />
              ))}
            </Box>
          </Box>

          {/* Filter by Annotation Type */}
          <Box>
            <FormLabel component="legend">Filter by Annotation Type (optional)</FormLabel>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Leave empty to export all annotation types
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <Chip
                label="Type Annotations"
                onClick={() => toggleAnnotationType('type')}
                color={selectedAnnotationTypes.includes('type') ? 'primary' : 'default'}
                variant={selectedAnnotationTypes.includes('type') ? 'filled' : 'outlined'}
              />
              <Chip
                label="Object Annotations"
                onClick={() => toggleAnnotationType('object')}
                color={selectedAnnotationTypes.includes('object') ? 'primary' : 'default'}
                variant={selectedAnnotationTypes.includes('object') ? 'filled' : 'outlined'}
              />
            </Box>
          </Box>

          <Divider />

          {/* Export Statistics */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Export Statistics
            </Typography>

            {isLoadingStats && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">
                  Calculating...
                </Typography>
              </Box>
            )}

            {!isLoadingStats && exportStats && (
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="Annotations"
                    secondary={exportStats.annotationCount.toLocaleString()}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Sequences"
                    secondary={exportStats.sequenceCount.toLocaleString()}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Keyframes"
                    secondary={exportStats.keyframeCount.toLocaleString()}
                  />
                </ListItem>
                {includeInterpolated && (
                  <ListItem>
                    <ListItemText
                      primary="Interpolated Frames"
                      secondary={exportStats.interpolatedFrameCount.toLocaleString()}
                    />
                  </ListItem>
                )}
                <ListItem>
                  <ListItemText
                    primary="Estimated File Size"
                    secondary={formatBytes(exportStats.totalSize)}
                  />
                </ListItem>
              </List>
            )}

            {!isLoadingStats && exportStats && exportStats.annotationCount === 0 && (
              <Alert severity="info" sx={{ mt: 1 }}>
                No annotations match the selected filters.
              </Alert>
            )}
          </Box>

          {/* Error Display */}
          {error && (
            <Alert severity="error">
              {error}
            </Alert>
          )}

          {/* Export Progress */}
          {isExporting && (
            <Box>
              <Typography variant="body2" gutterBottom>
                Exporting annotations...
              </Typography>
              <LinearProgress />
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isExporting}>
          Cancel
        </Button>
        <Button
          onClick={handleExport}
          variant="contained"
          disabled={isExporting || isLoadingStats || (exportStats?.annotationCount === 0)}
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
