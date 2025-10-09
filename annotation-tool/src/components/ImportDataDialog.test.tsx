import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import ImportDataDialog from './ImportDataDialog'
import { api } from '../services/api'

// Mock API
vi.mock('../services/api', () => ({
  api: {
    previewImport: vi.fn(),
    uploadImportFile: vi.fn(),
    getImportHistory: vi.fn(),
  },
}))

// Create mock store
const createMockStore = () => {
  return configureStore({
    reducer: {
      persona: () => ({ personas: [], personaOntologies: [] }),
      world: () => ({ entities: [], events: [], times: [], entityCollections: [], eventCollections: [], timeCollections: [], relations: [] }),
      videos: () => ({ videos: [] }),
    },
  })
}

describe('ImportDataDialog', () => {
  const mockOnClose = vi.fn()
  const mockOnImportComplete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders when open', () => {
    const store = createMockStore()

    render(
      <Provider store={store}>
        <ImportDataDialog
          open={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      </Provider>
    )

    expect(screen.getByText('Import Data')).toBeInTheDocument()
    expect(screen.getByText(/drag and drop/i)).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    const store = createMockStore()

    render(
      <Provider store={store}>
        <ImportDataDialog
          open={false}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      </Provider>
    )

    expect(screen.queryByText('Import Data')).not.toBeInTheDocument()
  })

  // TODO: Add test for file upload
  // TODO: Add test for drag-and-drop
  // TODO: Add test for preview loading
  // TODO: Add test for conflict resolution UI
  // TODO: Add test for import execution
  // TODO: Add test for error handling
  // TODO: Add test for validation options
})
