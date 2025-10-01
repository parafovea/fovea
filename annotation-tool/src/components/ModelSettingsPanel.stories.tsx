/**
 * Storybook stories for ModelSettingsPanel component.
 * Demonstrates model configuration UI with diverse deployment scenarios including research lab, production, and edge computing.
 */

import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fn } from '@storybook/test'
import { ModelSettingsPanel } from './ModelSettingsPanel'
import * as useModelConfigHooks from '../hooks/useModelConfig'
import type { ModelConfig, MemoryValidation } from '../api/client'

/**
 * Create mock QueryClient for stories.
 */
function createMockQueryClient() {
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
 * Wrapper component that provides QueryClient.
 */
function StoryWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createMockQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

const meta: Meta<typeof ModelSettingsPanel> = {
  title: 'Model Configuration/ModelSettingsPanel',
  component: ModelSettingsPanel,
  decorators: [
    (Story) => (
      <StoryWrapper>
        <Story />
      </StoryWrapper>
    ),
  ],
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  args: {
    onSaveSuccess: fn(),
    onSaveError: fn(),
  },
}

export default meta
type Story = StoryObj<typeof ModelSettingsPanel>

/**
 * Research lab scenario with 80GB GPU.
 * Academic research lab with high-end GPU for model experimentation.
 * Configuration uses larger models with optimal VRAM allocation.
 */
export const ResearchLabLarge: Story = {
  render: (args) => {
    const mockConfig: ModelConfig = {
      models: {
        video_summarization: {
          selected: 'llama-4-maverick',
          options: {
            'llama-4-maverick': {
              model_id: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
              framework: 'transformers',
              vram_gb: 11.2,
              speed: 'fast',
              description: 'Fast VLM with strong reasoning capabilities',
              fps: 2.5,
            },
            'qwen-2.5-vl': {
              model_id: 'Qwen/Qwen2.5-VL-7B-Instruct',
              framework: 'transformers',
              vram_gb: 7.8,
              speed: 'fast',
              description: 'Efficient VLM with multilingual support',
              fps: 3.2,
            },
            'pixtral-12b': {
              model_id: 'mistralai/Pixtral-12B-2409',
              framework: 'transformers',
              vram_gb: 13.5,
              speed: 'moderate',
              description: 'High-accuracy vision-language model',
              fps: 1.8,
            },
          },
        },
        object_detection: {
          selected: 'florence-2',
          options: {
            'yolo-world': {
              model_id: 'AILab-CVC/YOLO-World',
              framework: 'transformers',
              vram_gb: 2.1,
              speed: 'fast',
              description: 'Real-time open-vocabulary object detection',
              fps: 25.0,
            },
            'owlv2-large': {
              model_id: 'google/owlv2-large-patch14-ensemble',
              framework: 'transformers',
              vram_gb: 4.5,
              speed: 'moderate',
              description: 'High-accuracy open-vocabulary detection',
              fps: 8.0,
            },
            'florence-2': {
              model_id: 'microsoft/Florence-2-large',
              framework: 'transformers',
              vram_gb: 3.8,
              speed: 'moderate',
              description: 'Multi-task vision model with strong detection',
              fps: 12.0,
            },
          },
        },
        video_tracking: {
          selected: 'samurai',
          options: {
            samurai: {
              model_id: 'yangchris11/samurai',
              framework: 'transformers',
              vram_gb: 6.2,
              speed: 'moderate',
              description: 'State-of-the-art video object segmentation and tracking',
              fps: 5.0,
            },
            'sam2-long': {
              model_id: 'facebook/sam2-long',
              framework: 'transformers',
              vram_gb: 8.5,
              speed: 'slow',
              description: 'Optimized for long video sequences',
              fps: 3.0,
            },
            'yolo11n-seg': {
              model_id: 'ultralytics/yolo11n-seg',
              framework: 'ultralytics',
              vram_gb: 1.8,
              speed: 'fast',
              description: 'Lightweight segmentation and tracking',
              fps: 30.0,
            },
          },
        },
      },
      inference: {
        max_memory_per_model: 80.0,
        offload_threshold: 0.9,
        warmup_on_startup: true,
      },
    }

    const mockValidation: MemoryValidation = {
      valid: true,
      total_vram_gb: 80.0,
      total_required_gb: 21.2,
      threshold: 0.9,
      max_allowed_gb: 72.0,
      model_requirements: {
        video_summarization: {
          model_id: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
          vram_gb: 11.2,
        },
        object_detection: {
          model_id: 'microsoft/Florence-2-large',
          vram_gb: 3.8,
        },
        video_tracking: {
          model_id: 'yangchris11/samurai',
          vram_gb: 6.2,
        },
      },
    }

    vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
      data: mockConfig,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
      data: mockValidation,
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
      mutateAsync: fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as any)

    return <ModelSettingsPanel {...args} />
  },
}

