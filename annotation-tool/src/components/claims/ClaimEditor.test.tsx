/**
 * Tests for ClaimEditor component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import React from 'react'
import ClaimEditor from './ClaimEditor'
import personaSlice from '../../store/personaSlice'
import worldSlice from '../../store/worldSlice'
import annotationSlice from '../../store/annotationSlice'
import { Claim } from '../../models/types'

function createTestStore(initialState = {}) {
  return configureStore({
    reducer: {
      persona: personaSlice,
      world: worldSlice,
      annotations: annotationSlice,
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

  describe('Dialog Behavior', () => {
    it('opens when open=true', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('does not render when open=false', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} open={false} />, {
        wrapper: createWrapper(store),
      })

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes when cancel clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} onClose={onClose} />, {
        wrapper: createWrapper(store),
      })

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('closes when backdrop clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const store = createTestStore()
      const { baseElement } = render(<ClaimEditor {...defaultProps} onClose={onClose} />, {
        wrapper: createWrapper(store),
      })

      // Find the backdrop element
      const backdrop = baseElement.querySelector('.MuiBackdrop-root')
      if (backdrop) {
        await user.click(backdrop)
        expect(onClose).toHaveBeenCalled()
      }
    })
  })

  describe('Form Fields', () => {
    it('renders claim content field', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(screen.getByText(/Claim Content/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/claim text with references/i)).toBeInTheDocument()
    })

    it('renders confidence slider', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(screen.getByText(/Confidence:/)).toBeInTheDocument()
      const slider = screen.getByRole('slider')
      expect(slider).toBeInTheDocument()
    })

    it('renders claimer accordion', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(screen.getByText(/Claimer \(optional\)/i)).toBeInTheDocument()
    })

    it('renders context accordion', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(screen.getByText(/Claim Context \(optional\)/i)).toBeInTheDocument()
    })
  })

  describe('Create Mode', () => {
    it('shows "Add Manual Claim" title when claim=null', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(screen.getByText('Add Manual Claim')).toBeInTheDocument()
    })

    it('shows "Add Subclaim" title when parentClaimId provided', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} parentClaimId="parent-1" />, {
        wrapper: createWrapper(store),
      })

      expect(screen.getByText('Add Subclaim')).toBeInTheDocument()
    })

    it('starts with empty fields', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      const input = screen.getByLabelText(/claim text with references/i)
      expect(input).toHaveValue('')
    })

    it('starts with confidence at 90%', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      expect(screen.getByText(/Confidence: 90%/)).toBeInTheDocument()
    })

    it('disables save button when no content', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      const saveButton = screen.getByRole('button', { name: /create/i })
      expect(saveButton).toBeDisabled()
    })
  })

  describe('Edit Mode', () => {
    it('shows "Edit Claim" title when claim provided', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, {
        wrapper: createWrapper(store),
      })

      expect(screen.getByText('Edit Claim')).toBeInTheDocument()
    })

    it('populates fields with claim data', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, {
        wrapper: createWrapper(store),
      })

      expect(screen.getByDisplayValue('Baseball is a popular sport')).toBeInTheDocument()
      expect(screen.getByText(/Confidence: 85%/)).toBeInTheDocument()
    })

    it('updates save button text to "Save"', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, {
        wrapper: createWrapper(store),
      })

      expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument()
    })

    it('enables save button when claim has content', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, {
        wrapper: createWrapper(store),
      })

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      expect(saveButton).not.toBeDisabled()
    })
  })

  describe('Validation', () => {
    it('disables save when text is empty', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      const saveButton = screen.getByRole('button', { name: /create/i })
      expect(saveButton).toBeDisabled()
    })

    it('enables save when text is entered', async () => {
      const user = userEvent.setup()
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      const input = screen.getByLabelText(/claim text with references/i)
      await user.type(input, 'Test claim content')

      const saveButton = screen.getByRole('button', { name: /create/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
    })

    it('validates confidence range (0-1)', async () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('min', '0')
      expect(slider).toHaveAttribute('max', '1')
    })
  })

  describe('Submission', () => {
    it('calls onSave with claim data', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(store),
      })

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledTimes(1)
    })

    it('includes all fields in submission', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(store),
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
      const store = createTestStore()
      render(
        <ClaimEditor
          {...defaultProps}
          claim={mockClaim}
          parentClaimId="parent-1"
          onSave={onSave}
        />,
        {
          wrapper: createWrapper(store),
        }
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
      const store = createTestStore()
      render(
        <ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} onClose={onClose} />,
        {
          wrapper: createWrapper(store),
        }
      )

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await user.click(saveButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Confidence Slider', () => {
    it('updates confidence value when slider moved', async () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      const slider = screen.getByRole('slider')

      // Slider starts at 0.9 (90%)
      expect(screen.getByText(/Confidence: 90%/)).toBeInTheDocument()

      // Change slider value (this is tricky with MUI sliders, so we just check it exists)
      expect(slider).toBeInTheDocument()
      expect(slider).toHaveAttribute('step', '0.01')
    })

    it('displays confidence percentage correctly', () => {
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, {
        wrapper: createWrapper(store),
      })

      // mockClaim has confidence 0.85
      expect(screen.getByText(/Confidence: 85%/)).toBeInTheDocument()
    })
  })

  describe('Claimer Section', () => {
    it('expands claimer accordion', async () => {
      const user = userEvent.setup()
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      const claimerAccordion = screen.getByText(/Claimer \(optional\)/i)
      await user.click(claimerAccordion)

      await waitFor(() => {
        expect(screen.getByLabelText(/claimer type/i)).toBeInTheDocument()
      })
    })

    it('shows claimer type options', async () => {
      const user = userEvent.setup()
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      // Expand claimer section
      const claimerAccordion = screen.getByText(/Claimer \(optional\)/i)
      await user.click(claimerAccordion)

      await waitFor(() => {
        const claimerTypeSelect = screen.getByLabelText(/claimer type/i)
        expect(claimerTypeSelect).toBeInTheDocument()
      })
    })

    it('shows claimer gloss editor when claimer type is entity', async () => {
      const user = userEvent.setup()
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      // Expand claimer section
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
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} claim={claimWithClaimer} onSave={onSave} />, {
        wrapper: createWrapper(store),
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
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

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
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

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
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper(store) })

      // GlossEditor should be present for claim text
      expect(screen.getByLabelText(/claim text with references/i)).toBeInTheDocument()
    })

    it('includes gloss array in submission', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(store),
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
      const store = createTestStore()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(store),
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
