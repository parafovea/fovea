import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ImportDataDialog } from './ImportDataDialog'
import { api } from '@services/api'

// Mock API. The path that ImportDataDialog imports from is `@services/api`
// (resolved by the vite-tsconfig-paths plugin), so we mock that exact
// specifier rather than the relative path.
vi.mock('@services/api', () => ({
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

  function renderDialog() {
    const queryClient = createQueryClient()
    return render(
      <QueryClientProvider client={queryClient}>
        <ImportDataDialog
          open={true}
          onClose={mockOnClose}
          onImportComplete={mockOnImportComplete}
        />
      </QueryClientProvider>,
    )
  }

  function makeFile(name: string, body: string): File {
    return new File([body], name, { type: 'application/x-ndjson' })
  }

  function makePreview(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      counts: {
        personas: 1,
        ontologies: 0,
        entities: 1,
        events: 0,
        times: 0,
        entityCollections: 0,
        eventCollections: 0,
        timeCollections: 0,
        relations: 0,
        annotations: 1,
        totalKeyframes: 1,
        singleKeyframeSequences: 1,
      },
      conflicts: [],
      warnings: [],
      ...overrides,
    }
  }

  it('uploads a .jsonl file via the hidden input and calls api.previewImport', async () => {
    vi.mocked(api.previewImport).mockResolvedValueOnce(makePreview())
    renderDialog()

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeTruthy()
    const file = makeFile('valid.jsonl', '{"type":"persona","data":{}}\n')
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(api.previewImport).toHaveBeenCalledTimes(1)
    })
    expect(vi.mocked(api.previewImport).mock.calls[0][0]).toBe(file)
  })

  it('accepts a .jsonl file via drag-and-drop and rejects other extensions with an inline error', async () => {
    vi.mocked(api.previewImport).mockResolvedValue(makePreview())
    renderDialog()
    const dropZone = screen.getByText(/drag and drop/i).closest('div')!

    // First simulate a wrong-extension drop — must NOT call previewImport
    // and must show the "Only .jsonl files are accepted" error.
    const wrongFile = new File(['hi'], 'wrong.txt', { type: 'text/plain' })
    fireEvent.drop(dropZone, { dataTransfer: { files: [wrongFile] } })
    await screen.findByText(/Only \.jsonl files are accepted/i)
    expect(api.previewImport).not.toHaveBeenCalled()

    // Then a correct .jsonl drop must trigger previewImport.
    const okFile = makeFile('good.jsonl', '{}\n')
    fireEvent.drop(dropZone, { dataTransfer: { files: [okFile] } })
    await waitFor(() => {
      expect(api.previewImport).toHaveBeenCalledTimes(1)
    })
  })

  it('renders the preview summary counts once the previewImport promise resolves', async () => {
    vi.mocked(api.previewImport).mockResolvedValueOnce(makePreview({
      counts: {
        personas: 2,
        ontologies: 0,
        entities: 5,
        events: 3,
        times: 1,
        entityCollections: 0,
        eventCollections: 0,
        timeCollections: 0,
        relations: 0,
        annotations: 7,
        totalKeyframes: 12,
        singleKeyframeSequences: 4,
      },
    }))
    renderDialog()
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [makeFile('p.jsonl', '{}')] } })

    // The preview surface shows each count. Anchor on the larger counts
    // to avoid ambiguity with the "0" placeholders for empty categories.
    await screen.findByText('7')
    expect(screen.getByText('7')).toBeInTheDocument()
    // Personas count
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders a conflict resolution row for each conflict the preview reports', async () => {
    vi.mocked(api.previewImport).mockResolvedValueOnce(makePreview({
      conflicts: [
        { type: 'missing-dependency', line: 1, originalId: 'a-1', details: 'Entity Q42 not found', resolution: 'skip-item' },
        { type: 'duplicate-id', line: 2, originalId: 'a-2', details: 'Annotation id already exists', resolution: 'preserve-id' },
      ],
    }))
    renderDialog()
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [makeFile('c.jsonl', '{}')] } })

    await screen.findByText(/Entity Q42 not found/i)
    expect(screen.getByText(/Annotation id already exists/i)).toBeInTheDocument()
  })

  it('invokes api.uploadImportFile with the selected file and options when the user starts the import', async () => {
    vi.mocked(api.previewImport).mockResolvedValueOnce(makePreview())
    vi.mocked(api.uploadImportFile).mockResolvedValueOnce({
      success: true,
      conflicts: [],
      warnings: [],
      errors: [],
      summary: {
        importedItems: {
          annotations: 1, personas: 0, ontologies: 0, summaries: 0, claims: 0, claimRelations: 0,
          worldObjects: 0, entities: 0, events: 0, times: 0, totalKeyframes: 1, singleKeyframeSequences: 1,
        },
        skippedItems: {
          annotations: 0, personas: 0, ontologies: 0, summaries: 0, claims: 0, claimRelations: 0,
          worldObjects: 0, entities: 0, events: 0, times: 0,
        },
        processedLines: 1,
        importTime: 1,
      },
    } as never)

    const user = userEvent.setup()
    renderDialog()
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = makeFile('ok.jsonl', '{}\n')
    fireEvent.change(fileInput, { target: { files: [file] } })
    await waitFor(() => expect(api.previewImport).toHaveBeenCalled())

    const importBtn = await screen.findByRole('button', { name: /^import$/i })
    await user.click(importBtn)

    await waitFor(() => {
      expect(api.uploadImportFile).toHaveBeenCalledTimes(1)
    })
    const [passedFile, passedOptions] = vi.mocked(api.uploadImportFile).mock.calls[0]
    expect(passedFile).toBe(file)
    // Whatever ImportOptions the dialog assembled, the structure must
    // carry conflictResolution + scope + validation + transaction.
    expect(passedOptions).toHaveProperty('conflictResolution')
    expect(passedOptions).toHaveProperty('validation')
    expect(passedOptions).toHaveProperty('transaction')
  })

  it('surfaces the preview-stage error message when api.previewImport rejects', async () => {
    vi.mocked(api.previewImport).mockRejectedValueOnce(new Error('Network down — could not reach the import endpoint'))
    renderDialog()
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [makeFile('x.jsonl', '{}\n')] } })

    await screen.findByText(/Network down — could not reach the import endpoint/i)
  })

  it('reflects toggled validation checkboxes in the options object passed to api.uploadImportFile', async () => {
    vi.mocked(api.previewImport).mockResolvedValueOnce(makePreview())
    vi.mocked(api.uploadImportFile).mockResolvedValueOnce({
      success: true, conflicts: [], warnings: [], errors: [],
      summary: {
        importedItems: {
          annotations: 1, personas: 0, ontologies: 0, summaries: 0, claims: 0, claimRelations: 0,
          worldObjects: 0, entities: 0, events: 0, times: 0, totalKeyframes: 1, singleKeyframeSequences: 1,
        },
        skippedItems: {
          annotations: 0, personas: 0, ontologies: 0, summaries: 0, claims: 0, claimRelations: 0,
          worldObjects: 0, entities: 0, events: 0, times: 0,
        },
        processedLines: 1,
        importTime: 1,
      },
    } as never)

    const user = userEvent.setup()
    renderDialog()
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [makeFile('v.jsonl', '{}\n')] } })
    await waitFor(() => expect(api.previewImport).toHaveBeenCalled())

    // The shadcn Checkbox does not auto-associate with its Label sibling
    // via htmlFor, so we anchor on the Label text and walk to its
    // preceding checkbox sibling.
    const strictLabel = await screen.findByText(/Strict Mode \(fail on warnings\)/i)
    const strictCheckbox = strictLabel.parentElement!.querySelector('[role="checkbox"]') as HTMLElement
    expect(strictCheckbox).toBeTruthy()
    await user.click(strictCheckbox)

    const importBtn = await screen.findByRole('button', { name: /^import$/i })
    await user.click(importBtn)

    await waitFor(() => expect(api.uploadImportFile).toHaveBeenCalledTimes(1))
    const passedOptions = vi.mocked(api.uploadImportFile).mock.calls[0][1] as {
      validation: { strictMode: boolean }
    }
    expect(passedOptions.validation.strictMode).toBe(true)
  })
})
