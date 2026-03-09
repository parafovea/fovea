/**
 * Tests for ModelManagementPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelManagementPage } from './ModelManagementPage'
import * as useModelConfigHooks from '@store/queries/useModelConfig'
import type { ModelConfig, MemoryValidation, ApiError } from '@api/client'

/**
 * Create a fresh QueryClient for each test.
 */
function createTestQueryClient(): QueryClient {
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
 * Mock model configuration with both CPU and GPU model options.
 */
const mockConfig: ModelConfig = {
  models: {
    video_summarization: {
      selected: 'qwen-2-5-vl-7b',
      options: [
        {
          name: 'qwen-2-5-vl-7b',
          modelId: 'Qwen/Qwen2.5-VL-7B-Instruct',
          framework: 'transformers',
          vramGb: 8,
          cpuMemoryGb: 0,
          cpuCompatible: false,
          speed: 'fast',
          description: 'GPU-optimized vision language model',
          fps: 3,
          requiresApiKey: false,
        },
        {
          name: 'qwen2-5-vl-3b-gguf',
          modelId: 'Qwen/Qwen2.5-VL-3B-Instruct-GGUF',
          framework: 'llama_cpp',
          vramGb: 0,
          cpuMemoryGb: 3,
          cpuCompatible: true,
          speed: 'slow',
          description: 'CPU-optimized vision language model',
          fps: 0.5,
          requiresApiKey: false,
        },
      ],
    },
    object_detection: {
      selected: 'yolo-world-s',
      options: [
        {
          name: 'yolo-world-s',
          modelId: 'AILab-CVC/YOLO-World-S',
          framework: 'ultralytics',
          vramGb: 2,
          cpuMemoryGb: 2,
          cpuCompatible: true,
          speed: 'fast',
          description: 'Real-time detection model',
          fps: 30,
          requiresApiKey: false,
        },
      ],
    },
  },
  inference: {
    maxMemoryPerModel: 24,
    offloadThreshold: 0.9,
    warmupOnStartup: true,
  },
  cudaAvailable: true,
  modelsAvailable: true,
  cpuModelsAvailable: true,
}

/**
 * Mock memory validation for testing.
 */
const mockValidation: MemoryValidation = {
  valid: true,
  totalVramGb: 24,
  totalRequiredGb: 10,
  threshold: 0.9,
  maxAllowedGb: 21.6,
  modelRequirements: {
    video_summarization: { modelId: 'Qwen/Qwen2.5-VL-7B-Instruct', vramGb: 8, cpuCompatible: false },
    object_detection: { modelId: 'AILab-CVC/YOLO-World-S', vramGb: 2, cpuCompatible: true },
  },
}

/**
 * Sets up all three hook mocks with sensible defaults and optional overrides.
 *
 * @param overrides - partial return values for each hook
 */
function setupMocks(overrides?: {
  config?: Partial<ReturnType<typeof useModelConfigHooks.useModelConfig>>
  validation?: Partial<ReturnType<typeof useModelConfigHooks.useMemoryValidation>>
  selectModel?: Partial<ReturnType<typeof useModelConfigHooks.useSelectModel>>
}): void {
  vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
    data: mockConfig,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...overrides?.config,
  } as any)

  vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
    data: mockValidation,
    refetch: vi.fn(),
    ...overrides?.validation,
  } as any)

  vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    ...overrides?.selectModel,
  } as any)
}

