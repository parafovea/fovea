/**
 * Hook for monitoring session validity and expiry warnings.
 * Polls the session status endpoint every 5 minutes and provides
 * expiry warnings when the session is close to expiring.
 *
 * @module hooks/auth/useSessionHeartbeat
 */

import { useState, useEffect, useCallback } from 'react'

import axiosInstance from '@api/axiosInstance'
import { logWarning } from '@services/errorLogging'

/**
 * Session heartbeat state returned by the hook.
 */
export interface SessionHeartbeatState {
  /** When the session expires, or null if unknown */
  expiresAt: Date | null
  /** Whether to show the expiry warning dialog */
  showWarning: boolean
  /** Whether the session has expired */
  isExpired: boolean
  /** Manually trigger a session check */
  checkSession: () => Promise<void>
}

/** Interval between session checks (5 minutes) */
const CHECK_INTERVAL_MS = 5 * 60 * 1000

/** Warning threshold before expiry (5 minutes) */
const WARNING_THRESHOLD_MS = 5 * 60 * 1000

/**
 * Monitors session validity and provides expiry warnings.
 * Checks session status every 5 minutes and sets showWarning
 * when the session is within 5 minutes of expiring.
 *
 * @returns Session heartbeat state including expiry time and warning flags
 *
 * @example
 * ```typescript
 * function SessionMonitor() {
 *   const { expiresAt, showWarning, isExpired } = useSessionHeartbeat()
 *
 *   if (isExpired) {
 *     return <RedirectToLogin />
 *   }
 *
 *   return showWarning ? <ExpiryWarningDialog expiresAt={expiresAt} /> : null
 * }
 * ```
 */
export function useSessionHeartbeat(): SessionHeartbeatState {
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const [showWarning, setShowWarning] = useState(false)
  const [isExpired, setIsExpired] = useState(false)

  const checkSession = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/api/auth/session-status')
      const { expiresAt: exp } = response.data
      const expDate = new Date(exp)
      setExpiresAt(expDate)

      // Show warning if within 5 minutes of expiry
      const timeUntilExpiry = expDate.getTime() - Date.now()
      setShowWarning(timeUntilExpiry > 0 && timeUntilExpiry < WARNING_THRESHOLD_MS)
      setIsExpired(false)

      logWarning('Session heartbeat check completed', {
        component: 'useSessionHeartbeat',
        expiresAt: exp,
        timeUntilExpiry,
        showWarning: timeUntilExpiry > 0 && timeUntilExpiry < WARNING_THRESHOLD_MS,
      })
    } catch (error) {
      const axiosError = error as { response?: { status?: number } }
      if (axiosError.response?.status === 401) {
        setIsExpired(true)
        setShowWarning(false)
      }
    }
  }, [])

  useEffect(() => {
    // Initial check
    checkSession()

    // Check every 5 minutes
    const interval = setInterval(checkSession, CHECK_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [checkSession])

  return { expiresAt, showWarning, isExpired, checkSession }
}
