/**
 * ErrorBoundary component catches React errors in child components
 * and displays a fallback UI instead of crashing the entire application.
 */

import { Component, ErrorInfo, ReactNode } from 'react'
import { ErrorFallback } from './ErrorFallback'
import { logError } from '../services/errorLogging'

interface ErrorBoundaryProps {
  /**
   * Child components to render when no error has occurred
   */
  children: ReactNode

  /**
   * Optional fallback component to render when an error occurs
   * If not provided, uses the default ErrorFallback component
   */
  fallback?: (error: Error, resetError: () => void) => ReactNode

  /**
   * Optional callback invoked when an error is caught
   */
  onError?: (error: Error, errorInfo: ErrorInfo) => void

  /**
   * Optional context information to include in error logs
   */
  context?: Record<string, unknown>
}

interface ErrorBoundaryState {
  /**
   * Whether an error has been caught
   */
  hasError: boolean

  /**
   * The error that was caught (if any)
   */
  error: Error | null
}

/**
 * ErrorBoundary catches errors in React component tree and displays fallback UI.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 *
 * With custom fallback:
 * ```tsx
 * <ErrorBoundary fallback={(error, reset) => <CustomError error={error} onReset={reset} />}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  /**
   * Update state when an error is caught so next render shows fallback UI.
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  /**
   * Log error details when an error is caught.
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console and error tracking service
    logError(error, errorInfo, this.props.context)

    // Invoke optional error callback
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  /**
   * Reset error boundary to allow retrying the failed operation.
   */
  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
    })
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Render custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError)
      }

      // Otherwise render default fallback
      return <ErrorFallback error={this.state.error} resetError={this.resetError} />
    }

    // No error: render children normally
    return this.props.children
  }
}
