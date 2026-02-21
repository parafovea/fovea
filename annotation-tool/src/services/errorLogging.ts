/**
 * Error logging service for centralized error handling and reporting.
 * Provides structured error logging with backend reporting and batching.
 *
 * Features:
 * - Backend error reporting with batching
 * - Configurable sample rate
 * - Session and correlation ID tracking
 * - Graceful handling of page unload
 */

import type { ErrorInfo } from 'react'

/**
 * Configuration options for error logging.
 */
export interface ErrorLoggingConfig {
  /** Enable error reporting to backend (default: true in production) */
  enabled?: boolean
  /** Sample rate 0-1 for error reporting (default: 0.2 in prod, 1.0 in dev) */
  sampleRate?: number
  /** Enable console logging (default: true in dev) */
  consoleLogging?: boolean
  /** Backend endpoint for error reports */
  endpoint?: string
  /** Batch size before auto-flush (default: 10) */
  batchSize?: number
  /** Batch timeout in ms (default: 5000) */
  batchTimeout?: number
}

/**
 * Error report payload sent to backend.
 */
interface ErrorReport {
  errorType: string
  message: string
  stack?: string
  componentStack?: string
  component?: string
  route?: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  context?: Record<string, unknown>
  timestamp: string
  sessionId?: string
  correlationId?: string
  browser?: string
  url?: string
}

const defaultConfig: Required<ErrorLoggingConfig> = {
  enabled: true,
  sampleRate: 0.2,
  consoleLogging: true,
  endpoint: '/api/telemetry/errors',
  batchSize: 10,
  batchTimeout: 5000,
}

// Module state
let config: Required<ErrorLoggingConfig> = { ...defaultConfig }
let sessionId: string | undefined
let errorBatch: ErrorReport[] = []
let batchTimer: ReturnType<typeof setTimeout> | null = null
let initialized = false

/**
 * Initialize error logging service.
 * Should be called once at app startup, before React renders.
 */
export function initErrorLogging(userConfig: ErrorLoggingConfig = {}): void {
  if (initialized) {
    console.warn('[ErrorLogging] Already initialized, skipping')
    return
  }

  config = { ...defaultConfig, ...userConfig }
  sessionId = generateSessionId()
  initialized = true

  // Set up page unload handler to flush pending errors
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      flushErrors(true)
    })

    // Also handle visibilitychange for mobile
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushErrors(true)
      }
    })
  }

  if (config.consoleLogging) {
    console.debug(`[ErrorLogging] Initialized with sample rate ${config.sampleRate}`)
  }
}

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
  const severity: 'error' | 'warning' = 'error'

  // Console logging
  if (config.consoleLogging) {
    console.group('[ErrorLogging] Application Error')
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)

    if (errorInfo?.componentStack) {
      console.error('Component Stack:', errorInfo.componentStack)
    }

    if (context) {
      console.error('Context:', context)
    }

    console.groupEnd()
  }

  // Backend reporting
  reportError({
    errorType: getErrorType(error),
    message: error.message,
    stack: error.stack,
    componentStack: errorInfo?.componentStack ?? undefined,
    component: context?.component as string | undefined,
    route: getCurrentRoute(),
    severity,
    context,
    timestamp: new Date().toISOString(),
    correlationId: generateCorrelationId(),
    browser: getBrowserInfo(),
    url: typeof window !== 'undefined' ? window.location.href : undefined,
  })
}

/**
 * Logs a warning message.
 *
 * @param message - The warning message
 * @param data - Optional additional data
 */
export function logWarning(message: string, data?: Record<string, unknown>): void {
  if (config.consoleLogging) {
    console.warn('[ErrorLogging] Warning:', message, data)
  }

  reportError({
    errorType: 'warning',
    message,
    severity: 'warning',
    context: data,
    route: getCurrentRoute(),
    timestamp: new Date().toISOString(),
    correlationId: generateCorrelationId(),
    browser: getBrowserInfo(),
    url: typeof window !== 'undefined' ? window.location.href : undefined,
  })
}

/**
 * Logs a critical error with immediate send.
 * Use for errors that need immediate attention.
 *
 * @param error - The error object
 * @param context - Optional additional context
 */
export function logCritical(error: Error, context?: Record<string, unknown>): void {
  if (config.consoleLogging) {
    console.error('[ErrorLogging] CRITICAL:', error.message, error.stack, context)
  }

  const report: ErrorReport = {
    errorType: getErrorType(error),
    message: error.message,
    stack: error.stack,
    component: context?.component as string | undefined,
    route: getCurrentRoute(),
    severity: 'critical',
    context,
    timestamp: new Date().toISOString(),
    correlationId: generateCorrelationId(),
    browser: getBrowserInfo(),
    url: typeof window !== 'undefined' ? window.location.href : undefined,
  }

  // Critical errors bypass batching and send immediately
  sendErrorReport(report, true)
}

