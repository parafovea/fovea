import type { Ref, RefCallback } from 'react'

/**
 * Compose several refs into a single ref callback that fans the node out to
 * each one. Accepts callback refs, object refs (`useRef` results), and
 * `undefined` slots, so a component can forward an external ref while keeping
 * its own. Each ref receives the node on attach and `null` on detach.
 */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === 'function') {
        ref(node)
      } else {
        (ref as { current: T | null }).current = node
      }
    }
  }
}
