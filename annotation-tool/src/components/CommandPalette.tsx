/**
 * Command Palette component (VS Code style).
 * Searchable command launcher with keyboard shortcuts displayed.
 * Opens with Cmd/Ctrl+Shift+P.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Typography,
  Box,
  Chip,
  Paper
} from '@mui/material'
import { Search as SearchIcon } from '@mui/icons-material'
import { useHotkeys } from 'react-hotkeys-hook'
import { commandRegistry } from '../lib/commands/command-registry.js'
import { formatKeybinding } from '../lib/commands/commands.js'

/**
 * Command Palette component.
 * Provides searchable command execution interface.
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
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Open command palette with Cmd+Shift+P
  useHotkeys(
    'mod+shift+p',
    (event) => {
      event.preventDefault()
      setOpen(true)
      setSearch('')
      setSelectedIndex(0)
    },
    { enableOnFormTags: true }
  )

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Get all available commands (filtered by context)
  // Re-evaluate when dialog opens to get current context
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
    // Re-evaluate when dialog opens to refresh context-dependent commands
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!search.trim()) {
      return allCommands
    }

    const searchLower = search.toLowerCase()
    return allCommands.filter(cmd =>
      cmd.title.toLowerCase().includes(searchLower) ||
      cmd.description?.toLowerCase().includes(searchLower) ||
      cmd.id.toLowerCase().includes(searchLower) ||
      cmd.category.toLowerCase().includes(searchLower)
    )
  }, [allCommands, search])

  // Handle command execution
  const executeCommand = useCallback(async (commandId: string) => {
    setOpen(false)
    setSearch('')
    setSelectedIndex(0)

    try {
      await commandRegistry.execute(commandId)
    } catch (error) {
      console.error(`Failed to execute command ${commandId}:`, error)
    }
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setSelectedIndex(prev =>
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        )
        break

      case 'ArrowUp':
        event.preventDefault()
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev))
        break

      case 'Enter':
        event.preventDefault()
        if (filteredCommands[selectedIndex]) {
          executeCommand(filteredCommands[selectedIndex].id)
        }
        break

      case 'Escape':
        event.preventDefault()
        setOpen(false)
        setSearch('')
        setSelectedIndex(0)
        break

      default:
        break
    }
  }, [filteredCommands, selectedIndex, executeCommand])

  // Handle dialog close
  const handleClose = useCallback(() => {
    setOpen(false)
    setSearch('')
    setSelectedIndex(0)
  }, [])

  // Scroll selected item into view
  useEffect(() => {
    const selectedElement = document.querySelector(`[data-command-index="${selectedIndex}"]`)
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          position: 'fixed',
          top: '10%',
          m: 0,
          maxHeight: '80vh'
        }
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <TextField
            inputRef={inputRef}
            fullWidth
            placeholder="Type a command or search..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />
            }}
            variant="outlined"
            size="small"
            autoComplete="off"
          />
        </Box>

        <List
          sx={{
            maxHeight: '60vh',
            overflow: 'auto',
            py: 0
          }}
        >
          {filteredCommands.length === 0 ? (
            <Box sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">
                No commands found
              </Typography>
            </Box>
          ) : (
            filteredCommands.map((command, index) => (
              <ListItem
                key={command.id}
                data-command-index={index}
                disablePadding
                sx={{
                  backgroundColor: index === selectedIndex ? 'action.selected' : 'transparent'
                }}
              >
                <ListItemButton
                  onClick={() => executeCommand(command.id)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  sx={{ py: 1.5 }}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body1">
                          {command.title}
                        </Typography>
                        <Chip
                          label={command.category}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.7rem',
                            textTransform: 'capitalize'
                          }}
                        />
                      </Box>
                    }
                    secondary={command.description || command.id}
                  />
                  {command.keybinding && (
                    <Box sx={{ ml: 2 }}>
                      <Paper
                        variant="outlined"
                        sx={{
                          px: 1,
                          py: 0.5,
                          backgroundColor: 'grey.100',
                          display: 'inline-block'
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: 'monospace',
                            color: 'text.secondary'
                          }}
                        >
                          {Array.isArray(command.keybinding)
                            ? formatKeybinding(command.keybinding[0])
                            : formatKeybinding(command.keybinding)}
                        </Typography>
                      </Paper>
                    </Box>
                  )}
                </ListItemButton>
              </ListItem>
            ))
          )}
        </List>

        <Box
          sx={{
            p: 1,
            borderTop: 1,
            borderColor: 'divider',
            backgroundColor: 'grey.50',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {filteredCommands.length} command{filteredCommands.length !== 1 ? 's' : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            ↑↓ Navigate • ↵ Execute • Esc Close
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
