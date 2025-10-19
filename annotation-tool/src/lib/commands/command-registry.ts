/**
 * Command Pattern implementation for keyboard shortcuts and menu actions.
 * Follows VS Code command system architecture.
 *
 * Commands can be triggered by:
 * - Keyboard shortcuts
 * - Menu items
 * - Command palette
 * - API calls
 */

/**
 * Command category for grouping related commands.
 */
export type CommandCategory = 'video' | 'annotation' | 'ontology' | 'object' | 'global' | 'navigation' | 'file'

/**
 * Context expression for conditional command execution.
 * Examples: "annotationWorkspaceActive", "!inputFocused", "videoPlaying && !modalOpen"
 */
export type WhenClause = string

/**
 * Command interface defining an executable action.
 */
export interface Command {
  /** Unique command identifier (e.g., "video.playPause") */
  id: string

  /** Human-readable title */
  title: string

  /** Command category for grouping */
  category: CommandCategory

  /** Keyboard shortcut(s). Can be single or multiple bindings. */
  keybinding?: string | string[]

  /** Context expression determining when command is available */
  when?: WhenClause

  /** Command execution function */
  execute: (args?: any) => void | Promise<void>

  /** Optional function to check if command can execute */
  canExecute?: () => boolean

  /** Optional description for help text */
  description?: string
}

/**
 * Disposable interface for cleanup.
 */
export interface Disposable {
  dispose(): void
}

/**
 * Context evaluator function type.
 */
export type ContextEvaluator = (context: Record<string, boolean>) => boolean

/**
 * Command Registry manages all application commands.
 * Provides command registration, execution, and querying.
 */
export class CommandRegistry {
  private commands = new Map<string, Command>()
  private context = new Map<string, boolean>()

  /**
   * Register a command.
   *
   * @param command Command to register
   * @returns Disposable for unregistering the command
   *
   * @example
   * ```ts
   * const disposable = commandRegistry.register({
   *   id: 'video.playPause',
   *   title: 'Play/Pause Video',
   *   category: 'video',
   *   keybinding: 'space',
   *   when: 'annotationWorkspaceActive && !inputFocused',
   *   execute: () => togglePlayback()
   * })
   * ```
   */
  register(command: Command): Disposable {
    if (this.commands.has(command.id)) {
      console.warn(`Command ${command.id} is already registered`)
    }

    this.commands.set(command.id, command)

    return {
      dispose: () => {
        this.commands.delete(command.id)
      }
    }
  }

  /**
   * Execute a command by ID.
   *
   * @param commandId Command identifier
   * @param args Optional arguments to pass to the command
   * @returns Promise resolving when command completes
   *
   * @example
   * ```ts
   * await commandRegistry.execute('video.playPause')
   * await commandRegistry.execute('annotation.addKeyframe', { frame: 30 })
   * ```
   */
  async execute(commandId: string, args?: any): Promise<void> {
    const command = this.commands.get(commandId)

    if (!command) {
      console.error(`Command ${commandId} not found`)
      return
    }

    // Check if command can execute
    if (command.canExecute && !command.canExecute()) {
      return
    }

    // Check when clause
    if (command.when && !this.evaluateWhenClause(command.when)) {
      return
    }

    try {
      await command.execute(args)
    } catch (error) {
      console.error(`Error executing command ${commandId}:`, error)
      throw error
    }
  }

  /**
   * Get a command by ID.
   *
   * @param commandId Command identifier
   * @returns Command or undefined if not found
   */
  getCommand(commandId: string): Command | undefined {
    return this.commands.get(commandId)
  }

  /**
   * Get all commands, optionally filtered by category.
   *
   * @param category Optional category filter
   * @returns Array of commands
   *
   * @example
   * ```ts
   * const allCommands = commandRegistry.getCommands()
   * const videoCommands = commandRegistry.getCommands('video')
   * ```
   */
  getCommands(category?: CommandCategory): Command[] {
    const allCommands = Array.from(this.commands.values())

    if (category) {
      return allCommands.filter(cmd => cmd.category === category)
    }

    return allCommands
  }

  /**
   * Get commands for a specific context.
   *
   * @param contextName Context name (e.g., "annotationWorkspace")
   * @returns Array of commands available in the context
   */
  getCommandsForContext(contextName: string): Command[] {
    return this.getCommands().filter(command => {
      if (!command.when) return true
      return command.when.includes(contextName)
    })
  }

  /**
   * Get keybinding(s) for a command.
   *
   * @param commandId Command identifier
   * @returns Array of keybindings (empty if none)
   */
  getKeybinding(commandId: string): string[] {
    const command = this.commands.get(commandId)
    if (!command || !command.keybinding) return []

    return Array.isArray(command.keybinding)
      ? command.keybinding
      : [command.keybinding]
  }

  /**
   * Set context value.
   *
   * @param key Context key
   * @param value Context value
   *
   * @example
   * ```ts
   * commandRegistry.setContext('annotationWorkspaceActive', true)
   * commandRegistry.setContext('inputFocused', false)
   * ```
   */
  setContext(key: string, value: boolean): void {
    this.context.set(key, value)
  }

  /**
   * Get context value.
   *
   * @param key Context key
   * @returns Context value (defaults to false)
   */
  getContext(key: string): boolean {
    return this.context.get(key) ?? false
  }

  /**
   * Evaluate a when clause expression.
   *
   * Supports:
   * - Simple expressions: "annotationWorkspaceActive"
   * - Negation: "!inputFocused"
   * - AND: "annotationWorkspaceActive && !inputFocused"
   * - OR: "videoPlaying || videoPaused"
   *
   * @param whenClause When clause expression
   * @returns True if the clause evaluates to true
   */
  evaluateWhenClause(whenClause: WhenClause): boolean {
    // Handle OR conditions
    if (whenClause.includes('||')) {
      return whenClause.split('||').some(part => this.evaluateWhenClause(part.trim()))
    }

    // Handle AND conditions
    if (whenClause.includes('&&')) {
      return whenClause.split('&&').every(part => this.evaluateWhenClause(part.trim()))
    }

    // Handle negation
    if (whenClause.startsWith('!')) {
      return !this.getContext(whenClause.substring(1).trim())
    }

    // Simple context check
    return this.getContext(whenClause.trim())
  }

  /**
   * Clear all commands.
   * Primarily for testing.
   */
  clear(): void {
    this.commands.clear()
    this.context.clear()
  }
}

/**
 * Global command registry instance.
 */
export const commandRegistry = new CommandRegistry()
