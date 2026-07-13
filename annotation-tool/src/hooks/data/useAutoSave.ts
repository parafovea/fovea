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
import { registerAutoSaveFlush } from './autoSaveRegistry'

/**
 * Status of the auto-save operation.
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'retrying'

/**
 * Outcome of a single save attempt, returned by `forceSave` so callers (the
 * emergency-flush registry, a dialog closing) can tell a real write from a
 * no-op:
 * - `saved`: the data was persisted.
 * - `skipped`: change detection found nothing to write (non-forced only).
 * - `blocked`: a non-forced save no-oped because one was already in flight.
 * - `superseded`: a queued forced save was replaced by a newer forced save.
 * - `error`: the save failed after exhausting retries.
 */
export type SaveOutcome = 'saved' | 'skipped' | 'blocked' | 'superseded' | 'error'

/**
 * Entity types supported by auto-save for observability.
 *
 * Auto-save is reserved for two cases:
 *   1. Surfaces with no Save button (e.g. annotations — drawn with the mouse).
 *   2. Long-form free-text editing where losing work is painful, even if a
 *      Save button also exists (e.g. video summaries).
 *
 * Discrete record forms (personas, world objects, ontology types, claims) use
 * explicit save + a dirty prompt instead.
 */
export type AutoSaveEntityType =
  | 'annotation'
  | 'summary'

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
  /**
   * Optional projection applied to `data` before change detection. The
   * serialized snapshot of the result is compared against the last save to
   * decide whether anything changed. Defaults to `JSON.stringify(data)`.
   * Override this to strip server-managed fields the editor never writes
   * (e.g. `updatedAt`) so the post-save refetch echoing a new timestamp does
   * not look like a change and re-arm auto-save.
   *
   * @param data - the current data
   * @returns a JSON-serializable value compared via `JSON.stringify`
   */
  getComparisonSnapshot?: (data: T) => unknown
}

/**
 * Return value from useAutoSave hook.
 *
 * @typeParam T - the data type managed by the hook
 */
