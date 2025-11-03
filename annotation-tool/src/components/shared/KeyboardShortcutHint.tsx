import { useState, useEffect } from 'react'
import { Box, Typography, Paper, IconButton, Collapse } from '@mui/material'
import { Close as CloseIcon, Keyboard as KeyboardIcon } from '@mui/icons-material'
import { useLocation } from 'react-router-dom'
import { commandRegistry } from '../../lib/commands/command-registry.js'
import { formatKeybinding } from '../../lib/commands/commands.js'

export default function KeyboardShortcutHint() {
  const location = useLocation()
  const [isExpanded, setIsExpanded] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)
  
  // Get the most relevant commands for the current context
  const getRelevantCommands = () => {
    const allCommands = commandRegistry.getCommands()
    const commands = []

    // Always show command palette and help
    commands.push(allCommands.find(c => c.id === 'commandPalette.toggle'))
    commands.push(allCommands.find(c => c.id === 'help.show'))

    // Add context-specific commands based on route
    if (location.pathname === '/') {
      commands.push(allCommands.find(c => c.id === 'search.focus'))
      commands.push(allCommands.find(c => c.id === 'video.open'))
    } else if (location.pathname === '/ontology') {
      commands.push(allCommands.find(c => c.id === 'ontology.newType'))
      commands.push(allCommands.find(c => c.id === 'ontology.nextTab'))
    } else if (location.pathname === '/objects') {
      commands.push(allCommands.find(c => c.id === 'object.new'))
      commands.push(allCommands.find(c => c.id === 'object.nextTab'))
    } else if (location.pathname.startsWith('/annotate')) {
      commands.push(allCommands.find(c => c.id === 'video.playPause'))
      commands.push(allCommands.find(c => c.id === 'annotation.addKeyframe'))
      commands.push(allCommands.find(c => c.id === 'timeline.toggle'))
    }

    return commands.filter(Boolean).slice(0, 4) // Show max 4 commands
  }

  const commands = getRelevantCommands() || []
  
  // Auto-collapse after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExpanded(false)
    }, 10000)
    
    return () => clearTimeout(timer)
  }, [location.pathname]) // Reset timer on route change
  
  if (isDismissed || commands.length === 0) {
    return null
  }
  
  return (
    <Box
      role="complementary"
      aria-label="Keyboard shortcuts hint"
      sx={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 1200,
        maxWidth: 400,
        pointerEvents: 'none', // Allow clicks to pass through to elements behind
      }}
    >
      <Collapse in={isExpanded}>
        <Paper
          elevation={3}
          sx={{
            p: 2,
            backgroundColor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            position: 'relative',
            pointerEvents: 'auto', // Re-enable pointer events for this Paper
          }}
        >
          <IconButton
            size="small"
            onClick={() => setIsDismissed(true)}
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
            }}
            aria-label="Dismiss keyboard shortcuts hint"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <KeyboardIcon fontSize="small" color="primary" />
            <Typography variant="caption" fontWeight="bold">
              Keyboard Shortcuts
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {commands.map((command, index) => {
              if (!command || !command.keybinding) return null
              const keybinding = Array.isArray(command.keybinding) ? command.keybinding[0] : command.keybinding
              return (
                <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      backgroundColor: 'grey.200',
                      px: 0.5,
                      py: 0.25,
                      borderRadius: 0.5,
                      fontSize: '0.7rem',
                    }}
                  >
                    {formatKeybinding(keybinding)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    {command.description || command.title}
                  </Typography>
                </Box>
              )
            })}
          </Box>
        </Paper>
      </Collapse>
      
      {!isExpanded && (
        <Paper
          elevation={2}
          sx={{
            p: 1,
            cursor: 'pointer',
            pointerEvents: 'auto', // Re-enable pointer events for this Paper
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
          onClick={() => setIsExpanded(true)}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <KeyboardIcon fontSize="small" color="action" />
            <Typography variant="caption" color="text.secondary">
              Press ? for shortcuts
            </Typography>
          </Box>
        </Paper>
      )}
    </Box>
  )
}