/**
 * Logs an info message.
 *
 * @param message - The info message
 * @param data - Optional additional data
 */
export function logInfo(message: string, data?: Record<string, unknown>): void {
  if (config.consoleLogging) {
    console.info('[ErrorLogging] Info:', message, data)
  }

  // Info messages are not sent to backend unless explicitly requested
}

/**
 * Queue an error for batched reporting.
 */
function reportError(report: ErrorReport): void {
  if (!config.enabled) {
    return
  }

  // Apply sampling
  if (Math.random() > config.sampleRate) {
    return
  }

  report.sessionId = sessionId

  errorBatch.push(report)

  // Check if batch is full
  if (errorBatch.length >= config.batchSize) {
    flushErrors()
  } else if (!batchTimer) {
    // Start batch timer
    batchTimer = setTimeout(() => {
      flushErrors()
    }, config.batchTimeout)
  }
}

/**
 * Flush pending errors to backend.
 *
 * @param useKeepalive - Use keepalive for unload scenarios
 */
function flushErrors(useKeepalive = false): void {
  if (batchTimer) {
    clearTimeout(batchTimer)
    batchTimer = null
  }

  if (errorBatch.length === 0) {
    return
  }

  const batch = [...errorBatch]
  errorBatch = []

  // Use batch endpoint for multiple errors
  const endpoint = batch.length === 1
    ? config.endpoint
    : `${config.endpoint}/batch`

  const body = batch.length === 1
    ? JSON.stringify(batch[0])
    : JSON.stringify({ errors: batch })

  try {
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
      keepalive: useKeepalive,
    }).catch((err) => {
      // Silent fail - we don't want to cause more errors
      if (config.consoleLogging) {
        console.debug('[ErrorLogging] Failed to send errors:', err)
      }
    })
  } catch {
    // Ignore errors during send
  }
}

/**
 * Send a single error report immediately (bypass batching).
 */
function sendErrorReport(report: ErrorReport, useKeepalive = false): void {
  if (!config.enabled) {
    return
  }

  report.sessionId = sessionId

  try {
    fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(report),
      keepalive: useKeepalive,
    }).catch((err) => {
      if (config.consoleLogging) {
        console.debug('[ErrorLogging] Failed to send critical error:', err)
      }
    })
  } catch {
    // Ignore errors during send
  }
}

/**
 * Generate a session ID for error correlation.
 * Uses crypto.randomUUID() for secure randomness.
 */
function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `sess-${crypto.randomUUID()}`
  }
  // Fallback for environments without crypto.randomUUID
  return `sess-${Date.now().toString(36)}-${generateSecureRandom()}`
}

/**
 * Generate a correlation ID for individual errors.
 * Uses crypto.getRandomValues() for secure randomness.
 */
function generateCorrelationId(): string {
  return `err-${Date.now().toString(36)}-${generateSecureRandom()}`
}

/**
 * Generate a secure random string using crypto API.
 */
function generateSecureRandom(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint32Array(2)
    crypto.getRandomValues(array)
    return array[0].toString(36) + array[1].toString(36)
  }
  // Last resort fallback - should rarely be hit in modern browsers
  return Math.random().toString(36).substring(2, 11)
}

/**
 * Get current route from window location.
 */
function getCurrentRoute(): string {
  if (typeof window === 'undefined') {
    return 'unknown'
  }
  return window.location.pathname
}

/**
 * Get browser information for error context.
 */
function getBrowserInfo(): string {
  if (typeof navigator === 'undefined') {
    return 'unknown'
  }
  const ua = navigator.userAgent
  // Simple browser detection
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Edg')) return 'Edge'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Safari')) return 'Safari'
  return 'Other'
}

/**
 * Classify error type from error object.
 */
function getErrorType(error: Error): string {
  if (error.name === 'TypeError') return 'type-error'
  if (error.name === 'SyntaxError') return 'syntax-error'
  if (error.name === 'ReferenceError') return 'reference-error'
  if (error.name === 'RangeError') return 'range-error'
  if (error.message.includes('network') || error.message.includes('fetch')) return 'network-error'
  if (error.message.includes('chunk')) return 'chunk-load-error'
  return 'runtime-error'
}

/**
 * Get the current session ID for correlation.
 */
export function getSessionId(): string | undefined {
  return sessionId
}
