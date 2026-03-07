/**
 * Dashboard component for monitoring loaded models and their status.
 * Displays real-time VRAM usage, performance metrics, and health indicators.
 */

import { useState } from 'react'
import {
  MemoryStick,
  CheckCircle,
  XCircle,
  RefreshCw,
  Hourglass,
  CloudOff,
  Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useModelStatus } from '@store/queries/useModelConfig'
import { LoadedModelStatus, ModelHealth } from '@api/client'
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
 * Maps model health status to Badge variant for display.
 *
 * @param health - Current health status of the model
 * @returns Badge variant corresponding to the health status
 */
function getHealthVariant(
  health: ModelHealth
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (health) {
    case 'loaded':
      return 'secondary'
    case 'loading':
      return 'outline'
    case 'failed':
      return 'destructive'
    case 'unloaded':
      return 'outline'
  }
}

/**
 * Maps model health status to corresponding icon component.
 *
 * @param health - Current health status of the model
 * @returns Icon element representing the health status
 */
function getHealthIcon(health: ModelHealth) {
  switch (health) {
    case 'loaded':
      return <CheckCircle className="h-3 w-3" />
    case 'loading':
      return <Hourglass className="h-3 w-3" />
    case 'failed':
      return <XCircle className="h-3 w-3" />
    case 'unloaded':
      return <CloudOff className="h-3 w-3" />
  }
}

/**
 * Maps task type identifiers to human-readable display names.
 */
const TASK_DISPLAY_NAMES: Record<string, string> = {
  videoSummarization: 'Video Summarization',
  video_summarization: 'Video Summarization',
  objectDetection: 'Object Detection',
  object_detection: 'Object Detection',
  videoTracking: 'Video Tracking',
  video_tracking: 'Video Tracking',
  ontologyAugmentation: 'Ontology Augmentation',
  ontology_augmentation: 'Ontology Augmentation',
  audioTranscription: 'Audio Transcription',
  audio_transcription: 'Audio Transcription',
  speakerDiarization: 'Speaker Diarization',
  speaker_diarization: 'Speaker Diarization',
  voiceActivityDetection: 'Voice Activity Detection',
  voice_activity_detection: 'Voice Activity Detection',
  claimExtraction: 'Claim Extraction',
  claim_extraction: 'Claim Extraction',
  claimSynthesis: 'Claim Synthesis',
  claim_synthesis: 'Claim Synthesis',
}

/**
 * Dashboard component for monitoring loaded models.
 * Displays real-time VRAM usage, performance metrics, and health indicators with auto-refresh.
 *
 * @param props - Component properties
 * @returns ModelStatusDashboard component
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

  const handleAutoRefreshToggle = (checked: boolean) => {
    setAutoRefresh(checked)
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <Skeleton className="h-8 w-3/5 mb-2" />
          <Skeleton className="h-[200px] w-full mt-4" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load model status: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!status) {
    return (
      <Card>
        <CardContent>
          <Alert>
            <AlertDescription>No model status available.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  const vramUtilizationPercent =
    status.totalVramAvailableGb > 0
      ? (status.totalVramAllocatedGb / status.totalVramAvailableGb) * 100
      : 0

  const isVramWarning = vramUtilizationPercent >= 80 && vramUtilizationPercent < 100
  const isVramError = vramUtilizationPercent >= 100
  const isCpuOnly = !status.cudaAvailable
  const cpuModelsAvailable = status.cpuModelsAvailable
  const modelsDisabled = !status.cudaAvailable && !cpuModelsAvailable

  return (
    <Card>
      <CardContent>
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center mb-2">
            <h5 className="text-lg font-semibold">
              Model Status Dashboard
            </h5>
            <div className="flex-grow" />
            {showAutoRefreshToggle && (
              <Label className="flex items-center gap-2 mr-2">
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={handleAutoRefreshToggle}
                  size="sm"
                />
                <span className="text-sm">Auto-refresh</span>
              </Label>
            )}
            {showRefreshButton && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" onClick={handleManualRefresh} aria-label="Refresh now" />
                  }
                >
                  <RefreshCw className="h-4 w-4" />
                </TooltipTrigger>
                <TooltipContent>Refresh now</TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Monitor loaded models, VRAM usage, and performance metrics in real-time.
          </p>
        </div>

        {/* CPU Mode Info / No Models Warning */}
        {isCpuOnly && cpuModelsAvailable && (
          <Alert className="mb-6">
            <AlertTitle>CPU Mode</AlertTitle>
            <AlertDescription>
              Running with CPU-optimized models (no GPU/CUDA detected).
              Performance may be slower than GPU mode.
            </AlertDescription>
          </Alert>
        )}
        {modelsDisabled && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>No AI Models Available</AlertTitle>
            <AlertDescription>
              No GPU/CUDA detected and no CPU-compatible models are installed.
              AI features are disabled.
            </AlertDescription>
          </Alert>
        )}

        {/* Overall VRAM Status */}
        <div className="rounded-lg border bg-card p-4 mb-6">
          <div className="flex items-center mb-2">
            <MemoryStick className="mr-2 h-4 w-4" />
            <span className="font-medium">Total VRAM Usage</span>
            <div className="flex-grow" />
            <Badge
              variant={isVramError ? 'destructive' : isVramWarning ? 'outline' : 'secondary'}
            >
              {isVramError ? (
                <XCircle className="mr-1 h-3 w-3" />
              ) : isVramWarning ? (
                <XCircle className="mr-1 h-3 w-3" />
              ) : (
                <CheckCircle className="mr-1 h-3 w-3" />
              )}
              {status.totalVramAllocatedGb.toFixed(1)} / {status.totalVramAvailableGb.toFixed(1)} GB
            </Badge>
          </div>

          <Progress
            value={Math.min(vramUtilizationPercent, 100)}
            className={cn(
              'h-2',
              isVramError && '[&>div]:bg-destructive',
              isVramWarning && !isVramError && '[&>div]:bg-yellow-500',
            )}
          />

          <p className="text-xs text-muted-foreground mt-2">
            {status.loadedModels.length} model{status.loadedModels.length !== 1 ? 's' : ''} loaded
            {' \u00b7 '}
            Utilization: {vramUtilizationPercent.toFixed(0)}%
          </p>
        </div>

        {/* Loaded Models */}
        {status.loadedModels.length === 0 ? (
          <Alert variant={modelsDisabled ? 'destructive' : 'default'}>
            <AlertDescription>
              {modelsDisabled
                ? "No models available. Install CPU-compatible models or add a GPU."
                : "No models currently loaded. Models will load automatically when needed."}
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {status.loadedModels.map((model) => (
              <ModelStatusCard
                key={`${model.taskType}-${model.modelId}`}
                model={model}
                onUnload={onUnloadModel}
              />
            ))}
          </div>
        )}

        {/* Footer with timestamp */}
        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Last updated: {formatDistanceToNow(new Date(status.timestamp), { addSuffix: true })}
          </p>
        </div>
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
 * Card component for displaying a single model's status information.
 *
 * @param props - Component properties
 * @returns ModelStatusCard component
 */
