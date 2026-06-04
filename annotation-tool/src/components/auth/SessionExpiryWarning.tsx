/**
 * Dialog component that warns users when their session is about to expire.
 * Provides options to extend the session or logout immediately.
 *
 * @module components/auth/SessionExpiryWarning
 */

import { useState, useEffect } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import axiosInstance from '@api/axiosInstance'

/**
 * Props for the SessionExpiryWarning component.
 */
export interface SessionExpiryWarningProps {
  /** Whether the dialog is open */
  open: boolean
  /** When the session expires */
  expiresAt: Date | null
  /** Callback when session is extended */
  onExtend: () => void
  /** Callback when user chooses to logout */
  onLogout: () => void
}

/**
 * Dialog that warns users about imminent session expiry.
 * Displays a countdown timer and provides buttons to extend
 * the session or logout immediately.
 *
 * @param props - Component props
 * @returns Session expiry warning dialog
 *
 * @example
 * ```typescript
 * function SessionMonitor() {
 *   const { expiresAt, showWarning, checkSession } = useSessionHeartbeat()
 *
 *   return (
 *     <SessionExpiryWarning
 *       open={showWarning}
 *       expiresAt={expiresAt}
 *       onExtend={checkSession}
 *       onLogout={handleLogout}
 *     />
 *   )
 * }
 * ```
 */
export function SessionExpiryWarning({
  open,
  expiresAt,
  onExtend,
  onLogout,
}: SessionExpiryWarningProps): JSX.Element {
  const [countdown, setCountdown] = useState('')
  const [extending, setExtending] = useState(false)

  useEffect(() => {
    if (!open || !expiresAt) return

    const updateCountdown = (): void => {
      const remaining = Math.max(
        0,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000)
      )
      const minutes = Math.floor(remaining / 60)
      const seconds = remaining % 60
      setCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`)
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [open, expiresAt])

  const handleExtend = async (): Promise<void> => {
    setExtending(true)
    try {
      await axiosInstance.post('/api/auth/extend-session')
      onExtend()
    } catch {
      // Error handled by interceptor
    } finally {
      setExtending(false)
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Session Expiring Soon</DialogTitle>
          <DialogDescription>
            Your session will expire in {countdown}. Would you like to stay logged in?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onLogout}>
            Logout Now
          </Button>
          <Button onClick={handleExtend} disabled={extending}>
            {extending ? 'Extending...' : 'Stay Logged In'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
