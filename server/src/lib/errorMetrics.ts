/**
 * Error-specific metrics for observability.
 *
 * Provides counters and helpers for tracking errors across the application,
 * enabling real-time monitoring and alerting via Grafana dashboards.
 */

import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('fovea-backend')

/**
 * Severity levels for error classification.
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical'

/**
 * Error sources for attribution.
 */
export type ErrorSource = 'backend' | 'frontend' | 'queue' | 'database' | 'external'

/**
 * Counter for total errors across all sources.
 * Labels: error_type, error_code, source, severity, route
 */
export const errorsTotalCounter = meter.createCounter('fovea.errors.total', {
  description: 'Total number of errors by type, source, and severity',
  unit: '1',
})

/**
 * Counter for frontend-reported errors.
 * Labels: error_type, component, route, browser, severity
 */
export const frontendErrorsCounter = meter.createCounter('fovea.errors.frontend', {
  description: 'Frontend errors reported by browser clients',
  unit: '1',
})

/**
 * Counter for API/backend errors.
 * Labels: method, route, status_code, error_code
 */
export const apiErrorsCounter = meter.createCounter('fovea.errors.api', {
  description: 'API errors by method, route, and status code',
  unit: '1',
})

/**
 * Counter for queue job failures.
 * Labels: queue_name, job_type, error_code
 */
export const queueErrorsCounter = meter.createCounter('fovea.errors.queue', {
  description: 'Queue job processing errors',
  unit: '1',
})

/**
 * Histogram for error processing time (for async error handling).
 */
export const errorProcessingDuration = meter.createHistogram('fovea.errors.processing_duration', {
  description: 'Time to process and record error in milliseconds',
  unit: 'ms',
})

/**
 * Options for recording an error.
 */
export interface RecordErrorOptions {
  /** Error type classification (e.g., 'validation', 'auth', 'runtime') */
  errorType: string
  /** Optional error code (e.g., 'VALIDATION_ERROR', 'NOT_FOUND') */
  errorCode?: string
  /** Source of the error */
  source: ErrorSource
  /** Severity level */
  severity: ErrorSeverity
  /** Route where the error occurred */
  route?: string
  /** HTTP method (for API errors) */
  method?: string
  /** HTTP status code (for API errors) */
  statusCode?: number
  /** Component name (for frontend errors) */
  component?: string
  /** Browser info (for frontend errors) */
  browser?: string
  /** Queue name (for queue errors) */
  queueName?: string
  /** Job type (for queue errors) */
  jobType?: string
}

/**
 * Record an error to appropriate metrics counters.
 * This is the main entry point for error tracking.
 *
 * @example
 * ```ts
 * recordError({
 *   errorType: 'validation',
 *   errorCode: 'INVALID_INPUT',
 *   source: 'backend',
 *   severity: 'warning',
 *   route: '/api/videos',
 *   method: 'POST',
 *   statusCode: 400,
 * })
 * ```
 */
export function recordError(options: RecordErrorOptions): void {
  const {
    errorType,
    errorCode = 'UNKNOWN',
    source,
    severity,
    route = 'unknown',
    method,
    statusCode,
    component,
    browser,
    queueName,
    jobType,
  } = options

  // Always record to total errors counter
  errorsTotalCounter.add(1, {
    error_type: errorType,
    error_code: errorCode,
    source,
    severity,
    route,
  })

  // Record to source-specific counters
  switch (source) {
    case 'frontend':
      frontendErrorsCounter.add(1, {
        error_type: errorType,
        component: component || 'unknown',
        route,
        browser: browser || 'unknown',
        severity,
      })
      break

    case 'backend':
      if (method && statusCode) {
        apiErrorsCounter.add(1, {
          method,
          route,
          status_code: statusCode.toString(),
          error_code: errorCode,
        })
      }
      break

    case 'queue':
      queueErrorsCounter.add(1, {
        queue_name: queueName || 'unknown',
        job_type: jobType || 'unknown',
        error_code: errorCode,
      })
      break

    // database and external errors only go to total counter
    default:
      break
  }
}

/**
 * Record an API error from the Fastify error handler.
 * Convenience wrapper for backend API errors.
 */
export function recordApiError(
  method: string,
  route: string,
  statusCode: number,
  errorCode: string,
  severity: ErrorSeverity = 'error'
): void {
  recordError({
    errorType: getErrorTypeFromStatus(statusCode),
    errorCode,
    source: 'backend',
    severity,
    route,
    method,
    statusCode,
  })
}

/**
 * Record a frontend error from telemetry endpoint.
 * Convenience wrapper for frontend errors.
 */
export function recordFrontendError(
  errorType: string,
  component: string,
  route: string,
  severity: ErrorSeverity,
  browser?: string
): void {
  recordError({
    errorType,
    source: 'frontend',
    severity,
    route,
    component,
    browser,
  })
}

/**
 * Record a queue processing error.
 * Convenience wrapper for queue errors.
 */
export function recordQueueError(
  queueName: string,
  jobType: string,
  errorCode: string
): void {
  recordError({
    errorType: 'queue-failure',
    errorCode,
    source: 'queue',
    severity: 'error',
    queueName,
    jobType,
  })
}

/**
 * Map HTTP status codes to error types.
 */
function getErrorTypeFromStatus(statusCode: number): string {
  if (statusCode >= 400 && statusCode < 500) {
    if (statusCode === 400) return 'validation'
    if (statusCode === 401) return 'auth'
    if (statusCode === 403) return 'forbidden'
    if (statusCode === 404) return 'not_found'
    if (statusCode === 409) return 'conflict'
    if (statusCode === 429) return 'rate_limit'
    return 'client_error'
  }
  if (statusCode >= 500) {
    if (statusCode === 503) return 'service_unavailable'
    if (statusCode === 504) return 'timeout'
    return 'server_error'
  }
  return 'unknown'
}

/**
 * Map severity to numeric level for comparison.
 */
export function severityToLevel(severity: ErrorSeverity): number {
  const levels: Record<ErrorSeverity, number> = {
    info: 0,
    warning: 1,
    error: 2,
    critical: 3,
  }
  return levels[severity] ?? 1
}
