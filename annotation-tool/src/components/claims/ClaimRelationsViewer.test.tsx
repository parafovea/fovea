/**
 * Tests for ClaimRelationsViewer component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import React from 'react'
import { ClaimRelationsViewer } from './ClaimRelationsViewer'
import claimsSlice from '../../store/claimsSlice'
import personaSlice from '../../store/personaSlice'
import { ClaimRelation } from '../../models/types'
import { server } from '../../../test/setup'
import { http, HttpResponse } from 'msw'

function createTestStore(initialState = {}) {
  return configureStore({
    reducer: {
      claims: claimsSlice,
      persona: personaSlice,
    },
    preloadedState: initialState,
  })
}

function createWrapper(store: ReturnType<typeof createTestStore>) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>{children}</BrowserRouter>
      </QueryClientProvider>
    </Provider>
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
    // Mock fetch claim relations API
    server.use(
      http.get('/api/summaries/:summaryId/claims/:claimId/relations', () => {
        return HttpResponse.json({
          asSource: mockOutgoingRelations,
          asTarget: mockIncomingRelations,
        })
      })
    )
  })

  describe('Loading State', () => {
    it('shows loading spinner when fetching', () => {
      const store = createTestStore({
        claims: {
          claimsBySummary: {},
          relations: {},
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

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

      const store = createTestStore({
        claims: {
          claimsBySummary: {},
          relations: {},
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText(/failed/i)).toBeInTheDocument()
      })
    })
  })

  describe('Outgoing Relations', () => {
    it('renders outgoing relations section', async () => {
      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {
            'summary-1': [
              {
                id: 'claim-2',
                gloss: [{ type: 'text', content: 'Target claim text' }],
              },
            ],
          },
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [
                { id: 'rel-type-1', name: 'supports', sourceTypes: ['claim'], targetTypes: ['claim'] },
              ],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

      // Wait for relations to load from MSW
      expect(await screen.findByText(/outgoing relations \(1\)/i)).toBeInTheDocument()
    })

    it('shows relation type name', async () => {
      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {
            'summary-1': [
              {
                id: 'claim-2',
                gloss: [{ type: 'text', content: 'Target claim' }],
              },
            ],
          },
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [
                { id: 'rel-type-1', name: 'supports', sourceTypes: ['claim'], targetTypes: ['claim'] },
              ],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(await screen.findByText('supports')).toBeInTheDocument()
    })

    it('shows confidence badge', async () => {
      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {
            'summary-1': [
              {
                id: 'claim-2',
                gloss: [{ type: 'text', content: 'Target' }],
              },
            ],
          },
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [
                { id: 'rel-type-1', name: 'supports', sourceTypes: ['claim'], targetTypes: ['claim'] },
              ],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(await screen.findByText(/confidence: 90%/i)).toBeInTheDocument()
    })

    it('shows "no outgoing" message when empty', async () => {
      // Override MSW to return empty relations
      server.use(
        http.get('/api/summaries/:summaryId/claims/:claimId/relations', () => {
          return HttpResponse.json({ asSource: [], asTarget: [] })
        })
      )

      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {},
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(await screen.findByText(/no outgoing relations/i)).toBeInTheDocument()
    })
  })

  describe('Incoming Relations', () => {
    it('renders incoming relations section', async () => {
      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {
            'summary-1': [
              {
                id: 'claim-3',
                gloss: [{ type: 'text', content: 'Source claim' }],
              },
            ],
          },
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [
                { id: 'rel-type-2', name: 'conflicts', sourceTypes: ['claim'], targetTypes: ['claim'] },
              ],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(await screen.findByText(/incoming relations \(1\)/i)).toBeInTheDocument()
    })

    it('shows source claim preview', async () => {
      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {
            'summary-1': [
              {
                id: 'claim-3',
                gloss: [{ type: 'text', content: 'Source claim text' }],
              },
            ],
          },
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [
                { id: 'rel-type-2', name: 'conflicts', sourceTypes: ['claim'], targetTypes: ['claim'] },
              ],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(await screen.findByText(/source claim text/i)).toBeInTheDocument()
    })

    it('shows "no incoming" message when empty', async () => {
      // Override MSW to return empty relations
      server.use(
        http.get('/api/summaries/:summaryId/claims/:claimId/relations', () => {
          return HttpResponse.json({ asSource: [], asTarget: [] })
        })
      )

      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {},
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

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

      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {},
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

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
      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {},
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} onAddRelation={onAddRelation} />, {
        wrapper: createWrapper(store),
      })

      const addButton = await screen.findByRole('button', { name: /add relation/i })
      await user.click(addButton)

      expect(onAddRelation).toHaveBeenCalledTimes(1)
    })

    it('shows delete button on each relation', async () => {
      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {
            'summary-1': [
              {
                id: 'claim-2',
                gloss: [{ type: 'text', content: 'Target' }],
              },
            ],
          },
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [
                { id: 'rel-type-1', name: 'supports', sourceTypes: ['claim'], targetTypes: ['claim'] },
              ],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(await screen.findByRole('button', { name: /delete relation/i })).toBeInTheDocument()
    })
  })

  describe('Relation Type Display', () => {
    it('gets relation type name from ontology', async () => {
      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {
            'summary-1': [
              {
                id: 'claim-2',
                gloss: [{ type: 'text', content: 'Target' }],
              },
            ],
          },
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [
                { id: 'rel-type-1', name: 'supports', sourceTypes: ['claim'], targetTypes: ['claim'] },
              ],
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(await screen.findByText('supports')).toBeInTheDocument()
    })

    it('shows "Unknown" for missing types', async () => {
      const store = createTestStore({
        claims: {
          relations: {},
          claimsBySummary: {
            'summary-1': [
              {
                id: 'claim-2',
                gloss: [{ type: 'text', content: 'Target' }],
              },
            ],
          },
        },
        persona: {
          personaOntologies: [
            {
              personaId: 'persona-1',
              relationTypes: [], // No matching relation type
            },
          ],
        },
      })

      render(<ClaimRelationsViewer {...defaultProps} />, { wrapper: createWrapper(store) })

      const unknowns = await screen.findAllByText('Unknown')
      expect(unknowns.length).toBeGreaterThan(0)
    })
  })
})
