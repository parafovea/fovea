import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import WikidataImportFlow from '../../../src/components/shared/WikidataImportFlow'
import personaSlice from '../../../src/store/personaSlice'
import worldSlice from '../../../src/store/worldSlice'

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

const createMockStore = () => {
  return configureStore({
    reducer: {
      persona: personaSlice,
      world: worldSlice,
    },
    preloadedState: {
      persona: {
        personas: [],
        personaOntologies: [],
        activePersonaId: 'test-persona-id',
        isLoading: false,
        error: null,
        unsavedChanges: false,
      },
      world: {
        entities: [],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: [],
        selectedEntity: null,
        selectedEvent: null,
        selectedTime: null,
        selectedLocation: null,
        selectedCollection: null,
        isLoading: false,
        error: null,
      },
    },
  })
}

describe('WikidataImportFlow', () => {
  it('renders search step initially', () => {
    const store = createMockStore()
    render(
      <Provider store={store}>
        <WikidataImportFlow
          type="entity-type"
          personaId="test-persona-id"
          entityType="type"
        />
      </Provider>
    )

    expect(screen.getByText('Search Wikidata')).toBeInTheDocument()
    expect(screen.getByTestId('wikidata-search')).toBeInTheDocument()
  })

  it('advances to preview step when item selected', async () => {
    const store = createMockStore()
    render(
      <Provider store={store}>
        <WikidataImportFlow
          type="entity-type"
          personaId="test-persona-id"
          entityType="type"
        />
      </Provider>
    )

    // Select an item from search
    fireEvent.click(screen.getByText('Select Test Item'))

    await waitFor(() => {
      expect(screen.getByText('Preview & Confirm')).toBeInTheDocument()
    })

    expect(screen.getByText('Test Entity')).toBeInTheDocument()
    expect(screen.getByText('Test Description')).toBeInTheDocument()
    expect(screen.getByText('Q12345')).toBeInTheDocument()
  })

  it('shows aliases in preview', async () => {
    const store = createMockStore()
    render(
      <Provider store={store}>
        <WikidataImportFlow
          type="entity-type"
          personaId="test-persona-id"
          entityType="type"
        />
      </Provider>
    )

    // Select an item from search
    fireEvent.click(screen.getByText('Select Test Item'))

    await waitFor(() => {
      expect(screen.getByText('Alias1')).toBeInTheDocument()
      expect(screen.getByText('Alias2')).toBeInTheDocument()
    })
  })

  it('imports item and shows success step', async () => {
    const store = createMockStore()
    const onSuccess = vi.fn()

    render(
      <Provider store={store}>
        <WikidataImportFlow
          type="entity-type"
          personaId="test-persona-id"
          entityType="type"
          onSuccess={onSuccess}
        />
      </Provider>
    )

    // Select item
    fireEvent.click(screen.getByText('Select Test Item'))

    await waitFor(() => {
      expect(screen.getByText('Import and Save')).toBeInTheDocument()
    })

    // Click import
    fireEvent.click(screen.getByText('Import and Save'))

    await waitFor(() => {
      expect(screen.getByText('Successfully Imported!')).toBeInTheDocument()
    })

    expect(onSuccess).toHaveBeenCalledWith(expect.any(String))
  })

  it('calls onCancel when cancel is clicked', async () => {
    const store = createMockStore()
    const onCancel = vi.fn()

    render(
      <Provider store={store}>
        <WikidataImportFlow
          type="entity-type"
          personaId="test-persona-id"
          entityType="type"
          onCancel={onCancel}
        />
      </Provider>
    )

    // Select item to get to preview step
    fireEvent.click(screen.getByText('Select Test Item'))

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    // Click cancel
    fireEvent.click(screen.getByText('Cancel'))

    expect(onCancel).toHaveBeenCalled()
  })

  it('allows going back from preview step', async () => {
    const store = createMockStore()

    render(
      <Provider store={store}>
        <WikidataImportFlow
          type="entity-type"
          personaId="test-persona-id"
          entityType="type"
        />
      </Provider>
    )

    // Select item
    fireEvent.click(screen.getByText('Select Test Item'))

    await waitFor(() => {
      expect(screen.getByText('Back')).toBeInTheDocument()
    })

    // Click back
    fireEvent.click(screen.getByText('Back'))

    await waitFor(() => {
      expect(screen.getByTestId('wikidata-search')).toBeInTheDocument()
    })
  })

  it('shows undo button in success step', async () => {
    const store = createMockStore()

    render(
      <Provider store={store}>
        <WikidataImportFlow
          type="entity-type"
          personaId="test-persona-id"
          entityType="type"
        />
      </Provider>
    )

    // Select and import
    fireEvent.click(screen.getByText('Select Test Item'))

    await waitFor(() => {
      expect(screen.getByText('Import and Save')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Import and Save'))

    await waitFor(() => {
      expect(screen.getByText('Undo')).toBeInTheDocument()
    })
  })

  it('renders stepper with correct steps', () => {
    const store = createMockStore()
    render(
      <Provider store={store}>
        <WikidataImportFlow
          type="entity-type"
          personaId="test-persona-id"
          entityType="type"
        />
      </Provider>
    )

    expect(screen.getByText('Search Wikidata')).toBeInTheDocument()
    expect(screen.getByText('Preview & Confirm')).toBeInTheDocument()
    expect(screen.getByText('Success')).toBeInTheDocument()
  })
})
