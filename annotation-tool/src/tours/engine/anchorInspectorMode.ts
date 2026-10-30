import { create } from 'zustand'

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
