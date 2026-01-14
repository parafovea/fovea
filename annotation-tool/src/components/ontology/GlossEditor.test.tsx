import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GlossEditor from './GlossEditor'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// Mock the hooks
vi.mock('@store/queries', () => ({
  usePersonaOntology: () => ({ data: null }),
  useWorld: () => ({ data: { entities: [], entityTypes: [], events: [], times: [] } }),
  useAnnotations: () => ({ data: [] }),
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

describe('GlossEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('State Sync', () => {
    it('does not reset input when typing rapidly', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(
        <GlossEditor gloss={[]} onChange={onChange} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByRole('textbox')

      // Type rapidly
      await user.type(input, 'Hello World')

      expect(input).toHaveValue('Hello World')
    })

    it('preserves input when component re-renders with same gloss', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <GlossEditor gloss={[]} onChange={onChange} personaId="test" />
        </QueryClientProvider>
      )

      const input = screen.getByRole('textbox')
      await user.type(input, 'My text')

      // Simulate re-render with same gloss (like when external data loads)
      // Keep the same QueryClient to avoid remounting
      rerender(
        <QueryClientProvider client={queryClient}>
          <GlossEditor gloss={[]} onChange={onChange} personaId="test" />
        </QueryClientProvider>
      )

      expect(input).toHaveValue('My text')
    })

    it('updates input when gloss prop changes externally', async () => {
      const onChange = vi.fn()
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <GlossEditor gloss={[]} onChange={onChange} />
        </QueryClientProvider>
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('')

      // Simulate external gloss change (e.g., loading saved data)
      // Keep the same QueryClient to avoid remounting
      rerender(
        <QueryClientProvider client={queryClient}>
          <GlossEditor
            gloss={[{ type: 'text', content: 'External update' }]}
            onChange={onChange}
          />
        </QueryClientProvider>
      )

      expect(input).toHaveValue('External update')
    })

    it('initializes with existing gloss content', () => {
      const onChange = vi.fn()

      render(
        <GlossEditor
          gloss={[{ type: 'text', content: 'Initial content' }]}
          onChange={onChange}
        />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('Initial content')
    })

    it('calls onChange with parsed gloss when typing', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(
        <GlossEditor gloss={[]} onChange={onChange} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByRole('textbox')
      await user.type(input, 'Test')

      // onChange should be called for each character
      expect(onChange).toHaveBeenCalledTimes(4)

      // Last call should have the full text
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0]
      expect(lastCall).toEqual([{ type: 'text', content: 'Test' }])
    })
  })

  describe('Autocomplete', () => {
    it('shows autocomplete when # is typed', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(
        <GlossEditor gloss={[]} onChange={onChange} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByRole('textbox')
      await user.type(input, '#')

      // Should show autocomplete with types section
      await waitFor(() => {
        expect(screen.getByText(/No types found/i)).toBeInTheDocument()
      })
    })

    it('shows autocomplete when @ is typed', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(
        <GlossEditor gloss={[]} onChange={onChange} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByRole('textbox')
      await user.type(input, '@')

      // Should show autocomplete with objects section
      await waitFor(() => {
        expect(screen.getByText(/No objects found/i)).toBeInTheDocument()
      })
    })

    it('closes autocomplete when Escape is pressed', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()

      render(
        <GlossEditor gloss={[]} onChange={onChange} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByRole('textbox')
      await user.type(input, '#')

      // Autocomplete should be open
      await waitFor(() => {
        expect(screen.getByText(/No types found/i)).toBeInTheDocument()
      })

      // Press Escape
      await user.keyboard('{Escape}')

      // Autocomplete should be closed
      await waitFor(() => {
        expect(screen.queryByText(/No types found/i)).not.toBeInTheDocument()
      })
    })
  })

  describe('Disabled State', () => {
    it('disables input when disabled prop is true', () => {
      render(
        <GlossEditor gloss={[]} onChange={vi.fn()} disabled={true} />,
        { wrapper: createWrapper() }
      )

      const input = screen.getByRole('textbox')
      expect(input).toBeDisabled()
    })
  })
})
