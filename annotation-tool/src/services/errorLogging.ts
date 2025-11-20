/**
 * Error logging service for centralized error handling and reporting.
 * Provides structured error logging with stack traces.
 * Extensible for future error tracking services (e.g., Sentry, Rollbar).
 */

import type { ErrorInfo } from 'react'

/**
 * Logs an error with additional context information.
 *
 * @param error - The error object that was thrown
 * @param errorInfo - React error info containing component stack
 * @param context - Optional additional context about where/when the error occurred
 */
export function logError(
  error: Error,
  errorInfo?: ErrorInfo,
  context?: Record<string, unknown>
): void {
  // Log to console with structured format
  console.group('🚨 Application Error')
  console.error('Error:', error.message)
  console.error('Stack:', error.stack)

  if (errorInfo?.componentStack) {
    console.error('Component Stack:', errorInfo.componentStack)
  }

  if (context) {
    console.error('Context:', context)
  }

  console.groupEnd()

  // Future: Send to error tracking service
  // Example: Sentry.captureException(error, { contexts: { react: errorInfo, ...context } })
}

/**
 * Logs a warning message.
 *
 * @param message - The warning message
 * @param data - Optional additional data
 */
export function logWarning(message: string, data?: Record<string, unknown>): void {
  console.warn('⚠️  Warning:', message, data)

  // Future: Send to monitoring service
}

/**
 * Logs an info message.
 *
 * @param message - The info message
 * @param data - Optional additional data
 */
export function logInfo(message: string, data?: Record<string, unknown>): void {
  console.info('ℹ️  Info:', message, data)

  // Future: Send to analytics service
}
