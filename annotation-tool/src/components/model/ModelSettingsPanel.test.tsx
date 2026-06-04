/**
 * Tests for ModelSettingsPanel component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelSettingsPanel } from './ModelSettingsPanel'
import * as useModelConfigHooks from '@store/queries/useModelConfig'
import type { ModelConfig, MemoryValidation, ApiError } from '@api/client'

/**
 * Create a fresh QueryClient for each test.
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

/**
 * Render component with QueryClient provider.
 */
function renderWithQuery(component: React.ReactElement) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  )
}

/**
 * Mock model configuration for testing.
 */
const mockConfig: ModelConfig = {
  models: {
    videoSummarization: {
      selected: 'llama-4-maverick',
      options: [
        {
          name: 'llama-4-maverick',
          modelId: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
          framework: 'transformers',
          vramGb: 11.2,
          cpuMemoryGb: 0,
          cpuCompatible: false,
          speed: 'fast',
          description: 'Fast VLM with strong reasoning capabilities',
          fps: 2.5,
          requiresApiKey: false,
        },
        {
          name: 'qwen-2.5-vl',
          modelId: 'Qwen/Qwen2.5-VL-7B-Instruct',
          framework: 'transformers',
          vramGb: 7.8,
          cpuMemoryGb: 0,
          cpuCompatible: false,
          speed: 'fast',
          description: 'Efficient VLM with multilingual support',
          fps: 3.2,
          requiresApiKey: false,
        },
      ],
    },
    objectDetection: {
      selected: 'yolo-world',
      options: [
        {
          name: 'yolo-world',
          modelId: 'AILab-CVC/YOLO-World',
          framework: 'transformers',
          vramGb: 2.1,
          cpuMemoryGb: 0,
          cpuCompatible: false,
          speed: 'fast',
          description: 'Real-time open-vocabulary object detection',
          fps: 25.0,
          requiresApiKey: false,
        },
        {
          name: 'owlv2-large',
          modelId: 'google/owlv2-large-patch14-ensemble',
          framework: 'transformers',
          vramGb: 4.5,
          cpuMemoryGb: 0,
          cpuCompatible: false,
          speed: 'moderate',
          description: 'High-accuracy open-vocabulary detection',
          fps: 8.0,
          requiresApiKey: false,
        },
      ],
    },
    videoTracking: {
      selected: 'samurai',
      options: [
        {
          name: 'samurai',
          modelId: 'yangchris11/samurai',
          framework: 'transformers',
          vramGb: 6.2,
          cpuMemoryGb: 0,
          cpuCompatible: false,
          speed: 'moderate',
          description: 'State-of-the-art video object segmentation and tracking',
          fps: 5.0,
          requiresApiKey: false,
        },
        {
          name: 'yolo11n-seg',
          modelId: 'ultralytics/yolo11n-seg',
          framework: 'ultralytics',
          vramGb: 1.8,
          cpuMemoryGb: 0,
          cpuCompatible: false,
          speed: 'fast',
          description: 'Lightweight segmentation and tracking',
          fps: 30.0,
          requiresApiKey: false,
        },
      ],
    },
  },
  inference: {
    maxMemoryPerModel: 24.0,
    offloadThreshold: 0.9,
    warmupOnStartup: true,
  },
  cudaAvailable: true,
  modelsAvailable: true,
  cpuModelsAvailable: false,
}

/**
 * Mock memory validation for testing.
 */
const mockValidation: MemoryValidation = {
  valid: true,
  totalVramGb: 24.0,
  totalRequiredGb: 19.5,
  threshold: 0.9,
  maxAllowedGb: 21.6,
  modelRequirements: {
    videoSummarization: {
      modelId: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
      vramGb: 11.2,
      cpuCompatible: false,
    },
    objectDetection: {
      modelId: 'AILab-CVC/YOLO-World',
      vramGb: 2.1,
      cpuCompatible: false,
    },
    videoTracking: {
      modelId: 'yangchris11/samurai',
      vramGb: 6.2,
      cpuCompatible: false,
    },
  },
}

