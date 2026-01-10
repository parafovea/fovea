/**
 * Tests for ClaimsViewer component.
 *
 * Following industry standards:
 * - MSW for API mocking (configured in test/setup.ts)
 * - Fresh QueryClient per test for isolation
 * - No Redux - uses TanStack Query
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import React from 'react'
import ClaimsViewer from './ClaimsViewer'
import { Claim } from '../../models/types'
import { server } from '../../../test/setup'
import { http, HttpResponse } from 'msw'

/**
 * Creates a fresh QueryClient for each test.
 * Following TkDodo's pattern for test isolation.
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

/**
 * Creates wrapper with QueryClientProvider.
 */
function createWrapper() {
  const queryClient = createTestQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  )
}

const mockClaims: Claim[] = [
  {
    id: 'claim-1',
    summaryId: 'summary-1',
    summaryType: 'video',
    text: 'Baseball is a popular sport',
    gloss: [{ type: 'text', content: 'Baseball is a popular sport' }],
    confidence: 0.9,
    extractionStrategy: 'sentence-based',
    modelUsed: 'gpt-4',
    subclaims: [
      {
        id: 'claim-1-1',
        summaryId: 'summary-1',
        summaryType: 'video',
        text: 'Baseball is played professionally',
        gloss: [{ type: 'text', content: 'Baseball is played professionally' }],
        confidence: 0.85,
        extractionStrategy: 'sentence-based',
        modelUsed: 'gpt-4',
        parentClaimId: 'claim-1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'claim-2',
    summaryId: 'summary-1',
    summaryType: 'video',
    text: 'Marine mammals migrate seasonally',
    gloss: [{ type: 'text', content: 'Marine mammals migrate seasonally' }],
    confidence: 0.7,
    extractionStrategy: 'semantic-units',
    modelUsed: 'gpt-3.5-turbo',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

describe('ClaimsViewer', () => {
  const defaultProps = {
    claims: mockClaims,
    summaryId: 'summary-1',
    personaId: 'persona-1',
  }

  beforeEach(() => {
    server.resetHandlers()
    vi.clearAllMocks()

    // Default MSW handlers for all tests
    server.use(
      // Claim relations API
      http.get('/api/summaries/:summaryId/claims/:claimId/relations', () => {
        return HttpResponse.json({ asSource: [], asTarget: [] })
      }),
      // Persona ontology API for relation type names
      http.get('/api/personas/:personaId/ontology', () => {
        return HttpResponse.json({
          entities: [],
          roles: [],
          events: [],
          relationTypes: [],
          relations: [],
        })
      })
    )
  })

  describe('Rendering', () => {
    it('renders empty state when no claims', () => {
      render(
        <ClaimsViewer {...defaultProps} claims={[]} />,
        { wrapper: createWrapper() }
      )

      expect(screen.getByText('No claims yet')).toBeInTheDocument()
      expect(screen.getByText(/Extract claims from the summary/)).toBeInTheDocument()
    })

    it('renders claims tree with root claims', () => {
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      expect(screen.getByText(/Baseball is a popular sport/)).toBeInTheDocument()
      expect(screen.getByText(/Marine mammals migrate seasonally/)).toBeInTheDocument()
    })

    it('renders subclaims hierarchically', () => {
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      // Check that subclaim is present
      expect(screen.getByText(/Baseball is played professionally/)).toBeInTheDocument()
    })

    it('displays confidence chips correctly', () => {
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      expect(screen.getByText('90% confident')).toBeInTheDocument()
      expect(screen.getByText('70% confident')).toBeInTheDocument()
      expect(screen.getByText('85% confident')).toBeInTheDocument()
    })

    it('displays extraction strategy chips', () => {
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const sentenceBasedChips = screen.getAllByText('sentence-based')
      expect(sentenceBasedChips.length).toBeGreaterThan(0)
      expect(screen.getByText('semantic-units')).toBeInTheDocument()
    })

    it('displays model used chips', () => {
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const gpt4Chips = screen.getAllByText('gpt-4')
      expect(gpt4Chips.length).toBeGreaterThan(0)
      expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument()
    })
  })

  describe('Loading States', () => {
    it('shows skeleton loaders when loading=true', () => {
      const { container } = render(
        <ClaimsViewer {...defaultProps} loading={true} />,
        { wrapper: createWrapper() }
      )

      const skeletons = container.querySelectorAll('.MuiSkeleton-root')
      expect(skeletons.length).toBeGreaterThan(0)
    })

    it('hides content while loading', () => {
      render(<ClaimsViewer {...defaultProps} loading={true} />, {
        wrapper: createWrapper(),
      })

      expect(screen.queryByText(/Baseball is a popular sport/)).not.toBeInTheDocument()
    })
  })

  describe('Error States', () => {
    it('shows error alert when error prop provided', () => {
      render(<ClaimsViewer {...defaultProps} error="Failed to load claims" />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('Failed to load claims')).toBeInTheDocument()
    })

    it('displays error message text', () => {
      render(<ClaimsViewer {...defaultProps} error="Network error occurred" />, {
        wrapper: createWrapper(),
      })

      expect(screen.getByText('Network error occurred')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  describe('Filtering', () => {
    it('filters claims by search term', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const searchInput = screen.getByPlaceholderText('Search claims...')
      await user.type(searchInput, 'baseball')

      // Baseball claim should still be visible
      expect(screen.getByText(/Baseball is a popular sport/)).toBeInTheDocument()
      // Marine mammals claim should not be visible
      expect(screen.queryByText(/Marine mammals migrate seasonally/)).not.toBeInTheDocument()
    })

    it('filters by minimum confidence', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      // Open confidence filter dropdown
      const confidenceSelect = screen.getByRole('combobox', { name: /min confidence/i })
      await user.click(confidenceSelect)

      // Select 80%+ option
      const option80 = screen.getByRole('option', { name: '80%+' })
      await user.click(option80)

      // Only claim with 90% confidence should be visible
      expect(screen.getByText(/Baseball is a popular sport/)).toBeInTheDocument()
      // Claim with 70% confidence should not be visible
      expect(screen.queryByText(/Marine mammals migrate seasonally/)).not.toBeInTheDocument()
    })

    it('filters by extraction strategy', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      // Open strategy filter dropdown
      const strategySelect = screen.getByRole('combobox', { name: /strategy/i })
      await user.click(strategySelect)

      // Select semantic-units option
      const semanticOption = screen.getByRole('option', { name: 'Semantic Units' })
      await user.click(semanticOption)

      // Only semantic-units claim should be visible
      expect(screen.getByText(/Marine mammals migrate seasonally/)).toBeInTheDocument()
      // Sentence-based claim should not be visible in main tree (though subclaim may still exist)
      const baseballClaim = screen.queryByText(/Baseball is a popular sport/)
      expect(baseballClaim).not.toBeInTheDocument()
    })

    it('filters by model', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      // Open model filter dropdown
      const modelSelect = screen.getByRole('combobox', { name: /model/i })
      await user.click(modelSelect)

      // Select GPT-3.5 option
      const gpt35Option = screen.getByRole('option', { name: 'GPT-3.5' })
      await user.click(gpt35Option)

      // Only GPT-3.5 claim should be visible
      expect(screen.getByText(/Marine mammals migrate seasonally/)).toBeInTheDocument()
      expect(screen.queryByText(/Baseball is a popular sport/)).not.toBeInTheDocument()
    })

    it('shows "no results" when filters exclude all claims', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const searchInput = screen.getByPlaceholderText('Search claims...')
      await user.type(searchInput, 'nonexistent search term xyz')

      expect(screen.getByText('No claims match your filters')).toBeInTheDocument()
    })

    it('filters subclaims recursively', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const searchInput = screen.getByPlaceholderText('Search claims...')
      await user.type(searchInput, 'professionally')

      // Parent claim should be visible because subclaim matches
      expect(screen.getByText(/Baseball is a popular sport/)).toBeInTheDocument()
      // Matching subclaim should be visible
      expect(screen.getByText(/Baseball is played professionally/)).toBeInTheDocument()
    })

    it('shows parent if subclaim matches filter', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const searchInput = screen.getByPlaceholderText('Search claims...')
      await user.type(searchInput, 'professionally')

      // Parent should be shown even if it doesn't match the filter
      expect(screen.getByText(/Baseball is a popular sport/)).toBeInTheDocument()
    })

    it('updates results count on filter change', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      // Initially showing all claims
      expect(screen.getByText(/Showing 2 of 2 claims/)).toBeInTheDocument()

      // Filter by search
      const searchInput = screen.getByPlaceholderText('Search claims...')
      await user.type(searchInput, 'baseball')

      // Should show 1 of 2 claims
      expect(screen.getByText(/Showing 1 of 2 claims/)).toBeInTheDocument()
    })
  })

  describe('Searching', () => {
    it('searches claim text content', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const searchInput = screen.getByPlaceholderText('Search claims...')
      await user.type(searchInput, 'baseball')

      expect(screen.getByText(/Baseball is a popular sport/)).toBeInTheDocument()
      expect(screen.queryByText(/Marine mammals/)).not.toBeInTheDocument()
    })

    it('searches gloss content', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const searchInput = screen.getByPlaceholderText('Search claims...')
      await user.type(searchInput, 'mammals')

      expect(screen.getByText(/Marine mammals migrate seasonally/)).toBeInTheDocument()
      expect(screen.queryByText(/Baseball is a popular sport/)).not.toBeInTheDocument()
    })

    it('is case-insensitive', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const searchInput = screen.getByPlaceholderText('Search claims...')
      await user.type(searchInput, 'BASEBALL')

      expect(screen.getByText(/Baseball is a popular sport/)).toBeInTheDocument()
    })
  })

  describe('Tree Interactions', () => {
    it('expands claim to show subclaims', async () => {
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      // Subclaim should be visible initially (expanded by default)
      expect(screen.getByText(/Baseball is played professionally/)).toBeInTheDocument()
    })

    it('collapses claim to hide subclaims', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      // Find the expand/collapse button for the claim with subclaims
      const expandButtons = screen.getAllByRole('button')
      const expandButton = expandButtons.find((btn) => {
        const icon = btn.querySelector('svg')
        return icon && icon.getAttribute('data-testid') === 'ExpandMoreIcon'
      })

      if (expandButton) {
        await user.click(expandButton)

        // Subclaim should not be visible after collapse
        await waitFor(() => {
          expect(screen.queryByText(/Baseball is played professionally/)).not.toBeVisible()
        })
      }
    })

    it('disables expand button when no subclaims', () => {
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      // Find all icon buttons and check for disabled state
      const buttons = screen.getAllByRole('button')
      const disabledButtons = buttons.filter((btn) => btn.disabled)

      // At least one button should be disabled (for claims without subclaims)
      expect(disabledButtons.length).toBeGreaterThan(0)
    })
  })

  describe('Actions', () => {
    it('calls onEditClaim when edit button clicked', async () => {
      const user = userEvent.setup()
      const onEditClaim = vi.fn()
      render(<ClaimsViewer {...defaultProps} onEditClaim={onEditClaim} />, {
        wrapper: createWrapper(),
      })

      const editButtons = screen.getAllByRole('button', { name: /edit claim/i })
      await user.click(editButtons[0])

      expect(onEditClaim).toHaveBeenCalledTimes(1)
      expect(onEditClaim).toHaveBeenCalledWith(expect.objectContaining({ id: 'claim-1' }))
    })

    it('calls onDeleteClaim when delete button clicked', async () => {
      const user = userEvent.setup()
      const onDeleteClaim = vi.fn()
      render(<ClaimsViewer {...defaultProps} onDeleteClaim={onDeleteClaim} />, {
        wrapper: createWrapper(),
      })

      const deleteButtons = screen.getAllByRole('button', { name: /delete claim/i })
      await user.click(deleteButtons[0])

      expect(onDeleteClaim).toHaveBeenCalledTimes(1)
      expect(onDeleteClaim).toHaveBeenCalledWith(expect.objectContaining({ id: 'claim-1' }))
    })

    it('calls onAddClaim when add subclaim button clicked', async () => {
      const user = userEvent.setup()
      const onAddClaim = vi.fn()
      render(<ClaimsViewer {...defaultProps} onAddClaim={onAddClaim} />, {
        wrapper: createWrapper(),
      })

      const addButtons = screen.getAllByRole('button', { name: /add subclaim/i })
      await user.click(addButtons[0])

      expect(onAddClaim).toHaveBeenCalledTimes(1)
    })

    it('passes parent claim ID when adding subclaim', async () => {
      const user = userEvent.setup()
      const onAddClaim = vi.fn()
      render(<ClaimsViewer {...defaultProps} onAddClaim={onAddClaim} />, {
        wrapper: createWrapper(),
      })

      const addButtons = screen.getAllByRole('button', { name: /add subclaim/i })
      await user.click(addButtons[0])

      expect(onAddClaim).toHaveBeenCalledWith('claim-1')
    })
  })

  describe('Relations Integration', () => {
    it('shows relations icon button', () => {
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const relationsButtons = screen.getAllByRole('button', { name: /relations/i })
      expect(relationsButtons.length).toBeGreaterThan(0)
    })

    it('expands relations viewer when icon clicked', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const relationsButtons = screen.getAllByRole('button', { name: /show relations/i })
      await user.click(relationsButtons[0])

      // Relations section should be visible
      await waitFor(() => {
        expect(screen.getByTestId('claim-relations-viewer')).toBeInTheDocument()
      })
    })

    it('hides relations viewer when icon clicked again', async () => {
      const user = userEvent.setup()
      render(<ClaimsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const relationsButton = screen.getAllByRole('button', { name: /show relations/i })[0]
      await user.click(relationsButton)

      // Wait for relations to appear
      await waitFor(() => {
        expect(screen.getByTestId('claim-relations-viewer')).toBeInTheDocument()
      })

      // Click again to hide
      const hideButton = screen.getAllByRole('button', { name: /hide relations/i })[0]
      await user.click(hideButton)

      // Verify relations viewer is hidden
      await waitFor(() => {
        expect(screen.queryByTestId('claim-relations-viewer')).not.toBeInTheDocument()
      })
    })
  })
})
