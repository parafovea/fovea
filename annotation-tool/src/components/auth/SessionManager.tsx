/**
 * Orchestration component for session management.
 * Combines session heartbeat monitoring, emergency save functionality,
 * and expiry warnings into a single component.
 *
 * @module components/auth/SessionManager
 */

import { useEffect, useCallback } from 'react'

import { useNavigate } from 'react-router-dom'

import { useAuthStore } from '@store/zustand/authStore'
import { useSessionHeartbeat } from '@hooks/auth/useSessionHeartbeat'
import { useEmergencySave } from '@hooks/auth/useEmergencySave'
import { SessionExpiryWarning } from './SessionExpiryWarning'

/**
 * Manages session lifecycle including expiry warnings and automatic logout.
 * Renders the SessionExpiryWarning dialog when the session is about to expire
 * and handles navigation to login page on session expiry.
 *
 * This component should be rendered once at the app root level,
 * after the Routes component.
 *
 * @returns Session manager component (renders warning dialog in multi-user mode)
 *
 * @example
 * ```typescript
 * function App() {
 *   return (
 *     <ErrorBoundary>
 *       <Routes>
 *         {/* routes *\/}
 *       </Routes>
 *       <SessionManager />
 *     </ErrorBoundary>
 *   )
 * }
 * ```
 */
export function SessionManager(): JSX.Element | null {
  const navigate = useNavigate()
  const mode = useAuthStore((state) => state.mode)
  const logoutSuccess = useAuthStore((state) => state.logoutSuccess)
  const isMultiUser = mode === 'multi-user'
  const { expiresAt, showWarning, checkSession } = useSessionHeartbeat(isMultiUser)
  useEmergencySave() // Sets up event listener

  const handleExtend = useCallback(() => {
    checkSession() // Refresh session info
  }, [checkSession])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // Ignore
    }
    logoutSuccess()
    if (mode === 'multi-user') {
      navigate('/login')
    }
  }, [logoutSuccess, mode, navigate])

  // Listen for session:expired event
  useEffect(() => {
    const handleExpired = (): void => {
      if (mode === 'multi-user') {
        navigate('/login')
      }
    }

    window.addEventListener('session:expired', handleExpired)
    return () => window.removeEventListener('session:expired', handleExpired)
  }, [mode, navigate])

  // Only show in multi-user mode
  if (mode !== 'multi-user') {
    return null
  }

  return (
    <SessionExpiryWarning
      open={showWarning}
      expiresAt={expiresAt}
      onExtend={handleExtend}
      onLogout={handleLogout}
    />
  )
}
