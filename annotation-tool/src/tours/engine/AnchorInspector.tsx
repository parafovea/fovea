/**
 * The author-mode anchor inspector: a full-viewport, non-interactive overlay
 * that labels every currently registered tour anchor with its `AnchorId`.
 *
 * When author mode is on, an admin authoring tours sees a small badge pinned to
 * the top-left of each registered anchor's bounding box, so the published anchor
 * vocabulary is discoverable by walking the running app rather than by reading
 * the catalog. The overlay reads the live registry via `useAnchorRegistry`,
 * subscribes to it so badges appear and vanish as anchors mount and unmount, and
 * re-measures each frame so a badge follows its element through dialog, popover,
 * and scroll motion. It paints nothing and reserves no layout when author mode
 * is off.
 *
 * Author mode is held in a tiny zustand store so any control (an admin toolbar
 * switch, a keyboard shortcut) can flip it from anywhere:
 *
 *   const enabled = useAnchorInspectorMode((s) => s.enabled)
 *   const toggle = useAnchorInspectorMode((s) => s.toggle)
 *
 * Mount `<AnchorInspector />` once inside the `AnchorRegistryProvider` subtree.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import { create } from 'zustand'

import type { AnchorId } from './anchorCatalog'
import { useAnchorRegistry } from './anchorRegistry'

/** The author-mode flag. When `enabled`, the inspector overlays anchor badges. */
interface AnchorInspectorMode {
  /** Whether the inspector overlay is painting anchor badges. */
  enabled: boolean
  /** Turn the overlay on or off. */
  setEnabled: (enabled: boolean) => void
  /** Flip the overlay between on and off. */
  toggle: () => void
}

/**
 * Author-mode toggle store. Any control can read `enabled` to reflect state and
 * call `toggle` / `setEnabled` to drive it.
 */
export const useAnchorInspectorMode = create<AnchorInspectorMode>((set) => ({
  enabled: false,
  setEnabled: (enabled) => set({ enabled }),
  toggle: () => set((state) => ({ enabled: !state.enabled })),
}))

type Rect = { x: number; y: number; width: number; height: number }

interface Badge {
  id: AnchorId
  rect: Rect
}

/** The z-index sits above the spotlight overlay so badges stay visible during a tour. */
const OVERLAY_Z_INDEX = 1001

function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

function badgesEqual(a: Badge[], b: Badge[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || !rectsEqual(a[i].rect, b[i].rect)) return false
  }
  return true
}

/**
 * Subscribe to the registry's identity set (which anchors are registered),
 * re-rendering the caller whenever an anchor mounts or unmounts. The returned
 * value is a stable key string so React bails out of renders when the set is
 * unchanged.
 */
function useRegisteredAnchorIds(): AnchorId[] {
  const registry = useAnchorRegistry()
  const subscribe = useCallback(
    (notify: () => void) => registry.subscribe(() => notify()),
    [registry],
  )
  const idsKey = useSyncExternalStore(subscribe, () =>
    [...registry.snapshot().keys()].sort().join('\n'),
  )
  // `idsKey` changes identity only when the set of registered ids changes, so
  // this array recomputes (and the measure effect re-runs) exactly then.
  return useMemo(() => (idsKey === '' ? [] : (idsKey.split('\n') as AnchorId[])), [idsKey])
}

export function AnchorInspector() {
  const enabled = useAnchorInspectorMode((state) => state.enabled)
  const registry = useAnchorRegistry()
  const anchorIds = useRegisteredAnchorIds()
  const [badges, setBadges] = useState<Badge[]>([])

  useEffect(() => {
    if (!enabled || anchorIds.length === 0) {
      setBadges([])
      return undefined
    }

    let rafId = 0
    let cancelled = false
    let current: Badge[] = []

    function measure() {
      if (cancelled) return
      const next: Badge[] = []
      for (const id of anchorIds) {
        const element = registry.get(id)
        if (!element || !document.contains(element)) continue
        const r = element.getBoundingClientRect()
        // A zero-size box means the element is laid out off-screen or hidden;
        // skip it rather than pinning a badge to the viewport origin.
        if (r.width === 0 && r.height === 0) continue
        next.push({ id, rect: { x: r.left, y: r.top, width: r.width, height: r.height } })
      }
      if (!badgesEqual(current, next)) {
        current = next
        setBadges(next)
      }
    }

    function tick() {
      if (cancelled) return
      measure()
      rafId = window.requestAnimationFrame(tick)
    }

    tick()

    return () => {
      cancelled = true
      window.cancelAnimationFrame(rafId)
    }
  }, [enabled, anchorIds, registry])

  if (!enabled || badges.length === 0) return null

  return (
    <div
      data-fovea-anchor-inspector=""
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: OVERLAY_Z_INDEX,
        pointerEvents: 'none',
      }}
    >
      {badges.map(({ id, rect }) => (
        <div key={id} style={badgeFrameStyle(rect)}>
          <span style={badgeLabelStyle}>{id}</span>
        </div>
      ))}
    </div>
  )
}

function badgeFrameStyle(rect: Rect): CSSProperties {
  return {
    position: 'fixed',
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    boxSizing: 'border-box',
    border: '1px dashed hsl(var(--primary))',
    borderRadius: 2,
    pointerEvents: 'none',
  }
}

const badgeLabelStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  transform: 'translateY(-100%)',
  maxWidth: '40ch',
  padding: '1px 4px',
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: 10,
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: 'hsl(var(--primary-foreground))',
  background: 'hsl(var(--primary))',
  borderRadius: 2,
}