describe('ModelSettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('displays loading skeleton while fetching configuration', () => {
      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: undefined,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      renderWithQuery(<ModelSettingsPanel />)

      // Check for skeleton elements
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('error state', () => {
    it('displays error message when configuration fails to load', () => {
      const mockError: ApiError = {
        message: 'Network error occurred',
        statusCode: 500,
      }

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: mockError,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: undefined,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      renderWithQuery(<ModelSettingsPanel />)

      expect(screen.getByText(/Failed to load model configuration/i)).toBeInTheDocument()
      expect(screen.getByText(/Network error occurred/i)).toBeInTheDocument()
    })
  })

  describe('model configuration display', () => {
    it('displays all task types with current selections (research lab scenario)', () => {
      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: mockConfig,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: mockValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      renderWithQuery(<ModelSettingsPanel />)

      // Verify task types are displayed
      expect(screen.getByText('Video Summarization')).toBeInTheDocument()
      expect(screen.getByText('Object Detection')).toBeInTheDocument()
      expect(screen.getByText('Video Tracking')).toBeInTheDocument()

      // Verify VRAM budget is displayed
      expect(screen.getByText(/VRAM Budget/i)).toBeInTheDocument()
      expect(screen.getByText(/19.5 \/ 21.6 GB/i)).toBeInTheDocument()
    })

    it('displays model details for selected models', () => {
      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: mockConfig,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: mockValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      renderWithQuery(<ModelSettingsPanel />)

      // Verify model details are shown
      expect(screen.getByText('meta-llama/Llama-3.2-11B-Vision-Instruct')).toBeInTheDocument()
      expect(screen.getByText('AILab-CVC/YOLO-World')).toBeInTheDocument()
      expect(screen.getByText('yangchris11/samurai')).toBeInTheDocument()

      // Verify framework info
      expect(screen.getAllByText('transformers')).toHaveLength(3)
    })
  })

  describe('model selection', () => {
    it('allows changing model selection for a task type', async () => {
      // Use a configuration with more VRAM headroom
      const lowUtilizationValidation: MemoryValidation = {
        valid: true,
        totalVramGb: 32.0,
        totalRequiredGb: 19.5,
        threshold: 0.9,
        maxAllowedGb: 28.8,
        modelRequirements: mockValidation.modelRequirements,
      }

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: mockConfig,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: lowUtilizationValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      const user = userEvent.setup()
      renderWithQuery(<ModelSettingsPanel />)

      // Initially save should be disabled (no changes)
      const saveButton = screen.getByRole('button', { name: /Save Configuration/i })
      expect(saveButton).toBeDisabled()

      // Find and click the object detection select
      const selects = screen.getAllByRole('combobox')
      const objectDetectionSelect = selects[1] // Second select for object detection

      await user.click(objectDetectionSelect)

      // Wait for menu to appear and find the option by text in the menu item
      await waitFor(() => {
        const menuItems = screen.getAllByRole('option')
        expect(menuItems.length).toBeGreaterThan(0)
      })

      // Find the owlv2-large option and click it
      // This will increase VRAM from 19.5 to 21.9 (still under 28.8 max_allowed)
      const owlv2Option = screen.getAllByRole('option').find(
        (option) => option.textContent?.includes('owlv2-large')
      )
      expect(owlv2Option).toBeDefined()
      await user.click(owlv2Option!)

      // Verify save button becomes enabled after change
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
    })

    it('enables reset button when changes are made', async () => {
      // Use a configuration with more VRAM headroom
      const lowUtilizationValidation: MemoryValidation = {
        valid: true,
        totalVramGb: 32.0,
        totalRequiredGb: 19.5,
        threshold: 0.9,
        maxAllowedGb: 28.8,
        modelRequirements: mockValidation.modelRequirements,
      }

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: mockConfig,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: lowUtilizationValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      const user = userEvent.setup()
      renderWithQuery(<ModelSettingsPanel />)

      // Initially reset should be disabled
      const resetButton = screen.getByRole('button', { name: /Reset/i })
      expect(resetButton).toBeDisabled()

      // Make a change
      const selects = screen.getAllByRole('combobox')
      await user.click(selects[0])

      await waitFor(() => {
        const menuItems = screen.getAllByRole('option')
        expect(menuItems.length).toBeGreaterThan(0)
      })

      const qwenOption = screen.getAllByRole('option').find(
        (option) => option.textContent?.includes('qwen-2.5-vl')
      )
      expect(qwenOption).toBeDefined()
      await user.click(qwenOption!)

      // Reset button should now be enabled
      await waitFor(() => {
        expect(resetButton).not.toBeDisabled()
      })
    })
  })

  describe('VRAM budget validation', () => {
    it('displays warning when VRAM usage exceeds 80% (production deployment scenario)', () => {
      const warningValidation: MemoryValidation = {
        valid: true,
        totalVramGb: 24.0,
        totalRequiredGb: 20.5,
        threshold: 0.9,
        maxAllowedGb: 21.6,
        modelRequirements: mockValidation.modelRequirements,
      }

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: mockConfig,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: warningValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      renderWithQuery(<ModelSettingsPanel />)

      expect(screen.getByText(/Approaching VRAM limit/i)).toBeInTheDocument()
    })

    it('displays error when VRAM budget is exceeded (edge computing scenario)', () => {
      const errorValidation: MemoryValidation = {
        valid: false,
        totalVramGb: 16.0,
        totalRequiredGb: 19.5,
        threshold: 0.9,
        maxAllowedGb: 14.4,
        modelRequirements: mockValidation.modelRequirements,
      }

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: mockConfig,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: errorValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      renderWithQuery(<ModelSettingsPanel />)

      expect(screen.getByText(/Configuration exceeds available VRAM budget/i)).toBeInTheDocument()

      // Save button should be disabled
      const saveButton = screen.getByRole('button', { name: /Save Configuration/i })
      expect(saveButton).toBeDisabled()
    })

    it('displays success indicator when VRAM usage is optimal', () => {
      const optimalValidation: MemoryValidation = {
        valid: true,
        totalVramGb: 32.0,
        totalRequiredGb: 19.5,  // Actual models total 19.5 GB
        threshold: 0.9,
        maxAllowedGb: 28.8,  // 19.5 / 28.8 = 67.7% (under 80% warning threshold)
        modelRequirements: mockValidation.modelRequirements,
      }

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: mockConfig,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: optimalValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      renderWithQuery(<ModelSettingsPanel />)

      // Should not show any warnings or errors
      expect(screen.queryByText(/Approaching VRAM limit/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/Configuration exceeds/i)).not.toBeInTheDocument()
    })
  })

  describe('save configuration', () => {
    it('saves configuration changes successfully', async () => {
      // Use a configuration with more VRAM headroom
      const lowUtilizationValidation: MemoryValidation = {
        valid: true,
        totalVramGb: 32.0,
        totalRequiredGb: 19.5,
        threshold: 0.9,
        maxAllowedGb: 28.8,
        modelRequirements: mockValidation.modelRequirements,
      }

      const mockMutateAsync = vi.fn().mockResolvedValue({
        status: 'success',
        taskType: 'objectDetection',
        selectedModel: 'owlv2-large',
      })

      const mockRefetch = vi.fn()

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: mockConfig,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: lowUtilizationValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      const user = userEvent.setup()
      const onSaveSuccess = vi.fn()
      renderWithQuery(<ModelSettingsPanel onSaveSuccess={onSaveSuccess} />)

      // Make a change
      const selects = screen.getAllByRole('combobox')
      await user.click(selects[1])

      await waitFor(() => {
        const menuItems = screen.getAllByRole('option')
        expect(menuItems.length).toBeGreaterThan(0)
      })

      const owlv2Option = screen.getAllByRole('option').find(
        (option) => option.textContent?.includes('owlv2-large')
      )
      expect(owlv2Option).toBeDefined()
      await user.click(owlv2Option!)

      // Wait for save button to be enabled
      const saveButton = screen.getByRole('button', { name: /Save Configuration/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })

      // Click save
      await user.click(saveButton)

      // Verify mutation was called
      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          taskType: 'objectDetection',
          modelName: 'owlv2-large',
        })
      })
    })

    it('handles save errors gracefully', async () => {
      // Use a configuration with more VRAM headroom
      const lowUtilizationValidation: MemoryValidation = {
        valid: true,
        totalVramGb: 32.0,
        totalRequiredGb: 19.5,
        threshold: 0.9,
        maxAllowedGb: 28.8,
        modelRequirements: mockValidation.modelRequirements,
      }

      const mockMutateAsync = vi.fn().mockRejectedValue(new Error('Save failed'))

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: mockConfig,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: lowUtilizationValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: mockMutateAsync,
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      const user = userEvent.setup()
      const onSaveError = vi.fn()
      renderWithQuery(<ModelSettingsPanel onSaveError={onSaveError} />)

      // Make a change
      const selects = screen.getAllByRole('combobox')
      await user.click(selects[0])

      await waitFor(() => {
        const menuItems = screen.getAllByRole('option')
        expect(menuItems.length).toBeGreaterThan(0)
      })

      const qwenOption = screen.getAllByRole('option').find(
        (option) => option.textContent?.includes('qwen-2.5-vl')
      )
      expect(qwenOption).toBeDefined()
      await user.click(qwenOption!)

      // Wait for save button to be enabled
      const saveButton = screen.getByRole('button', { name: /Save Configuration/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })

      // Click save
      await user.click(saveButton)

      // Verify error callback was called
      await waitFor(() => {
        expect(onSaveError).toHaveBeenCalledWith('Save failed')
      })
    })
  })

  describe('reset configuration', () => {
    it('resets changes to original configuration', async () => {
      // Use a configuration with more VRAM headroom
      const lowUtilizationValidation: MemoryValidation = {
        valid: true,
        totalVramGb: 32.0,
        totalRequiredGb: 19.5,
        threshold: 0.9,
        maxAllowedGb: 28.8,
        modelRequirements: mockValidation.modelRequirements,
      }

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: mockConfig,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: lowUtilizationValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      const user = userEvent.setup()
      renderWithQuery(<ModelSettingsPanel />)

      // Make a change
      const selects = screen.getAllByRole('combobox')
      await user.click(selects[0])

      await waitFor(() => {
        const menuItems = screen.getAllByRole('option')
        expect(menuItems.length).toBeGreaterThan(0)
      })

      const qwenOption = screen.getAllByRole('option').find(
        (option) => option.textContent?.includes('qwen-2.5-vl')
      )
      expect(qwenOption).toBeDefined()
      await user.click(qwenOption!)

      // Verify reset button is enabled
      const resetButton = screen.getByRole('button', { name: /Reset/i })
      await waitFor(() => {
        expect(resetButton).not.toBeDisabled()
      })

      // Click reset
      await user.click(resetButton)

      // Verify reset button is disabled again
      await waitFor(() => {
        expect(resetButton).toBeDisabled()
      })
    })
  })

  describe('refresh functionality', () => {
    it('refetches configuration when refresh button is clicked', async () => {
      const mockRefetch = vi.fn()
      const mockRefetchValidation = vi.fn()

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: mockConfig,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: mockValidation,
        refetch: mockRefetchValidation,
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      const user = userEvent.setup()
      renderWithQuery(<ModelSettingsPanel />)

      const refreshButton = screen.getByRole('button', { name: /Refresh/i })
      await user.click(refreshButton)

      expect(mockRefetch).toHaveBeenCalled()
      expect(mockRefetchValidation).toHaveBeenCalled()
    })
  })

  describe('high VRAM scenarios', () => {
    it('handles large GPU configuration (research lab with 80GB VRAM)', () => {
      const largeGpuConfig: ModelConfig = {
        ...mockConfig,
        inference: {
          ...mockConfig.inference,
          maxMemoryPerModel: 80.0,
        },
      }

      const largeGpuValidation: MemoryValidation = {
        valid: true,
        totalVramGb: 80.0,
        totalRequiredGb: 19.5,
        threshold: 0.9,
        maxAllowedGb: 72.0,
        modelRequirements: mockValidation.modelRequirements,
      }

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: largeGpuConfig,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: largeGpuValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      renderWithQuery(<ModelSettingsPanel />)

      expect(screen.getByText(/19.5 \/ 72.0 GB/i)).toBeInTheDocument()
      expect(screen.getByText(/Total available: 80.0 GB/i)).toBeInTheDocument()
    })

    it('handles low VRAM configuration (edge device with 8GB VRAM)', () => {
      const edgeConfig: ModelConfig = {
        ...mockConfig,
        models: {
          ...mockConfig.models,
          videoSummarization: {
            selected: 'qwen-2.5-vl',
            options: mockConfig.models.videoSummarization.options,
          },
          videoTracking: {
            selected: 'yolo11n-seg',
            options: mockConfig.models.videoTracking.options,
          },
        },
      }

      const edgeValidation: MemoryValidation = {
        valid: true,
        totalVramGb: 8.0,
        totalRequiredGb: 7.0,
        threshold: 0.9,
        maxAllowedGb: 7.2,
        modelRequirements: {
          videoSummarization: { modelId: 'Qwen/Qwen2.5-VL-7B-Instruct', vramGb: 7.8, cpuCompatible: false },
          objectDetection: { modelId: 'AILab-CVC/YOLO-World', vramGb: 2.1, cpuCompatible: false },
          videoTracking: { modelId: 'ultralytics/yolo11n-seg', vramGb: 1.8, cpuCompatible: false },
        },
      }

      vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
        data: edgeConfig,
        isLoading: false,
        error: null,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
        data: edgeValidation,
        refetch: vi.fn(),
      } as any)

      vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
        mutateAsync: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: false,
      } as any)

      renderWithQuery(<ModelSettingsPanel />)

      expect(screen.getByText(/Total available: 8.0 GB/i)).toBeInTheDocument()
    })
  })
})
