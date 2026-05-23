/**
 * Tests for VideoSummaryEditor component.
 *
 * These tests ensure claims persist correctly across sessions/browsers by verifying
 * the component handles API errors vs missing summaries correctly.
 *
 * Related to: https://github.com/parafovea/fovea/issues/87
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import VideoSummaryEditor from './VideoSummaryEditor'

// Mock ResizeObserver for MUI components
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

// Mock the API client
vi.mock('@store/queries', async () => {
  const actual = await vi.importActual('@store/queries')
  return {
    ...actual,
    useVideoSummary: vi.fn(),
    useSaveSummary: vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
      error: null,
    })),
    usePersonaOntology: vi.fn(() => ({ data: null })),
    useModelConfig: vi.fn(() => ({
      data: { cudaAvailable: true, modelsAvailable: true, cpuModelsAvailable: false },
      isLoading: false,
      error: null,
    })),
  }
})

vi.mock('@store/queries/useClaims', () => ({
  useClaims: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateClaim: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useUpdateClaim: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useDeleteClaim: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useExtractClaims: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useExtractionJobStatus: vi.fn(() => ({ data: null })),
  useClaimRelations: vi.fn(() => ({ data: { asSource: [], asTarget: [] }, isLoading: false })),
  useCreateClaimRelation: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useDeleteClaimRelation: vi.fn(() => ({ mutateAsync: vi.fn() })),
  claimsQueryKeys: {
    all: ['claims'],
    bySummary: (id: string) => ['claims', 'summary', id],
  },
}))

vi.mock('@store/zustand/claimsUiStore', () => ({
  useClaimsUiStore: vi.fn((selector) => {
    const state = {
      selectedClaimId: null,
      draftClaim: null,
      extracting: false,
      extractionJobId: null,
      extractionProgress: null,
      extractionError: null,
      startExtraction: vi.fn(),
      updateExtractionProgress: vi.fn(),
      setExtractionError: vi.fn(),
      clearExtractionState: vi.fn(),
    }
    return selector(state)
  }),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  )
}

describe('VideoSummaryEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Cross-browser claim persistence (Issue #87)', () => {
    it('does NOT create new summary when fetch fails with 401 error', async () => {
      // This test ensures that if a user is logged in on Browser B but gets a 401
      // (e.g., stale session), we don't accidentally create a new empty summary
      // which would orphan the claims from Browser A.

      const { useVideoSummary, useSaveSummary } = await import('@store/queries')
      const mockMutate = vi.fn()

      // Simulate 401 error - query failed, not "summary doesn't exist"
      vi.mocked(useVideoSummary).mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Unauthorized', statusCode: 401 } as any,
        isError: true,
        refetch: vi.fn(),
      } as any)

      vi.mocked(useSaveSummary).mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
        error: null,
      } as any)

      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      // Wait for effects to run
      await waitFor(() => {
        // Should show error, not create summary
        expect(screen.getByText(/Unauthorized/i)).toBeInTheDocument()
      })

      // CRITICAL: Should NOT have tried to create a new summary
      expect(mockMutate).not.toHaveBeenCalled()
    })

    it('DOES create summary when fetch returns 404 (summary genuinely missing)', async () => {
      // This test ensures that when a summary truly doesn't exist (new video/persona),
      // we DO create one so the user can add claims.

      const { useVideoSummary, useSaveSummary } = await import('@store/queries')
      const mockMutate = vi.fn()

      // Simulate 404 - summary doesn't exist (returns null, no error)
      vi.mocked(useVideoSummary).mockReturnValue({
        data: null, // null means 404 was returned
        isLoading: false,
        error: null, // No error - query succeeded but returned null
        isError: false,
        refetch: vi.fn(),
      } as any)

      vi.mocked(useSaveSummary).mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
        error: null,
      } as any)

      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      // Wait for effects to run
      await waitFor(() => {
        // Should have created a new summary
        expect(mockMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            videoId: 'test-video',
            personaId: 'test-persona',
            summary: [],
          }),
          expect.any(Object)
        )
      })
    })

    it('uses existing summary ID when summary exists', async () => {
      // This test ensures that when a summary already exists (e.g., from Browser A),
      // Browser B uses the same summary ID so claims are shared.

      const { useVideoSummary, useSaveSummary } = await import('@store/queries')
      const { useClaims } = await import('@store/queries/useClaims')
      const mockMutate = vi.fn()

      const existingSummary = {
        id: 'existing-summary-uuid',
        videoId: 'test-video',
        personaId: 'test-persona',
        summary: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      // Simulate successful fetch - summary exists
      vi.mocked(useVideoSummary).mockReturnValue({
        data: existingSummary,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      vi.mocked(useSaveSummary).mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
        error: null,
      } as any)

      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      // Wait for component to stabilize
      await waitFor(() => {
        // Should NOT have tried to create a new summary
        expect(mockMutate).not.toHaveBeenCalled()
      })

      // Verify useClaims would be called with the correct summary ID
      // (on Claims tab activation)
      expect(useClaims).toHaveBeenCalled()
    })

    it('does not create summary while still loading', async () => {
      // Ensure we don't race and create duplicate summaries

      const { useVideoSummary, useSaveSummary } = await import('@store/queries')
      const mockMutate = vi.fn()

      // Simulate loading state
      vi.mocked(useVideoSummary).mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      vi.mocked(useSaveSummary).mockReturnValue({
        mutate: mockMutate,
        mutateAsync: vi.fn(),
        isPending: false,
        error: null,
      } as any)

      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      // Should show loading indicator (base-ui Spinner uses role="status")
      expect(screen.getByRole('status')).toBeInTheDocument()

      // Should NOT have tried to create a summary while loading
      expect(mockMutate).not.toHaveBeenCalled()
    })
  })

  describe('Comment Field', () => {
    it('renders comment field for video summary', async () => {
      const user = userEvent.setup()
      const { useVideoSummary } = await import('@store/queries')
      const existingSummary = {
        id: 'summary-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        summary: [],
        comment: 'Test comment',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      vi.mocked(useVideoSummary).mockReturnValue({
        data: existingSummary,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      // Default tab is Claims; switch to Summary tab to see comment field
      await user.click(screen.getByRole('tab', { name: /Summary/i }))

      await waitFor(() => {
        const commentField = screen.getByPlaceholderText(/Enter comment/i)
        expect(commentField).toBeInTheDocument()
        expect(commentField).toHaveValue('Test comment')
      })
    })

    it('saves comment when summary is saved', async () => {
      const user = userEvent.setup()
      const { useVideoSummary, useSaveSummary } = await import('@store/queries')
      const mockMutateAsync = vi.fn().mockResolvedValue({})
      const existingSummary = {
        id: 'summary-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        summary: [],
        comment: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      vi.mocked(useVideoSummary).mockReturnValue({
        data: existingSummary,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      vi.mocked(useSaveSummary).mockReturnValue({
        mutate: vi.fn(),
        mutateAsync: mockMutateAsync,
        isPending: false,
        error: null,
      } as any)

      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      // Default tab is Claims; switch to Summary tab to see comment field
      await user.click(screen.getByRole('tab', { name: /Summary/i }))

      const commentField = await screen.findByPlaceholderText(/Enter comment/i)
      await user.type(commentField, 'New comment')

      // Autosave only triggers when summary changes; type in summary to trigger save
      const summaryField = screen.getByLabelText(/Video Summary/i)
      await user.type(summaryField, 'x')

      // Wait for autosave (1s debounce) to trigger with comment included
      await waitFor(
        () => {
          expect(mockMutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
              comment: expect.stringContaining('New comment'),
            })
          )
        },
        { timeout: 5000 }
      )
    })
  })

  describe('Default Tab', () => {
    it('defaults to Summary tab (tab 0) when summary exists', async () => {
      // VideoSummaryEditor now opens to Summary regardless of whether a
      // summary already exists. The prior "auto-switch to Claims when
      // a summary loads" effect was removed (commit 591ad1c) because it
      // forced users into a tab they hadn't asked for.
      const { useVideoSummary } = await import('@store/queries')
      const existingSummary = {
        id: 'summary-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        summary: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      vi.mocked(useVideoSummary).mockReturnValue({
        data: existingSummary,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        const summaryTab = screen.getByRole('tab', { name: /summary/i })
        expect(summaryTab).toHaveAttribute('aria-selected', 'true')
      })
    })
  })

  describe('Models Disabled Mode', () => {
    it('disables Extract Claims button when no models available', async () => {
      const { useVideoSummary, useModelConfig } = await import('@store/queries')
      const existingSummary = {
        id: 'summary-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        summary: [{ type: 'text', content: 'Test summary' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      vi.mocked(useVideoSummary).mockReturnValue({
        data: existingSummary,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      vi.mocked(useModelConfig).mockReturnValue({
        data: { cudaAvailable: false, modelsAvailable: false, cpuModelsAvailable: false },
        isLoading: false,
        error: null,
      } as any)

      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        // Switch to Claims tab
        const claimsTab = screen.getByRole('tab', { name: /claims/i })
        userEvent.setup().click(claimsTab)
      })

      await waitFor(() => {
        // base-ui Tooltip render prop creates two matching button elements;
        // query only the one with data-slot="button" (the actual Button component).
        const extractButtons = screen.getAllByRole('button', { name: /extract claims/i })
        const extractButton = extractButtons.find(btn => btn.getAttribute('data-slot') === 'button')!
        expect(extractButton).toBeDisabled()
      })
    })

    it('enables Extract Claims button when GPU is available', async () => {
      const { useVideoSummary, useModelConfig } = await import('@store/queries')
      const existingSummary = {
        id: 'summary-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        summary: [{ type: 'text', content: 'Test summary' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      vi.mocked(useVideoSummary).mockReturnValue({
        data: existingSummary,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      vi.mocked(useModelConfig).mockReturnValue({
        data: { cudaAvailable: true, modelsAvailable: true, cpuModelsAvailable: false },
        isLoading: false,
        error: null,
      } as any)

      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        const claimsTab = screen.getByRole('tab', { name: /claims/i })
        userEvent.setup().click(claimsTab)
      })

      await waitFor(() => {
        const extractButtons = screen.getAllByRole('button', { name: /extract claims/i })
        const extractButton = extractButtons.find(btn => btn.getAttribute('data-slot') === 'button')!
        expect(extractButton).not.toBeDisabled()
      })
    })

    it('enables Extract Claims button when CPU models are available', async () => {
      const { useVideoSummary, useModelConfig } = await import('@store/queries')
      const existingSummary = {
        id: 'summary-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        summary: [{ type: 'text', content: 'Test summary' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      vi.mocked(useVideoSummary).mockReturnValue({
        data: existingSummary,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      vi.mocked(useModelConfig).mockReturnValue({
        data: { cudaAvailable: false, modelsAvailable: true, cpuModelsAvailable: true },
        isLoading: false,
        error: null,
      } as any)

      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      await waitFor(() => {
        const claimsTab = screen.getByRole('tab', { name: /claims/i })
        userEvent.setup().click(claimsTab)
      })

      await waitFor(() => {
        const extractButtons = screen.getAllByRole('button', { name: /extract claims/i })
        const extractButton = extractButtons.find(btn => btn.getAttribute('data-slot') === 'button')!
        expect(extractButton).not.toBeDisabled()
      })
    })
  })

  describe('Claims Loading Error Handling', () => {
    it('displays error message when claims fail to load', async () => {
      const { useVideoSummary } = await import('@store/queries')
      const { useClaims } = await import('@store/queries/useClaims')
      const existingSummary = {
        id: 'summary-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        summary: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      vi.mocked(useVideoSummary).mockReturnValue({
        data: existingSummary,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      vi.mocked(useClaims).mockReturnValue({
        data: [],
        isLoading: false,
        error: new Error('Failed to load claims'),
        isError: true,
      } as any)

      const user = userEvent.setup()
      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      // Dialog opens on Summary; click into Claims so the error
      // message (which is rendered inside the Claims tabpanel) is
      // actually mounted before we assert on it.
      await user.click(await screen.findByRole('tab', { name: /claims/i }))

      await waitFor(() => {
        expect(screen.getByText(/Failed to load claims/i)).toBeInTheDocument()
      })
    })
  })

  describe('Summary Preview Accordion', () => {
    it('renders the summary preview accordion on Claims tab when summary has content', async () => {
      const { useVideoSummary } = await import('@store/queries')
      const existingSummary = {
        id: 'summary-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        summary: [{ type: 'text', content: 'A summary of the video' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      vi.mocked(useVideoSummary).mockReturnValue({
        data: existingSummary,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      const user = userEvent.setup()
      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      // Default tab is now Summary; switch to Claims to reach the
      // Summary Preview accordion (it lives inside the Claims tabpanel).
      await user.click(await screen.findByRole('tab', { name: /claims/i }))
      await waitFor(() => {
        const claimsTab = screen.getByRole('tab', { name: /claims/i })
        expect(claimsTab).toHaveAttribute('aria-selected', 'true')
      })

      // The Summary Preview accordion should be visible
      expect(screen.getByText('Summary Preview')).toBeInTheDocument()
    })

    it('does not render the summary preview accordion when summary is empty', async () => {
      const { useVideoSummary } = await import('@store/queries')
      const existingSummary = {
        id: 'summary-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        summary: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      vi.mocked(useVideoSummary).mockReturnValue({
        data: existingSummary,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      const user = userEvent.setup()
      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      // Switch to Claims explicitly; default is now Summary.
      await user.click(await screen.findByRole('tab', { name: /claims/i }))
      await waitFor(() => {
        const claimsTab = screen.getByRole('tab', { name: /claims/i })
        expect(claimsTab).toHaveAttribute('aria-selected', 'true')
      })

      // Summary Preview should NOT be rendered when summary is empty
      expect(screen.queryByText('Summary Preview')).not.toBeInTheDocument()
    })

    it('is collapsible via click', async () => {
      const user = userEvent.setup()
      const { useVideoSummary } = await import('@store/queries')
      const existingSummary = {
        id: 'summary-1',
        videoId: 'test-video',
        personaId: 'test-persona',
        summary: [{ type: 'text', content: 'Some summary content' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      vi.mocked(useVideoSummary).mockReturnValue({
        data: existingSummary,
        isLoading: false,
        error: null,
        isError: false,
        refetch: vi.fn(),
      } as any)

      render(
        <VideoSummaryEditor
          videoId="test-video"
          personaId="test-persona"
        />,
        { wrapper: createWrapper() }
      )

      // Summary Preview lives in the Claims tabpanel; default is Summary.
      await user.click(await screen.findByRole('tab', { name: /claims/i }))

      await waitFor(() => {
        expect(screen.getByText('Summary Preview')).toBeInTheDocument()
      })

      // Click the accordion header to collapse it
      await user.click(screen.getByText('Summary Preview'))

      // The accordion should still be in the DOM (just collapsed)
      expect(screen.getByText('Summary Preview')).toBeInTheDocument()
    })
  })
})
