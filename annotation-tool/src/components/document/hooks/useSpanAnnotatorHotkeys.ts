/**
 * Keyboard shortcuts for the span annotator.
 *
 * Binds Escape to cancel the in-progress gesture or relation, Delete/Backspace
 * to remove the active span, the digit keys to quick-label a pending selection,
 * and `r` to begin building a relation. Shortcuts stay inert while the user is
 * typing in a form field (react-hotkeys-hook's default), so they never fight the
 * label picker's search input.
 *
 * @module
 */

import { useHotkeys } from 'react-hotkeys-hook'

/** The actions the annotator hotkeys drive. */
export interface SpanAnnotatorHotkeyHandlers {
  /** Cancels the current gesture, draft, or relation build. */
  onCancel: () => void
  /** Deletes the active span. */
  onDeleteActive: () => void
  /** Applies the nth quick label to the pending selection (1-based digit). */
  onQuickLabel: (digit: number) => void
  /** Begins building a relation. */
  onStartRelation: () => void
  /** Whether the shortcuts are active. Defaults to `true`. */
  enabled?: boolean
}

/**
 * Registers the span annotator's keyboard shortcuts.
 *
 * @param handlers - the actions to run and whether the shortcuts are enabled
 */
export function useSpanAnnotatorHotkeys(handlers: SpanAnnotatorHotkeyHandlers): void {
  const { onCancel, onDeleteActive, onQuickLabel, onStartRelation, enabled = true } = handlers

  useHotkeys('escape', () => onCancel(), { enabled, enableOnFormTags: true }, [onCancel])

  useHotkeys('delete, backspace', () => onDeleteActive(), { enabled }, [onDeleteActive])

  useHotkeys(
    '1, 2, 3, 4, 5, 6, 7, 8, 9',
    (event) => {
      const digit = Number(event.key)
      if (Number.isInteger(digit) && digit >= 1 && digit <= 9) onQuickLabel(digit)
    },
    { enabled },
    [onQuickLabel],
  )

  useHotkeys('r', () => onStartRelation(), { enabled }, [onStartRelation])
}
