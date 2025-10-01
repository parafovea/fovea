/**
 * Storybook stories for ModelStatusDashboard component.
 */

import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelStatusDashboard } from './ModelStatusDashboard'
import * as useModelConfigHooks from '../hooks/useModelConfig'
import { ModelStatusResponse, LoadedModelStatus } from '../api/client'
import { fn } from '@storybook/test'

/**
 * Create a QueryClient for Storybook.
 */
function createStoryQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: Infinity,
      },
    },
  })
}

/**
 * Decorator for Storybook stories.
 */
function StoryDecorator(Story: React.ComponentType) {
  const queryClient = createStoryQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      <Story />
    </QueryClientProvider>
  )
}

/**
 * Create mock model status.
 */
function createMockModelStatus(overrides?: Partial<LoadedModelStatus>): LoadedModelStatus {
  return {
    model_id: 'llama-4-maverick',
    task_type: 'video_summarization',
    model_name: 'llama-4-maverick',
    framework: 'vllm',
    quantization: 'int4',
    health: 'loaded',
    vram_allocated_gb: 12.0,
    vram_used_gb: 10.5,
    warm_up_complete: true,
    last_used: new Date().toISOString(),
    load_time_ms: 5000,
    performance_metrics: {
      total_requests: 42,
      average_latency_ms: 250,
      requests_per_second: 2.5,
      average_fps: null,
    },
    error_message: null,
    ...overrides,
  }
}

/**
 * Create mock status response.
 */
function createMockStatusResponse(
  models: LoadedModelStatus[] = [],
  overrides?: Partial<ModelStatusResponse>
): ModelStatusResponse {
  const totalAllocated = models.reduce((sum, m) => sum + m.vram_allocated_gb, 0)
  return {
    loaded_models: models,
    total_vram_allocated_gb: totalAllocated,
    total_vram_available_gb: 24.0,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

const meta: Meta<typeof ModelStatusDashboard> = {
  title: 'Model Management/ModelStatusDashboard',
  component: ModelStatusDashboard,
  decorators: [StoryDecorator],
  parameters: {
    layout: 'padded',
  },
  args: {
    onUnloadModel: fn(),
  },
}

export default meta
type Story = StoryObj<typeof ModelStatusDashboard>

/**
 * Story: No models loaded (idle system).
 */
export const NoModelsLoaded: Story = {
  name: 'No Models Loaded',
  beforeEach: () => {
    const status = createMockStatusResponse([], {
      total_vram_allocated_gb: 0,
      total_vram_available_gb: 24.0,
    })
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: status,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)
  },
}

/**
 * Story: Single model loaded and active.
 */
export const SingleModelActive: Story = {
  name: 'Single Model Active',
  beforeEach: () => {
    const model = createMockModelStatus({
      task_type: 'video_summarization',
      model_name: 'llama-4-maverick',
      vram_allocated_gb: 12.0,
      vram_used_gb: 10.5,
      warm_up_complete: true,
      performance_metrics: {
        total_requests: 156,
        average_latency_ms: 235,
        requests_per_second: 4.2,
        average_fps: null,
      },
    })
    const status = createMockStatusResponse([model])
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: status,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)
  },
}

/**
 * Story: Research lab with multiple models loaded.
 */
export const ResearchLabMultipleModels: Story = {
  name: 'Research Lab - Multiple Models',
  beforeEach: () => {
    const models = [
      createMockModelStatus({
        task_type: 'video_summarization',
        model_name: 'llama-4-maverick',
        framework: 'vllm',
        quantization: 'int4',
        vram_allocated_gb: 12.0,
        vram_used_gb: 11.2,
        warm_up_complete: true,
        performance_metrics: {
          total_requests: 523,
          average_latency_ms: 180,
          requests_per_second: 5.5,
          average_fps: null,
        },
      }),
      createMockModelStatus({
        model_id: 'yolo-world-v2-l',
        task_type: 'object_detection',
        model_name: 'yolo-world-v2-l',
        framework: 'torch',
        quantization: null,
        vram_allocated_gb: 8.0,
        vram_used_gb: 7.1,
        warm_up_complete: true,
        performance_metrics: {
          total_requests: 891,
          average_latency_ms: 45,
          requests_per_second: 22.0,
          average_fps: 15.3,
        },
      }),
      createMockModelStatus({
        model_id: 'samurai',
        task_type: 'video_tracking',
        model_name: 'samurai',
        framework: 'torch',
        quantization: 'fp16',
        vram_allocated_gb: 6.0,
        vram_used_gb: 5.5,
        warm_up_complete: true,
        performance_metrics: {
          total_requests: 234,
          average_latency_ms: 120,
          requests_per_second: 8.3,
          average_fps: 12.5,
        },
      }),
    ]
    const status = createMockStatusResponse(models, {
      total_vram_allocated_gb: 26.0,
      total_vram_available_gb: 48.0,
    })
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: status,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)
  },
}

/**
 * Story: Production system with high utilization.
 */
