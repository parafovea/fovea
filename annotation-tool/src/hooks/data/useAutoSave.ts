/**
 * Generic auto-save hook for automatic data persistence.
 *
 * Provides debounced saves, periodic backup saves, retry logic with exponential
 * backoff, and automatic saves on page visibility changes and unload.
 *
 * @module hooks/data/useAutoSave
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { logWarning, logCritical } from '@services/errorLogging'
import { withSpan } from '@telemetry/tracing'

/**
 * Status of the auto-save operation.
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'retrying'

/**
 * Entity types supported by auto-save for observability.
 */
export type AutoSaveEntityType =
  | 'annotation'
  | 'persona'
  | 'ontology'
  | 'summary'
  | 'claim'
  | 'world-object'

/**
 * Configuration options for useAutoSave hook.
 */
export interface UseAutoSaveOptions<T> {
  /** Data to auto-save */
  data: T
  /** Whether auto-save is enabled */
  isEnabled: boolean
  /** Function to perform the save operation */
  onSave: (data: T) => Promise<void>
  /** Debounce delay in milliseconds (default: 1000ms) */
  debounceMs?: number
  /** Periodic backup save interval in milliseconds (default: 30000ms) */
  periodicMs?: number
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number
  /** Entity type for observability tracing */
  entityType: AutoSaveEntityType
  /** Entity ID for tracing context */
  entityId?: string
}

/**
 * Return value from useAutoSave hook.
 */
export interface UseAutoSaveReturn {
  /** Current save status */
  saveStatus: SaveStatus
  /** Timestamp of last successful save */
  lastSavedAt: Date | null
  /** Whether there are unsaved changes */
  pendingChanges: boolean
  /** Error message if save failed */
  errorMessage: string | null
  /** Current retry attempt count */
  retryCount: number
  /** Force an immediate save, bypassing debounce */
  forceSave: () => Promise<void>
}

/**
 * Generic auto-save hook for automatic data persistence.
 *
 * Features:
 * - Debounced saves on data changes
 * - Periodic backup saves at configurable intervals
 * - Retry logic with exponential backoff
 * - Automatic save on page visibility change (tab hidden)
 * - Automatic save attempt before page unload
 * - Telemetry tracing for observability
 *
 * @param options - Configuration options
 * @returns Auto-save state and control functions
 *
 * @example
 * ```typescript
 * const { saveStatus, pendingChanges, forceSave } = useAutoSave({
 *   data: annotations,
 *   isEnabled: true,
 *   onSave: async (data) => {
 *     await api.saveAnnotations(videoId, data)
 *   },
 *   entityType: 'annotation',
 *   entityId: videoId,
 * })
 * ```
 */
export function useAutoSave<T>({
  data,
  isEnabled,
  onSave,
  debounceMs = 1000,
  periodicMs = 30000,
  maxRetries = 3,
  entityType,
  entityId,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [pendingChanges, setPendingChanges] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const saveInProgressRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const periodicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dataRef = useRef(data)
  const lastSavedDataRef = useRef<string>('')

  // Update data ref when data changes
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // Core save function with retry logic
  const performSave = useCallback(
    async (attempt = 0): Promise<void> => {
      if (saveInProgressRef.current) return

      const currentData = dataRef.current
      const serialized = JSON.stringify(currentData)

      // Skip if no changes
      if (serialized === lastSavedDataRef.current) {
        setPendingChanges(false)
        return
      }

      saveInProgressRef.current = true
      setSaveStatus(attempt > 0 ? 'retrying' : 'saving')
      setRetryCount(attempt)

      try {
        await withSpan(
          `${entityType}-autosave`,
          { entityId: entityId || 'unknown', entityType },
          async (span) => {
            await onSave(currentData)
            span.setAttribute('save_success', true)
            span.setAttribute('retry_count', attempt)
          }
        )

        lastSavedDataRef.current = serialized
        setLastSavedAt(new Date())
        setSaveStatus('saved')
        setPendingChanges(false)
        setErrorMessage(null)
        setRetryCount(0)
      } catch (error) {
        const err = error as Error

        // Check if this is an auth error (401) - don't retry auth errors
        const isAuthError =
          err.message.includes('401') ||
          err.message.includes('Unauthorized') ||
          err.message.includes('Session expired')

        if (isAuthError) {
          // Auth errors should not be retried - the session is invalid
          setSaveStatus('error')
          setErrorMessage('Session expired. Please log in again.')
          logWarning(`${entityType} save failed due to auth error`, {
            entityId,
            error: err.message,
          })
          // Don't log as critical - this is an expected auth flow issue
        } else if (attempt < maxRetries - 1) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 1000
          logWarning(`${entityType} save failed, retrying`, {
            entityId,
            retryCount: attempt + 1,
            error: err.message,
          })

          setTimeout(() => {
            saveInProgressRef.current = false
            performSave(attempt + 1)
          }, delay)
        } else {
          setSaveStatus('error')
          setErrorMessage(err.message)
          logCritical(err, {
            component: `useAutoSave:${entityType}`,
            entityId,
          })
        }
      } finally {
        if (attempt === 0 || attempt >= maxRetries - 1) {
          saveInProgressRef.current = false
        }
      }
    },
    [onSave, entityType, entityId, maxRetries]
  )

  // Force save function
  const forceSave = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    await performSave()
  }, [performSave])

  // Debounced save on data change
  useEffect(() => {
    if (!isEnabled) return

    const serialized = JSON.stringify(data)
    if (serialized !== lastSavedDataRef.current) {
      setPendingChanges(true)
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      performSave()
    }, debounceMs)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [data, isEnabled, debounceMs, performSave])

  // Periodic backup save
  useEffect(() => {
    if (!isEnabled || periodicMs <= 0) return

    periodicTimerRef.current = setInterval(() => {
      if (pendingChanges && !saveInProgressRef.current) {
        performSave()
      }
    }, periodicMs)

    return () => {
      if (periodicTimerRef.current) {
        clearInterval(periodicTimerRef.current)
      }
    }
  }, [isEnabled, periodicMs, pendingChanges, performSave])

  // Save before page unload
  useEffect(() => {
    if (!isEnabled) return

    const handleBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (pendingChanges) {
        // Trigger save
        performSave()
        // Show browser warning
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isEnabled, pendingChanges, performSave])

  // Save on visibility change (tab hidden)
  useEffect(() => {
    if (!isEnabled) return

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden' && pendingChanges) {
        performSave()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isEnabled, pendingChanges, performSave])

  return {
    saveStatus,
    lastSavedAt,
    pendingChanges,
    errorMessage,
    retryCount,
    forceSave,
  }
}
