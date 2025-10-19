/**
 * Tooltip component that displays keyboard shortcuts.
 * Wraps MUI Tooltip and automatically fetches shortcut from command registry.
 */

import { Tooltip, TooltipProps, Box, Typography } from '@mui/material'
import { commandRegistry } from '../../lib/commands/command-registry.js'
import { formatKeybinding } from '../../lib/commands/commands.js'

interface KeyboardShortcutTooltipProps extends Omit<TooltipProps, 'title'> {
  /** Command ID to fetch shortcut for */
  commandId?: string
  /** Custom title (if not using commandId) */
  title?: string
  /** Additional text to append after shortcut */
  description?: string
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
  ...tooltipProps
}: KeyboardShortcutTooltipProps) {
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
        <Box>
          <Typography variant="body2">
            {description || command.description || command.title}
          </Typography>
          {shortcutText && (
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                mt: 0.5,
                fontFamily: 'monospace',
                opacity: 0.8
              }}
            >
              {shortcutText}
            </Typography>
          )}
        </Box>
      )
    }
  }

  return (
    <Tooltip title={tooltipContent} {...tooltipProps}>
      {children}
    </Tooltip>
  )
}
