/**
 * Admin page for selecting CPU or GPU models per task type.
 * Provides device preference toggles, model dropdowns, VRAM budget visualization,
 * and download status with on-demand download triggers.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  MemoryStick,
  Monitor,
  Gauge,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  CloudDownload,
  Cloud,
  CloudOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useModelConfig,
  useSelectModel,
  useMemoryValidation,
  useTaskReady,
  useLoadModel,
} from '@store/queries/useModelConfig'
import type { ModelOption } from '@api/client'
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

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
const SPEED_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  real_time: 'secondary',
  very_fast: 'secondary',
  fast: 'secondary',
  moderate: 'outline',
  medium: 'outline',
  slow: 'destructive',
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
function TaskDownloadStatus({ taskType }: { taskType: string }): JSX.Element | null {
  const { data, isLoading, isFetching, error } = useTaskReady(taskType)
  const loadModelMutation = useLoadModel()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Spinner className="h-4 w-4" />
        <span className="text-sm text-muted-foreground">
          Checking cache...
        </span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <CloudOff className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Unable to check cache status
        </span>
      </div>
    )
  }

  if (!data) return null

  // External API models are always "ready"
  if (data.framework === 'external_api') {
    return (
      <div className="flex items-center gap-2">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <span className="text-sm text-muted-foreground">
          External API (no download needed)
        </span>
      </div>
    )
  }

  if (data.cached) {
    return (
      <div className="flex items-center gap-2">
        <Cloud className="h-4 w-4 text-green-500" />
        <span className="text-sm text-green-600">
          Downloaded
        </span>
      </div>
    )
  }

  // Show loading state while the mutation is running or the query is refetching after success
  const isDownloading = loadModelMutation.isPending || (loadModelMutation.isSuccess && isFetching)

  return (
    <div className="flex items-center gap-2">
      <CloudDownload className="h-4 w-4 text-yellow-500" />
      <span className="text-sm text-yellow-600">
        Not downloaded
      </span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                disabled={isDownloading}
                onClick={() => loadModelMutation.mutate(taskType)}
                className="ml-2"
              >
                {isDownloading ? <Spinner className="mr-2 h-3 w-3" /> : <CloudDownload className="mr-2 h-3 w-3" />}
                {isDownloading ? 'Downloading...' : 'Download'}
              </Button>
            }
          />
          <TooltipContent>
            Download model to local cache. This may take several minutes.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {loadModelMutation.isError && (
        <span className="text-sm text-destructive ml-2">
          Failed: {loadModelMutation.error?.message}
        </span>
      )}
    </div>
  )
}

/**
 * Admin page for managing model configuration per task type.
 * Displays device preference toggles, model selection dropdowns,
 * VRAM budget visualization, download status, and save/reset/refresh controls.
 */
