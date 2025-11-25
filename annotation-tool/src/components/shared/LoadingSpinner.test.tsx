import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoadingSpinner } from './LoadingSpinner'

describe('LoadingSpinner', () => {
  it('renders with default message', () => {
    render(<LoadingSpinner />)

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders with custom message', () => {
    render(<LoadingSpinner message="Please wait..." />)

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    expect(screen.getByText('Please wait...')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('renders without message when empty string provided', () => {
    render(<LoadingSpinner message="" />)

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('renders CircularProgress component', () => {
    const { container } = render(<LoadingSpinner />)

    // CircularProgress renders as an SVG with role="progressbar"
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toBeInTheDocument()
  })

  it('applies correct styles for centering', () => {
    render(<LoadingSpinner />)

    const container = screen.getByTestId('loading-spinner')
    const styles = window.getComputedStyle(container)

    expect(styles.display).toBe('flex')
    expect(styles.flexDirection).toBe('column')
    expect(styles.alignItems).toBe('center')
    expect(styles.justifyContent).toBe('center')
  })
})
