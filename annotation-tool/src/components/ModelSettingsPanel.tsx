/**
 * Panel component for configuring model selection per task type.
 * Provides dropdowns for model selection, VRAM visualization, and validation.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  LinearProgress,
  Chip,
  Stack,
  Divider,
  Skeleton,
  Grid,
  Paper,
  Tooltip,
} from '@mui/material'
import {
  Memory as MemoryIcon,
  Speed as SpeedIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useModelConfig, useSelectModel, useMemoryValidation } from '../hooks/useModelConfig'
import { ModelOption } from '../api/client'

/**
 * Props for ModelSettingsPanel component.
 */
export interface ModelSettingsPanelProps {
  onSaveSuccess?: () => void
  onSaveError?: (error: string) => void
}

/**
 * Display name mapping for task types.
 */
const TASK_DISPLAY_NAMES: Record<string, string> = {
  video_summarization: 'Video Summarization',
  object_detection: 'Object Detection',
  video_tracking: 'Video Tracking',
}

/**
 * Speed indicator color mapping.
 */
const SPEED_COLORS: Record<string, 'success' | 'warning' | 'error'> = {
  fast: 'success',
  moderate: 'warning',
  slow: 'error',
}

/**
 * Panel component for configuring model selection per task type.
 * Displays model options with VRAM requirements, inference speeds, and memory budget visualization.
 *
 * @param props - Component properties
 * @returns ModelSettingsPanel component
 */
