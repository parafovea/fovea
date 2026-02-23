import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EntityEditor from './EntityEditor'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock the hooks
vi.mock('@store/queries', () => ({
  usePersonas: () => ({ data: [{ id: 'p1', name: 'Test Persona' }] }),
  useAllPersonaOntologies: () => ({ data: [] }),
  useAddEntity: () => ({ mutate: vi.fn() }),
  useUpdateEntity: () => ({ mutate: vi.fn() }),
  useDeleteEntity: () => ({ mutate: vi.fn() }),
  // GlossEditor dependencies
  usePersonaOntology: () => ({ data: null }),
  useWorld: () => ({ data: { entities: [], entityTypes: [] } }),
  useAnnotations: () => ({ data: [] }),
}))

vi.mock('@store/zustand/annotationUiStore', () => ({
  useAnnotationUiStore: () => 'p1',
}))

// Create a wrapper with QueryClientProvider
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('EntityEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Alternate Names Input', () => {
    it('preserves trailing comma while typing alternate names', async () => {
      const user = userEvent.setup()
      render(
        <EntityEditor open={true} onClose={vi.fn()} entity={null} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByLabelText(/alternate names/i)
      await user.type(input, 'John,')

      expect(input).toHaveValue('John,')
    })

    it('allows typing multiple names with commas', async () => {
      const user = userEvent.setup()
      render(
        <EntityEditor open={true} onClose={vi.fn()} entity={null} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByLabelText(/alternate names/i)
      await user.type(input, 'John, Jane, Bob')

      expect(input).toHaveValue('John, Jane, Bob')
    })

    it('preserves comma at end when user is still typing', async () => {
      const user = userEvent.setup()
      render(
        <EntityEditor open={true} onClose={vi.fn()} entity={null} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByLabelText(/alternate names/i)
      await user.type(input, 'John, ')

      expect(input).toHaveValue('John, ')
    })

    it('loads existing alternate names as comma-separated string', async () => {
      const entity = {
        id: '1',
        name: 'Test Entity',
        description: [{ type: 'text' as const, content: 'desc' }],
        typeAssignments: [],
        metadata: {
          alternateNames: ['John', 'Johnny', 'J'],
          externalIds: {},
          properties: {},
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      render(
        <EntityEditor open={true} onClose={vi.fn()} entity={entity} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByLabelText(/alternate names/i)
      expect(input).toHaveValue('John, Johnny, J')
    })

    it('handles empty alternate names gracefully', async () => {
      const entity = {
        id: '1',
        name: 'Test Entity',
        description: [{ type: 'text' as const, content: 'desc' }],
        typeAssignments: [],
        metadata: {
          alternateNames: [],
          externalIds: {},
          properties: {},
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      render(
        <EntityEditor open={true} onClose={vi.fn()} entity={entity} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByLabelText(/alternate names/i)
      expect(input).toHaveValue('')
    })

    it('handles undefined metadata.alternateNames gracefully', async () => {
      const entity = {
        id: '1',
        name: 'Test Entity',
        description: [{ type: 'text' as const, content: 'desc' }],
        typeAssignments: [],
        metadata: {
          externalIds: {},
          properties: {},
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      render(
        <EntityEditor open={true} onClose={vi.fn()} entity={entity} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByLabelText(/alternate names/i)
      expect(input).toHaveValue('')
    })
  })
})