/**
 * Production deployment scenario with 24GB GPU.
 * Production server with RTX 3090/4090 running balanced model configuration.
 * VRAM usage is approaching threshold with warning indicator.
 */
export const ProductionBalanced: Story = {
  render: (args) => {
    const mockConfig: ModelConfig = {
      models: {
        video_summarization: {
          selected: 'llama-4-maverick',
          options: {
            'llama-4-maverick': {
              model_id: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
              framework: 'transformers',
              vram_gb: 11.2,
              speed: 'fast',
              description: 'Fast VLM with strong reasoning capabilities',
              fps: 2.5,
            },
            'qwen-2.5-vl': {
              model_id: 'Qwen/Qwen2.5-VL-7B-Instruct',
              framework: 'transformers',
              vram_gb: 7.8,
              speed: 'fast',
              description: 'Efficient VLM with multilingual support',
              fps: 3.2,
            },
          },
        },
        object_detection: {
          selected: 'owlv2-large',
          options: {
            'yolo-world': {
              model_id: 'AILab-CVC/YOLO-World',
              framework: 'transformers',
              vram_gb: 2.1,
              speed: 'fast',
              description: 'Real-time open-vocabulary object detection',
              fps: 25.0,
            },
            'owlv2-large': {
              model_id: 'google/owlv2-large-patch14-ensemble',
              framework: 'transformers',
              vram_gb: 4.5,
              speed: 'moderate',
              description: 'High-accuracy open-vocabulary detection',
              fps: 8.0,
            },
          },
        },
        video_tracking: {
          selected: 'samurai',
          options: {
            samurai: {
              model_id: 'yangchris11/samurai',
              framework: 'transformers',
              vram_gb: 6.2,
              speed: 'moderate',
              description: 'State-of-the-art video object segmentation and tracking',
              fps: 5.0,
            },
            'yolo11n-seg': {
              model_id: 'ultralytics/yolo11n-seg',
              framework: 'ultralytics',
              vram_gb: 1.8,
              speed: 'fast',
              description: 'Lightweight segmentation and tracking',
              fps: 30.0,
            },
          },
        },
      },
      inference: {
        max_memory_per_model: 24.0,
        offload_threshold: 0.9,
        warmup_on_startup: true,
      },
    }

    const mockValidation: MemoryValidation = {
      valid: true,
      total_vram_gb: 24.0,
      total_required_gb: 21.9,
      threshold: 0.9,
      max_allowed_gb: 21.6,
      model_requirements: {
        video_summarization: {
          model_id: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
          vram_gb: 11.2,
        },
        object_detection: {
          model_id: 'google/owlv2-large-patch14-ensemble',
          vram_gb: 4.5,
        },
        video_tracking: {
          model_id: 'yangchris11/samurai',
          vram_gb: 6.2,
        },
      },
    }

    vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
      data: mockConfig,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
      data: mockValidation,
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
      mutateAsync: fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as any)

    return <ModelSettingsPanel {...args} />
  },
}

/**
 * Edge computing scenario with 8GB GPU.
 * Edge device with limited VRAM running lightweight models.
 * Configuration is optimized for resource-constrained environments.
 */
export const EdgeComputingOptimized: Story = {
  render: (args) => {
    const mockConfig: ModelConfig = {
      models: {
        video_summarization: {
          selected: 'qwen-2.5-vl',
          options: {
            'llama-4-maverick': {
              model_id: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
              framework: 'transformers',
              vram_gb: 11.2,
              speed: 'fast',
              description: 'Fast VLM with strong reasoning capabilities',
              fps: 2.5,
            },
            'qwen-2.5-vl': {
              model_id: 'Qwen/Qwen2.5-VL-7B-Instruct',
              framework: 'transformers',
              vram_gb: 4.2,
              speed: 'fast',
              description: 'Efficient VLM with multilingual support (4-bit quantized)',
              fps: 3.2,
            },
          },
        },
        object_detection: {
          selected: 'yolo-world',
          options: {
            'yolo-world': {
              model_id: 'AILab-CVC/YOLO-World',
              framework: 'transformers',
              vram_gb: 2.1,
              speed: 'fast',
              description: 'Real-time open-vocabulary object detection',
              fps: 25.0,
            },
            'owlv2-base': {
              model_id: 'google/owlv2-base-patch16-ensemble',
              framework: 'transformers',
              vram_gb: 2.8,
              speed: 'fast',
              description: 'Lightweight open-vocabulary detection',
              fps: 15.0,
            },
          },
        },
        video_tracking: {
          selected: 'yolo11n-seg',
          options: {
            'yolo11n-seg': {
              model_id: 'ultralytics/yolo11n-seg',
              framework: 'ultralytics',
              vram_gb: 1.8,
              speed: 'fast',
              description: 'Lightweight segmentation and tracking',
              fps: 30.0,
            },
            samurai: {
              model_id: 'yangchris11/samurai',
              framework: 'transformers',
              vram_gb: 6.2,
              speed: 'moderate',
              description: 'State-of-the-art video object segmentation and tracking',
              fps: 5.0,
            },
          },
        },
      },
      inference: {
        max_memory_per_model: 8.0,
        offload_threshold: 0.9,
        warmup_on_startup: false,
      },
    }

    const mockValidation: MemoryValidation = {
      valid: true,
      total_vram_gb: 8.0,
      total_required_gb: 8.1,
      threshold: 0.9,
      max_allowed_gb: 7.2,
      model_requirements: {
        video_summarization: {
          model_id: 'Qwen/Qwen2.5-VL-7B-Instruct',
          vram_gb: 4.2,
        },
        object_detection: {
          model_id: 'AILab-CVC/YOLO-World',
          vram_gb: 2.1,
        },
        video_tracking: {
          model_id: 'ultralytics/yolo11n-seg',
          vram_gb: 1.8,
        },
      },
    }

    vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
      data: mockConfig,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
      data: mockValidation,
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
      mutateAsync: fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as any)

    return <ModelSettingsPanel {...args} />
  },
}

