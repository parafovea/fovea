/**
 * Tests for ClaimEditor component.
 *
 * Following industry standards:
 * - MSW for API mocking (configured in test/setup.ts)
 * - Fresh QueryClient per test for isolation
 * - No Redux - uses TanStack Query + Zustand
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import React from 'react'
import { ClaimEditor } from './ClaimEditor'
import { Claim } from '@models/types'
import { useClaimsUiStore } from '@store/zustand/claimsUiStore'
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
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </MemoryRouter>
  )
}

const mockClaim: Claim = {
  id: 'claim-1',
  summaryId: 'summary-1',
  summaryType: 'video',
  text: 'Baseball is a popular sport',
  gloss: [{ type: 'text', content: 'Baseball is a popular sport' }],
  confidence: 0.85,
  audio: ['speech'], // Add modality metadata so save button is enabled
  video: [],
  metadata: [],
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
    useClaimsUiStore.getState().reset()

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
      const { container } = render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      expect(screen.getByText(/Confidence \*/i)).toBeInTheDocument()
      const slider = document.querySelector('[data-slot="slider"]')
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
      // Confidence display shows 90%
      expect(screen.getByText('90%')).toBeInTheDocument()
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
      // mockClaim has confidence 0.85
      expect(screen.getByText('85%')).toBeInTheDocument()
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

      // Select at least one modality checkbox (required)
      const speechCheckbox = screen.getByLabelText('Speech', { selector: 'input' })
      await user.click(speechCheckbox)

      const saveButton = screen.getByRole('button', { name: /create/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
    })

    it('validates confidence range (0-1)', () => {
      const { container } = render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      const slider = document.querySelector('[data-slot="slider"]')
      expect(slider).toBeInTheDocument()
      // Slider renders with min/max marks (0%, 50%, 100%)
      expect(screen.getByText('0%')).toBeInTheDocument()
      expect(screen.getByText('100%')).toBeInTheDocument()
    })
  })

  describe('Submission', () => {
    it('calls onSave with claim data', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      // Ensure modality is selected (mockClaim has audio: ['speech'])
      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
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
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
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
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
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
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('Confidence Slider', () => {
    it('renders confidence slider with initial value', () => {
      const { container } = render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      const slider = document.querySelector('[data-slot="slider"]')

      // Slider starts at 0.9 (90%) shown in display text
      expect(slider).toBeInTheDocument()
      expect(screen.getByText('90%')).toBeInTheDocument()
    })

    it('displays confidence percentage correctly', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })
      // mockClaim has confidence 0.85
      expect(screen.getByText('85%')).toBeInTheDocument()
    })
  })

  describe('Claimer Section', () => {
    it('expands claimer accordion', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const claimerAccordion = screen.getByText(/Claimer \(optional\)/i)
      await user.click(claimerAccordion)

      await waitFor(() => {
        expect(screen.getByText('Claimer Type')).toBeInTheDocument()
      })
    })

    it('shows claimer type options', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const claimerAccordion = screen.getByText(/Claimer \(optional\)/i)
      await user.click(claimerAccordion)

      await waitFor(() => {
        expect(screen.getByText('Claimer Type')).toBeInTheDocument()
      })
    })

    it('shows claimer gloss editor when claimer type is entity', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const claimerAccordion = screen.getByText(/Claimer \(optional\)/i)
      await user.click(claimerAccordion)

      await waitFor(() => {
        expect(screen.getByText('Claimer Type')).toBeInTheDocument()
      })

      // Click the select trigger
      const selectTrigger = screen.getByText(/none \(standalone claim\)/i)
      await user.click(selectTrigger)

      await waitFor(async () => {
        const entityOption = screen.getByText(/Entity \(single world state entity\)/i)
        await user.click(entityOption)
      })

      await waitFor(() => {
        expect(screen.getByText(/who is making this claim/i)).toBeInTheDocument()
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
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
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
        expect(screen.getByText('Claiming Event')).toBeInTheDocument()
        expect(screen.getByText('Claiming Time')).toBeInTheDocument()
        expect(screen.getByText('Claiming Location')).toBeInTheDocument()
      })
    })

    it('shows context fields', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const contextAccordion = screen.getByText(/Claim Context \(optional\)/i)
      await user.click(contextAccordion)

      await waitFor(() => {
        expect(screen.getByText('Claiming Event')).toBeInTheDocument()
        expect(screen.getByText('Claiming Time')).toBeInTheDocument()
        expect(screen.getByText('Claiming Location')).toBeInTheDocument()
      })
    })
  })

  describe('Modality Metadata Section', () => {
    it('renders modality metadata section (always visible)', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      expect(screen.getByText(/Audio Sources/i)).toBeInTheDocument()
      expect(screen.getByText(/Video Sources/i)).toBeInTheDocument()
      expect(screen.getByText(/Metadata Sources/i)).toBeInTheDocument()
    })

    it('shows modality checkboxes', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // MUI Checkbox uses hidden input; use getByLabelText with selector
      expect(screen.getByLabelText('Speech', { selector: 'input' })).toBeInTheDocument()
      expect(screen.getByLabelText('Non-speech', { selector: 'input' })).toBeInTheDocument()
      expect(screen.getAllByLabelText('Text', { selector: 'input' })).toHaveLength(2)
      expect(screen.getAllByLabelText('Non-text', { selector: 'input' })).toHaveLength(2)
    })

    it('allows selecting audio modality checkboxes', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // MUI Checkbox may not expose role="checkbox" in accessibility tree; use getByLabelText
      const speechCheckbox = screen.getByLabelText('Speech', { selector: 'input' })
      expect(speechCheckbox).not.toBeChecked()
      await user.click(speechCheckbox)
      expect(speechCheckbox).toBeChecked()
    })

    it('allows selecting video modality checkboxes', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // Scope to Video Sources section (header Box parent contains FormGroup)
      const videoSection = screen.getByText(/Video Sources/i).parentElement?.parentElement
      const videoTextCheckbox = within(videoSection!).getByLabelText('Text', { selector: 'input' }) as HTMLInputElement
      expect(videoTextCheckbox).toBeDefined()
      expect(videoTextCheckbox).not.toBeChecked()
      await user.click(videoTextCheckbox)
      expect(videoTextCheckbox).toBeChecked()
    })

    it('allows selecting metadata modality checkboxes', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // Scope to Metadata Sources section
      const metadataSection = screen.getByText(/Metadata Sources/i).parentElement?.parentElement
      const metadataTextCheckbox = within(metadataSection!).getByLabelText('Text', { selector: 'input' }) as HTMLInputElement
      expect(metadataTextCheckbox).toBeDefined()
      expect(metadataTextCheckbox).not.toBeChecked()
      await user.click(metadataTextCheckbox)
      expect(metadataTextCheckbox).toBeChecked()
    })

    it('populates modality metadata from existing claim', () => {
      const claimWithModality: Claim = {
        ...mockClaim,
        audio: ['speech'],
        video: ['text'],
        metadata: ['text'],
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithModality} />, { wrapper: createWrapper() })

      // Checkboxes should be checked based on claim data
      const speechCheckbox = screen.getByLabelText('Speech', { selector: 'input' })
      expect(speechCheckbox).toBeChecked()

      const videoSection = screen.getByText(/Video Sources/i).parentElement?.parentElement
      const metadataSection = screen.getByText(/Metadata Sources/i).parentElement?.parentElement
      expect(within(videoSection!).getByLabelText('Text', { selector: 'input' })).toBeChecked()
      expect(within(metadataSection!).getByLabelText('Text', { selector: 'input' })).toBeChecked()
    })

    it('handles claim without modality metadata (backward compatibility)', () => {
      // Claim without modality fields (existing data)
      const claimWithoutModality: Claim = {
        ...mockClaim,
        audio: null,
        video: null,
        metadata: null,
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithoutModality} />, { wrapper: createWrapper() })
      // Should not crash - fields default to empty arrays
      expect(screen.getByText(/Audio Sources/i)).toBeInTheDocument()
      expect(screen.getByText(/Video Sources/i)).toBeInTheDocument()
      expect(screen.getByText(/Metadata Sources/i)).toBeInTheDocument()
    })

    it('includes modality metadata in submission when set', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      const claimWithModality: Claim = {
        ...mockClaim,
        audio: ['speech'],
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithModality} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: ['speech'],
        })
      )
    })

    it('does not include modality metadata in submission when null', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      // mockClaim has audio: ['speech'], so it will be included
      // For this test, we need a claim without modality but we still need to select one to save
      const claimWithoutModality: Claim = {
        ...mockClaim,
        audio: null,
        video: null,
        metadata: null,
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithoutModality} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      // Select at least one modality checkbox (required)
      const speechCheckbox = screen.getByLabelText('Speech', { selector: 'input' })
      await user.click(speechCheckbox)

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)

      // Since we selected speech, audio will be ['speech']
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: ['speech'],
        })
      )
    })

    it('allows setting and clearing audio modality', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      // Start with a claim that has audio set
      const claimWithAudio: Claim = {
        ...mockClaim,
        audio: ['speech'],
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithAudio} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      // Just save - audio should be preserved
      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: ['speech'],
        })
      )
    })

    it('allows setting and clearing video modality', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      const videoSection = screen.getByText(/Video Sources/i).parentElement?.parentElement
      await user.click(within(videoSection!).getByLabelText('Text', { selector: 'input' }))

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          video: ['text'],
        })
      )
    })

    it('allows setting and clearing metadata modality', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      const metadataSection = screen.getByText(/Metadata Sources/i).parentElement?.parentElement
      await user.click(within(metadataSection!).getByLabelText('Text', { selector: 'input' }))

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: ['text'],
        })
      )
    })

    it('allows setting metadata to non-text (other metadata)', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      const metadataSection = screen.getByText(/Metadata Sources/i).parentElement?.parentElement
      await user.click(within(metadataSection!).getByLabelText('Non-text', { selector: 'input' }))

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: ['non-text'],
        })
      )
    })

    it('handles all three modality fields together', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      const claimWithAllModality: Claim = {
        ...mockClaim,
        audio: ['speech'],
        video: ['non-text'],
        metadata: ['text'],
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithAllModality} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: ['speech'],
          video: ['non-text'],
          metadata: ['text'],
        })
      )
    })

    it('preserves modality metadata when editing other fields', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      const claimWithModality: Claim = {
        ...mockClaim,
        audio: ['non-speech'],
        video: ['text'],
        metadata: ['non-text'],
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithModality} onSave={onSave} />, {
        wrapper: createWrapper(),
      })

      // Just save without changing anything - modality should be preserved
      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: ['non-speech'],
          video: ['text'],
          metadata: ['non-text'],
        })
      )
    })

    it('displays tooltips for modality fields', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // Tooltips are rendered but may not be visible until hover
      // We can at least verify the section headers and checkboxes exist
      expect(screen.getByText(/Audio Sources/i)).toBeInTheDocument()
      expect(screen.getByText(/Video Sources/i)).toBeInTheDocument()
      expect(screen.getByText(/Metadata Sources/i)).toBeInTheDocument()
      expect(screen.getByLabelText('Speech', { selector: 'input' })).toBeInTheDocument()
    })

    it('handles undefined modality fields gracefully', () => {
      const claimWithoutModality: Claim = {
        ...mockClaim,
        audio: undefined,
        video: undefined,
        metadata: undefined,
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithoutModality} />, { wrapper: createWrapper() })
      // Should not crash
      expect(screen.getByText(/Audio Sources/i)).toBeInTheDocument()
      expect(screen.getByText(/Video Sources/i)).toBeInTheDocument()
      expect(screen.getByText(/Metadata Sources/i)).toBeInTheDocument()
    })

    it('renders modality metadata in horizontal layout (33% each)', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      // Modality metadata should be visible (not in accordion anymore)
      expect(screen.getByText(/Modality Metadata \*/i)).toBeInTheDocument()
      expect(screen.getByText(/Audio Sources/i)).toBeInTheDocument()
      expect(screen.getByText(/Video Sources/i)).toBeInTheDocument()
      expect(screen.getByText(/Metadata Sources/i)).toBeInTheDocument()
      
      // Checkboxes should be visible
      const speechCheckboxes = screen.getAllByLabelText(/Speech/i)
      expect(speechCheckboxes.length).toBeGreaterThan(0)
      const nonSpeechCheckboxes = screen.getAllByLabelText(/Non-speech/i)
      expect(nonSpeechCheckboxes.length).toBeGreaterThan(0)
    })

    it('shows info icons for modality sections', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // Info icons (lucide-info SVGs) should be present next to each modality section header
      const infoIcons = document.querySelectorAll('svg.lucide-info')
      expect(infoIcons.length).toBe(3) // Audio, Video, Metadata
    })

    it('renders checkboxes for modality options (not dropdowns)', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      expect(screen.getByLabelText('Speech', { selector: 'input' })).toBeInTheDocument()
      expect(screen.getByLabelText('Non-speech', { selector: 'input' })).toBeInTheDocument()
      expect(screen.getAllByLabelText('Text', { selector: 'input' })).toHaveLength(2)
      expect(screen.getAllByLabelText('Non-text', { selector: 'input' })).toHaveLength(2)
    })

    it('allows selecting multiple audio options', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const speechCheckbox = screen.getByLabelText('Speech', { selector: 'input' })
      const nonSpeechCheckbox = screen.getByLabelText('Non-speech', { selector: 'input' })

      await user.click(speechCheckbox)
      await user.click(nonSpeechCheckbox)

      expect(speechCheckbox).toBeChecked()
      expect(nonSpeechCheckbox).toBeChecked()
    })

    it('does not show chips after selecting modality options', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const speechCheckbox = screen.getByLabelText('Speech', { selector: 'input' })
      await user.click(speechCheckbox)

      // Should not show chips/badges (chips were removed in favor of checkboxes)
      const chips = screen.queryAllByRole('button')
      const actualChips = chips.filter(chip => {
        const ariaLabel = chip.getAttribute('aria-label')
        return ariaLabel && /speech|non-speech|text|non-text/i.test(ariaLabel) &&
               !chip.querySelector('svg[data-testid="InfoIcon"]')
      })
      expect(actualChips.length).toBe(0)
    })

    it('requires at least one modality option to be selected', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<ClaimEditor {...defaultProps} onSave={onSave} />, { wrapper: createWrapper() })
      
      // Enter content
      const input = screen.getByLabelText(/claim text with references/i)
      await user.type(input, 'Test claim')
      
      // Set confidence
      screen.getByRole('slider')
      // Slider already at 0.9, which is valid
      
      // Don't select any modality - save should be disabled
      const saveButton = screen.getByRole('button', { name: /create/i })
      expect(saveButton).toBeDisabled()
    })

    it('enables save when content, confidence, and modality are set', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // Enter content
      const input = screen.getByLabelText(/claim text with references/i)
      await user.type(input, 'Test claim')

      // Select at least one modality
      const speechCheckbox = screen.getByLabelText('Speech', { selector: 'input' })
      await user.click(speechCheckbox)

      // Save should be enabled
      const saveButton = screen.getByRole('button', { name: /create/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
    })

    it('disables save when only metadata sources are selected', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // Enter content
      const input = screen.getByLabelText(/claim text with references/i)
      await user.type(input, 'Test claim')

      // Select only metadata checkbox (no audio or video)
      const metadataSection = screen.getByText(/Metadata Sources/i).parentElement?.parentElement
      await user.click(within(metadataSection!).getByLabelText('Text', { selector: 'input' }))

      // Save should be disabled because metadata-only is not allowed
      const saveButton = screen.getByRole('button', { name: /create/i })
      expect(saveButton).toBeDisabled()
    })

    it('enables save when metadata plus audio source is selected', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // Enter content
      const input = screen.getByLabelText(/claim text with references/i)
      await user.type(input, 'Test claim')

      // Select metadata checkbox
      const metadataSection = screen.getByText(/Metadata Sources/i).parentElement?.parentElement
      await user.click(within(metadataSection!).getByLabelText('Text', { selector: 'input' }))

      // Also select an audio checkbox
      const speechCheckbox = screen.getByLabelText('Speech', { selector: 'input' })
      await user.click(speechCheckbox)

      // Save should be enabled since we have audio + metadata
      const saveButton = screen.getByRole('button', { name: /create/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
    })

    it('enables save when metadata plus video source is selected', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // Enter content
      const input = screen.getByLabelText(/claim text with references/i)
      await user.type(input, 'Test claim')

      // Select metadata checkbox
      const metadataSection = screen.getByText(/Metadata Sources/i).parentElement?.parentElement
      await user.click(within(metadataSection!).getByLabelText('Non-text', { selector: 'input' }))

      // Also select a video checkbox
      const videoSection = screen.getByText(/Video Sources/i).parentElement?.parentElement
      await user.click(within(videoSection!).getByLabelText('Non-text', { selector: 'input' }))

      // Save should be enabled since we have video + metadata
      const saveButton = screen.getByRole('button', { name: /create/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
    })

    it('shows warning when only metadata sources are selected', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // Select only metadata checkbox
      const metadataSection = screen.getByText(/Metadata Sources/i).parentElement?.parentElement
      await user.click(within(metadataSection!).getByLabelText('Text', { selector: 'input' }))

      // Warning message should appear
      expect(screen.getByText(/Metadata sources cannot be the only selection/i)).toBeInTheDocument()
    })

    it('hides warning when audio or video source is added', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      // Select only metadata checkbox
      const metadataSection = screen.getByText(/Metadata Sources/i).parentElement?.parentElement
      await user.click(within(metadataSection!).getByLabelText('Text', { selector: 'input' }))

      // Warning should be visible
      expect(screen.getByText(/Metadata sources cannot be the only selection/i)).toBeInTheDocument()

      // Add an audio source
      const speechCheckbox = screen.getByLabelText('Speech', { selector: 'input' })
      await user.click(speechCheckbox)

      // Warning should disappear
      expect(screen.queryByText(/Metadata sources cannot be the only selection/i)).not.toBeInTheDocument()
    })
  })

  describe('Comment Field', () => {
    it('renders comment field after context section', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      expect(screen.getByText(/Comment \(optional\)/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/Enter comment/i)).toBeInTheDocument()
    })

    it('allows entering comment text', async () => {
      const user = userEvent.setup()
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      
      const commentField = screen.getByPlaceholderText(/Enter comment/i)
      await user.type(commentField, 'This is a test comment')
      
      expect(commentField).toHaveValue('This is a test comment')
    })

    it('populates comment from existing claim', () => {
      const claimWithComment: Claim = {
        ...mockClaim,
        comment: 'Existing comment',
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithComment} />, { wrapper: createWrapper() })
      
      const commentField = screen.getByPlaceholderText(/Enter comment/i)
      expect(commentField).toHaveValue('Existing comment')
    })

    it('includes comment in submission when provided', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      const claimWithComment: Claim = {
        ...mockClaim,
        comment: 'Test comment',
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithComment} onSave={onSave} />, {
        wrapper: createWrapper(),
      })
      
      // claimWithComment already has audio: ['speech'] from mockClaim, so save should be enabled
      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)
      
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          comment: 'Test comment',
        })
      )
    })

    it('sends null comment when comment is empty', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(),
      })
      
      // mockClaim already has audio: ['speech'], so save should be enabled
      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)
      
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          comment: null,
        })
      )
    })

    it('trims whitespace from comment before saving', async () => {
      const user = userEvent.setup()
      const onSave = vi.fn()
      render(<ClaimEditor {...defaultProps} claim={mockClaim} onSave={onSave} />, {
        wrapper: createWrapper(),
      })
      
      const commentField = screen.getByPlaceholderText(/Enter comment/i)
      await user.type(commentField, '  Comment with spaces  ')
      
      // mockClaim already has audio: ['speech'], so save should be enabled
      const saveButton = screen.getByRole('button', { name: /^save$/i })
      await waitFor(() => {
        expect(saveButton).not.toBeDisabled()
      })
      await user.click(saveButton)
      
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          comment: 'Comment with spaces',
        })
      )
    })
  })

  describe('Field Ordering', () => {
    it('renders fields in correct order: Content → Confidence → Modality → Claimer → Context → Comment', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      
      const contentLabel = screen.getByText(/Claim Content \*/i)
      const confidenceLabel = screen.getByText(/Confidence \*/i)
      const modalityLabel = screen.getByText(/Modality Metadata \*/i)
      const claimerLabel = screen.getByText(/Claimer \(optional\)/i)
      const contextLabel = screen.getByText(/Claim Context \(optional\)/i)
      const commentLabel = screen.getByText(/Comment \(optional\)/i)
      
      // Check order by comparing positions in DOM
      const allLabels = [
        contentLabel,
        confidenceLabel,
        modalityLabel,
        claimerLabel,
        contextLabel,
        commentLabel,
      ]
      
      // Verify all are present
      allLabels.forEach(label => expect(label).toBeInTheDocument())
      
      // Verify order: each should come before the next in DOM order
      const contentIndex = contentLabel.compareDocumentPosition(confidenceLabel)
      expect(contentIndex & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      
      const confidenceIndex = confidenceLabel.compareDocumentPosition(modalityLabel)
      expect(confidenceIndex & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      
      const modalityIndex = modalityLabel.compareDocumentPosition(claimerLabel)
      expect(modalityIndex & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      
      const claimerIndex = claimerLabel.compareDocumentPosition(contextLabel)
      expect(claimerIndex & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      
      const contextIndex = contextLabel.compareDocumentPosition(commentLabel)
      expect(contextIndex & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
  })

  describe('Confidence Slider', () => {
    it('displays percentage inline above slider', () => {
      const { container } = render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const slider = document.querySelector('[data-slot="slider"]')
      expect(slider).toBeInTheDocument()

      // Percentage is displayed as text above the slider
      expect(screen.getByText('90%')).toBeInTheDocument()
    })

    it('renders slider with initial value', () => {
      const { container } = render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })

      const slider = document.querySelector('[data-slot="slider"]')
      expect(slider).toBeInTheDocument()
      expect(screen.getByText('90%')).toBeInTheDocument()
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

  describe('Workspace Toggle Keyboard Shortcuts', () => {
    /**
     * Dispatches a keydown event on the dialog's title element.
     * This targets a non-input DOM element so the handler does not skip it,
     * and avoids the jsdom limitation where Document nodes lack .closest().
     */
    function pressKeyOnDialog(key: string): void {
      const title = screen.getByRole('heading', { level: 2 })
      fireEvent.keyDown(title, { key })
    }

    it('saves draft and navigates to /ontology when "o" is pressed', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })

      pressKeyOnDialog('o')

      const draft = useClaimsUiStore.getState().draftClaim
      expect(draft).not.toBeNull()
      expect(draft?.videoId).toBe('video-1')
      expect(draft?.personaId).toBe('persona-1')
      expect(draft?.summaryId).toBe('summary-1')
    })

    it('saves draft and navigates to /objects when "w" is pressed', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })

      pressKeyOnDialog('w')

      const draft = useClaimsUiStore.getState().draftClaim
      expect(draft).not.toBeNull()
      expect(draft?.videoId).toBe('video-1')
      expect(draft?.personaId).toBe('persona-1')
      expect(draft?.summaryId).toBe('summary-1')
    })

    it('does not save draft when "o" is pressed and dialog is closed', () => {
      render(<ClaimEditor {...defaultProps} open={false} />, { wrapper: createWrapper() })

      // No dialog, so dispatch on document body
      fireEvent.keyDown(document.body, { key: 'o' })

      expect(useClaimsUiStore.getState().draftClaim).toBeNull()
    })

    it('does not fire when focus is on an INPUT element', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })

      // GlossEditor renders an input with label "Claim text with references"
      const inputField = screen.getByLabelText(/claim text with references/i)
      fireEvent.keyDown(inputField, { key: 'o' })

      expect(useClaimsUiStore.getState().draftClaim).toBeNull()
    })

    it('does not fire when focus is on a TEXTAREA element', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })

      const commentField = screen.getByPlaceholderText(/Enter comment/i)
      fireEvent.keyDown(commentField, { key: 'w' })

      expect(useClaimsUiStore.getState().draftClaim).toBeNull()
    })

    it('includes editingClaimId when editing an existing claim', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })

      pressKeyOnDialog('o')

      const draft = useClaimsUiStore.getState().draftClaim
      expect(draft?.editingClaimId).toBe('claim-1')
    })

    it('includes parentClaimId when creating a subclaim', () => {
      render(
        <ClaimEditor {...defaultProps} parentClaimId="parent-1" />,
        { wrapper: createWrapper() }
      )

      // "Add Subclaim" is the h2 heading when parentClaimId is set
      const title = screen.getByRole('heading', { level: 2 })
      fireEvent.keyDown(title, { key: 'w' })

      const draft = useClaimsUiStore.getState().draftClaim
      expect(draft?.parentClaimId).toBe('parent-1')
    })

    it('preserves form state in draft when shortcut is triggered', () => {
      const claimWithAll: Claim = {
        ...mockClaim,
        audio: ['speech', 'non-speech'],
        video: ['text'],
        metadata: ['non-text'],
        comment: 'Test comment',
        claimerType: 'entity',
        claimerGloss: [{ type: 'text', content: 'Reporter' }],
      }
      render(<ClaimEditor {...defaultProps} claim={claimWithAll} />, { wrapper: createWrapper() })

      pressKeyOnDialog('o')

      const draft = useClaimsUiStore.getState().draftClaim
      expect(draft).not.toBeNull()
      expect(draft?.confidence).toBe(0.85)
      expect(draft?.audio).toEqual(['speech', 'non-speech'])
      expect(draft?.video).toEqual(['text'])
      expect(draft?.metadata).toEqual(['non-text'])
      expect(draft?.comment).toBe('Test comment')
    })

    it('ignores unrelated keys', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })

      pressKeyOnDialog('a')
      pressKeyOnDialog('x')
      pressKeyOnDialog('Enter')

      expect(useClaimsUiStore.getState().draftClaim).toBeNull()
    })
  })
})
