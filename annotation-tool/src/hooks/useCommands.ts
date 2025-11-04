/**
 * React hook for integrating react-hotkeys-hook with Command Registry.
 * Registers keyboard shortcuts and executes commands from the registry.
 */

import { useEffect, useCallback, useRef } from 'react'
import { commandRegistry } from '../lib/commands/command-registry.js'

/**
 * Check if a keyboard event matches a keybinding string.
 * Supports modifier keys (mod, shift, alt, ctrl) and special keys.
 *
 * @param event Keyboard event
 * @param keybinding Keybinding string (e.g., "mod+s", "shift+right", "space")
 * @returns True if event matches keybinding
 */
function matchesKeybinding(event: KeyboardEvent, keybinding: string): boolean {
  const parts = keybinding.toLowerCase().split('+')
  const isMac = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0

  // Check modifiers
  const needsMod = parts.includes('mod')
  const needsShift = parts.includes('shift')
  const needsAlt = parts.includes('alt')
  const needsCtrl = parts.includes('ctrl')

  // Check that modifiers match exactly
  const modPressed = isMac ? event.metaKey : event.ctrlKey
  if (needsMod !== modPressed) return false
  if (needsShift !== event.shiftKey) return false
  if (needsAlt !== event.altKey) return false
  // Don't check ctrl separately if mod is active (they overlap on non-Mac)
  if (!isMac && needsMod) {
    // On non-Mac, mod = ctrl, so ctrl will be pressed
  } else if (needsCtrl !== event.ctrlKey) {
    return false
  }

  // Get the key part (last element or the only element)
  const keyPart = parts[parts.length - 1]

  // Map special keys
  const keyMap: Record<string, string> = {
    'space': ' ',
    'enter': 'Enter',
    'escape': 'Escape',
    'delete': 'Delete',
    'backspace': 'Backspace',
    'tab': 'Tab',
    'home': 'Home',
    'end': 'End',
    'pageup': 'PageUp',
    'pagedown': 'PageDown',
    'left': 'ArrowLeft',
    'right': 'ArrowRight',
    'up': 'ArrowUp',
    'down': 'ArrowDown',
    'plus': '+',
    'equals': '=',
    'minus': '-',
    'comma': ','
  }

  const expectedKey = keyMap[keyPart] || keyPart.toUpperCase()
  const actualKey = event.key === ' ' ? ' ' : (event.key.length === 1 ? event.key.toUpperCase() : event.key)

  return expectedKey === actualKey
}

/**
 * Command execution callback map.
 * Maps command IDs to their execution functions.
 */
export type CommandHandlers = Record<string, (args?: any) => void | Promise<void>>

/**
 * Hook options for command registration.
 */
export interface UseCommandsOptions {
  /** Context name for filtering commands (e.g., "annotationWorkspace") */
  context?: string

  /** Whether commands are enabled (defaults to true) */
  enabled?: boolean

  /** Whether to enable shortcuts on form elements (defaults to false) */
  enableOnFormTags?: boolean
}

/**
 * Register commands and keyboard shortcuts for a component.
 *
 * @param handlers Object mapping command IDs to execution functions
 * @param options Configuration options
 *
 * @example
 * ```tsx
 * function AnnotationWorkspace() {
 *   const videoRef = useRef<HTMLVideoElement>(null)
 *
 *   useCommands({
 *     'video.playPause': () => {
 *       if (videoRef.current) {
 *         videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause()
 *       }
 *     },
 *     'annotation.addKeyframe': () => {
 *       dispatch(addKeyframe(currentFrame))
 *     }
 *   }, {
 *     context: 'annotationWorkspace'
 *   })
 * }
 * ```
 */
