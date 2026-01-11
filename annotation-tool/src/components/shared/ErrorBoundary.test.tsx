/**
 * Tests for ErrorBoundary component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from './ErrorBoundary'

/**
 * Component that throws an error for testing.
 */
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error')
  }
  return <div>No error</div>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error for these tests since we're intentionally triggering errors
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'group').mockImplementation(() => {})
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {})
  })

  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    )

    expect(screen.getByText('Test content')).toBeInTheDocument()
  })

  it('catches errors and renders fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('displays error message in fallback UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    // Click to expand error details
    const expandButton = screen.getByText('Error details')
    userEvent.click(expandButton)

    // Error message should be visible
    expect(screen.getByText(/Test error/)).toBeInTheDocument()
  })

  it('resets error boundary state when "Try Again" is clicked', async () => {
    const user = userEvent.setup()
    const resetError = vi.fn()

    render(
      <ErrorBoundary
        fallback={(error, reset) => (
          <div>
            <p>Error occurred: {error.message}</p>
            <button onClick={() => { reset(); resetError(); }}>Try Again</button>
          </div>
        )}
      >
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    // Error should be caught
    expect(screen.getByText(/Error occurred:/)).toBeInTheDocument()

    // Click "Try Again"
    const tryAgainButton = screen.getByRole('button', { name: /try again/i })
    await user.click(tryAgainButton)

    // Reset callback should be called
    expect(resetError).toHaveBeenCalled()
  })

  it('renders custom fallback when provided', () => {
    const customFallback = (error: Error, resetError: () => void) => (
      <div>
        <h1>Custom Error</h1>
        <p>{error.message}</p>
        <button onClick={resetError}>Reset</button>
      </div>
    )

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(screen.getByText('Custom Error')).toBeInTheDocument()
    expect(screen.getByText('Test error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
  })

  it('calls onError callback when error is caught', () => {
    const onError = vi.fn()

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(onError).toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String),
      })
    )
  })

  it('logs error with context when provided', () => {
    const consoleSpy = vi.spyOn(console, 'error')

    render(
      <ErrorBoundary context={{ route: 'TestRoute', user: 'test-user' }}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(consoleSpy).toHaveBeenCalled()
  })

  it('provides "Report Issue" link', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    )

    const reportButton = screen.getByRole('button', { name: /report issue/i })
    expect(reportButton).toBeInTheDocument()
  })
})