export interface UseAutoSaveReturn<T> {
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
  /**
   * Force an immediate save, bypassing debounce and the change-skip guard.
   *
   * Pass `dataOverride` after a discrete edit (e.g. adding a keyframe) whose
   * mutation has updated an external store but has not yet propagated back
   * into `data` for the current render. Without it the save would read the
   * pre-edit `data` and silently persist the stale value. When omitted, the
   * latest `data` seen on render is used.
   *
   * @param dataOverride - the exact data to persist, used in place of the
   *   render-time `data`
   * @returns the outcome of the save (whether it actually persisted)
   */
  forceSave: (dataOverride?: T) => Promise<SaveOutcome>
  /**
   * Seed the change-detection baseline to `savedData` without writing.
   *
   * Call this the moment the editor adopts freshly loaded server content so the
   * first debounce tick sees no change and does not fire a spurious save of the
   * just-fetched data. Without it the baseline stays empty and the initial sync
   * looks like a user edit.
   *
   * @param savedData - the data now considered already persisted
   */
  markSaved: (savedData: T) => void
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
  getComparisonSnapshot,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn<T> {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [pendingChanges, setPendingChanges] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  const saveInProgressRef = useRef(false)
  // A forced save requested while another save is in flight is parked here and
  // drained when the in-flight save settles, so a final edit (dialog close,
  // keyframe override, emergency flush) is never silently dropped. Its resolver
  // reports the eventual outcome to the original forceSave caller.
  const pendingForceRef = useRef<{ dataOverride?: T; resolve: (outcome: SaveOutcome) => void } | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const periodicTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dataRef = useRef(data)
  const lastSavedDataRef = useRef<string>('')

  // Serialize `data` to the string used for change detection. When a caller
  // supplies getComparisonSnapshot, serialize the snapshot it derives (which
  // strips server-managed fields the editor never writes, and can fold in a
  // sibling field such as a comment); otherwise fall back to serializing the
  // whole `data`. The closure is held in a ref and updated DURING render (not in
  // an effect) so the change key computed below reflects the latest snapshot
  // this same render — otherwise an edit to a getComparisonSnapshot-only field
  // (e.g. a comment that lives outside `data`) would lag a render and the
  // debounce effect, keyed on the change key's string VALUE, would never re-run.
  const getComparisonSnapshotRef = useRef(getComparisonSnapshot)
  getComparisonSnapshotRef.current = getComparisonSnapshot

  const serialize = useCallback((value: T): string => {
    const snapshot = getComparisonSnapshotRef.current
    return JSON.stringify(snapshot ? snapshot(value) : value)
  }, [])

  // Value-based change key: the serialized comparison snapshot of the current
  // data. Because it is a string compared by VALUE, using it as the debounce
  // effect's dependency re-arms a save on any change to a compared field
  // (including getComparisonSnapshot-only fields) without churning every render
  // when the snapshot closure's identity changes.
  const changeKey = serialize(data)

  // Keep the data ref pointed at the latest `data` seen on render. Done during
  // render (not in an effect) so a forceSave fired from the same event handler
  // that just re-rendered the parent reads the committed value rather than the
  // previous render's. This narrows but does not close the gap for edits whose
  // mutation has not yet reached `data` this render; those pass dataOverride to
  // forceSave (see performSave).
  dataRef.current = data

  // Core save function with retry logic. `dataOverride`, when provided, is the
  // exact data to persist; it is used in place of dataRef so a forced save can
  // carry an edit that has not yet propagated back into `data`. Returns the
  // outcome so a forced save's caller can tell a real write from a no-op.
  const performSave = useCallback(
    async (force = false, dataOverride?: T): Promise<SaveOutcome> => {
      // A save is already running. A non-forced tick simply skips (its data will
      // be picked up by the debounce/periodic loop). A forced save must NOT be
      // dropped: park it, and it is drained in the in-flight save's `finally`.
      // The returned promise resolves with the eventual outcome of that drained
      // write, so `forceSave` reports real persistence, not a no-op.
      if (saveInProgressRef.current) {
        if (!force) return 'blocked'
        return new Promise<SaveOutcome>((resolve) => {
          const previous = pendingForceRef.current
          pendingForceRef.current = { dataOverride, resolve }
          // Only the latest forced save is kept; supersede an older parked one.
          if (previous) previous.resolve('superseded')
        })
      }

      const currentData = dataOverride !== undefined ? dataOverride : dataRef.current
      const serialized = serialize(currentData)

      // Skip if no changes — unless this is a forced save. `forceSave` is the
      // explicit "save now" path used after discrete edits (e.g. adding a
      // keyframe), where the data ref may not yet reflect the just-issued
      // mutation; those must persist rather than be skipped by change
      // detection. Forced saves are never triggered on the idle refetch, so
      // bypassing the guard here cannot re-introduce the auto-save loop.
      if (!force && serialized === lastSavedDataRef.current) {
        setPendingChanges(false)
        return 'skipped'
      }

      saveInProgressRef.current = true
      let outcome: SaveOutcome = 'saved'

      try {
        // Retry with exponential backoff (1s, 2s, 4s) INSIDE this invocation, so
        // the in-progress guard stays held across the whole sequence — a
        // debounce/periodic tick cannot start a second save concurrently with a
        // pending retry (duplicate writes / last-writer-wins) — and the final
        // outcome is known when this promise resolves.
        for (let attempt = 0; attempt < maxRetries; attempt++) {
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
            outcome = 'saved'
            break
          } catch (error) {
            const err = error as Error

            // Auth errors (401) are not retried — the session is invalid.
            const isAuthError =
              err.message.includes('401') ||
              err.message.includes('Unauthorized') ||
              err.message.includes('Session expired')

            if (isAuthError) {
              setSaveStatus('error')
              setErrorMessage('Session expired. Please log in again.')
              logWarning(`${entityType} save failed due to auth error`, {
                entityId,
                error: err.message,
              })
              outcome = 'error'
              break
            }

            if (attempt < maxRetries - 1) {
              logWarning(`${entityType} save failed, retrying`, {
                entityId,
                retryCount: attempt + 1,
                error: err.message,
              })
              await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
              continue
            }

            setSaveStatus('error')
            setErrorMessage(err.message)
            logCritical(err, {
              component: `useAutoSave:${entityType}`,
              entityId,
            })
            outcome = 'error'
          }
        }
      } finally {
        saveInProgressRef.current = false
        // Drain a forced save parked while this one ran, carrying its override,
        // and resolve its caller's promise with the real outcome.
        const queued = pendingForceRef.current
        if (queued) {
          pendingForceRef.current = null
          performSave(true, queued.dataOverride).then(queued.resolve, () => queued.resolve('error'))
        }
      }

      return outcome
    },
    [onSave, entityType, entityId, maxRetries, serialize]
  )

