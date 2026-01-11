/**
 * Tests for ErrorFallback component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorFallback } from './ErrorFallback'

describe('ErrorFallback', () => {
  const mockError = new Error('Test error message')
  mockError.stack = 'Error: Test error message\n    at TestComponent (test.tsx:10:15)'

  const mockResetError = vi.fn()

  it('renders error heading', () => {
    render(<ErrorFallback error={mockError} resetError={mockResetError} />)

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders apology message', () => {
    render(<ErrorFallback error={mockError} resetError={mockResetError} />)

    expect(
      screen.getByText(/We apologize for the inconvenience/i)
    ).toBeInTheDocument()
  })

  it('renders "Try Again" button', () => {
    render(<ErrorFallback error={mockError} resetError={mockResetError} />)

    const tryAgainButton = screen.getByRole('button', { name: /try again/i })
    expect(tryAgainButton).toBeInTheDocument()
  })

  it('renders "Report Issue" button', () => {
    render(<ErrorFallback error={mockError} resetError={mockResetError} />)

    const reportButton = screen.getByRole('button', { name: /report issue/i })
    expect(reportButton).toBeInTheDocument()
  })

  it('calls resetError when "Try Again" is clicked', async () => {
    const user = userEvent.setup()
    render(<ErrorFallback error={mockError} resetError={mockResetError} />)

    const tryAgainButton = screen.getByRole('button', { name: /try again/i })
    await user.click(tryAgainButton)

    expect(mockResetError).toHaveBeenCalledTimes(1)
  })

  it('opens GitHub issue when "Report Issue" is clicked', async () => {
    const user = userEvent.setup()
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null)

    render(<ErrorFallback error={mockError} resetError={mockResetError} />)

    const reportButton = screen.getByRole('button', { name: /report issue/i })
    await user.click(reportButton)

    expect(windowOpenSpy).toHaveBeenCalledTimes(1)
    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://github.com/parafovea/fovea/issues/new'),
      '_blank'
    )
    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('Test%20error%20message'),
      '_blank'
    )
  })

  it('shows error details when clicked', async () => {
    const user = userEvent.setup()
    render(<ErrorFallback error={mockError} resetError={mockResetError} />)

    // Find the toggle button
    const errorDetailsToggle = screen.getByText('Error details')
    expect(errorDetailsToggle).toBeInTheDocument()

    // Click to expand
    await user.click(errorDetailsToggle)

    // Error message and stack trace should now be visible
    const errorText = screen.getByText(/Test error message/)
    expect(errorText).toBeVisible()

    // Stack trace should also be visible
    const stackTrace = screen.getByText(/at TestComponent/)
    expect(stackTrace).toBeVisible()
  })

  it('displays error stack trace', async () => {
    const user = userEvent.setup()
    render(<ErrorFallback error={mockError} resetError={mockResetError} />)

    const errorDetailsToggle = screen.getByText('Error details')
    await user.click(errorDetailsToggle)

    expect(screen.getByText(/at TestComponent/)).toBeInTheDocument()
  })

  it('handles error without stack trace', async () => {
    const user = userEvent.setup()
    const errorWithoutStack = new Error('Error without stack')
    delete errorWithoutStack.stack

    render(<ErrorFallback error={errorWithoutStack} resetError={mockResetError} />)

    const errorDetailsToggle = screen.getByText('Error details')
    await user.click(errorDetailsToggle)

    expect(screen.getByText('Error without stack')).toBeInTheDocument()
  })

  it('renders bug report icon', () => {
    const { container } = render(<ErrorFallback error={mockError} resetError={mockResetError} />)

    // Check for BugReport icon (MUI renders it as SVG)
    const icon = container.querySelector('svg[data-testid="BugReportIcon"]')
    expect(icon || container.querySelector('svg')).toBeInTheDocument()
  })
})
