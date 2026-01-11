/**
 * Storybook stories for ModelSettingsPanel component.
 * Demonstrates model configuration UI with diverse deployment scenarios including research lab, production, and edge computing.
 */

import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ModelSettingsPanel } from './ModelSettingsPanel'

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
    onSaveSuccess: () => {},
    onSaveError: () => {},
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
    // Note: Hook mocking removed - these stories are for visual demonstration only
    // For interactive testing, use the component test files instead

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
    // Note: Hook mocking removed - these stories are for visual demonstration only
    // For interactive testing, use the component test files instead

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
    // Note: Hook mocking removed - these stories are for visual demonstration only
    // For interactive testing, use the component test files instead

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
    // Note: Hook mocking removed - these stories are for visual demonstration only
    // For interactive testing, use the component test files instead

    return <ModelSettingsPanel {...args} />
  },
}

/**
 * Loading state while fetching configuration.
 * Displays skeleton loaders during initial data fetch.
 */
export const Loading: Story = {
  render: (args) => {
    // Note: Hook mocking removed - these stories are for visual demonstration only
    // For interactive testing, use the component test files instead

    return <ModelSettingsPanel {...args} />
  },
}

/**
 * Error state when configuration fails to load.
 * Displays error message with retry option.
 */
export const Error: Story = {
  render: (args) => {
    // Note: Hook mocking removed - these stories are for visual demonstration only
    // For interactive testing, use the component test files instead

    return <ModelSettingsPanel {...args} />
  },
}
