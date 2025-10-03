/**
 * Dashboard component for monitoring loaded models and their status.
 * Displays real-time VRAM usage, performance metrics, and health indicators.
 */

import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Stack,
  LinearProgress,
  Grid,
  Paper,
  Alert,
  Skeleton,
  IconButton,
  Tooltip,
  Switch,
  FormControlLabel,
  Divider,
  Button,
} from '@mui/material'
import {
  Memory as MemoryIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  HourglassEmpty as LoadingIcon,
  CloudOff as UnloadedIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material'
import { useModelStatus } from '../hooks/useModelConfig'
import { LoadedModelStatus, ModelHealth } from '../api/client'
import { formatDistanceToNow } from 'date-fns'

/**
 * Props for ModelStatusDashboard component.
 */
export interface ModelStatusDashboardProps {
  /**
   * Auto-refresh interval in milliseconds.
   * Set to false to disable auto-refresh.
   * @default 15000
   */
  refreshInterval?: number | false
  /**
   * Enable manual refresh button.
   * @default true
   */
  showRefreshButton?: boolean
  /**
   * Enable auto-refresh toggle.
   * @default true
   */
  showAutoRefreshToggle?: boolean
  /**
   * Callback when unload button is clicked.
   */
  onUnloadModel?: (modelId: string, taskType: string) => void
}

/**
 * Get color for health status badge.
 */
function getHealthColor(
  health: ModelHealth
): 'success' | 'warning' | 'error' | 'default' {
  switch (health) {
    case 'loaded':
      return 'success'
    case 'loading':
      return 'warning'
    case 'failed':
      return 'error'
    case 'unloaded':
      return 'default'
  }
}

/**
 * Get icon for health status.
 */
function getHealthIcon(health: ModelHealth) {
  switch (health) {
    case 'loaded':
      return <CheckCircleIcon fontSize="small" />
    case 'loading':
      return <LoadingIcon fontSize="small" />
    case 'failed':
      return <ErrorIcon fontSize="small" />
    case 'unloaded':
      return <UnloadedIcon fontSize="small" />
  }
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
 * Dashboard component for monitoring loaded models.
 * Displays real-time VRAM usage, performance metrics, and health indicators with auto-refresh.
 *
 * @param props - Component properties
 * @returns ModelStatusDashboard component
 *
 * @example
 * ```tsx
 * // Basic usage with default auto-refresh
 * <ModelStatusDashboard />
 *
 * // Custom refresh interval
 * <ModelStatusDashboard refreshInterval={5000} />
 *
 * // With unload callback
 * <ModelStatusDashboard
 *   onUnloadModel={(modelId, taskType) => {
 *     console.log('Unload model:', modelId, taskType)
 *   }}
 * />
 * ```
 */
export function ModelStatusDashboard({
  refreshInterval = 15000,
  showRefreshButton = true,
  showAutoRefreshToggle = true,
  onUnloadModel,
}: ModelStatusDashboardProps) {
  const [autoRefresh, setAutoRefresh] = useState(true)

  const {
    data: status,
    isLoading,
    error,
    refetch,
  } = useModelStatus({
    refetchInterval: autoRefresh ? refreshInterval : false,
  })

  const handleManualRefresh = () => {
    refetch()
  }

  const handleAutoRefreshToggle = (event: React.ChangeEvent<HTMLInputElement>) => {
    setAutoRefresh(event.target.checked)
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
            Failed to load model status: {error.message}
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!status) {
    return (
      <Card>
        <CardContent>
          <Alert severity="info">No model status available.</Alert>
        </CardContent>
      </Card>
    )
  }

  const vramUtilizationPercent =
    status.total_vram_available_gb > 0
      ? (status.total_vram_allocated_gb / status.total_vram_available_gb) * 100
      : 0

  const isVramWarning = vramUtilizationPercent >= 80 && vramUtilizationPercent < 100
  const isVramError = vramUtilizationPercent >= 100
  const isCpuOnly = !status.cuda_available

  return (
    <Card>
      <CardContent>
        {/* Header */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography variant="h5" component="div">
              Model Status Dashboard
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            {showAutoRefreshToggle && (
              <FormControlLabel
                control={
                  <Switch
                    checked={autoRefresh}
                    onChange={handleAutoRefreshToggle}
                    size="small"
                  />
                }
                label={<Typography variant="body2">Auto-refresh</Typography>}
              />
            )}
            {showRefreshButton && (
              <Tooltip title="Refresh now">
                <IconButton size="small" onClick={handleManualRefresh}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            Monitor loaded models, VRAM usage, and performance metrics in real-time.
          </Typography>
        </Box>

        {/* CPU-Only Mode Warning */}
        {isCpuOnly && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              CPU-Only Mode Detected
            </Typography>
            <Typography variant="body2">
              The model service is running in CPU-only mode (no GPU/CUDA available).
              Deep learning models cannot be loaded or used without GPU acceleration.
            </Typography>
          </Alert>
        )}

        {/* Overall VRAM Status */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <MemoryIcon sx={{ mr: 1 }} />
            <Typography variant="subtitle1">Total VRAM Usage</Typography>
            <Box sx={{ flexGrow: 1 }} />
            <Chip
              label={`${status.total_vram_allocated_gb.toFixed(1)} / ${status.total_vram_available_gb.toFixed(1)} GB`}
              color={isVramError ? 'error' : isVramWarning ? 'warning' : 'success'}
              icon={
                isVramError ? (
                  <ErrorIcon />
                ) : isVramWarning ? (
                  <ErrorIcon />
                ) : (
                  <CheckCircleIcon />
                )
              }
              size="small"
            />
          </Box>

          <LinearProgress
            variant="determinate"
            value={Math.min(vramUtilizationPercent, 100)}
            color={isVramError ? 'error' : isVramWarning ? 'warning' : 'success'}
            sx={{ height: 8, borderRadius: 1 }}
          />

          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {status.loaded_models.length} model{status.loaded_models.length !== 1 ? 's' : ''} loaded
            {' · '}
            Utilization: {vramUtilizationPercent.toFixed(0)}%
          </Typography>
        </Paper>

        {/* Loaded Models */}
        {status.loaded_models.length === 0 ? (
          <Alert severity={isCpuOnly ? "warning" : "info"}>
            {isCpuOnly
              ? "No models loaded. GPU required to load deep learning models."
              : "No models currently loaded. Models will load automatically when needed."}
          </Alert>
        ) : (
          <Grid container spacing={2}>
            {status.loaded_models.map((model) => (
              <Grid item xs={12} md={6} lg={4} key={`${model.task_type}-${model.model_id}`}>
                <ModelStatusCard
                  model={model}
                  onUnload={onUnloadModel}
                />
              </Grid>
            ))}
          </Grid>
        )}

        {/* Footer with timestamp */}
        <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            Last updated: {formatDistanceToNow(new Date(status.timestamp), { addSuffix: true })}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  )
}

/**
 * Props for ModelStatusCard component.
 */
interface ModelStatusCardProps {
  model: LoadedModelStatus
  onUnload?: (modelId: string, taskType: string) => void
}

/**
 * Card component for displaying a single model's status.
 * Shows health, VRAM usage, performance metrics, and unload button.
 *
 * @param props - Component properties
 * @returns ModelStatusCard component
 */
function ModelStatusCard({ model, onUnload }: ModelStatusCardProps) {
  const handleUnload = () => {
    if (onUnload) {
      onUnload(model.model_id, model.task_type)
    }
  }

  const vramUsagePercent =
    model.vram_allocated_gb > 0 && model.vram_used_gb !== null
      ? (model.vram_used_gb / model.vram_allocated_gb) * 100
      : null

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          {/* Header with task type and health */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6" component="div">
              {TASK_DISPLAY_NAMES[model.task_type] || model.task_type}
            </Typography>
            <Chip
              label={model.health}
              color={getHealthColor(model.health)}
              icon={getHealthIcon(model.health)}
              size="small"
            />
          </Box>

          <Divider />

          {/* Model Information */}
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Model
            </Typography>
            <Typography variant="body2" fontWeight="medium">
              {model.model_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {model.model_id}
            </Typography>
          </Box>

          {/* Framework and Quantization */}
          <Grid container spacing={1}>
            <Grid item xs={6}>
              <Typography variant="body2" color="text.secondary">
                Framework
              </Typography>
              <Typography variant="body2" fontWeight="medium">
                {model.framework}
              </Typography>
            </Grid>
            {model.quantization && (
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Quantization
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  {model.quantization}
                </Typography>
              </Grid>
            )}
          </Grid>

          {/* VRAM Usage */}
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <MemoryIcon sx={{ fontSize: 16, mr: 0.5 }} />
              <Typography variant="body2" color="text.secondary">
                VRAM Usage
              </Typography>
              <Box sx={{ flexGrow: 1 }} />
              {model.vram_used_gb !== null ? (
                <Typography variant="caption" fontWeight="medium">
                  {model.vram_used_gb.toFixed(1)} / {model.vram_allocated_gb.toFixed(1)} GB
                </Typography>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  {model.vram_allocated_gb.toFixed(1)} GB allocated
                </Typography>
              )}
            </Box>
            {vramUsagePercent !== null && (
              <LinearProgress
                variant="determinate"
                value={Math.min(vramUsagePercent, 100)}
                color={vramUsagePercent >= 90 ? 'warning' : 'primary'}
                sx={{ height: 6, borderRadius: 1 }}
              />
            )}
          </Box>

          {/* Warm-up Status */}
          {model.health === 'loaded' && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {model.warm_up_complete ? (
                <Chip
                  label="Warm-up complete"
                  color="success"
                  size="small"
                  icon={<CheckCircleIcon />}
                />
              ) : (
                <Chip
                  label="Warming up"
                  color="warning"
                  size="small"
                  icon={<LoadingIcon />}
                />
              )}
            </Box>
          )}

          {/* Performance Metrics */}
          {model.performance_metrics && (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Performance Metrics
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Requests
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {model.performance_metrics.total_requests}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Avg Latency
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {model.performance_metrics.average_latency_ms.toFixed(0)} ms
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="caption" color="text.secondary">
                    Req/sec
                  </Typography>
                  <Typography variant="body2" fontWeight="medium">
                    {model.performance_metrics.requests_per_second.toFixed(2)}
                  </Typography>
                </Grid>
                {model.performance_metrics.average_fps !== null && (
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">
                      Avg FPS
                    </Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {model.performance_metrics.average_fps.toFixed(1)}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </Box>
          )}

          {/* Last Used */}
          {model.last_used && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <ScheduleIcon sx={{ fontSize: 16 }} color="action" />
              <Typography variant="caption" color="text.secondary">
                Last used: {formatDistanceToNow(new Date(model.last_used), { addSuffix: true })}
              </Typography>
            </Box>
          )}

          {/* Load Time */}
          {model.load_time_ms !== null && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Load time: {(model.load_time_ms / 1000).toFixed(1)}s
              </Typography>
            </Box>
          )}

          {/* Error Message */}
          {model.error_message && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              <Typography variant="caption">{model.error_message}</Typography>
            </Alert>
          )}

          {/* Unload Button */}
          {onUnload && model.health === 'loaded' && (
            <Button
              variant="outlined"
              color="warning"
              size="small"
              onClick={handleUnload}
              fullWidth
            >
              Unload Model
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
