/**
 * Tooltip component that displays keyboard shortcuts.
 * Wraps shadcn Tooltip and automatically fetches shortcut from command registry.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { commandRegistry } from '@lib/commands/command-registry'
import { formatKeybinding } from '@lib/commands/commands'

interface KeyboardShortcutTooltipProps {
  /** Command ID to fetch shortcut for */
  commandId?: string
  /** Custom title (if not using commandId) */
  title?: string
  /** Additional text to append after shortcut */
  description?: string
  /** Child element to wrap with the tooltip */
  children: React.ReactElement
}

/**
 * Tooltip with keyboard shortcut display.
 *
 * @example
 * ```tsx
 * <KeyboardShortcutTooltip commandId="video.playPause">
 *   <IconButton><PlayIcon /></IconButton>
 * </KeyboardShortcutTooltip>
 * ```
 *
 * @example
 * ```tsx
 * <KeyboardShortcutTooltip commandId="timeline.toggle" description="Show/hide timeline">
 *   <Button>Timeline</Button>
 * </KeyboardShortcutTooltip>
 * ```
 */
export function KeyboardShortcutTooltip({
  commandId,
  title,
  description,
  children,
}: KeyboardShortcutTooltipProps): JSX.Element {
  let tooltipContent: React.ReactNode = title || ''

  if (commandId) {
    const command = commandRegistry.getCommand(commandId)

    if (command) {
      const shortcutText = command.keybinding
        ? Array.isArray(command.keybinding)
          ? formatKeybinding(command.keybinding[0])
          : formatKeybinding(command.keybinding)
        : null

      tooltipContent = (
        <div>
          <p className="text-sm">
            {description || command.description || command.title}
          </p>
          {shortcutText && (
            <span className="mt-1 block font-mono text-xs opacity-80">
              {shortcutText}
            </span>
          )}
        </div>
      )
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  )
}
