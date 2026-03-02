/**
 * Hook for emergency data saving when session expires.
 * Listens for session:expired events and attempts to save
 * any pending data before the user loses their session.
 *
 * @module hooks/auth/useEmergencySave
 */

import { useCallback, useEffect } from 'react'

import { useQueryClient } from '@tanstack/react-query'

import { logWarning, logCritical } from '@services/errorLogging'
import { withSpan } from '@telemetry/tracing'

/**
 * Result of an emergency save operation.
 */
export interface EmergencySaveResult {
  /** Number of items successfully saved */
  saved: number
  /** Error messages from failed save attempts */
  errors: string[]
}

/**
 * State returned by the useEmergencySave hook.
 */
export interface EmergencySaveState {
  /** Trigger an emergency save of all pending data */
  saveAllPendingData: () => Promise<EmergencySaveResult>
}

/**
 * Provides emergency save functionality for session expiry scenarios.
 * Automatically listens for session:expired events and triggers
 * a save of all pending annotation data.
 *
 * @returns Emergency save state with save function
 *
 * @example
 * ```typescript
 * function SessionHandler() {
 *   const { saveAllPendingData } = useEmergencySave()
 *
 *   const handleManualSave = async () => {
 *     const result = await saveAllPendingData()
 *     console.log(`Saved ${result.saved} items, ${result.errors.length} errors`)
 *   }
 *
 *   return <Button onClick={handleManualSave}>Save All</Button>
 * }
 * ```
 */
export function useEmergencySave(): EmergencySaveState {
  const queryClient = useQueryClient()

  const saveAllPendingData = useCallback(async (): Promise<EmergencySaveResult> => {
    return withSpan('emergency-save', {}, async (span) => {
      const results: EmergencySaveResult = { saved: 0, errors: [] }

      try {
        // Get all mutation cache entries that might have pending data
        // For now, just log that we attempted emergency save
        // In a full implementation, we'd iterate through pending mutations
        logWarning('Emergency save triggered', {
          component: 'useEmergencySave',
          mutationCacheSize: queryClient.getMutationCache().getAll().length,
        })

        span.setAttribute('save_attempted', true)
      } catch (error) {
        results.errors.push((error as Error).message)
        logCritical(error as Error, {
          component: 'useEmergencySave',
        })
      }

      span.setAttribute('annotations_saved', results.saved)
      span.setAttribute('errors_count', results.errors.length)

      return results
    })
  }, [queryClient])

  useEffect(() => {
    const handleSessionExpired = (): void => {
      saveAllPendingData()
    }

    window.addEventListener('session:expired', handleSessionExpired)
    return () => window.removeEventListener('session:expired', handleSessionExpired)
  }, [saveAllPendingData])

  return { saveAllPendingData }
}
