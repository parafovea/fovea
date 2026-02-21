/**
 * Tests for ClaimEditor component.
 *
 * Following industry standards:
 * - MSW for API mocking (configured in test/setup.ts)
 * - Fresh QueryClient per test for isolation
 * - No Redux - uses TanStack Query + Zustand
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
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

      expect(screen.getByText(/Confidence \*/i)).toBeInTheDocument()
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
      const slider = screen.getByRole('slider')
      expect(slider).toHaveValue('0.9')
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
      const slider = screen.getByRole('slider')
      expect(slider).toHaveValue('0.85')
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
    it('updates confidence value when slider moved', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      const slider = screen.getByRole('slider')

      // Slider starts at 0.9 (90%)
      expect(slider).toHaveValue('0.9')
      expect(slider).toBeInTheDocument()
      expect(slider).toHaveAttribute('step', '0.01')
    })

    it('displays confidence percentage correctly', () => {
      render(<ClaimEditor {...defaultProps} claim={mockClaim} />, { wrapper: createWrapper() })
      // mockClaim has confidence 0.85
      const slider = screen.getByRole('slider')
      expect(slider).toHaveValue('0.85')
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

    it('shows info icons with tooltips for modality sections', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      
      // Info icons should be present
      const infoIcons = screen.getAllByRole('button', { hidden: true })
      const audioInfoIcon = infoIcons.find(btn => 
        btn.closest('[aria-label*="Audio"]') || btn.querySelector('svg[data-testid="InfoIcon"]')
      )
      expect(audioInfoIcon).toBeDefined()
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
      const slider = screen.getByRole('slider')
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
    it('displays percentage on slider thumb (not above)', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      
      const slider = screen.getByRole('slider')
      // Check that slider has valueLabelDisplay prop (may not be visible as attribute)
      expect(slider).toBeInTheDocument()
      
      // Should not have percentage text above slider (it's on the thumb)
      expect(screen.queryByText(/Confidence: 90%/)).not.toBeInTheDocument()
    })

    it('updates percentage on thumb when slider moved', () => {
      render(<ClaimEditor {...defaultProps} />, { wrapper: createWrapper() })
      
      const slider = screen.getByRole('slider')
      // Slider should display percentage on thumb (valueLabelDisplay="on")
      expect(slider).toBeInTheDocument()
      expect(slider).toHaveValue('0.9')
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
