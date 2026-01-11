/**
 * Storybook stories for ModelStatusDashboard component.
 */

import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelStatusDashboard } from './ModelStatusDashboard'

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

const meta: Meta<typeof ModelStatusDashboard> = {
  title: 'Model Management/ModelStatusDashboard',
  component: ModelStatusDashboard,
  decorators: [StoryDecorator],
  parameters: {
    layout: 'padded',
  },
  args: {
    onUnloadModel: () => {},
  },
}

export default meta
type Story = StoryObj<typeof ModelStatusDashboard>

/**
 * Story: No models loaded (idle system).
 */
export const NoModelsLoaded: Story = {
  name: 'No Models Loaded',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}

/**
 * Story: Single model loaded and active.
 */
export const SingleModelActive: Story = {
  name: 'Single Model Active',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}

/**
 * Story: Research lab with multiple models loaded.
 */
export const ResearchLabMultipleModels: Story = {
  name: 'Research Lab - Multiple Models',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}

/**
 * Story: Production system with high utilization.
 */
export const ProductionHighUtilization: Story = {
  name: 'Production - High Utilization',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}

/**
 * Story: Memory pressure (over budget).
 */
export const MemoryPressure: Story = {
  name: 'Memory Pressure - Over Budget',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}

/**
 * Story: Model loading state.
 */
export const ModelLoading: Story = {
  name: 'Model Loading',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}

/**
 * Story: Model failed to load.
 */
export const ModelFailed: Story = {
  name: 'Model Failed',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}

/**
 * Story: Mixed health states.
 */
export const MixedHealthStates: Story = {
  name: 'Mixed Health States',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}

/**
 * Story: Edge computing scenario (limited VRAM).
 */
export const EdgeComputingLimitedVRAM: Story = {
  name: 'Edge Computing - Limited VRAM',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}

/**
 * Story: Loading state.
 */
export const Loading: Story = {
  name: 'Loading',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}

/**
 * Story: Error state.
 */
export const Error: Story = {
  name: 'Error',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}

/**
 * Story: Model warming up.
 */
export const ModelWarmingUp: Story = {
  name: 'Model Warming Up',
  // Note: Hook mocking removed - these stories are for visual demonstration only
  // For interactive testing, use the component test files instead
}
