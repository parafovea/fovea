/**
 * Tests for ModelStatusDashboard component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelStatusDashboard } from './ModelStatusDashboard'
import * as useModelConfigHooks from '../hooks/useModelConfig'
import { ModelStatusResponse, LoadedModelStatus } from '../api/client'

/**
 * Create a QueryClient for testing.
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
}

/**
 * Wrapper component for tests.
 */
function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      {children}
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

describe('ModelStatusDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Loading State', () => {
    it('displays loading skeleton when data is loading', () => {
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      // Skeleton elements don't have role="progressbar", look for the Skeleton component
      const skeletons = document.querySelectorAll('.MuiSkeleton-root')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('Error State', () => {
    it('displays error message when loading fails', () => {
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Network error', statusCode: 500 },
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/Failed to load model status/i)).toBeInTheDocument()
      expect(screen.getByText(/Network error/i)).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('displays message when no models are loaded', () => {
      const emptyStatus = createMockStatusResponse([])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: emptyStatus,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/No models currently loaded/i)).toBeInTheDocument()
      expect(screen.getByText(/0 models loaded/i)).toBeInTheDocument()
    })
  })

  describe('Single Model Loaded', () => {
    it('displays model information correctly', () => {
      const model = createMockModelStatus()
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText('Video Summarization')).toBeInTheDocument()
      // Model name appears twice (as name and as model_id)
      const modelNames = screen.getAllByText('llama-4-maverick')
      expect(modelNames.length).toBeGreaterThan(0)
      expect(screen.getByText('vllm')).toBeInTheDocument()
      expect(screen.getByText('int4')).toBeInTheDocument()
      // "loaded" appears in multiple places (chip, statistics, etc.)
      const loadedElements = screen.getAllByText(/loaded/i)
      expect(loadedElements.length).toBeGreaterThan(0)
    })

    it('displays VRAM usage correctly', () => {
      const model = createMockModelStatus({
        vram_allocated_gb: 12.0,
        vram_used_gb: 10.5,
      })
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/10.5 \/ 12.0 GB/i)).toBeInTheDocument()
    })

    it('displays performance metrics when available', () => {
      const model = createMockModelStatus()
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText('42')).toBeInTheDocument() // total requests
      expect(screen.getByText(/250 ms/i)).toBeInTheDocument() // latency
      expect(screen.getByText(/2.50/i)).toBeInTheDocument() // req/sec
    })

    it('displays warm-up status', () => {
      const model = createMockModelStatus({ warm_up_complete: true })
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/Warm-up complete/i)).toBeInTheDocument()
    })

    it('displays warming up status when not complete', () => {
      const model = createMockModelStatus({ warm_up_complete: false })
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/Warming up/i)).toBeInTheDocument()
    })
  })

  describe('Multiple Models', () => {
    it('displays all loaded models', () => {
      const models = [
        createMockModelStatus({
          task_type: 'video_summarization',
          model_name: 'llama-4-maverick',
        }),
        createMockModelStatus({
          task_type: 'object_detection',
          model_name: 'yolo-world',
          vram_allocated_gb: 8.0,
        }),
        createMockModelStatus({
          task_type: 'video_tracking',
          model_name: 'samurai',
          vram_allocated_gb: 6.0,
        }),
      ]
      const status = createMockStatusResponse(models)
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText('Video Summarization')).toBeInTheDocument()
      expect(screen.getByText('Object Detection')).toBeInTheDocument()
      expect(screen.getByText('Video Tracking')).toBeInTheDocument()
      expect(screen.getByText(/3 models loaded/i)).toBeInTheDocument()
    })

    it('calculates total VRAM correctly', () => {
      const models = [
        createMockModelStatus({
          model_id: 'llama-4-maverick',
          task_type: 'video_summarization',
          vram_allocated_gb: 12.0,
        }),
        createMockModelStatus({
          model_id: 'yolo-world',
          task_type: 'object_detection',
          vram_allocated_gb: 8.0,
        }),
        createMockModelStatus({
          model_id: 'samurai',
          task_type: 'video_tracking',
          vram_allocated_gb: 6.0,
        }),
      ]
      const status = createMockStatusResponse(models, {
        total_vram_allocated_gb: 26.0,
        total_vram_available_gb: 24.0,
      })
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/26.0 \/ 24.0 GB/i)).toBeInTheDocument()
    })
  })

  describe('Health Status', () => {
    it('displays loading status correctly', () => {
      const model = createMockModelStatus({ health: 'loading' })
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })

    it('displays failed status with error message', () => {
      const model = createMockModelStatus({
        health: 'failed',
        error_message: 'Out of memory',
      })
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/failed/i)).toBeInTheDocument()
      expect(screen.getByText(/Out of memory/i)).toBeInTheDocument()
    })

    it('displays unloaded status', () => {
      const model = createMockModelStatus({ health: 'unloaded' })
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/unloaded/i)).toBeInTheDocument()
    })
  })

  describe('VRAM Warnings', () => {
    it('shows warning when VRAM utilization is high', () => {
      const models = [createMockModelStatus({ vram_allocated_gb: 20.0 })]
      const status = createMockStatusResponse(models, {
        total_vram_allocated_gb: 20.0,
        total_vram_available_gb: 24.0,
      })
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      // Check for warning color on the chip (83% utilization)
      const vramChip = screen.getByText(/20.0 \/ 24.0 GB/i)
      expect(vramChip).toBeInTheDocument()
    })

    it('shows error when VRAM utilization exceeds available', () => {
      const models = [createMockModelStatus({ vram_allocated_gb: 26.0 })]
      const status = createMockStatusResponse(models, {
        total_vram_allocated_gb: 26.0,
        total_vram_available_gb: 24.0,
      })
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      const vramChip = screen.getByText(/26.0 \/ 24.0 GB/i)
      expect(vramChip).toBeInTheDocument()
    })
  })

  describe('Refresh Controls', () => {
    it('displays refresh button by default', () => {
      const status = createMockStatusResponse([])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByLabelText(/Refresh now/i)).toBeInTheDocument()
    })

    it('calls refetch when refresh button clicked', async () => {
      const user = userEvent.setup()
      const refetch = vi.fn()
      const status = createMockStatusResponse([])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch,
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      const refreshButton = screen.getByLabelText(/Refresh now/i)
      await user.click(refreshButton)

      expect(refetch).toHaveBeenCalledTimes(1)
    })

    it('displays auto-refresh toggle by default', () => {
      const status = createMockStatusResponse([])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/Auto-refresh/i)).toBeInTheDocument()
    })

    it('toggles auto-refresh when switch clicked', async () => {
      const user = userEvent.setup()
      const status = createMockStatusResponse([])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      const toggle = screen.getByRole('checkbox', { name: /Auto-refresh/i })
      expect(toggle).toBeChecked()

      await user.click(toggle)
      expect(toggle).not.toBeChecked()
    })

    it('hides refresh button when showRefreshButton is false', () => {
      const status = createMockStatusResponse([])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard showRefreshButton={false} />
        </TestWrapper>
      )

      expect(screen.queryByLabelText(/Refresh now/i)).not.toBeInTheDocument()
    })

    it('hides auto-refresh toggle when showAutoRefreshToggle is false', () => {
      const status = createMockStatusResponse([])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard showAutoRefreshToggle={false} />
        </TestWrapper>
      )

      expect(screen.queryByText(/Auto-refresh/i)).not.toBeInTheDocument()
    })
  })

  describe('Unload Model', () => {
    it('displays unload button when onUnloadModel provided', () => {
      const model = createMockModelStatus({ health: 'loaded' })
      const status = createMockStatusResponse([model])
      const onUnloadModel = vi.fn()
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard onUnloadModel={onUnloadModel} />
        </TestWrapper>
      )

      expect(screen.getByText(/Unload Model/i)).toBeInTheDocument()
    })

    it('calls onUnloadModel when unload button clicked', async () => {
      const user = userEvent.setup()
      const model = createMockModelStatus({
        model_id: 'llama-4-maverick',
        task_type: 'video_summarization',
        health: 'loaded',
      })
      const status = createMockStatusResponse([model])
      const onUnloadModel = vi.fn()
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard onUnloadModel={onUnloadModel} />
        </TestWrapper>
      )

      const unloadButton = screen.getByText(/Unload Model/i)
      await user.click(unloadButton)

      expect(onUnloadModel).toHaveBeenCalledWith(
        'llama-4-maverick',
        'video_summarization'
      )
    })

    it('does not display unload button for non-loaded models', () => {
      const model = createMockModelStatus({ health: 'loading' })
      const status = createMockStatusResponse([model])
      const onUnloadModel = vi.fn()
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard onUnloadModel={onUnloadModel} />
        </TestWrapper>
      )

      expect(screen.queryByText(/Unload Model/i)).not.toBeInTheDocument()
    })
  })

  describe('Performance Metrics', () => {
    it('displays FPS when available', () => {
      const model = createMockModelStatus({
        performance_metrics: {
          total_requests: 100,
          average_latency_ms: 50,
          requests_per_second: 10,
          average_fps: 30.5,
        },
      })
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/30.5/i)).toBeInTheDocument()
    })

    it('does not display performance metrics when not available', () => {
      const model = createMockModelStatus({ performance_metrics: null })
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      // Look for specific performance metrics text that should not appear
      expect(screen.queryByText('Requests')).not.toBeInTheDocument()
      expect(screen.queryByText('Avg Latency')).not.toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles model without quantization', () => {
      const model = createMockModelStatus({ quantization: null })
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText('vllm')).toBeInTheDocument()
      expect(screen.queryByText('Quantization')).not.toBeInTheDocument()
    })

    it('handles model without last_used timestamp', () => {
      const model = createMockModelStatus({ last_used: null })
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.queryByText(/Last used/i)).not.toBeInTheDocument()
    })

    it('handles model without vram_used_gb', () => {
      const model = createMockModelStatus({ vram_used_gb: null })
      const status = createMockStatusResponse([model])
      vi.spyOn(useModelConfigHooks, 'useModelStatus').mockReturnValue({
        data: status,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      render(
        <TestWrapper>
          <ModelStatusDashboard />
        </TestWrapper>
      )

      expect(screen.getByText(/12.0 GB allocated/i)).toBeInTheDocument()
    })
  })
})
