/**
 * Tests for ClaimsExtractionDialog component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import ClaimsExtractionDialog from './ClaimsExtractionDialog'

describe('ClaimsExtractionDialog', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onExtract: vi.fn(),
    extracting: false,
  }

  describe('Configuration Options', () => {
    it('renders input source checkboxes', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      expect(screen.getByLabelText(/summary text \(required\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/annotations \(enable @references\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/ontology \(enable #references\)/i)).toBeInTheDocument()
    })

    it('disables summary text checkbox (required)', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const summaryCheckbox = screen.getByLabelText(/summary text \(required\)/i)
      expect(summaryCheckbox).toBeDisabled()
      expect(summaryCheckbox).toBeChecked()
    })

    it('toggles annotation checkbox', async () => {
      const user = userEvent.setup()
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const annotationCheckbox = screen.getByLabelText(/annotations \(enable @references\)/i)
      expect(annotationCheckbox).not.toBeChecked()

      await user.click(annotationCheckbox)
      expect(annotationCheckbox).toBeChecked()

      await user.click(annotationCheckbox)
      expect(annotationCheckbox).not.toBeChecked()
    })

    it('toggles ontology checkbox', async () => {
      const user = userEvent.setup()
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const ontologyCheckbox = screen.getByLabelText(/ontology \(enable #references\)/i)
      expect(ontologyCheckbox).toBeChecked()

      await user.click(ontologyCheckbox)
      expect(ontologyCheckbox).not.toBeChecked()
    })

    it('shows ontology depth options when enabled', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      expect(screen.getByLabelText(/names only/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/names \+ glosses \(default\)/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/full definitions/i)).toBeInTheDocument()
    })

    it('hides ontology depth when disabled', async () => {
      const user = userEvent.setup()
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const ontologyCheckbox = screen.getByLabelText(/ontology \(enable #references\)/i)
      await user.click(ontologyCheckbox)

      // Depth options should not be visible
      expect(screen.queryByLabelText(/names only/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/names \+ glosses/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/full definitions/i)).not.toBeInTheDocument()
    })
  })

  describe('Extraction Strategy', () => {
    it('renders strategy radio buttons', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      expect(screen.getByText(/sentence-based \(default\)/i)).toBeInTheDocument()
      expect(screen.getByText(/semantic units/i)).toBeInTheDocument()
      expect(screen.getByText(/hierarchical/i)).toBeInTheDocument()
    })

    it('defaults to sentence-based', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const sentenceBasedRadio = screen.getByRole('radio', { name: /sentence-based/i })
      expect(sentenceBasedRadio).toBeChecked()
    })

    it('changes strategy on selection', async () => {
      const user = userEvent.setup()
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const semanticRadio = screen.getByRole('radio', { name: /semantic units/i })
      await user.click(semanticRadio)

      expect(semanticRadio).toBeChecked()

      const sentenceBasedRadio = screen.getByRole('radio', { name: /sentence-based/i })
      expect(sentenceBasedRadio).not.toBeChecked()
    })

    it('shows all three strategies', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      expect(screen.getByRole('radio', { name: /sentence-based/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /semantic units/i })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: /hierarchical/i })).toBeInTheDocument()
    })
  })

  describe('Parameters', () => {
    it('renders max claims input', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      expect(screen.getByLabelText(/max claims/i)).toBeInTheDocument()
      expect(screen.getByText(/maximum number of claims to extract \(1-200\)/i)).toBeInTheDocument()
    })

    it('renders min confidence input', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      expect(screen.getByLabelText(/min confidence/i)).toBeInTheDocument()
      expect(screen.getByText(/minimum confidence threshold \(0-1\)/i)).toBeInTheDocument()
    })

    it('validates max claims range', async () => {
      const user = userEvent.setup()
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const maxClaimsInput = screen.getByLabelText(/max claims/i) as HTMLInputElement

      // Default value is 50
      expect(maxClaimsInput).toHaveValue(50)

      // Test value gets clamped to max 200
      await user.clear(maxClaimsInput)
      await user.type(maxClaimsInput, '250')
      // Component clamps to 200
      await waitFor(() => {
        expect(parseInt(maxClaimsInput.value)).toBeLessThanOrEqual(200)
      })

      // Test minimum value
      await user.clear(maxClaimsInput)
      await user.type(maxClaimsInput, '0')
      await waitFor(() => {
        expect(parseInt(maxClaimsInput.value)).toBeGreaterThanOrEqual(1)
      })
    })

    it('validates confidence range (0-1)', async () => {
      const user = userEvent.setup()
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const minConfidenceInput = screen.getByLabelText(/min confidence/i) as HTMLInputElement

      // Default value is 0.5
      expect(minConfidenceInput).toHaveValue(0.5)

      // Test value gets clamped to max 1
      await user.clear(minConfidenceInput)
      await user.type(minConfidenceInput, '1.5')
      await waitFor(() => {
        expect(parseFloat(minConfidenceInput.value)).toBeLessThanOrEqual(1)
      })

      // Test minimum value
      await user.clear(minConfidenceInput)
      await user.type(minConfidenceInput, '-0.5')
      await waitFor(() => {
        expect(parseFloat(minConfidenceInput.value)).toBeGreaterThanOrEqual(0)
      })
    })
  })

  describe('Extraction Flow', () => {
    it('calls onExtract with config on button click', async () => {
      const user = userEvent.setup()
      const onExtract = vi.fn()
      render(<ClaimsExtractionDialog {...defaultProps} onExtract={onExtract} />)

      const extractButton = screen.getByRole('button', { name: /extract claims/i })
      await user.click(extractButton)

      expect(onExtract).toHaveBeenCalledTimes(1)
    })

    it('passes all selected options', async () => {
      const user = userEvent.setup()
      const onExtract = vi.fn()
      render(<ClaimsExtractionDialog {...defaultProps} onExtract={onExtract} />)

      // Toggle annotations on
      const annotationCheckbox = screen.getByLabelText(/annotations \(enable @references\)/i)
      await user.click(annotationCheckbox)

      // Select semantic-units strategy
      const semanticRadio = screen.getByRole('radio', { name: /semantic units/i })
      await user.click(semanticRadio)

      const extractButton = screen.getByRole('button', { name: /extract claims/i })
      await user.click(extractButton)

      expect(onExtract).toHaveBeenCalledWith(
        expect.objectContaining({
          inputSources: expect.objectContaining({
            includeSummaryText: true,
            includeAnnotations: true,
            includeOntology: true,
          }),
          extractionStrategy: 'semantic-units',
          maxClaimsPerSummary: 50,
          minConfidence: 0.5,
        })
      )
    })

    it('shows progress bar when extracting=true', () => {
      render(<ClaimsExtractionDialog {...defaultProps} extracting={true} />)

      expect(screen.getByText(/extracting claims.../i)).toBeInTheDocument()
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('disables inputs during extraction', () => {
      render(<ClaimsExtractionDialog {...defaultProps} extracting={true} />)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      const extractButton = screen.getByRole('button', { name: /extracting.../i })

      expect(cancelButton).toBeDisabled()
      expect(extractButton).toBeDisabled()
    })

    it('shows progress percentage', () => {
      render(<ClaimsExtractionDialog {...defaultProps} extracting={true} progress={65} />)

      expect(screen.getByText(/65% complete/i)).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('displays error alert when error prop set', () => {
      render(<ClaimsExtractionDialog {...defaultProps} error="Failed to extract claims" />)

      expect(screen.getByText('Failed to extract claims')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    it('shows error message text', () => {
      const errorMessage = 'Network timeout occurred'
      render(<ClaimsExtractionDialog {...defaultProps} error={errorMessage} />)

      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })

    it('allows retry after error', async () => {
      const user = userEvent.setup()
      const onExtract = vi.fn()
      render(
        <ClaimsExtractionDialog
          {...defaultProps}
          error="Failed to extract"
          onExtract={onExtract}
        />
      )

      const extractButton = screen.getByRole('button', { name: /extract claims/i })
      expect(extractButton).not.toBeDisabled()

      await user.click(extractButton)
      expect(onExtract).toHaveBeenCalledTimes(1)
    })
  })

  describe('Dialog Behavior', () => {
    it('opens when open=true', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Extract Claims from Summary')).toBeInTheDocument()
    })

    it('does not render when open=false', () => {
      render(<ClaimsExtractionDialog {...defaultProps} open={false} />)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('closes when cancel clicked and not extracting', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<ClaimsExtractionDialog {...defaultProps} onClose={onClose} />)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not close when cancel clicked during extraction', async () => {
      const onClose = vi.fn()
      render(<ClaimsExtractionDialog {...defaultProps} extracting={true} onClose={onClose} />)

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      expect(cancelButton).toBeDisabled()

      // Cannot click disabled button, but verify it's disabled
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('Default Values', () => {
    it('starts with ontology enabled', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const ontologyCheckbox = screen.getByLabelText(/ontology \(enable #references\)/i)
      expect(ontologyCheckbox).toBeChecked()
    })

    it('starts with annotations disabled', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const annotationCheckbox = screen.getByLabelText(/annotations \(enable @references\)/i)
      expect(annotationCheckbox).not.toBeChecked()
    })

    it('starts with names-and-glosses ontology depth', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const namesAndGlossesRadio = screen.getByLabelText(/names \+ glosses \(default\)/i)
      expect(namesAndGlossesRadio).toBeChecked()
    })

    it('starts with 50 max claims', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const maxClaimsInput = screen.getByLabelText(/max claims/i)
      expect(maxClaimsInput).toHaveValue(50)
    })

    it('starts with 0.5 min confidence', () => {
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const minConfidenceInput = screen.getByLabelText(/min confidence/i)
      expect(minConfidenceInput).toHaveValue(0.5)
    })
  })

  describe('Ontology Depth Selection', () => {
    it('changes ontology depth', async () => {
      const user = userEvent.setup()
      render(<ClaimsExtractionDialog {...defaultProps} />)

      const namesOnlyRadio = screen.getByLabelText(/names only/i)
      await user.click(namesOnlyRadio)

      expect(namesOnlyRadio).toBeChecked()

      const namesAndGlossesRadio = screen.getByLabelText(/names \+ glosses/i)
      expect(namesAndGlossesRadio).not.toBeChecked()
    })

    it('includes ontology depth in config', async () => {
      const user = userEvent.setup()
      const onExtract = vi.fn()
      render(<ClaimsExtractionDialog {...defaultProps} onExtract={onExtract} />)

      const fullDefinitionsRadio = screen.getByLabelText(/full definitions/i)
      await user.click(fullDefinitionsRadio)

      const extractButton = screen.getByRole('button', { name: /extract claims/i })
      await user.click(extractButton)

      expect(onExtract).toHaveBeenCalledWith(
        expect.objectContaining({
          inputSources: expect.objectContaining({
            ontologyDepth: 'full-definitions',
          }),
        })
      )
    })
  })
})
