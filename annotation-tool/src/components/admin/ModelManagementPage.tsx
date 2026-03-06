/**
 * Admin page for selecting CPU or GPU models per task type.
 * Provides device preference toggles, model dropdowns, VRAM budget visualization,
 * and download status with on-demand download triggers.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  CircularProgress,
  LinearProgress,
  Chip,
  Skeleton,
  Grid,
  Paper,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
  Stack,
} from '@mui/material'
import {
  Memory as MemoryIcon,
  Computer as ComputerIcon,
  Speed as SpeedIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  CloudDownload as CloudDownloadIcon,
  CloudDone as CloudDoneIcon,
  CloudOff as CloudOffIcon,
} from '@mui/icons-material'
import {
  useModelConfig,
  useSelectModel,
  useMemoryValidation,
  useTaskReady,
  useLoadModel,
} from '@store/queries/useModelConfig'
import type { ModelOption } from '@api/client'

/**
 * Display name mapping for task types.
 */
const TASK_DISPLAY_NAMES: Record<string, string> = {
  videoSummarization: 'Video Summarization',
  ontologyAugmentation: 'Ontology Augmentation',
  objectDetection: 'Object Detection',
  videoTracking: 'Video Tracking',
  audioTranscription: 'Audio Transcription',
  speakerDiarization: 'Speaker Diarization',
  voiceActivityDetection: 'Voice Activity Detection',
  claimExtraction: 'Claim Extraction',
  claimSynthesis: 'Claim Synthesis',
}

/**
 * Speed indicator color mapping.
 */
const SPEED_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  real_time: 'success',
  very_fast: 'success',
  fast: 'success',
  moderate: 'warning',
  medium: 'warning',
  slow: 'error',
}

/**
 * Determines the initial device preference for a task type based on the currently
 * selected model and CUDA availability.
 */
function getInitialDevice(
  selectedModelName: string,
  options: ModelOption[],
  cudaAvailable: boolean,
): 'cpu' | 'gpu' {
  if (!cudaAvailable) return 'cpu'

  const selectedOption = options.find((opt) => opt.name === selectedModelName)
  if (selectedOption && selectedOption.vramGb === 0 && selectedOption.cpuCompatible) {
    return 'cpu'
  }

  return 'gpu'
}

/**
 * Returns the first model name compatible with the given device.
 */
function firstCompatibleModel(
  options: ModelOption[],
  device: 'cpu' | 'gpu',
): string {
  for (const option of options) {
    if (device === 'cpu' && option.cpuCompatible) return option.name
    if (device === 'gpu') return option.name
  }
  return ''
}

/**
 * Checks whether a model is compatible with a given device.
 */
function isCompatible(option: ModelOption, device: 'cpu' | 'gpu'): boolean {
  if (device === 'cpu') return option.cpuCompatible
  return true
}

/**
 * Sub-component showing download/cache status for a task type's selected model.
 * Each card manages its own task-ready query to avoid N queries in the parent.
 */
function TaskDownloadStatus({ taskType }: { taskType: string }) {
  const { data, isLoading, isFetching, error } = useTaskReady(taskType)
  const loadModelMutation = useLoadModel()

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          Checking cache...
        </Typography>
      </Box>
    )
  }

  if (error) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CloudOffIcon fontSize="small" color="disabled" />
        <Typography variant="body2" color="text.secondary">
          Unable to check cache status
        </Typography>
      </Box>
    )
  }

  if (!data) return null

  // External API models are always "ready"
  if (data.framework === 'external_api') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CheckCircleIcon fontSize="small" color="success" />
        <Typography variant="body2" color="text.secondary">
          External API (no download needed)
        </Typography>
      </Box>
    )
  }

  if (data.cached) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CloudDoneIcon fontSize="small" color="success" />
        <Typography variant="body2" color="success.main">
          Downloaded
        </Typography>
      </Box>
    )
  }

  // Show loading state while the mutation is running or the query is refetching after success
  const isDownloading = loadModelMutation.isPending || (loadModelMutation.isSuccess && isFetching)

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <CloudDownloadIcon fontSize="small" color="warning" />
      <Typography variant="body2" color="warning.main">
        Not downloaded
      </Typography>
      <Tooltip title="Download model to local cache. This may take several minutes.">
        <Button
          size="small"
          variant="outlined"
          startIcon={
            isDownloading ? <CircularProgress size={14} /> : <CloudDownloadIcon />
          }
          disabled={isDownloading}
          onClick={() => loadModelMutation.mutate(taskType)}
          sx={{ ml: 1, textTransform: 'none' }}
        >
          {isDownloading ? 'Downloading...' : 'Download'}
        </Button>
      </Tooltip>
      {loadModelMutation.isError && (
        <Typography variant="body2" color="error.main" sx={{ ml: 1 }}>
          Failed: {loadModelMutation.error?.message}
        </Typography>
      )}
    </Box>
  )
}

