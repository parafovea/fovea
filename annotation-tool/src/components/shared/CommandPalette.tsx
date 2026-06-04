/**
 * Command Palette component (VS Code style).
 * Searchable command launcher with keyboard shortcuts displayed.
 * Opens with Cmd/Ctrl+Shift+P.
 */

import { useState, useMemo, useCallback } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { commandRegistry } from '@lib/commands/command-registry'
import { formatKeybinding } from '@lib/commands/commands'

/**
 * Command Palette component.
 * Provides searchable command execution using cmdk for filtering
 * and keyboard navigation.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <>
 *       <YourComponents />
 *       <CommandPalette />
 *     </>
 *   )
 * }
 * ```
 */
export function CommandPalette(): JSX.Element {
  const [open, setOpen] = useState(false)

  // Open command palette with Cmd+Shift+P
  useHotkeys(
    'mod+shift+p',
    (event) => {
      event.preventDefault()
      setOpen(true)
    },
    { enableOnFormTags: true }
  )

  // Get all available commands, filtered by context.
  // Re-evaluate when dialog opens to get current context.
  const allCommands = useMemo(() => {
    const commands = commandRegistry.getCommands() || []
    return commands.filter(cmd => {
      // Hide command palette toggle from palette
      if (cmd.id === 'commandPalette.toggle') return false

      // Check when clause
      if (cmd.when && !commandRegistry.evaluateWhenClause(cmd.when)) {
        return false
      }

      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Group commands by category
  const commandsByCategory = useMemo(() => {
    const grouped = new Map<string, typeof allCommands>()
    for (const cmd of allCommands) {
      const category = cmd.category
      const existing = grouped.get(category) || []
      grouped.set(category, [...existing, cmd])
    }
    return grouped
  }, [allCommands])

  // Handle command execution
  const executeCommand = useCallback(async (commandId: string) => {
    setOpen(false)

    try {
      await commandRegistry.execute(commandId)
    } catch (error) {
      console.error(`Failed to execute command ${commandId}:`, error)
    }
  }, [])

  // Handle dialog close
  const handleClose = useCallback(() => {
    setOpen(false)
  }, [])

  return (
    <CommandDialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}
    >
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No commands found</CommandEmpty>
        {Array.from(commandsByCategory).map(([category, commands]) => (
          <CommandGroup key={category} heading={category}>
            {commands.map(command => (
              <CommandItem
                key={command.id}
                value={`${command.title} ${command.description || ''} ${command.id} ${command.category}`}
                onSelect={() => executeCommand(command.id)}
              >
                <span className="flex-1">{command.title}</span>
                <Badge variant="secondary" className="ml-2 text-[0.65rem] capitalize">
                  {command.category}
                </Badge>
                {command.keybinding && (
                  <CommandShortcut>
                    {Array.isArray(command.keybinding)
                      ? formatKeybinding(command.keybinding[0])
                      : formatKeybinding(command.keybinding)}
                  </CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
      <div className="flex items-center justify-between border-t bg-muted/50 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {allCommands.length} command{allCommands.length !== 1 ? 's' : ''}
        </span>
        <span className="text-xs text-muted-foreground">
          ↑↓ Navigate &middot; ↵ Execute &middot; Esc Close
        </span>
      </div>
    </CommandDialog>
  )
}
