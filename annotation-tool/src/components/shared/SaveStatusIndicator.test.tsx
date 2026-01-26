/**
 * Unit tests for SaveStatusIndicator component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SaveStatusIndicator } from './SaveStatusIndicator'

describe('SaveStatusIndicator', () => {
  describe('idle status', () => {
    it('renders nothing when status is idle', () => {
      const { container } = render(
        <SaveStatusIndicator
          status="idle"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={0}
        />
      )

      expect(container.firstChild).toBeNull()
    })
  })

  describe('saving status', () => {
    it('shows saving indicator and message', () => {
      render(
        <SaveStatusIndicator
          status="saving"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={0}
        />
      )

      expect(screen.getByText('Saving...')).toBeInTheDocument()
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('shows only progress indicator in compact mode', () => {
      render(
        <SaveStatusIndicator
          status="saving"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={0}
          compact
        />
      )

      expect(screen.getByRole('progressbar')).toBeInTheDocument()
      expect(screen.queryByText('Saving...')).not.toBeInTheDocument()
    })
  })

  describe('saved status', () => {
    it('shows saved message with time', () => {
      const savedAt = new Date('2024-01-15T14:30:00')

      render(
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
      render(
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
      render(
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
      render(
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

      render(
        <SaveStatusIndicator
          status="error"
          lastSavedAt={null}
          errorMessage="Network error"
          retryCount={0}
          onRetry={onRetry}
        />
      )

      const retryButton = screen.getByRole('button', { name: /retry/i })
      expect(retryButton).toBeInTheDocument()

      fireEvent.click(retryButton)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('does not show retry button when onRetry is not provided', () => {
      render(
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
      render(
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
      render(
        <SaveStatusIndicator
          status="retrying"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={1}
          maxRetries={3}
        />
      )

      expect(screen.getByText('Retrying (2/3)...')).toBeInTheDocument()
      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('shows progress indicator with tooltip in compact mode', () => {
      render(
        <SaveStatusIndicator
          status="retrying"
          lastSavedAt={null}
          errorMessage={null}
          retryCount={1}
          maxRetries={3}
          compact
        />
      )

      expect(screen.getByRole('progressbar')).toBeInTheDocument()
    })

    it('uses default maxRetries of 3', () => {
      render(
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