describe('ModelManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('displays loading skeleton while fetching configuration', () => {
      setupMocks({
        config: { data: undefined, isLoading: true },
      })

      renderWithQuery(<ModelManagementPage />)

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

      setupMocks({
        config: { data: undefined, isLoading: false, error: mockError },
      })

      renderWithQuery(<ModelManagementPage />)

      expect(screen.getByText(/Failed to load model configuration/i)).toBeInTheDocument()
      expect(screen.getByText(/Network error occurred/i)).toBeInTheDocument()
    })
  })

  describe('no config state', () => {
    it('displays info alert when no configuration available', () => {
      setupMocks({
        config: { data: undefined, isLoading: false, error: null },
      })

      renderWithQuery(<ModelManagementPage />)

      expect(screen.getByText(/No model configuration available/i)).toBeInTheDocument()
    })
  })

  describe('device toggle', () => {
    it('defaults device to gpu when cudaAvailable is true', () => {
      setupMocks()

      renderWithQuery(<ModelManagementPage />)

      // The GPU toggle buttons should be selected (aria-pressed="true")
      const gpuButtons = screen.getAllByRole('button', { name: /GPU/i })
      // The first GPU button (for video_summarization) should be pressed
      expect(gpuButtons[0]).toHaveAttribute('aria-pressed', 'true')
    })

    it('defaults device to cpu when cudaAvailable is false', () => {
      const cpuConfig: ModelConfig = { ...mockConfig, cudaAvailable: false }

      setupMocks({
        config: { data: cpuConfig },
      })

      renderWithQuery(<ModelManagementPage />)

      const cpuButtons = screen.getAllByRole('button', { name: /CPU/i })
      expect(cpuButtons[0]).toHaveAttribute('aria-pressed', 'true')
    })

    it('disables GPU toggle button when CUDA is not available', () => {
      const cpuConfig: ModelConfig = { ...mockConfig, cudaAvailable: false }

      setupMocks({
        config: { data: cpuConfig },
      })

      renderWithQuery(<ModelManagementPage />)

      const gpuButtons = screen.getAllByRole('button', { name: /GPU/i })
      expect(gpuButtons[0]).toBeDisabled()
    })
  })

  describe('device toggle filtering', () => {
    it('filters models to CPU-compatible when CPU device selected', async () => {
      setupMocks()

      renderWithQuery(<ModelManagementPage />)

      // Switch video_summarization to CPU
      const cpuButtons = screen.getAllByRole('button', { name: /CPU/i })
      fireEvent.click(cpuButtons[0])

      // Open the video_summarization model select dropdown
      const selects = screen.getAllByRole('combobox')
      fireEvent.mouseDown(selects[0])

      await waitFor(() => {
        const menuItems = screen.getAllByRole('option')
        expect(menuItems.length).toBeGreaterThan(0)
      })

      const options = screen.getAllByRole('option')
      // Only the CPU-compatible model should appear
      const optionTexts = options.map((opt) => opt.textContent)
      expect(optionTexts.some((t) => t?.includes('qwen2-5-vl-3b-gguf'))).toBe(true)
      expect(optionTexts.some((t) => t?.includes('qwen-2-5-vl-7b'))).toBe(false)
    })
  })

  describe('auto-selection on device switch', () => {
    it('auto-selects first compatible model when switching device', async () => {
      setupMocks()

      renderWithQuery(<ModelManagementPage />)

      // Initially on GPU with qwen-2-5-vl-7b selected
      // Switch video_summarization to CPU
      const cpuButtons = screen.getAllByRole('button', { name: /CPU/i })
      fireEvent.click(cpuButtons[0])

      // The select value should change to the CPU-compatible model
      await waitFor(() => {
        const selects = screen.getAllByRole('combobox')
        expect(selects[0]).toHaveTextContent('qwen2-5-vl-3b-gguf')
      })
    })
  })

  describe('save functionality', () => {
    it('calls selectModel mutation for changed selections', async () => {
      const mockMutateAsync = vi.fn().mockResolvedValue({})

      setupMocks({
        selectModel: { mutateAsync: mockMutateAsync },
      })

      renderWithQuery(<ModelManagementPage />)

      // Switch video_summarization to CPU (auto-selects CPU-compatible model)
      const cpuButtons = screen.getAllByRole('button', { name: /CPU/i })
      fireEvent.click(cpuButtons[0])

      // Wait for save button to be enabled
      const saveButton = screen.getByRole('button', { name: /Save Configuration/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })

      fireEvent.click(saveButton)

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalledWith({
          taskType: 'video_summarization',
          modelName: 'qwen2-5-vl-3b-gguf',
        })
      })
    })

    it('disables save button when no changes made', () => {
      setupMocks()

      renderWithQuery(<ModelManagementPage />)

      const saveButton = screen.getByRole('button', { name: /Save Configuration/i })
      expect(saveButton).toBeDisabled()
    })
  })

  describe('reset', () => {
    it('resets selections to saved config on reset click', async () => {
      setupMocks()

      renderWithQuery(<ModelManagementPage />)

      // Switch video_summarization to CPU (changes selection)
      const cpuButtons = screen.getAllByRole('button', { name: /CPU/i })
      fireEvent.click(cpuButtons[0])

      // Reset button should be enabled
      const resetButton = screen.getByRole('button', { name: /Reset/i })
      await waitFor(() => {
        expect(resetButton).not.toBeDisabled()
      })

      // Click reset
      fireEvent.click(resetButton)

      // Reset button should be disabled again (no changes)
      await waitFor(() => {
        expect(resetButton).toBeDisabled()
      })

      // GPU should be re-selected for video_summarization
      const gpuButtons = screen.getAllByRole('button', { name: /GPU/i })
      expect(gpuButtons[0]).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('CPU-only mode', () => {
    it('shows CPU mode info alert when no CUDA available', () => {
      const cpuConfig: ModelConfig = {
        ...mockConfig,
        cudaAvailable: false,
        cpuModelsAvailable: true,
      }

      setupMocks({
        config: { data: cpuConfig },
      })

      renderWithQuery(<ModelManagementPage />)

      expect(screen.getByText('CPU Mode')).toBeInTheDocument()
    })
  })

  describe('no models', () => {
    it('shows error alert when no models available', () => {
      const noModelsConfig: ModelConfig = {
        ...mockConfig,
        cudaAvailable: false,
        cpuModelsAvailable: false,
      }

      setupMocks({
        config: { data: noModelsConfig },
      })

      renderWithQuery(<ModelManagementPage />)

      expect(screen.getByText('No AI Models Available')).toBeInTheDocument()
    })
  })

  describe('VRAM budget', () => {
    it('shows VRAM budget when GPU tasks exist', () => {
      setupMocks()

      renderWithQuery(<ModelManagementPage />)

      expect(screen.getByText(/VRAM Budget/i)).toBeInTheDocument()
    })
  })
})
