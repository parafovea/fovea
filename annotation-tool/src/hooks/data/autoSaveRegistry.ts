/**
 * Process-wide registry of active auto-save flush callbacks.
 *
 * Each mounted `useAutoSave` registers its `forceSave` here so a global handler
 * (the session-expiry emergency save) can flush every editor's pending edits at
 * once, without each editor having to subscribe to the global event itself.
 *
 * @module
 */

import type { SaveOutcome } from './useAutoSave'

type FlushFn = () => Promise<SaveOutcome>

const flushCallbacks = new Set<FlushFn>()

/**
 * Register an auto-save flush callback. Returns an unregister function to call
 * on unmount.
 *
 * @param flush - the editor's `forceSave`
 * @returns a function that removes the callback from the registry
 */
export function registerAutoSaveFlush(flush: FlushFn): () => void {
  flushCallbacks.add(flush)
  return () => {
    flushCallbacks.delete(flush)
  }
}

/**
 * Flush every registered auto-save concurrently. Resolves with the count of
 * editors that ACTUALLY persisted a write and the errors from those that
 * failed, so a caller (e.g. emergency save) reports a real outcome rather than a
 * no-op. A forced save that was change-skipped, blocked, or superseded resolves
 * without throwing but wrote nothing, so it is not counted as saved — otherwise
 * the session-expiry flush would over-report data preservation. Never rejects.
 *
 * @returns the number that actually persisted and any errors encountered
 */
export async function flushAllAutoSaves(): Promise<{ saved: number; errors: Error[] }> {
  const callbacks = Array.from(flushCallbacks)
  const results = await Promise.allSettled(callbacks.map((flush) => flush()))
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason instanceof Error ? r.reason : new Error(String(r.reason))))
  const saved = results.filter(
    (r): r is PromiseFulfilledResult<SaveOutcome> => r.status === 'fulfilled' && r.value === 'saved'
  ).length
  return { saved, errors }
}
