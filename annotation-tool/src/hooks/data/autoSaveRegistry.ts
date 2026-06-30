/**
 * Process-wide registry of active auto-save flush callbacks.
 *
 * Each mounted `useAutoSave` registers its `forceSave` here so a global handler
 * (the session-expiry emergency save) can flush every editor's pending edits at
 * once, without each editor having to subscribe to the global event itself.
 *
 * @module
 */

type FlushFn = () => Promise<void>

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
 * callbacks that flushed without throwing and the errors from those that did,
 * so a caller (e.g. emergency save) can report a real outcome rather than a
 * no-op. Never rejects.
 *
 * @returns the number flushed successfully and any errors encountered
 */
export async function flushAllAutoSaves(): Promise<{ saved: number; errors: Error[] }> {
  const callbacks = Array.from(flushCallbacks)
  const results = await Promise.allSettled(callbacks.map((flush) => flush()))
  const errors = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => (r.reason instanceof Error ? r.reason : new Error(String(r.reason))))
  return { saved: results.length - errors.length, errors }
}