export const ProductionHighUtilization: Story = {
  name: 'Production - High Utilization',
  beforeEach: () => {
    const models = [
      createMockModelStatus({
        task_type: 'video_summarization',
        model_name: 'llama-4-maverick',
        vram_allocated_gb: 12.0,
        vram_used_gb: 11.8,
        warm_up_complete: true,
        performance_metrics: {
          total_requests: 1523,
          average_latency_ms: 210,
          requests_per_second: 7.1,
          average_fps: null,
        },
      }),
      createMockModelStatus({
        model_id: 'florence-2-large',
        task_type: 'object_detection',
        model_name: 'florence-2-large',
        framework: 'torch',
        quantization: 'int8',
        vram_allocated_gb: 10.0,
        vram_used_gb: 9.6,
        warm_up_complete: true,
        performance_metrics: {
          total_requests: 2341,
          average_latency_ms: 85,
          requests_per_second: 11.7,
          average_fps: 8.2,
        },
      }),
    ]
    const status = createMockStatusResponse(models, {
      total_vram_allocated_gb: 22.0,
      total_vram_available_gb: 24.0, // 92% utilization
    })
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: status,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)
  },
}

/**
 * Story: Memory pressure (over budget).
 */
export const MemoryPressure: Story = {
  name: 'Memory Pressure - Over Budget',
  beforeEach: () => {
    const models = [
      createMockModelStatus({
        task_type: 'video_summarization',
        model_name: 'llama-4-maverick',
        vram_allocated_gb: 12.0,
        vram_used_gb: 11.9,
      }),
      createMockModelStatus({
        model_id: 'yolo-world-v2-l',
        task_type: 'object_detection',
        model_name: 'yolo-world-v2-l',
        vram_allocated_gb: 8.0,
        vram_used_gb: 7.8,
      }),
      createMockModelStatus({
        model_id: 'sam2long',
        task_type: 'video_tracking',
        model_name: 'sam2long',
        vram_allocated_gb: 10.0,
        vram_used_gb: 9.5,
      }),
    ]
    const status = createMockStatusResponse(models, {
      total_vram_allocated_gb: 30.0,
      total_vram_available_gb: 24.0, // 125% over budget
    })
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: status,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)
  },
}

/**
 * Story: Model loading state.
 */
export const ModelLoading: Story = {
  name: 'Model Loading',
  beforeEach: () => {
    const models = [
      createMockModelStatus({
        task_type: 'video_summarization',
        model_name: 'llama-4-maverick',
        health: 'loading',
        warm_up_complete: false,
        vram_used_gb: null,
        performance_metrics: null,
        last_used: null,
        load_time_ms: null,
      }),
    ]
    const status = createMockStatusResponse(models)
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: status,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)
  },
}

/**
 * Story: Model failed to load.
 */
export const ModelFailed: Story = {
  name: 'Model Failed',
  beforeEach: () => {
    const models = [
      createMockModelStatus({
        task_type: 'video_summarization',
        model_name: 'llama-4-maverick',
        health: 'failed',
        warm_up_complete: false,
        vram_used_gb: null,
        performance_metrics: null,
        error_message: 'CUDA out of memory: tried to allocate 12.0 GiB',
      }),
    ]
    const status = createMockStatusResponse(models)
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: status,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)
  },
}

/**
 * Story: Mixed health states.
 */
export const MixedHealthStates: Story = {
  name: 'Mixed Health States',
  beforeEach: () => {
    const models = [
      createMockModelStatus({
        task_type: 'video_summarization',
        model_name: 'llama-4-maverick',
        health: 'loaded',
        warm_up_complete: true,
      }),
      createMockModelStatus({
        model_id: 'yolo-world',
        task_type: 'object_detection',
        model_name: 'yolo-world',
        health: 'loading',
        warm_up_complete: false,
        vram_used_gb: null,
        performance_metrics: null,
        load_time_ms: null,
      }),
      createMockModelStatus({
        model_id: 'sam2',
        task_type: 'video_tracking',
        model_name: 'sam2',
        health: 'failed',
        warm_up_complete: false,
        vram_used_gb: null,
        performance_metrics: null,
        error_message: 'Model checkpoint not found',
      }),
    ]
    const status = createMockStatusResponse(models)
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: status,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)
  },
}

/**
 * Story: Edge computing scenario (limited VRAM).
 */
export const EdgeComputingLimitedVRAM: Story = {
  name: 'Edge Computing - Limited VRAM',
  beforeEach: () => {
    const models = [
      createMockModelStatus({
        task_type: 'object_detection',
        model_name: 'yolo11n-seg',
        framework: 'torch',
        quantization: 'int8',
        vram_allocated_gb: 2.5,
        vram_used_gb: 2.1,
        warm_up_complete: true,
        performance_metrics: {
          total_requests: 89,
          average_latency_ms: 180,
          requests_per_second: 5.5,
          average_fps: 8.3,
        },
      }),
    ]
    const status = createMockStatusResponse(models, {
      total_vram_allocated_gb: 2.5,
      total_vram_available_gb: 8.0,
    })
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: status,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)
  },
}

/**
 * Story: Loading state.
 */
export const Loading: Story = {
  name: 'Loading',
  beforeEach: () => {
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: fn(),
    } as any)
  },
}

/**
 * Story: Error state.
 */
export const Error: Story = {
  name: 'Error',
  beforeEach: () => {
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Network error: Failed to fetch model status', statusCode: 500 },
      refetch: fn(),
    } as any)
  },
}

/**
 * Story: Model warming up.
 */
export const ModelWarmingUp: Story = {
  name: 'Model Warming Up',
  beforeEach: () => {
    const models = [
      createMockModelStatus({
        task_type: 'video_summarization',
        model_name: 'llama-4-maverick',
        health: 'loaded',
        warm_up_complete: false,
        performance_metrics: {
          total_requests: 3,
          average_latency_ms: 450,
          requests_per_second: 0.5,
          average_fps: null,
        },
      }),
    ]
    const status = createMockStatusResponse(models)
    vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
      data: status,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)
  },
}
