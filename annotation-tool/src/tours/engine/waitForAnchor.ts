/**
 * Resolve a `data-tour-id` to a single DOM element. Uses MutationObserver
 * for instant detection when the anchor mounts, with a hard 3 s ceiling so
 * the UI never hangs.
 *
 * The cardinal failure mode at a CVPR booth is a tour that *hangs* —
 * attendees walk away, telemetry shows the abandon as the last step
 * viewed instead of a clear failure, and the presenter learns nothing.
 * So this resolver does NOT throw on timeout; it returns null and lets
 * the engine surface a "skip step" affordance.
 *
 * @param anchor `data-tour-id` value (no `[data-tour-id="..."]` wrapping)
 * @param signal optional AbortSignal for cleanup on unmount / next step
 */
export async function waitForAnchor(
  anchor: string,
  signal?: AbortSignal,
): Promise<HTMLElement | null> {
  const selector = `[data-tour-id="${cssEscape(anchor)}"]`

  // Fast path — already mounted.
  const existing = document.querySelector(selector)
  if (existing instanceof HTMLElement) return existing
  if (signal?.aborted) return null

  // Slow path — observe the document subtree until the anchor appears or
  // the ceiling fires. MutationObserver wakes us instantly when the
  // element mounts; we then take the document.querySelector measurement
  // (cheap) and resolve.
  return new Promise<HTMLElement | null>((resolve) => {
    const ceilingMs = 3000
    let settled = false

    function finish(result: HTMLElement | null) {
      if (settled) return
      settled = true
      cleanup()
      resolve(result)
    }

    function check() {
      const el = document.querySelector(selector)
      if (el instanceof HTMLElement) finish(el)
    }

    const mo = new MutationObserver(check)
    mo.observe(document.body, { childList: true, subtree: true })

    const timer = window.setTimeout(() => finish(null), ceilingMs)

    function onAbort() {
      finish(null)
    }
    signal?.addEventListener('abort', onAbort)

    function cleanup() {
      mo.disconnect()
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }

    // Re-check once in case the element mounted between the fast-path
    // check and the observer hookup (race window of ~1 microtask).
    check()
  })
}

/**
 * Minimal CSS.escape shim — only quotes the characters that would break
 * an attribute-selector value. We document tour-anchor names as
 * kebab-case (see CVPR_2026_DEMO_PLAN.md §8 naming convention), so the
 * full CSS.escape table isn't needed.
 */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}