function ModelStatusCard({ model, onUnload }: ModelStatusCardProps) {
  const handleUnload = () => {
    if (onUnload) {
      onUnload(model.modelId, model.taskType)
    }
  }

  const vramUsagePercent =
    model.vramAllocatedGb > 0 && model.vramUsedGb !== null
      ? (model.vramUsedGb / model.vramAllocatedGb) * 100
      : null

  return (
    <Card>
      <CardContent>
        <div className="flex flex-col gap-4">
          {/* Header with task type and health */}
          <div className="flex items-center justify-between">
            <h6 className="text-base font-semibold">
              {TASK_DISPLAY_NAMES[model.taskType] || model.taskType}
            </h6>
            <Badge variant={getHealthVariant(model.health)}>
              {getHealthIcon(model.health)}
              <span className="ml-1">{model.health}</span>
            </Badge>
          </div>

          <Separator />

          {/* Model Information */}
          <div>
            <p className="text-sm text-muted-foreground mb-0.5">Model</p>
            <p className="text-sm font-medium">{model.modelName}</p>
            <p className="text-xs text-muted-foreground">{model.modelId}</p>
          </div>

          {/* Framework and Quantization */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-sm text-muted-foreground">Framework</p>
              <p className="text-sm font-medium">{model.framework}</p>
            </div>
            {model.quantization && (
              <div>
                <p className="text-sm text-muted-foreground">Quantization</p>
                <p className="text-sm font-medium">{model.quantization}</p>
              </div>
            )}
          </div>

          {/* VRAM Usage */}
          <div>
            <div className="flex items-center mb-1">
              <MemoryStick className="h-4 w-4 mr-1" />
              <span className="text-sm text-muted-foreground">VRAM Usage</span>
              <div className="flex-grow" />
              {model.vramUsedGb !== null ? (
                <span className="text-xs font-medium">
                  {model.vramUsedGb.toFixed(1)} / {model.vramAllocatedGb.toFixed(1)} GB
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {model.vramAllocatedGb.toFixed(1)} GB allocated
                </span>
              )}
            </div>
            {vramUsagePercent !== null && (
              <Progress
                value={Math.min(vramUsagePercent, 100)}
                className={cn(
                  'h-1.5',
                  vramUsagePercent >= 90 && '[&>div]:bg-yellow-500',
                )}
              />
            )}
          </div>

          {/* Warm-up Status */}
          {model.health === 'loaded' && (
            <div className="flex items-center gap-2">
              {model.warmUpComplete ? (
                <Badge variant="secondary">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Warm-up complete
                </Badge>
              ) : (
                <Badge variant="outline">
                  <Hourglass className="mr-1 h-3 w-3" />
                  Warming up
                </Badge>
              )}
            </div>
          )}

          {/* Performance Metrics */}
          {model.performanceMetrics && (
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Performance Metrics
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">Requests</p>
                  <p className="text-sm font-medium">{model.performanceMetrics.totalRequests}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Latency</p>
                  <p className="text-sm font-medium">{model.performanceMetrics.averageLatencyMs.toFixed(0)} ms</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Req/sec</p>
                  <p className="text-sm font-medium">{model.performanceMetrics.requestsPerSecond.toFixed(2)}</p>
                </div>
                {model.performanceMetrics.averageFps !== null && (
                  <div>
                    <p className="text-xs text-muted-foreground">Avg FPS</p>
                    <p className="text-sm font-medium">{model.performanceMetrics.averageFps.toFixed(1)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Last Used */}
          {model.lastUsed && (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Last used: {formatDistanceToNow(new Date(model.lastUsed), { addSuffix: true })}
              </span>
            </div>
          )}

          {/* Load Time */}
          {model.loadTimeMs !== null && (
            <div>
              <span className="text-xs text-muted-foreground">
                Load time: {(model.loadTimeMs / 1000).toFixed(1)}s
              </span>
            </div>
          )}

          {/* Error Message */}
          {model.errorMessage && (
            <Alert variant="destructive" className="py-1">
              <AlertDescription className="text-xs">{model.errorMessage}</AlertDescription>
            </Alert>
          )}

          {/* Unload Button */}
          {onUnload && model.health === 'loaded' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnload}
              className="w-full text-yellow-600 border-yellow-600 hover:bg-yellow-50"
            >
              Unload Model
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
