/**
 * Panel component for configuring model selection per task type.
 * Provides dropdowns for model selection, VRAM visualization, and validation.
 */

import { useState, useEffect, useMemo } from 'react'
import {
  MemoryStick,
  Gauge,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { useModelConfig, useSelectModel, useMemoryValidation } from '@store/queries/useModelConfig'
import { ModelOption } from '@api/client'

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
  videoSummarization: 'Video Summarization',
  objectDetection: 'Object Detection',
  videoTracking: 'Video Tracking',
}

/**
 * Speed indicator variant mapping.
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
   *
   * @returns Object containing VRAM requirements, utilization percent, and validation status, or null if config/validation unavailable
   */
  const vramCalculation = useMemo(() => {
    if (!config || !validation) {
      return null
    }

    let totalRequired = 0
    const requirements: Record<string, { modelId: string; vramGb: number }> = {}

    Object.entries(pendingSelections).forEach(([taskType, modelName]) => {
      const taskConfig = config.models[taskType]
      if (taskConfig) {
        const modelOption = taskConfig.options.find((o) => o.name === modelName)
        if (modelOption) {
          totalRequired += modelOption.vramGb
          requirements[taskType] = {
            modelId: modelOption.modelId,
            vramGb: modelOption.vramGb,
          }
        }
      }
    })

    const maxAllowed = validation.totalVramGb * validation.threshold
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
   * @param taskType - Task type identifier
   * @param modelName - Name of the selected model option
   */
  const handleModelChange = (taskType: string, modelName: string) => {
    setPendingSelections((prev) => ({
      ...prev,
      [taskType]: modelName,
    }))

    const allSelectionsMatchCurrent = Object.entries({
      ...pendingSelections,
      [taskType]: modelName,
    }).every(([task, selection]) => config?.models[task]?.selected === selection)

    setHasChanges(!allSelectionsMatchCurrent)
  }

  /**
   * Saves all pending model selections to the backend.
   */
  const handleSave = async () => {
    if (!config) return

    try {
      const promises = Object.entries(pendingSelections).map(([taskType, modelName]) => {
        const current = config.models[taskType]?.selected
        if (current !== modelName) {
          return selectModelMutation.mutateAsync({
            taskType,
            modelName,
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
              Failed to load model configuration: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!config || !validation || !vramCalculation) {
    return (
      <Card>
        <CardContent>
          <Alert>
            <AlertDescription>
              No model configuration available.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  // Determine hardware mode
  const isCpuOnly = !config.cudaAvailable
  const cpuModelsAvailable = config.cpuModelsAvailable
  const modelsDisabled = !config.cudaAvailable && !cpuModelsAvailable
  const isVramWarning = vramCalculation.utilizationPercent >= 80 && vramCalculation.valid
  const isVramError = !vramCalculation.valid

  return (
    <Card>
      <CardContent>
        <div className="mb-6">
          <h5 className="text-lg font-semibold mb-1">
            Model Configuration
          </h5>
          <p className="text-sm text-muted-foreground">
            Configure model selection for each task type. Monitor VRAM usage to ensure models fit within budget.
          </p>
        </div>

        {/* CPU Mode Info / No Models Warning */}
        {isCpuOnly && cpuModelsAvailable && (
          <Alert className="mb-6">
            <AlertTitle className="font-bold">
              CPU Mode - Using Optimized CPU Models
            </AlertTitle>
            <AlertDescription>
              <p className="mb-1">
                No GPU/CUDA detected. Running with CPU-optimized models (ONNX detection, llama.cpp).
              </p>
              <p>
                Performance may be slower than GPU mode. VRAM budget does not apply.
              </p>
            </AlertDescription>
          </Alert>
        )}
        {modelsDisabled && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle className="font-bold">
              No AI Models Available
            </AlertTitle>
            <AlertDescription>
              <p className="mb-1">
                No GPU/CUDA detected and no CPU-compatible models are installed.
              </p>
              <p className="mb-1">
                <strong>All AI-powered features are disabled:</strong>
              </p>
              <ul className="list-disc pl-4 mb-1">
                <li>Video summarization</li>
                <li>Object detection</li>
                <li>Object tracking</li>
                <li>Ontology augmentation</li>
              </ul>
              <p className="font-bold">
                Install CPU-compatible models or add a GPU to enable AI features.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* VRAM Budget Visualization */}
        {!isCpuOnly && !modelsDisabled && vramCalculation && validation && (
          <div className="rounded-lg border bg-card p-4 mb-6">
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

        {/* Model Selection per Task */}
        {!modelsDisabled && (
          <div className="flex flex-col gap-6">
            {Object.entries(config.models).map(([taskType, taskConfig]) => (
              <div key={taskType}>
                <h6 className="text-base font-semibold mb-2">
                  {TASK_DISPLAY_NAMES[taskType] || taskType}
                </h6>

                <div>
                  <Label className="mb-2">Model</Label>
                  <Select
                    value={pendingSelections[taskType] || taskConfig.selected}
                    onValueChange={(value) => { if (value !== null) handleModelChange(taskType, value) }}
                    disabled={modelsDisabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {taskConfig.options.map((option) => (
                        <SelectItem key={option.name} value={option.name}>
                          <div className="flex items-center gap-2">
                            <span>{option.name}</span>
                            <Badge variant="outline">
                              <MemoryStick className="mr-1 h-3 w-3" />
                              {option.vramGb.toFixed(1)} GB
                            </Badge>
                            <Badge variant={SPEED_VARIANTS[option.speed] || 'outline'}>
                              <Gauge className="mr-1 h-3 w-3" />
                              {option.speed}
                            </Badge>
                            {option.fps && (
                              <Badge variant="outline">{option.fps} FPS</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Display current model info */}
                <ModelOptionInfo
                  option={taskConfig.options.find(
                    (o) => o.name === (pendingSelections[taskType] || taskConfig.selected),
                  )}
                />
              </div>
            ))}
          </div>
        )}

        {!modelsDisabled && <Separator className="my-6" />}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button
            onClick={handleSave}
            disabled={modelsDisabled || !hasChanges || isVramError || selectModelMutation.isPending}
          >
            {selectModelMutation.isPending ? 'Saving...' : 'Save Configuration'}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={modelsDisabled || !hasChanges || selectModelMutation.isPending}
          >
            Reset
          </Button>
          <div className="flex-grow" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  onClick={() => {
                    refetch()
                    refetchValidation()
                  }}
                />
              }
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </TooltipTrigger>
            <TooltipContent>Refresh configuration</TooltipContent>
          </Tooltip>
        </div>

        {selectModelMutation.isError && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>
              Failed to save configuration: {selectModelMutation.error.message}
            </AlertDescription>
          </Alert>
        )}

        {selectModelMutation.isSuccess && (
          <Alert className="mt-4">
            <AlertDescription>
              Configuration saved successfully
            </AlertDescription>
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
    <div className="rounded-lg border bg-muted p-4 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="col-span-full">
          <p className="text-sm font-medium text-muted-foreground">
            Model Details
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Model ID</p>
          <p className="text-sm font-medium">{option.modelId}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Framework</p>
          <p className="text-sm font-medium">{option.framework}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">VRAM Required</p>
          <p className="text-sm font-medium">{option.vramGb.toFixed(1)} GB</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Speed</p>
          <Badge variant={SPEED_VARIANTS[option.speed] || 'outline'}>
            {option.speed}
          </Badge>
        </div>
        {option.fps && (
          <div>
            <p className="text-sm text-muted-foreground">Performance</p>
            <p className="text-sm font-medium">{option.fps} FPS</p>
          </div>
        )}
        <div className="col-span-full">
          <p className="text-sm text-muted-foreground">Description</p>
          <p className="text-sm">{option.description}</p>
        </div>
      </div>
    </div>
  )
}
