/**
 * Resolve a `data-tour-id` to a single DOM element, retrying on a fixed
 * cadence until it appears or the 3 s ceiling fires.
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
  const start = performance.now()
  const ceilingMs = 3000
  const pollMs = 50

  while (true) {
    if (signal?.aborted) return null
    const el = document.querySelector(selector)
    if (el instanceof HTMLElement) return el
    if (performance.now() - start >= ceilingMs) return null
    await new Promise((r) => setTimeout(r, pollMs))
  }
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