export function useCommands(
  handlers: CommandHandlers,
  options: UseCommandsOptions = {}
): void {
  const { context, enabled = true, enableOnFormTags = false } = options

  // Use ref to hold latest handlers without causing re-registration
  const handlersRef = useRef<CommandHandlers>(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  // Register command handlers with registry
  useEffect(() => {
    if (!enabled) return

    const disposables: Array<{ dispose: () => void }> = []

    Object.entries(handlers).forEach(([commandId, handler]) => {
      const existingCommand = commandRegistry.getCommand(commandId)

      if (existingCommand) {
        const disposable = commandRegistry.register({
          ...existingCommand,
          execute: handler
        })
        disposables.push(disposable)
      }
    })

    return () => {
      disposables.forEach(d => d.dispose())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers intentionally excluded to prevent re-registration
  }, [enabled])

  // Register keyboard shortcuts once
  useEffect(() => {
    if (!enabled) return

    const commands = context
      ? commandRegistry.getCommandsForContext(context)
      : commandRegistry.getCommands()

    const disposables: Array<() => void> = []

    commands.forEach(command => {
      if (!command.keybinding) return

      const keybindings = Array.isArray(command.keybinding)
        ? command.keybinding
        : [command.keybinding]

      keybindings.forEach((keybinding) => {
        const keyHandler = (event: KeyboardEvent) => {
          // Get handler fresh from ref
          const handler = handlersRef.current[command.id]
          if (!handler) return

          // Check if this event matches the keybinding
          if (!matchesKeybinding(event, keybinding)) {
            return
          }

          // Check if focus is on form element FIRST (unless explicitly enabled)
          const target = event.target as HTMLElement
          const isFormElement = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
          if (isFormElement && !enableOnFormTags) {
            return
          }

          // Prevent browser default to avoid browser capture (e.g., Ctrl+N opening new windows)
          event.preventDefault()
          event.stopPropagation()

          // Check when clause
          if (command.when && !commandRegistry.evaluateWhenClause(command.when)) {
            return
          }

          if (command.canExecute && !command.canExecute()) {
            return
          }

          handler()
        }

        document.addEventListener('keydown', keyHandler)
        disposables.push(() => document.removeEventListener('keydown', keyHandler))
      })
    })

    return () => {
      disposables.forEach(cleanup => cleanup())
    }
  }, [context, enabled, enableOnFormTags]) // handlers intentionally excluded
}

/**
 * Hook to set context values in the command registry.
 * Useful for managing when clauses.
 *
 * @param context Context key-value pairs to set
 *
 * @example
 * ```tsx
 * function AnnotationWorkspace() {
 *   const [timelineVisible, setTimelineVisible] = useState(false)
 *   const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
 *
 *   useCommandContext({
 *     annotationWorkspaceActive: true,
 *     timelineVisible,
 *     annotationSelected: !!selectedAnnotation,
 *     inputFocused: false
 *   })
 * }
 * ```
 */
export function useCommandContext(context: Record<string, boolean>): void {
  useEffect(() => {
    Object.entries(context).forEach(([key, value]) => {
      commandRegistry.setContext(key, value)
    })
  }, [context])
}

/**
 * Hook to execute a command programmatically.
 * Returns a callback that executes the command.
 *
 * @param commandId Command identifier
 * @returns Function to execute the command
 *
 * @example
 * ```tsx
 * function VideoPlayer() {
 *   const playPause = useCommand('video.playPause')
 *
 *   return (
 *     <Button onClick={() => playPause()}>
 *       Play/Pause
 *     </Button>
 *   )
 * }
 * ```
 */
export function useCommand(commandId: string): (args?: any) => Promise<void> {
  return useCallback(
    async (args?: any) => {
      await commandRegistry.execute(commandId, args)
    },
    [commandId]
  )
}

/**
 * Hook to get command information.
 * Useful for displaying keybindings in UI.
 *
 * @param commandId Command identifier
 * @returns Command or undefined if not found
 *
 * @example
 * ```tsx
 * function SaveButton() {
 *   const command = useCommandInfo('file.save')
 *
 *   return (
 *     <Tooltip title={`${command?.title} (${command?.keybinding})`}>
 *       <Button>Save</Button>
 *     </Tooltip>
 *   )
 * }
 * ```
 */
export function useCommandInfo(commandId: string) {
  return commandRegistry.getCommand(commandId)
}