export function ModelSettingsPanel({
  onSaveSuccess,
  onSaveError,
}: ModelSettingsPanelProps) {
  const { data: config, isLoading, error, refetch } = useModelConfig()
  const { data: validation, refetch: refetchValidation } = useMemoryValidation({
    enabled: !!config,
  })
  const selectModelMutation = useSelectModel()

  // Local state for pending changes (not yet saved)
  const [pendingSelections, setPendingSelections] = useState<Record<string, string>>({})
  const [hasChanges, setHasChanges] = useState(false)

  // Reset pending selections when config loads
  useEffect(() => {
    if (config) {
      const current: Record<string, string> = {}
      Object.entries(config.models).forEach(([taskType, taskConfig]) => {
        current[taskType] = taskConfig.selected
      })
      setPendingSelections(current)
    }
  }, [config])

  /**
   * Calculates total VRAM usage and validates against available budget.
   * Compares pending model selections against configured threshold.
   *
   * @returns Object containing VRAM requirements, utilization percent, and validation status, or null if config/validation unavailable
   */
  const vramCalculation = useMemo(() => {
    if (!config || !validation) {
      return null
    }

    let totalRequired = 0
    const requirements: Record<string, { model_id: string; vram_gb: number }> = {}

    Object.entries(pendingSelections).forEach(([taskType, modelName]) => {
      const taskConfig = config.models[taskType]
      if (taskConfig) {
        const modelOption = taskConfig.options[modelName]
        if (modelOption) {
          totalRequired += modelOption.vram_gb
          requirements[taskType] = {
            model_id: modelOption.model_id,
            vram_gb: modelOption.vram_gb,
          }
        }
      }
    })

    const maxAllowed = validation.total_vram_gb * validation.threshold
    const valid = totalRequired <= maxAllowed
    const utilizationPercent = (totalRequired / maxAllowed) * 100

    return {
      totalRequired,
      maxAllowed,
      valid,
      utilizationPercent,
      requirements,
    }
  }, [config, validation, pendingSelections])

  /**
   * Updates pending model selection for a task type and marks configuration as changed.
   *
   * @param taskType - Task type identifier (e.g., 'video_summarization')
   * @param modelName - Name of the selected model option
   */
  const handleModelChange = (taskType: string, modelName: string) => {
    setPendingSelections((prev) => ({
      ...prev,
      [taskType]: modelName,
    }))

    // Check if there are any changes from the current config
    const allSelectionsMatchCurrent = Object.entries({
      ...pendingSelections,
      [taskType]: modelName,
    }).every(([task, selection]) => config?.models[task]?.selected === selection)

    setHasChanges(!allSelectionsMatchCurrent)
  }

  /**
   * Saves all pending model selections to the backend.
   * Only sends API calls for selections that differ from current configuration.
   * Triggers success/error callbacks on completion.
   */
  const handleSave = async () => {
    if (!config) return

    try {
      // Save all changed selections
      const promises = Object.entries(pendingSelections).map(([taskType, modelName]) => {
        const current = config.models[taskType]?.selected
        if (current !== modelName) {
          return selectModelMutation.mutateAsync({
            task_type: taskType,
            model_name: modelName,
          })
        }
        return Promise.resolve()
      })

      await Promise.all(promises)

      setHasChanges(false)
      onSaveSuccess?.()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save model configuration'
      onSaveError?.(errorMessage)
    }
  }

  /**
   * Resets pending selections to current saved configuration.
   * Discards all unsaved changes and clears the changed state flag.
   */
  const handleReset = () => {
    if (config) {
      const current: Record<string, string> = {}
      Object.entries(config.models).forEach(([taskType, taskConfig]) => {
        current[taskType] = taskConfig.selected
      })
      setPendingSelections(current)
      setHasChanges(false)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Skeleton variant="text" width="60%" height={32} />
          <Skeleton variant="rectangular" height={200} sx={{ mt: 2 }} />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error" icon={<ErrorIcon />}>
            Failed to load model configuration: {error.message}
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!config || !validation || !vramCalculation) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info">
            No model configuration available.
          </Alert>
        </CardContent>
      </Card>
    )
  }

  // Check for CPU-only mode
  const isCpuOnly = !config.cuda_available
  const isVramWarning = vramCalculation.utilizationPercent >= 80 && vramCalculation.valid
  const isVramError = !vramCalculation.valid

  return (
    <Card>
      <CardContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" component="div" gutterBottom>
            Model Configuration
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure model selection for each task type. Monitor VRAM usage to ensure models fit within budget.
          </Typography>
        </Box>

        {/* CPU-Only Mode Warning */}
        {isCpuOnly && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
              ⚠️ GPU Required - CPU-Only Mode Detected
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              The model service is running in <strong>CPU-only mode</strong> (no GPU/CUDA available).
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>All AI-powered features are disabled:</strong>
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              <li>Video summarization</li>
              <li>Object detection</li>
              <li>Object tracking</li>
              <li>Ontology augmentation</li>
            </Box>
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 'bold' }}>
              These deep learning models require GPU acceleration and will not work on CPU.
            </Typography>
          </Alert>
        )}

        {/* VRAM Budget Visualization - Only show if GPU available */}
        {!isCpuOnly && (
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <MemoryIcon sx={{ mr: 1 }} />
            <Typography variant="subtitle1">
              VRAM Budget
            </Typography>
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
            Total available: {validation.total_vram_gb.toFixed(1)} GB
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

        {/* Model Selection per Task - hide in CPU mode */}
        {!isCpuOnly && (
          <Stack spacing={3}>
          {Object.entries(config.models).map(([taskType, taskConfig]) => (
            <Box key={taskType}>
              <Typography variant="h6" gutterBottom>
                {TASK_DISPLAY_NAMES[taskType] || taskType}
              </Typography>

              <FormControl fullWidth disabled={isCpuOnly}>
                <InputLabel id={`${taskType}-label`}>Model</InputLabel>
                <Select
                  labelId={`${taskType}-label`}
                  value={pendingSelections[taskType] || taskConfig.selected}
                  label="Model"
                  onChange={(e) => handleModelChange(taskType, e.target.value)}
                  disabled={isCpuOnly}
                >
                  {Object.entries(taskConfig.options).map(([name, option]) => (
                    <MenuItem key={name} value={name}>
                      <Box sx={{ width: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography>{name}</Typography>
                          <Chip
                            label={`${option.vram_gb.toFixed(1)} GB`}
                            size="small"
                            icon={<MemoryIcon />}
                          />
                          <Chip
                            label={option.speed}
                            size="small"
                            color={SPEED_COLORS[option.speed] || 'default'}
                            icon={<SpeedIcon />}
                          />
                          {option.fps && (
                            <Chip
                              label={`${option.fps} FPS`}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          {option.description}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Display current model info */}
              <ModelOptionInfo
                option={taskConfig.options[pendingSelections[taskType] || taskConfig.selected]}
              />
            </Box>
          ))}
          </Stack>
        )}

        {!isCpuOnly && <Divider sx={{ my: 3 }} />}

        {/* Action Buttons */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={isCpuOnly || !hasChanges || isVramError || selectModelMutation.isPending}
          >
            {selectModelMutation.isPending ? 'Saving...' : 'Save Configuration'}
          </Button>
          <Button
            variant="outlined"
            onClick={handleReset}
            disabled={isCpuOnly || !hasChanges || selectModelMutation.isPending}
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

        {selectModelMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Failed to save configuration: {selectModelMutation.error.message}
          </Alert>
        )}

        {selectModelMutation.isSuccess && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Configuration saved successfully
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Props for ModelOptionInfo component.
 */
interface ModelOptionInfoProps {
  option: ModelOption | undefined
}

/**
 * Display detailed information about a model option.
 *
 * @param props - Component properties
 * @returns ModelOptionInfo component
 */
function ModelOptionInfo({ option }: ModelOptionInfoProps) {
  if (!option) return null

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 2, bgcolor: 'background.default' }}>
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
            {option.model_id}
          </Typography>
        </Grid>
        <Grid item xs={12} sm={6}>
          <Typography variant="body2" color="text.secondary">
            Framework
          </Typography>
          <Typography variant="body2" fontWeight="medium">
            {option.framework}
          </Typography>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Typography variant="body2" color="text.secondary">
            VRAM Required
          </Typography>
          <Typography variant="body2" fontWeight="medium">
            {option.vram_gb.toFixed(1)} GB
          </Typography>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Typography variant="body2" color="text.secondary">
            Speed
          </Typography>
          <Chip
            label={option.speed}
            size="small"
            color={SPEED_COLORS[option.speed] || 'default'}
          />
        </Grid>
        {option.fps && (
          <Grid item xs={12} sm={4}>
            <Typography variant="body2" color="text.secondary">
              Performance
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {option.fps} FPS
            </Typography>
          </Grid>
        )}
        <Grid item xs={12}>
          <Typography variant="body2" color="text.secondary">
            Description
          </Typography>
          <Typography variant="body2">
            {option.description}
          </Typography>
        </Grid>
      </Grid>
    </Paper>
  )
}