/**
 * Over budget scenario with error state.
 * Configuration exceeds available VRAM budget with error indicator.
 * Save button is disabled until configuration is fixed.
 */
export const OverBudgetError: Story = {
  render: (args) => {
    const mockConfig: ModelConfig = {
      models: {
        video_summarization: {
          selected: 'pixtral-12b',
          options: {
            'llama-4-maverick': {
              model_id: 'meta-llama/Llama-3.2-11B-Vision-Instruct',
              framework: 'transformers',
              vram_gb: 11.2,
              speed: 'fast',
              description: 'Fast VLM with strong reasoning capabilities',
              fps: 2.5,
            },
            'pixtral-12b': {
              model_id: 'mistralai/Pixtral-12B-2409',
              framework: 'transformers',
              vram_gb: 13.5,
              speed: 'moderate',
              description: 'High-accuracy vision-language model',
              fps: 1.8,
            },
          },
        },
        object_detection: {
          selected: 'owlv2-large',
          options: {
            'yolo-world': {
              model_id: 'AILab-CVC/YOLO-World',
              framework: 'transformers',
              vram_gb: 2.1,
              speed: 'fast',
              description: 'Real-time open-vocabulary object detection',
              fps: 25.0,
            },
            'owlv2-large': {
              model_id: 'google/owlv2-large-patch14-ensemble',
              framework: 'transformers',
              vram_gb: 4.5,
              speed: 'moderate',
              description: 'High-accuracy open-vocabulary detection',
              fps: 8.0,
            },
          },
        },
        video_tracking: {
          selected: 'sam2-long',
          options: {
            'sam2-long': {
              model_id: 'facebook/sam2-long',
              framework: 'transformers',
              vram_gb: 8.5,
              speed: 'slow',
              description: 'Optimized for long video sequences',
              fps: 3.0,
            },
            'yolo11n-seg': {
              model_id: 'ultralytics/yolo11n-seg',
              framework: 'ultralytics',
              vram_gb: 1.8,
              speed: 'fast',
              description: 'Lightweight segmentation and tracking',
              fps: 30.0,
            },
          },
        },
      },
      inference: {
        max_memory_per_model: 16.0,
        offload_threshold: 0.9,
        warmup_on_startup: true,
      },
    }

    const mockValidation: MemoryValidation = {
      valid: false,
      total_vram_gb: 16.0,
      total_required_gb: 26.5,
      threshold: 0.9,
      max_allowed_gb: 14.4,
      model_requirements: {
        video_summarization: {
          model_id: 'mistralai/Pixtral-12B-2409',
          vram_gb: 13.5,
        },
        object_detection: {
          model_id: 'google/owlv2-large-patch14-ensemble',
          vram_gb: 4.5,
        },
        video_tracking: {
          model_id: 'facebook/sam2-long',
          vram_gb: 8.5,
        },
      },
    }

    vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
      data: mockConfig,
      isLoading: false,
      error: null,
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
      data: mockValidation,
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
      mutateAsync: fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as any)

    return <ModelSettingsPanel {...args} />
  },
}

/**
 * Loading state while fetching configuration.
 * Displays skeleton loaders during initial data fetch.
 */
export const Loading: Story = {
  render: (args) => {
    vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
      data: undefined,
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
      mutateAsync: fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as any)

    return <ModelSettingsPanel {...args} />
  },
}

/**
 * Error state when configuration fails to load.
 * Displays error message with retry option.
 */
export const Error: Story = {
  render: (args) => {
    vi.spyOn(useModelConfigHooks, 'useModelConfig').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: {
        message: 'Failed to connect to model service',
        statusCode: 500,
      },
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useMemoryValidation').mockReturnValue({
      data: undefined,
      refetch: fn(),
    } as any)

    vi.spyOn(useModelConfigHooks, 'useSelectModel').mockReturnValue({
      mutateAsync: fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    } as any)

    return <ModelSettingsPanel {...args} />
  },
}