  // Stable ref to the latest performSave so the debounce/periodic
  // effects below don't re-fire every time performSave's identity
  // changes — which previously happened on every render because
  // performSave depends on `onSave`, and `onSave` (the caller's
  // handleAutoSave) typically depends on a TanStack Query result
  // (currentSummary, currentAnnotation, etc.) whose object identity
  // changes after every save's success refetch. Without this ref the
  // debounce effect would clear and reinstall its setTimeout on EVERY
  // re-render, schedule a save, the save would re-trigger a refetch,
  // the refetch would re-rebuild onSave, and the dialog would shake at
  // ~60 Hz until the parent unmounted (the visible 'extremely jittery,
  // can't click elements' bug).
  const performSaveRef = useRef(performSave)
  useEffect(() => {
    performSaveRef.current = performSave
  }, [performSave])

  // Force save function. Returns the outcome so callers (dialog close, keyframe
  // override, emergency flush) can tell a real write from a no-op — and, via the
  // in-flight force queue in performSave, a forced save is never silently
  // dropped when another save is already running.
  const forceSave = useCallback(async (dataOverride?: T): Promise<SaveOutcome> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    return performSaveRef.current(true, dataOverride)
  }, [])

  // Seed the change-detection baseline to already-saved data without writing, so
  // the first debounce tick after the editor adopts server content sees no
  // change and does not fire a spurious save.
  const markSaved = useCallback((savedData: T) => {
    lastSavedDataRef.current = serialize(savedData)
    setPendingChanges(false)
  }, [serialize])

  // Register this editor's flush so a global handler (emergency save on session
  // expiry) can persist its pending edits. forceSave is stable, so this runs
  // once; the cleanup deregisters on unmount.
  useEffect(() => {
    if (!isEnabled) return
    return registerAutoSaveFlush(() => forceSave())
  }, [isEnabled, forceSave])

  // Debounced save on change. Keyed on `changeKey` (the serialized comparison
  // snapshot) rather than `data` so an edit to ANY compared field — including a
  // getComparisonSnapshot-only field such as a comment that lives outside `data`
  // — re-arms the save. Deps deliberately exclude performSave (held via ref) —
  // see the ref comment.
  useEffect(() => {
    if (!isEnabled) return

    if (changeKey !== lastSavedDataRef.current) {
      setPendingChanges(true)
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      performSaveRef.current()
    }, debounceMs)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [changeKey, isEnabled, debounceMs])

  // Periodic backup save. performSave intentionally NOT in deps for
  // the same reason — periodicTimer should NOT re-arm every render.
  useEffect(() => {
    if (!isEnabled || periodicMs <= 0) return

    periodicTimerRef.current = setInterval(() => {
      if (pendingChanges && !saveInProgressRef.current) {
        performSaveRef.current()
      }
    }, periodicMs)

    return () => {
      if (periodicTimerRef.current) {
        clearInterval(periodicTimerRef.current)
      }
    }
  }, [isEnabled, periodicMs, pendingChanges])

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
    markSaved,
  }
}
