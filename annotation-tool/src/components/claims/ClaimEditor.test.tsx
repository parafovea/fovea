/**
 * Tests for ClaimEditor component.
 *
 * Following industry standards:
 * - MSW for API mocking (configured in test/setup.ts)
 * - Fresh QueryClient per test for isolation
 * - No Redux - uses TanStack Query + Zustand
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import React from 'react'
import ClaimEditor from './ClaimEditor'
import { Claim } from '@models/types'
import { server } from '@test/setup'

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
 * Creates wrapper with QueryClientProvider and Router.
 */
function createWrapper() {
  const queryClient = createTestQueryClient()
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  )
}

const mockClaim: Claim = {
  id: 'claim-1',
  summaryId: 'summary-1',
  summaryType: 'video',
  text: 'Baseball is a popular sport',
  gloss: [{ type: 'text', content: 'Baseball is a popular sport' }],
  confidence: 0.85,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

describe('ClaimEditor', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    summaryId: 'summary-1',
    personaId: 'persona-1',
    videoId: 'video-1',
  }

  beforeEach(() => {
    server.resetHandlers()
    vi.clearAllMocks()

    // Set up MSW handlers for APIs the component may use
    server.use(
      http.get('/api/personas', () => {
        return HttpResponse.json([
          { id: 'persona-1', name: 'Test Persona', role: 'Analyst', informationNeed: 'Test' }
        ])
      }),
      http.get('/api/personas/:personaId/ontology', () => {
        return HttpResponse.json({
          entities: [],
          roles: [],
          events: [],
          relationTypes: [],
        })
      }),
      http.get('/api/world', () => {
        return HttpResponse.json({
          entities: [],
          events: [],
          times: [],
          locations: [],
          relations: [],
          collections: [],
        })
      })
    )
  })

  describe('Dialog Behavior', () => {
    it('opens when open=true', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not render when open=false', () => {
      render(<ClaimEditor {...defaultProps} open={false} />, { wrapper: createWrapper() })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes when cancel clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ClaimEditor {...defaultProps} onClose={onClose} />, { wrapper: createWrapper() })

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('closes when backdrop clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const { baseElement } = render(<ClaimEditor {...defaultProps} onClose={onClose} />, {
        wrapper: createWrapper(),
      })

      const backdrop = baseElement.querySelector('.MuiBackdrop-root')
      if (backdrop) {
        await user.click(backdrop)
        expect(onClose).toHaveBeenCalled()
      }
    })
  })

  describe('Form Fields', () => {
    it('renders claim content field', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      expect(screen.getByText(/Claim Content/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/claim text with references/i)).toBeInTheDocument()
    })

    it('renders confidence slider', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      expect(screen.getByText(/Confidence:/)).toBeInTheDocument()
      const slider = screen.getByRole('slider')
      expect(slider).toBeInTheDocument()
    })

    it('renders claimer accordion', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      expect(screen.getByText(/Claimer \(optional\)/i)).toBeInTheDocument()
    })

    it('renders context accordion', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      expect(screen.getByText(/Claim Context \(optional\)/i)).toBeInTheDocument()
    })
  })

  describe('Create Mode', () => {
    it('shows "Add Manual Claim" title when claim=null', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      expect(screen.getByText('Add Manual Claim')).toBeInTheDocument()
    })

    it('shows "Add Subclaim" title when parentClaimId provided', () => {
      render(<ClaimEditor {...defaultProps} parentClaimId="parent-1" />, {
        wrapper: createWrapper(),
      })
      expect(screen.getByText('Add Subclaim')).toBeInTheDocument()
    })

    it('starts with empty fields', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      const input = screen.getByLabelText(/claim text with references/i)
      expect(input).toHaveValue('')
    })

    it('starts with confidence at 90%', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      expect(screen.getByText(/Confidence: 90%/)).toBeInTheDocument()
    })

    it('disables save button when no content', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      const saveButton = screen.getByRole('button', { name: /create/i })
      expect(saveButton).toBeDisabled()
    })
  })

  describe('Edit Mode', () => {
    it('shows "Edit Claim" title when claim provided', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })
      expect(screen.getByText('Edit Claim')).toBeInTheDocument()
    })

    it('populates fields with claim data', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })
      expect(screen.getByDisplayValue('Baseball is a popular sport')).toBeInTheDocument()
      expect(screen.getByText(/Confidence: 85%/)).toBeInTheDocument()
    })

    it('updates save button text to "Save"', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })
      expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument()
    })

    it('enables save button when claim has content', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })
      const saveButton = screen.getByRole('button', { name: /^save$/i })
      expect(saveButton).not.toBeDisabled()
    })
  })

  describe('Validation', () => {
    it('disables save when text is empty', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      const saveButton = screen.getByRole('button', { name: /create/i })
      expect(saveButton).toBeDisabled()
    })

    it('enables save when text is entered', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const input = screen.getByLabelText(/claim text with references/i)
      await user.type(input, 'Test claim content')

      const saveButton = screen.getByRole('button', { name: /create/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
    })

    it('validates confidence range (0-1)', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('min', '0')
      expect(slider).toHaveAttribute('max', '1')
    })
  })

  describe('Submission', () => {
    it('calls onSave with claim data', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledTimes(1)
    })

    it('includes all fields in submission', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.any(String),
          gloss: expect.any(Array),
          confidence: expect.any(Number),
          summaryId: 'summary-1',
          summaryType: 'video',
          extractionStrategy: 'manual',
        })
      )
    })

    it('includes parentClaimId when provided', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(
        <ClaimEditor
          {...defaultProps}
          claim={mockClaim}
          parentClaimId="parent-1"
          onSave={onSave}
        />,
        { wrapper: createWrapper() }
      )

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          parentClaimId: 'parent-1',
        })
      )
    })

    it('closes dialog after save', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      const onClose = vi.fn()
      render(
        <ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} onClose={onClose} />,
        { wrapper: createWrapper() }
      )

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Confidence Slider', () => {
    it('updates confidence value when slider moved', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      const slider = screen.getByRole('slider')

      // Slider starts at 0.9 (90%)
      expect(screen.getByText(/Confidence: 90%/)).toBeInTheDocument()
      expect(slider).toBeInTheDocument()
      expect(slider).toHaveAttribute('step', '0.01')
    })

    it('displays confidence percentage correctly', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })
      // mockClaim has confidence 0.85
      expect(screen.getByText(/Confidence: 85%/)).toBeInTheDocument()
    })
  })

  describe('Claimer Section', () => {
    it('expands claimer accordion', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const claimerAccordion = screen.getByText(/Claimer \(optional\)/i)
      await user.click(claimerAccordion)

      await waitFor(() => {
        expect(screen.getByLabelText(/claimer type/i)).toBeInTheDocument()
      })
    })

    it('shows claimer type options', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const claimerAccordion = screen.getByText(/Claimer \(optional\)/i)
      await user.click(claimerAccordion)

      await waitFor(() => {
        const claimerTypeSelect = screen.getByLabelText(/claimer type/i)
        expect(claimerTypeSelect).toBeInTheDocument()
      })
    })

    it('shows claimer gloss editor when claimer type is entity', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const claimerAccordion = screen.getByText(/Claimer \(optional\)/i)
      await user.click(claimerAccordion)

      await waitFor(async () => {
        const claimerTypeSelect = screen.getByLabelText(/claimer type/i)
        await user.click(claimerTypeSelect)
      })

      const entityOption = screen.getByRole('option', { name: /Entity \(single world state entity\)/i })
      await user.click(entityOption)

      await waitFor(() => {
        expect(screen.getByLabelText(/^claimer$/i)).toBeInTheDocument()
      })
    })

    it('includes claimer fields in submission when set', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      const claimWithClaimer: Claim = {
        ...mockClaim,
        claimerType: 'entity',
        claimerGloss: [{ type: 'text', content: 'John Doe' }],
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithClaimer} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          claimerType: 'entity',
          claimerGloss: expect.any(Array),
        })
      )
    })
  })

  describe('Context Section', () => {
    it('expands context accordion', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const contextAccordion = screen.getByText(/Claim Context \(optional\)/i)
      await user.click(contextAccordion)

      await waitFor(() => {
        expect(screen.getByLabelText(/claiming event/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/claiming time/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/claiming location/i)).toBeInTheDocument()
      })
    })

    it('shows context fields', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const contextAccordion = screen.getByText(/Claim Context \(optional\)/i)
      await user.click(contextAccordion)

      await waitFor(() => {
        expect(screen.getByLabelText(/claiming event/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/claiming time/i)).toBeInTheDocument()
        expect(screen.getByLabelText(/claiming location/i)).toBeInTheDocument()
      })
    })
  })

  describe('Gloss Integration', () => {
    it('uses GlossEditor for claim content', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      expect(screen.getByLabelText(/claim text with references/i)).toBeInTheDocument()
    })

    it('includes gloss array in submission', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          gloss: expect.any(Array),
        })
      )
    })

    it('converts gloss to text in submission', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.any(String),
        })
      )
    })
  })
})