/**
 * Admin page for managing model configuration per task type.
 * Displays device preference toggles, model selection dropdowns,
 * VRAM budget visualization, download status, and save/reset/refresh controls.
 */
export default function ModelManagementPage() {
  const { data: config, isLoading, error, refetch } = useModelConfig()
  const { data: validation, refetch: refetchValidation } = useMemoryValidation({
    enabled: !!config,
  })
  const selectModelMutation = useSelectModel()

  const [devicePreferences, setDevicePreferences] = useState<Record<string, 'cpu' | 'gpu'>>({})
  const [pendingSelections, setPendingSelections] = useState<Record<string, string>>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Initialize state from config
  useEffect(() => {
    if (!config) return

    const devices: Record<string, 'cpu' | 'gpu'> = {}
    const selections: Record<string, string> = {}

    Object.entries(config.models).forEach(([taskType, taskConfig]) => {
      devices[taskType] = getInitialDevice(
        taskConfig.selected,
        taskConfig.options,
        config.cudaAvailable,
      )
      selections[taskType] = taskConfig.selected
    })

    setDevicePreferences(devices)
    setPendingSelections(selections)
    setHasChanges(false)
  }, [config])

  const computeHasChanges = useCallback(
    (selections: Record<string, string>): boolean => {
      if (!config) return false
      return Object.entries(selections).some(
        ([taskType, modelName]) => config.models[taskType]?.selected !== modelName,
      )
    },
    [config],
  )

  const handleDeviceChange = (taskType: string, newDevice: 'cpu' | 'gpu' | null) => {
    if (!newDevice || !config) return

    setDevicePreferences((prev) => ({ ...prev, [taskType]: newDevice }))

    const taskConfig = config.models[taskType]
    if (!taskConfig) return

    const currentModel = pendingSelections[taskType]
    const currentOption = taskConfig.options.find((o) => o.name === currentModel)

    if (!currentOption || !isCompatible(currentOption, newDevice)) {
      const compatible = firstCompatibleModel(taskConfig.options, newDevice)
      if (compatible) {
        const updated = { ...pendingSelections, [taskType]: compatible }
        setPendingSelections(updated)
        setHasChanges(computeHasChanges(updated))
      }
    }

    setSaveSuccess(false)
    setSaveError(null)
  }

  const handleModelChange = (taskType: string, modelName: string) => {
    const updated = { ...pendingSelections, [taskType]: modelName }
    setPendingSelections(updated)
    setHasChanges(computeHasChanges(updated))
    setSaveSuccess(false)
    setSaveError(null)
  }

  const handleSave = async () => {
    if (!config) return

    setSaveSuccess(false)
    setSaveError(null)

    try {
      const promises = Object.entries(pendingSelections).map(([taskType, modelName]) => {
        const current = config.models[taskType]?.selected
        if (current !== modelName) {
          return selectModelMutation.mutateAsync({ taskType, modelName })
        }
        return Promise.resolve()
      })

      await Promise.all(promises)
      setHasChanges(false)
      setSaveSuccess(true)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save model configuration')
    }
  }

  const handleReset = () => {
    if (!config) return

    const devices: Record<string, 'cpu' | 'gpu'> = {}
    const selections: Record<string, string> = {}

    Object.entries(config.models).forEach(([taskType, taskConfig]) => {
      devices[taskType] = getInitialDevice(
        taskConfig.selected,
        taskConfig.options,
        config.cudaAvailable,
      )
      selections[taskType] = taskConfig.selected
    })

    setDevicePreferences(devices)
    setPendingSelections(selections)
    setHasChanges(false)
    setSaveSuccess(false)
    setSaveError(null)
  }

  const vramCalculation = useMemo(() => {
    if (!config || !validation) return null

    let totalRequired = 0
    const requirements: Record<string, { modelId: string; vramGb: number }> = {}

    Object.entries(pendingSelections).forEach(([taskType, modelName]) => {
      if (devicePreferences[taskType] !== 'gpu') return

      const taskConfig = config.models[taskType]
      if (!taskConfig) return

      const modelOption = taskConfig.options.find((opt) => opt.name === modelName)
      if (modelOption) {
        totalRequired += modelOption.vramGb
        requirements[taskType] = {
          modelId: modelOption.modelId,
          vramGb: modelOption.vramGb,
        }
      }
    })

    const maxAllowed = validation.totalVramGb * validation.threshold
    const valid = totalRequired <= maxAllowed
    const utilizationPercent = maxAllowed > 0 ? (totalRequired / maxAllowed) * 100 : 0

    return { totalRequired, maxAllowed, valid, utilizationPercent, requirements }
  }, [config, validation, pendingSelections, devicePreferences])

  const hasGpuTask = Object.values(devicePreferences).some((d) => d === 'gpu')

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="text" width="40%" height={32} />
        <Skeleton variant="text" width="60%" height={20} sx={{ mb: 3 }} />
        <Skeleton variant="rectangular" height={120} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={120} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={120} />
      </Box>
    )
  }

  // Error state
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Failed to load model configuration: {error.message}
        </Alert>
      </Box>
    )
  }

  // No config state
  if (!config) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">No model configuration available.</Alert>
      </Box>
    )
  }

  const modelsDisabled = !config.cudaAvailable && !config.cpuModelsAvailable
  const isVramWarning =
    vramCalculation != null && vramCalculation.utilizationPercent >= 80 && vramCalculation.valid
  const isVramError = vramCalculation != null && !vramCalculation.valid

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6">Model Configuration</Typography>
        <Typography variant="body2" color="text.secondary">
          Select device preference and model for each task type. Models that are not yet
          downloaded can be pre-downloaded using the Download button.
        </Typography>
      </Box>

      {/* Alert banners */}
      {modelsDisabled && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }} gutterBottom>
            No AI Models Available
          </Typography>
          <Typography variant="body2">
            No GPU/CUDA detected and no CPU-compatible models are installed.
            Install CPU-compatible models or add a GPU to enable AI features.
          </Typography>
        </Alert>
      )}

      {!config.cudaAvailable && config.cpuModelsAvailable && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }} gutterBottom>
            CPU Mode
          </Typography>
          <Typography variant="body2">
            No GPU/CUDA detected. Running with CPU-optimized models. Performance may be slower than
            GPU mode.
          </Typography>
        </Alert>
      )}

      {/* VRAM Budget bar */}
      {config.cudaAvailable && hasGpuTask && vramCalculation && validation && (
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <MemoryIcon sx={{ mr: 1 }} />
            <Typography variant="subtitle1">VRAM Budget</Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Chip
              label={`${vramCalculation.totalRequired.toFixed(1)} / ${vramCalculation.maxAllowed.toFixed(1)} GB`}
              color={isVramError ? 'error' : isVramWarning ? 'warning' : 'success'}
              icon={
                isVramError ? (
                  <ErrorIcon />
                ) : isVramWarning ? (
                  <WarningIcon />
                ) : (
                  <CheckCircleIcon />
                )
              }
              size="small"
            />
          </Box>

          <LinearProgress
            variant="determinate"
            value={Math.min(vramCalculation.utilizationPercent, 100)}
            color={isVramError ? 'error' : isVramWarning ? 'warning' : 'success'}
            sx={{ height: 8, borderRadius: 1 }}
          />

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Total available: {validation.totalVramGb.toFixed(1)} GB
            {' · '}
            Utilization: {vramCalculation.utilizationPercent.toFixed(0)}%
          </Typography>

          {isVramError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              Configuration exceeds available VRAM budget. Please select smaller models.
            </Alert>
          )}

          {isVramWarning && !isVramError && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Approaching VRAM limit. Consider smaller models if performance issues occur.
            </Alert>
          )}
        </Paper>
      )}

      {/* Task type cards */}
      {!modelsDisabled && (
        <Stack spacing={3} sx={{ mb: 3 }}>
          {Object.entries(config.models).map(([taskType, taskConfig]) => {
            const device = devicePreferences[taskType] || 'cpu'
            const selectedModelName = pendingSelections[taskType] || taskConfig.selected
            const selectedOption = taskConfig.options.find(
              (opt) => opt.name === selectedModelName,
            )

            const filteredOptions = taskConfig.options.filter(
              (option) => isCompatible(option, device),
            )

            return (
              <Paper key={taskType} variant="outlined" sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                    {TASK_DISPLAY_NAMES[taskType] || taskType}
                  </Typography>
                  <TaskDownloadStatus taskType={taskType} />
                </Box>

                {/* Device toggle */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ minWidth: 50 }}>
                    Device:
                  </Typography>
                  <ToggleButtonGroup
                    value={device}
                    exclusive
                    size="small"
                    onChange={(_, val) => handleDeviceChange(taskType, val)}
                  >
                    <ToggleButton value="cpu">
                      <ComputerIcon sx={{ mr: 0.5 }} fontSize="small" />
                      CPU
                    </ToggleButton>
                    <ToggleButton value="gpu" disabled={!config.cudaAvailable}>
                      <MemoryIcon sx={{ mr: 0.5 }} fontSize="small" />
                      GPU
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>

                {/* Model dropdown */}
                <FormControl fullWidth sx={{ mb: 2 }}>
                  <InputLabel id={`${taskType}-model-label`}>Model</InputLabel>
                  <Select
                    labelId={`${taskType}-model-label`}
                    value={selectedModelName}
                    label="Model"
                    onChange={(e) => handleModelChange(taskType, e.target.value)}
                  >
                    {filteredOptions.length === 0 ? (
                      <MenuItem disabled value="">
                        No compatible models
                      </MenuItem>
                    ) : (
                      filteredOptions.map((option) => (
                        <MenuItem key={option.name} value={option.name}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography>{option.name}</Typography>
                            <Chip
                              label={`${(device === 'cpu' ? option.cpuMemoryGb : option.vramGb).toFixed(1)} GB`}
                              size="small"
                              icon={<MemoryIcon />}
                            />
                            <Chip
                              label={option.speed}
                              size="small"
                              color={SPEED_COLORS[option.speed] || 'default'}
                              icon={<SpeedIcon />}
                            />
                          </Box>
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>

                {/* Model details */}
                {selectedOption && (
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.default' }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Model Details
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">
                          Model ID
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {selectedOption.modelId}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">
                          Framework
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {selectedOption.framework}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">
                          {device === 'cpu' ? 'CPU Memory' : 'VRAM'}
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {(device === 'cpu'
                            ? selectedOption.cpuMemoryGb
                            : selectedOption.vramGb
                          ).toFixed(1)}{' '}
                          GB
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="body2" color="text.secondary">
                          Speed
                        </Typography>
                        <Chip
                          label={selectedOption.speed}
                          size="small"
                          color={SPEED_COLORS[selectedOption.speed] || 'default'}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Typography variant="body2" color="text.secondary">
                          Description
                        </Typography>
                        <Typography variant="body2">
                          {selectedOption.description}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Paper>
                )}
              </Paper>
            )
          })}
        </Stack>
      )}

      {/* Action buttons */}
      {!modelsDisabled && (
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!hasChanges || selectModelMutation.isPending}
          >
            {selectModelMutation.isPending ? 'Saving...' : 'Save Configuration'}
          </Button>
          <Button
            variant="outlined"
            onClick={handleReset}
            disabled={!hasChanges || selectModelMutation.isPending}
          >
            Reset
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title="Refresh configuration">
            <Button
              variant="outlined"
              onClick={() => {
                refetch()
                refetchValidation()
              }}
              startIcon={<RefreshIcon />}
            >
              Refresh
            </Button>
          </Tooltip>
        </Box>
      )}

      {/* Success/Error alerts */}
      {saveSuccess && (
        <Alert severity="success" sx={{ mt: 2 }}>
          Configuration saved successfully.
        </Alert>
      )}

      {saveError && (
        <Alert severity="error" sx={{ mt: 2 }}>
          Failed to save configuration: {saveError}
        </Alert>
      )}
    </Box>
  )
}
