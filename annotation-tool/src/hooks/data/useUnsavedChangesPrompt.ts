/**
 * Warns the user before they discard unsaved form changes.
 *
 * Pairs with explicit-save forms: the form tracks `isDirty`, and this hook
 * (a) shows the browser's native beforeunload prompt on tab close/reload, and
 * (b) provides `confirmDiscard()` for components to call before closing a
 * dialog or navigating in-app.
 *
 * @module hooks/data/useUnsavedChangesPrompt
 */

import { useCallback, useEffect } from 'react'

export interface UseUnsavedChangesPromptOptions {
  isDirty: boolean
  message?: string
}

export interface UseUnsavedChangesPromptReturn {
  /**
   * Returns `true` if the caller may proceed (form is clean, or user
   * confirmed). Returns `false` if the user cancelled the discard.
   */
  confirmDiscard: () => boolean
}

const DEFAULT_MESSAGE =
  'You have unsaved changes. Are you sure you want to discard them?'

export function useUnsavedChangesPrompt({
  isDirty,
  message = DEFAULT_MESSAGE,
}: UseUnsavedChangesPromptOptions): UseUnsavedChangesPromptReturn {
  useEffect(() => {
    if (!isDirty) return

    const handleBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  const confirmDiscard = useCallback((): boolean => {
    if (!isDirty) return true
    return window.confirm(message)
  }, [isDirty, message])

  return { confirmDiscard }
}