export function ModelManagementPage(): JSX.Element {
  const pageAnchor = useTourAnchor('model-management-page')
  const memoryAnchor = useTourAnchor('model-memory-validation')
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

  const handleDeviceChange = (taskType: string, newDevice: string) => {
    if (!newDevice || !config) return
    const device = newDevice as 'cpu' | 'gpu'

    setDevicePreferences((prev) => ({ ...prev, [taskType]: device }))

    const taskConfig = config.models[taskType]
    if (!taskConfig) return

    const currentModel = pendingSelections[taskType]
    const currentOption = taskConfig.options.find((o) => o.name === currentModel)

    if (!currentOption || !isCompatible(currentOption, device)) {
      const compatible = firstCompatibleModel(taskConfig.options, device)
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

  // The loading wrapper carries the page anchor so the Admin tour can
  // anchor here while config is fetching or the model-service is
  // unreachable (demo deployments skip the model-service container, so
  // the fetch errors and the anchor must still resolve).
  if (isLoading) {
    return (
      <div className="p-6" ref={pageAnchor}>
        <Skeleton className="h-8 w-2/5 mb-2" />
        <Skeleton className="h-5 w-3/5 mb-6" />
        <Skeleton className="h-[120px] w-full mb-4" />
        <Skeleton className="h-[120px] w-full mb-4" />
        <Skeleton className="h-[120px] w-full" />
      </div>
    )
  }

  // The error wrapper carries both the page anchor and the
  // memory-validation child anchor so the Admin tour can walk through
  // Models then VRAM validation even when the model-service is offline
  // (demo builds skip the model-service container).
  if (error) {
    return (
      <div className="p-6" ref={pageAnchor}>
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load model configuration: {error.message}
          </AlertDescription>
        </Alert>
        <div className="sr-only" aria-hidden="true" ref={memoryAnchor} />
      </div>
    )
  }

  // No config state
  if (!config) {
    return (
      <div className="p-6" ref={pageAnchor}>
        <Alert>
          <AlertDescription>No model configuration available.</AlertDescription>
        </Alert>
        <div className="sr-only" aria-hidden="true" ref={memoryAnchor} />
      </div>
    )
  }

  const modelsDisabled = !config.cudaAvailable && !config.cpuModelsAvailable
  const isVramWarning =
    vramCalculation != null && vramCalculation.utilizationPercent >= 80 && vramCalculation.valid
  const isVramError = vramCalculation != null && !vramCalculation.valid

  return (
    <div className="p-6" ref={pageAnchor}>
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold">Model Configuration</h3>
        <p className="text-sm text-muted-foreground">
          Select device preference and model for each task type. Models that are not yet
          downloaded can be pre-downloaded using the Download button.
        </p>
      </div>

      {/* Alert banners */}
      {modelsDisabled && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle className="font-bold">
            No AI Models Available
          </AlertTitle>
          <AlertDescription>
            No GPU/CUDA detected and no CPU-compatible models are installed.
            Install CPU-compatible models or add a GPU to enable AI features.
          </AlertDescription>
        </Alert>
      )}

      {!config.cudaAvailable && config.cpuModelsAvailable && (
        <Alert className="mb-6">
          <AlertTitle className="font-bold">
            CPU Mode
          </AlertTitle>
          <AlertDescription>
            No GPU/CUDA detected. Running with CPU-optimized models. Performance may be slower than
            GPU mode.
          </AlertDescription>
        </Alert>
      )}

      {/*
       * VRAM Budget bar, present only when a GPU is detected and at
       * least one task is assigned to it. On a host with no GPU (CPU-only
       * or a demo build that skips the model-service container), the
       * budget bar is suppressed and a sr-only placeholder carries the
       * memory-validation anchor instead, so the Admin tour resolves it
       * the same way the loading and error branches do.
       */}
      {!(config.cudaAvailable && hasGpuTask && vramCalculation && validation) && (
        <div className="sr-only" aria-hidden="true" ref={memoryAnchor} />
      )}
      {config.cudaAvailable && hasGpuTask && vramCalculation && validation && (
        <div className="rounded-lg border bg-card p-4 mb-6" ref={memoryAnchor}>
          <div className="flex items-center mb-2">
            <MemoryStick className="mr-2 h-4 w-4" />
            <span className="font-medium">VRAM Budget</span>
            <div className="flex-grow" />
            <Badge
              variant={isVramError ? 'destructive' : isVramWarning ? 'outline' : 'secondary'}
            >
              {isVramError ? (
                <XCircle className="mr-1 h-3 w-3" />
              ) : isVramWarning ? (
                <AlertTriangle className="mr-1 h-3 w-3" />
              ) : (
                <CheckCircle className="mr-1 h-3 w-3" />
              )}
              {vramCalculation.totalRequired.toFixed(1)} / {vramCalculation.maxAllowed.toFixed(1)} GB
            </Badge>
          </div>

          <Progress
            value={Math.min(vramCalculation.utilizationPercent, 100)}
            className={cn(
              'h-2',
              isVramError && '[&>div]:bg-destructive',
              isVramWarning && !isVramError && '[&>div]:bg-yellow-500',
            )}
          />

          <p className="text-xs text-muted-foreground mt-2">
            Total available: {validation.totalVramGb.toFixed(1)} GB
            {' \u00b7 '}
            Utilization: {vramCalculation.utilizationPercent.toFixed(0)}%
          </p>

          {isVramError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>
                Configuration exceeds available VRAM budget. Please select smaller models.
              </AlertDescription>
            </Alert>
          )}

          {isVramWarning && !isVramError && (
            <Alert className="mt-4">
              <AlertDescription>
                Approaching VRAM limit. Consider smaller models if performance issues occur.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Task type cards */}
      {!modelsDisabled && (
        <div className="flex flex-col gap-6 mb-6">
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
              <div key={taskType} className="rounded-lg border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-semibold">
                    {TASK_DISPLAY_NAMES[taskType] || taskType}
                  </span>
                  <TaskDownloadStatus taskType={taskType} />
                </div>

                {/* Device toggle */}
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-sm text-muted-foreground min-w-[50px]">
                    Device:
                  </span>
                  <ToggleGroup
                    value={[device]}
                    onValueChange={(val) => {
                      const newDevice = val.find((v) => v !== device)
                      if (newDevice) handleDeviceChange(taskType, newDevice)
                    }}
                    size="sm"
                  >
                    <ToggleGroupItem value="cpu">
                      <Monitor className="mr-1 h-4 w-4" />
                      CPU
                    </ToggleGroupItem>
                    <ToggleGroupItem value="gpu" disabled={!config.cudaAvailable}>
                      <MemoryStick className="mr-1 h-4 w-4" />
                      GPU
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {/* Model dropdown */}
                <div className="mb-4">
                  <Select
                    value={selectedModelName}
                    onValueChange={(value) => { if (value !== null) handleModelChange(taskType, value) }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredOptions.length === 0 ? (
                        <SelectItem value="" disabled>
                          No compatible models
                        </SelectItem>
                      ) : (
                        filteredOptions.map((option) => (
                          <SelectItem key={option.name} value={option.name}>
                            <div className="flex items-center gap-2">
                              <span>{option.name}</span>
                              <Badge variant="outline">
                                <MemoryStick className="mr-1 h-3 w-3" />
                                {(device === 'cpu' ? option.cpuMemoryGb : option.vramGb).toFixed(1)} GB
                              </Badge>
                              <Badge variant={SPEED_VARIANTS[option.speed] || 'outline'}>
                                <Gauge className="mr-1 h-3 w-3" />
                                {option.speed}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Model details */}
                {selectedOption && (
                  <div className="rounded-lg border bg-muted p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="col-span-full">
                        <p className="text-sm font-medium text-muted-foreground">
                          Model Details
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Model ID
                        </p>
                        <p className="text-sm font-medium">
                          {selectedOption.modelId}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Framework
                        </p>
                        <p className="text-sm font-medium">
                          {selectedOption.framework}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          {device === 'cpu' ? 'CPU Memory' : 'VRAM'}
                        </p>
                        <p className="text-sm font-medium">
                          {(device === 'cpu'
                            ? selectedOption.cpuMemoryGb
                            : selectedOption.vramGb
                          ).toFixed(1)}{' '}
                          GB
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Speed
                        </p>
                        <Badge variant={SPEED_VARIANTS[selectedOption.speed] || 'outline'}>
                          {selectedOption.speed}
                        </Badge>
                      </div>
                      <div className="col-span-full">
                        <p className="text-sm text-muted-foreground">
                          Description
                        </p>
                        <p className="text-sm">
                          {selectedOption.description}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Action buttons */}
      {!modelsDisabled && (
        <div className="flex gap-4">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || selectModelMutation.isPending}
          >
            {selectModelMutation.isPending ? 'Saving...' : 'Save Configuration'}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges || selectModelMutation.isPending}
          >
            Reset
          </Button>
          <div className="flex-grow" />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    onClick={() => {
                      refetch()
                      refetchValidation()
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                }
              />
              <TooltipContent>Refresh configuration</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}

      {/* Success/Error alerts */}
      {saveSuccess && (
        <Alert className="mt-4">
          <AlertDescription>
            Configuration saved successfully.
          </AlertDescription>
        </Alert>
      )}

      {saveError && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            Failed to save configuration: {saveError}
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
