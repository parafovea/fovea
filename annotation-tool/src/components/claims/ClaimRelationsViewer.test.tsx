/**
 * Tests for ClaimRelationsViewer component.
 *
 * Following industry standards:
 * - MSW for API mocking (configured in test/setup.ts)
 * - Fresh QueryClient per test for isolation
 * - No Redux - uses TanStack Query
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import React from 'react'
import { ClaimRelationsViewer } from './ClaimRelationsViewer'
import { ClaimRelation } from '@models/types'
import { server } from '@test/setup'
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

const mockOutgoingRelations: ClaimRelation[] = [
  {
    id: 'relation-1',
    sourceClaimId: 'claim-1',
    targetClaimId: 'claim-2',
    relationTypeId: 'rel-type-1',
    confidence: 0.9,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

const mockIncomingRelations: ClaimRelation[] = [
  {
    id: 'relation-2',
    sourceClaimId: 'claim-3',
    targetClaimId: 'claim-1',
    relationTypeId: 'rel-type-2',
    confidence: 0.85,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

describe('ClaimRelationsViewer', () => {
  const defaultProps = {
    claimId: 'claim-1',
    summaryId: 'summary-1',
    personaId: 'persona-1',
    onAddRelation: vi.fn(),
  }

  beforeEach(() => {
    server.resetHandlers()
    vi.clearAllMocks()

    // Default MSW handlers for all tests
    server.use(
      // Claim relations API
      http.get('/api/summaries/:summaryId/claims/:claimId/relations', () => {
        return HttpResponse.json({
          asSource: mockOutgoingRelations,
          asTarget: mockIncomingRelations,
        })
      }),
      // Claims API for TanStack Query
      http.get('/api/summaries/:summaryId/claims', () => {
        return HttpResponse.json([
          {
            id: 'claim-1',
            gloss: [{ type: 'text', content: 'Main claim text' }],
          },
          {
            id: 'claim-2',
            gloss: [{ type: 'text', content: 'Target claim text' }],
          },
          {
            id: 'claim-3',
            gloss: [{ type: 'text', content: 'Source claim text' }],
          },
        ])
      }),
      // Persona ontology API for relation type names
      http.get('/api/personas/:personaId/ontology', () => {
        return HttpResponse.json({
          entities: [],
          roles: [],
          events: [],
          relationTypes: [
            { id: 'rel-type-1', name: 'supports', sourceTypes: ['claim'], targetTypes: ['claim'] },
            { id: 'rel-type-2', name: 'conflicts', sourceTypes: ['claim'], targetTypes: ['claim'] },
          ],
          relations: [],
        })
      })
    )
  })

  describe('Loading State', () => {
    it('shows loading spinner when fetching', () => {
      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('shows error alert when fetch fails', async () => {
      // Override MSW handler to return error
      server.use(
        http.get('/api/summaries/:summaryId/claims/:claimId/relations', () => {
          return HttpResponse.json({ error: 'Failed to load relations' }, { status: 500 })
        })
      )

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument()
      })
    })
  })

  describe('Outgoing Relations', () => {
    it('renders outgoing relations section', async () => {
      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      // Wait for relations to load from MSW
      expect(await screen.findByText(/outgoing relations \(1\)/i)).toBeInTheDocument()
    })

    it('shows relation type name', async () => {
      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      expect(await screen.findByText('supports')).toBeInTheDocument()
    })

    it('shows confidence badge', async () => {
      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      expect(await screen.findByText(/confidence: 90%/i)).toBeInTheDocument()
    })

    it('shows "no outgoing" message when empty', async () => {
      // Override MSW to return empty relations
      server.use(
        http.get('/api/summaries/:summaryId/claims/:claimId/relations', () => {
          return HttpResponse.json({ asSource: [], asTarget: [] })
        })
      )

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      expect(await screen.findByText(/no outgoing relations/i)).toBeInTheDocument()
    })
  })

  describe('Incoming Relations', () => {
    it('renders incoming relations section', async () => {
      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      expect(await screen.findByText(/incoming relations \(1\)/i)).toBeInTheDocument()
    })

    it('shows source claim preview', async () => {
      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      // Claims are now fetched via TanStack Query from MSW mock
      expect(await screen.findByText(/source claim text/i)).toBeInTheDocument()
    })

    it('shows "no incoming" message when empty', async () => {
      // Override MSW to return empty relations
      server.use(
        http.get('/api/summaries/:summaryId/claims/:claimId/relations', () => {
          return HttpResponse.json({ asSource: [], asTarget: [] })
        })
      )

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      expect(await screen.findByText(/no incoming relations/i)).toBeInTheDocument()
    })
  })

  describe('Actions', () => {
    it('shows add relation button', async () => {
      server.use(
        http.get('/api/summaries/:summaryId/claims/:claimId/relations', () => {
          return HttpResponse.json({ asSource: [], asTarget: [] })
        })
      )

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      expect(await screen.findByRole('button', { name: /add relation/i })).toBeInTheDocument()
    })

    it('calls onAddRelation when clicked', async () => {
      server.use(
        http.get('/api/summaries/:summaryId/claims/:claimId/relations', () => {
          return HttpResponse.json({ asSource: [], asTarget: [] })
        })
      )

      const user = userEvent.setup()
      const onAddRelation = vi.fn()

      render(<ClaimRelationsViewer {...defaultProps} onAddRelation={onAddRelation} />, {
        wrapper: createWrapper(),
      })

      const addButton = await screen.findByRole('button', { name: /add relation/i })
      await user.click(addButton)

      expect(onAddRelation).toHaveBeenCalledTimes(1)
    })

    it('shows delete button on each relation', async () => {
      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      expect(await screen.findByRole('button', { name: /delete relation/i })).toBeInTheDocument()
    })
  })

  describe('Relation Type Display', () => {
    it('gets relation type name from ontology', async () => {
      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      expect(await screen.findByText('supports')).toBeInTheDocument()
    })

    it('shows "Unknown" for missing types', async () => {
      // Override ontology to have no matching relation types
      server.use(
        http.get('/api/personas/:personaId/ontology', () => {
          return HttpResponse.json({
            entities: [],
            roles: [],
            events: [],
            relationTypes: [], // No matching relation type
            relations: [],
          })
        })
      )

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper() })

      const unknowns = await screen.findAllByText('Unknown')
      expect(unknowns.length).toBeGreaterThan(0)
    })
  })
})
