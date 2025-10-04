import { useEffect, useRef, useCallback } from 'react'
import {
  ShortcutContext,
  matchesShortcut,
  getShortcutsForContext,
  ShortcutSequenceTracker,
} from '../utils/shortcuts'

interface UseKeyboardShortcutsOptions {
  context: ShortcutContext
  enabled?: boolean
}

interface ActionHandlers {
  [action: string]: () => void
}

export function useKeyboardShortcuts(
  handlers: ActionHandlers,
  options: UseKeyboardShortcutsOptions
) {
  const { context, enabled = true } = options
  const sequenceTracker = useRef(new ShortcutSequenceTracker())
  
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return
    
    // Don't handle shortcuts when typing in input fields
    const target = event.target as HTMLElement
    const isInputField = 
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.contentEditable === 'true'
    
    // Allow certain shortcuts even in input fields
    const allowInInput = ['Escape', 'Enter'].includes(event.key)
    
    if (isInputField && !allowInInput) return
    
    // Get shortcuts for current context
    const shortcuts = getShortcutsForContext(context)
    
    // Check for sequence shortcuts first
    const sequenceShortcuts = shortcuts.filter(s => s.sequence)
    for (const shortcut of sequenceShortcuts) {
      if (shortcut.sequence) {
        sequenceTracker.current.addKey(event.key)
        if (sequenceTracker.current.matchesSequence(shortcut.sequence)) {
          const handler = handlers[shortcut.action]
          if (handler) {
            event.preventDefault()
            handler()
            sequenceTracker.current.reset()
            return
          }
        }
      }
    }
    
    // Check for regular shortcuts
    for (const shortcut of shortcuts) {
      if (!shortcut.sequence && matchesShortcut(event, shortcut)) {
        const handler = handlers[shortcut.action]
        if (handler) {
          event.preventDefault()
          handler()
          return
        }
      }
    }
  }, [context, enabled, handlers])
  
  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown)
      const tracker = sequenceTracker.current
      return () => {
        window.removeEventListener('keydown', handleKeyDown)
        tracker.reset()
      }
    }
  }, [handleKeyDown, enabled])
  
  // Return a function to programmatically trigger shortcuts
  const triggerShortcut = useCallback((action: string) => {
    const handler = handlers[action]
    if (handler) {
      handler()
    }
  }, [handlers])
  
  return { triggerShortcut }
}

// Hook for registering global shortcuts
export function useGlobalKeyboardShortcuts(
  handlers: ActionHandlers,
  enabled = true
) {
  return useKeyboardShortcuts(handlers, { context: 'global', enabled })
}

// Hook for workspace-specific shortcuts
export function useWorkspaceKeyboardShortcuts(
  context: Extract<ShortcutContext, 'videoBrowser' | 'ontologyWorkspace' | 'objectWorkspace'>,
  handlers: ActionHandlers,
  enabled = true
) {
  return useKeyboardShortcuts(handlers, { context, enabled })
}

// Hook for dialog shortcuts
export function useDialogKeyboardShortcuts(
  handlers: ActionHandlers,
  enabled = true
) {
  return useKeyboardShortcuts(handlers, { context: 'dialog', enabled })
}