/**
 * Dialog for configuring object detection with persona-based or manual queries.
 * Supports persona ontology-based query building with 16 configurable options.
 */

import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Typography,
  Box,
  Stack,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  FormControlLabel,
  Checkbox,
  Paper,
  Divider,
} from '@mui/material'
import { Search as DetectIcon } from '@mui/icons-material'
import { RootState } from '../../store/store'

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
export interface DetectionRequest {
  videoId: string
  personaId?: string
  manualQuery?: string
  queryOptions?: DetectionQueryOptions
  frameNumbers?: number[]
  confidenceThreshold?: number
  enableTracking?: boolean
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
  const selectedPersonaId = useSelector((state: RootState) => state.annotations.selectedPersonaId)
  const personas = useSelector((state: RootState) => state.persona.personas)

  const [queryMode, setQueryMode] = useState<'persona' | 'manual'>('persona')
  const [manualQuery, setManualQuery] = useState('')
  const [frameMode, setFrameMode] = useState<'current' | 'range' | 'all'>('current')
  const [frameStart, setFrameStart] = useState(0)
  const [frameEnd, setFrameEnd] = useState(0)
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.3)

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
      enableTracking: frameMode !== 'current',
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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Detect Objects</DialogTitle>

      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {/* Query Mode Selection */}
          <Box>
            <Tabs value={queryMode} onChange={(_, v) => setQueryMode(v)} sx={{ mb: 2 }}>
              <Tab label="Use Persona Ontology" value="persona" />
              <Tab label="Manual Query" value="manual" />
            </Tabs>

            {queryMode === 'persona' && (
              <Box>
                {!selectedPersonaId && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Please select a persona first to use ontology-based detection
                  </Alert>
                )}

                {selectedPersona && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Selected Persona: {selectedPersona.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {selectedPersona.role} - {selectedPersona.informationNeed}
                    </Typography>
                  </Box>
                )}

                {/* Query Options */}
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Query Building Options
                  </Typography>

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 2 }}>
                    {/* Ontology Types */}
                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        Ontology Types
                      </Typography>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeEntityTypes}
                            onChange={(e) => handleOptionChange('includeEntityTypes', e.target.checked)}
                          />
                        }
                        label="Entity Types"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeEntityGlosses}
                            onChange={(e) => handleOptionChange('includeEntityGlosses', e.target.checked)}
                          />
                        }
                        label="Entity Glosses"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeEventTypes}
                            onChange={(e) => handleOptionChange('includeEventTypes', e.target.checked)}
                          />
                        }
                        label="Event Types"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeEventGlosses}
                            onChange={(e) => handleOptionChange('includeEventGlosses', e.target.checked)}
                          />
                        }
                        label="Event Glosses"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeRoleTypes}
                            onChange={(e) => handleOptionChange('includeRoleTypes', e.target.checked)}
                          />
                        }
                        label="Role Types"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeRoleGlosses}
                            onChange={(e) => handleOptionChange('includeRoleGlosses', e.target.checked)}
                          />
                        }
                        label="Role Glosses"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeRelationTypes}
                            onChange={(e) => handleOptionChange('includeRelationTypes', e.target.checked)}
                          />
                        }
                        label="Relation Types"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeRelationGlosses}
                            onChange={(e) => handleOptionChange('includeRelationGlosses', e.target.checked)}
                          />
                        }
                        label="Relation Glosses"
                      />
                    </Box>

                    {/* World State Instances */}
                    <Box>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        World State Instances
                      </Typography>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeEntityInstances}
                            onChange={(e) => handleOptionChange('includeEntityInstances', e.target.checked)}
                          />
                        }
                        label="Entity Instances"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeEntityInstanceGlosses}
                            onChange={(e) => handleOptionChange('includeEntityInstanceGlosses', e.target.checked)}
                          />
                        }
                        label="Entity Instance Glosses"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeEventInstances}
                            onChange={(e) => handleOptionChange('includeEventInstances', e.target.checked)}
                          />
                        }
                        label="Event Instances"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeEventInstanceGlosses}
                            onChange={(e) => handleOptionChange('includeEventInstanceGlosses', e.target.checked)}
                          />
                        }
                        label="Event Instance Glosses"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeLocationInstances}
                            onChange={(e) => handleOptionChange('includeLocationInstances', e.target.checked)}
                          />
                        }
                        label="Location Instances"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeLocationInstanceGlosses}
                            onChange={(e) => handleOptionChange('includeLocationInstanceGlosses', e.target.checked)}
                          />
                        }
                        label="Location Instance Glosses"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeTimeInstances}
                            onChange={(e) => handleOptionChange('includeTimeInstances', e.target.checked)}
                          />
                        }
                        label="Time Instances"
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={queryOptions.includeTimeInstanceGlosses}
                            onChange={(e) => handleOptionChange('includeTimeInstanceGlosses', e.target.checked)}
                          />
                        }
                        label="Time Instance Glosses"
                      />
                    </Box>
                  </Box>
                </Paper>
              </Box>
            )}

            {queryMode === 'manual' && (
              <TextField
                label="Detection Query"
                placeholder="e.g., person, vehicle, baseball"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                fullWidth
                helperText="Describe what you want to detect in the video"
              />
            )}
          </Box>

          <Divider />

          {/* Frame Selection */}
          <FormControl fullWidth>
            <InputLabel>Frame Selection</InputLabel>
            <Select
              value={frameMode}
              onChange={(e) => setFrameMode(e.target.value as 'current' | 'range' | 'all')}
              label="Frame Selection"
            >
              <MenuItem value="current">Current Frame Only</MenuItem>
              <MenuItem value="range">Frame Range</MenuItem>
              <MenuItem value="all">All Frames</MenuItem>
            </Select>
          </FormControl>

          {frameMode === 'range' && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Start Frame"
                type="number"
                value={frameStart}
                onChange={(e) => setFrameStart(parseInt(e.target.value) || 0)}
                size="small"
                fullWidth
              />
              <TextField
                label="End Frame"
                type="number"
                value={frameEnd}
                onChange={(e) => setFrameEnd(parseInt(e.target.value) || 0)}
                size="small"
                fullWidth
              />
            </Box>
          )}

          {/* Confidence Threshold */}
          <Box>
            <Typography variant="body2" gutterBottom>
              Confidence Threshold: {confidenceThreshold.toFixed(2)}
            </Typography>
            <Slider
              value={confidenceThreshold}
              onChange={(_, value) => setConfidenceThreshold(value as number)}
              min={0.1}
              max={1.0}
              step={0.05}
              marks={[
                { value: 0.1, label: '0.1' },
                { value: 0.5, label: '0.5' },
                { value: 1.0, label: '1.0' },
              ]}
            />
          </Box>

          {error && (
            <Alert severity="error">
              Detection failed: {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleDetect}
          variant="contained"
          disabled={isLoading || !canDetect}
          startIcon={isLoading ? <CircularProgress size={20} /> : <DetectIcon />}
        >
          {isLoading ? 'Detecting...' : 'Run Detection'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
