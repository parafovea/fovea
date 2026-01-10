import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ImportDataDialog from './ImportDataDialog'

// Mock API
vi.mock('../services/api', () => ({
  api: {
    previewImport: vi.fn(),
    uploadImportFile: vi.fn(),
    getImportHistory: vi.fn(),
  },
}))

// Create QueryClient for tests
const createQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
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
    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ImportDataDialog
          open={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      </QueryClientProvider>
    )

    expect(screen.getByText('Import Data')).toBeInTheDocument()
    expect(screen.getByText(/drag and drop/i)).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    const queryClient = createQueryClient()

    render(
      <QueryClientProvider client={queryClient}>
        <ImportDataDialog
          open={false}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      </QueryClientProvider>
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
