/**
 * Command initialization and registration.
 * Registers all command definitions with the command registry.
 */

import { commandRegistry } from './command-registry.js'
import {
  globalCommands,
  videoCommands,
  annotationCommands,
  ontologyCommands,
  objectCommands
} from './commands.js'

/**
 * Initialize all commands with placeholder handlers.
 * Components will override execute functions when they mount.
 */
export function initializeCommands(): void {
  // Register all command definitions
  const allCommands = [
    ...globalCommands,
    ...videoCommands,
    ...annotationCommands,
    ...ontologyCommands,
    ...objectCommands
  ]

  allCommands.forEach(cmd => {
    commandRegistry.register({
      ...cmd,
      execute: () => {
        console.warn(`Command ${cmd.id} executed but no handler registered`)
      }
    })
  })

  console.log(`Initialized ${allCommands.length} commands`)
}

/**
 * Set global context values that persist across components.
 */
export function initializeGlobalContext(): void {
  // These will be updated by components as needed
  commandRegistry.setContext('inputFocused', false)
  commandRegistry.setContext('dialogOpen', false)
  commandRegistry.setContext('annotationWorkspaceActive', false)
  commandRegistry.setContext('ontologyWorkspaceActive', false)
  commandRegistry.setContext('objectWorkspaceActive', false)
  commandRegistry.setContext('videoBrowserActive', false)

  // Expose command registry globally for E2E tests
  if (typeof window !== 'undefined') {
    (window as any).__commandRegistry = commandRegistry
  }
}
