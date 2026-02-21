/**
 * Authentication security metrics using OpenTelemetry.
 *
 * Provides counters for monitoring auth events, session lifecycle, and lockout events.
 * These metrics help identify security incidents and track auth system health.
 *
 * @module
 */

import { metrics } from '@opentelemetry/api'

const meter = metrics.getMeter('fovea-backend')

/**
 * Counter for authentication events (login attempts, successes, failures).
 */
export const authEventsCounter = meter.createCounter('fovea.auth.events', {
  description: 'Authentication events by type and result',
  unit: '1',
})

/**
 * Counter for session lifecycle events.
 */
export const sessionEventsCounter = meter.createCounter('fovea.auth.sessions', {
  description: 'Session lifecycle events',
  unit: '1',
})

/**
 * Counter for account lockout events.
 */
export const lockoutEventsCounter = meter.createCounter('fovea.auth.lockouts', {
  description: 'Account lockout events',
  unit: '1',
})

/**
 * Record a login attempt.
 *
 * @param success - Whether the login succeeded
 * @param reason - Failure reason if not successful
 */
export function recordLoginAttempt(success: boolean, reason?: string): void {
  authEventsCounter.add(1, {
    event_type: 'login',
    success: String(success),
    failure_reason: reason || 'none',
  })
}

/**
 * Record a session lifecycle event.
 *
 * @param event - Type of session event
 */
export function recordSessionEvent(
  event: 'created' | 'regenerated' | 'expired' | 'revoked' | 'extended'
): void {
  sessionEventsCounter.add(1, { event_type: event })
}

/**
 * Record an account lockout event.
 *
 * @param _username - Username that was locked out (not included in metrics to avoid cardinality)
 * @param attemptCount - Number of failed attempts that triggered lockout
 */
export function recordLockout(_username: string, attemptCount: number): void {
  // Bucket the attempt count to avoid high cardinality
  let bucket: string
  if (attemptCount <= 5) {
    bucket = '1-5'
  } else if (attemptCount <= 10) {
    bucket = '6-10'
  } else {
    bucket = '10+'
  }

  lockoutEventsCounter.add(1, {
    reason: 'failed_attempts',
    attempt_count_bucket: bucket,
  })
}
