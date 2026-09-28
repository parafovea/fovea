/**
 * Unit tests for SaveStatusIndicator component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { SaveStatusIndicator } from './SaveStatusIndicator'
import { AnchorRegistryProvider } from '@/tours/engine/anchorRegistry'

/** Render within an anchor registry so the save-indicator tour anchor can register. */
function renderIndicator(ui: ReactElement) {
  return render(<AnchorRegistryProvider>{ui}</AnchorRegistryProvider>)
}

describe('SaveStatusIndicator', () => {
  describe('idle status', () => {
    it('renders an invisible placeholder when status is idle', () => {
      // Idle renders a screen-reader-only div carrying the save-indicator
      // anchor so the auto-save surface has a stable spotlight target while no
      // save is in flight. Visually identical to nothing (height 0, sr-only).
      // The test asserts the placeholder is present and aria-hidden, not that
      // the element tree is empty.
      const { container } = renderIndicator(
        <SaveStatusIndicator
          status="idle"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={0}
        />
      )

      const placeholder = container.querySelector('[data-testid="save-status-idle"]')
      expect(placeholder).not.toBeNull()
      expect(placeholder).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('data-testid attributes', () => {
    it('renders with data-testid for saving status', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="saving"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={0}
        />
      )

      expect(screen.getByTestId('save-status-saving')).toBeInTheDocument()
    })

    it('renders with data-testid for saved status', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="saved"
          lastSavedAt={new Date()}
          errorMessage={null}
          retryCount={0}
        />
      )

      expect(screen.getByTestId('save-status-saved')).toBeInTheDocument()
    })

    it('renders with data-testid for error status', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="error"
          lastSavedAt={null}
          errorMessage="Network error"
          retryCount={0}
        />
      )

      expect(screen.getByTestId('save-status-error')).toBeInTheDocument()
    })

    it('renders with data-testid for retrying status', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="retrying"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={1}
        />
      )

      expect(screen.getByTestId('save-status-retrying')).toBeInTheDocument()
    })

    it('renders with data-testid in compact mode', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="saved"
          lastSavedAt={new Date()}
          errorMessage={null}
          retryCount={0}
          compact
        />
      )

      expect(screen.getByTestId('save-status-saved')).toBeInTheDocument()
    })
  })

  describe('saving status', () => {
    it('shows saving indicator and message', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="saving"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={0}
        />
      )

      expect(screen.getByText('Saving...')).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('shows only progress indicator in compact mode', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="saving"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={0}
          compact
        />
      )

      expect(screen.getByRole('status')).toBeInTheDocument()
      expect(screen.queryByText('Saving...')).not.toBeInTheDocument()
    })
  })

  describe('saved status', () => {
    it('shows saved message with time', () => {
      const savedAt = new Date('2024-01-15T14:30:00')

      renderIndicator(
        <SaveStatusIndicator
          status="saved"
          lastSavedAt={savedAt}
          errorMessage={null}
          retryCount={0}
        />
      )

      expect(screen.getByText(/Saved at/)).toBeInTheDocument()
    })

    it('shows saved message without time when lastSavedAt is null', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="saved"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={0}
        />
      )

      expect(screen.getByText('Saved')).toBeInTheDocument()
    })

    it('shows check icon in compact mode', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="saved"
          lastSavedAt={new Date()}
          errorMessage={null}
          retryCount={0}
          compact
        />
      )

      expect(screen.getByTestId('CheckIcon')).toBeInTheDocument()
      expect(screen.queryByText(/Saved/)).not.toBeInTheDocument()
    })
  })

  describe('error status', () => {
    it('shows error message', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="error"
          lastSavedAt={null}
          errorMessage="Network error"
          retryCount={0}
        />
      )

      expect(screen.getByText('Save failed')).toBeInTheDocument()
    })

    it('shows retry button when onRetry is provided', () => {
      const onRetry = vi.fn()

      renderIndicator(
        <SaveStatusIndicator
          status="error"
          lastSavedAt={null}
          errorMessage="Network error"
          retryCount={0}
          onRetry={onRetry}
        />
      )

      // The retry button is rendered via TooltipTrigger render prop,
      // so find it by its aria-label or by querying the button inside the tooltip
      const retryButton = screen.getByRole('button', { name: /retry/i })
      expect(retryButton).toBeInTheDocument()

      fireEvent.click(retryButton)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('does not show retry button when onRetry is not provided', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="error"
          lastSavedAt={null}
          errorMessage="Network error"
          retryCount={0}
        />
      )

      expect(
        screen.queryByRole('button', { name: /retry/i })
      ).not.toBeInTheDocument()
    })

    it('shows error icon with tooltip in compact mode', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="error"
          lastSavedAt={null}
          errorMessage="Network error"
          retryCount={0}
          compact
        />
      )

      expect(screen.getByTestId('ErrorIcon')).toBeInTheDocument()
    })
  })

  describe('retrying status', () => {
    it('shows retrying message with count', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="retrying"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={1}
          maxRetries={3}
        />
      )

      expect(screen.getByText('Retrying (2/3)...')).toBeInTheDocument()
      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('shows progress indicator with tooltip in compact mode', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="retrying"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={1}
          maxRetries={3}
          compact
        />
      )

      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('uses default maxRetries of 3', () => {
      renderIndicator(
        <SaveStatusIndicator
          status="retrying"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={0}
        />
      )

      expect(screen.getByText('Retrying (1/3)...')).toBeInTheDocument()
    })
  })
})
