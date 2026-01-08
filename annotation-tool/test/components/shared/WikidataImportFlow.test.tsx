import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WikidataImportFlow from '../../../src/components/shared/WikidataImportFlow'

// Mock WikidataSearch component
vi.mock('../../../src/components/WikidataSearch', () => ({
  default: ({ onImport }: { onImport: (data: any) => void }) => (
    <div data-testid="wikidata-search">
      <button
        onClick={() =>
          onImport({
            name: 'Test Entity',
            description: 'Test Description',
            wikidataId: 'Q12345',
            wikidataUrl: 'https://www.wikidata.org/wiki/Q12345',
            aliases: ['Alias1', 'Alias2'],
          })
        }
      >
        Select Test Item
      </button>
    </div>
  ),
}))

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
})

const renderWithProviders = (ui: React.ReactElement) => {
  const queryClient = createQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

describe('WikidataImportFlow', () => {
  it('renders search step initially', () => {
    renderWithProviders(
      <WikidataImportFlow
        type="entity-type"
        personaId="test-persona-id"
        entityType="type"
      />
    )

    expect(screen.getByText('Search Wikidata')).toBeInTheDocument()
    expect(screen.getByTestId('wikidata-search')).toBeInTheDocument()
  })

  it('imports immediately when item selected (one-click)', async () => {
    const onCancel = vi.fn()
    renderWithProviders(
      <WikidataImportFlow
        type="entity-type"
        personaId="test-persona-id"
        entityType="type"
        onCancel={onCancel}
      />
    )

    // Select an item from search
    fireEvent.click(screen.getByText('Select Test Item'))

    // Should call onCancel to close dialog after successful import
    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled()
    })
  })

  it('calls onSuccess callback after import', async () => {
    const onSuccess = vi.fn()

    renderWithProviders(
      <WikidataImportFlow
        type="entity-type"
        personaId="test-persona-id"
        entityType="type"
        onSuccess={onSuccess}
      />
    )

    // Select item - should import immediately
    fireEvent.click(screen.getByText('Select Test Item'))

    await waitFor(() => {
      expect(screen.getByText('Successfully Imported!')).toBeInTheDocument()
    })

    expect(onSuccess).toHaveBeenCalledWith(expect.any(String))
  })

  it('calls onCancel when done is clicked from success step', async () => {
    const onCancel = vi.fn()

    renderWithProviders(
      <WikidataImportFlow
        type="entity-type"
        personaId="test-persona-id"
        entityType="type"
        onCancel={onCancel}
      />
    )

    // Select item - imports immediately
    fireEvent.click(screen.getByText('Select Test Item'))

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    // Click done
    fireEvent.click(screen.getByText('Done'))

    expect(onCancel).toHaveBeenCalled()
  })

  it('shows undo button in success step after one-click import', async () => {
    renderWithProviders(
      <WikidataImportFlow
        type="entity-type"
        personaId="test-persona-id"
        entityType="type"
      />
    )

    // Select and import - happens immediately
    fireEvent.click(screen.getByText('Select Test Item'))

    await waitFor(() => {
      expect(screen.getByText('Undo')).toBeInTheDocument()
    })
  })

  it('renders stepper with correct steps', () => {
    renderWithProviders(
      <WikidataImportFlow
        type="entity-type"
        personaId="test-persona-id"
        entityType="type"
      />
    )

    expect(screen.getByText('Search Wikidata')).toBeInTheDocument()
    expect(screen.getByText('Preview & Confirm')).toBeInTheDocument()
    expect(screen.getByText('Success')).toBeInTheDocument()
  })
})
