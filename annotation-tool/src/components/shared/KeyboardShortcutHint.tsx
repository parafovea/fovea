import { useState, useEffect } from 'react'
import { Box, Typography, Paper, IconButton, Collapse } from '@mui/material'
import { Close as CloseIcon, Keyboard as KeyboardIcon } from '@mui/icons-material'
import { useLocation } from 'react-router-dom'
import { formatShortcut, globalShortcuts, videoBrowserShortcuts, ontologyWorkspaceShortcuts, objectWorkspaceShortcuts } from '../../utils/shortcuts'

export default function KeyboardShortcutHint() {
  const location = useLocation()
  const [isExpanded, setIsExpanded] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)
  
  // Get the most relevant shortcuts for the current context
  const getRelevantShortcuts = () => {
    const shortcuts = []

    // Always show help shortcut
    if (globalShortcuts) {
      shortcuts.push(globalShortcuts.find(s => s.action === 'help.show'))
    }

    // Add context-specific shortcuts
    if (location.pathname === '/') {
      if (videoBrowserShortcuts) {
        shortcuts.push(videoBrowserShortcuts.find(s => s.action === 'search.focus'))
        shortcuts.push(videoBrowserShortcuts.find(s => s.action === 'video.open'))
      }
    } else if (location.pathname === '/ontology') {
      if (ontologyWorkspaceShortcuts) {
        shortcuts.push(ontologyWorkspaceShortcuts.find(s => s.action === 'type.new'))
        shortcuts.push(ontologyWorkspaceShortcuts.find(s => s.action === 'search.focus'))
        shortcuts.push(ontologyWorkspaceShortcuts.find(s => s.action === 'navigate.personaBrowser'))
      }
    } else if (location.pathname === '/objects') {
      if (objectWorkspaceShortcuts) {
        shortcuts.push(objectWorkspaceShortcuts.find(s => s.action === 'object.new'))
        shortcuts.push(objectWorkspaceShortcuts.find(s => s.action === 'search.focus'))
        shortcuts.push(objectWorkspaceShortcuts.find(s => s.action === 'tab.next'))
      }
    }

    // Add navigation shortcuts
    if (globalShortcuts) {
      shortcuts.push(globalShortcuts.find(s => s.action === 'navigate.toggle'))
    }

    return shortcuts.filter(Boolean).slice(0, 4) // Show max 4 shortcuts
  }

  const shortcuts = getRelevantShortcuts() || []
  
  // Auto-collapse after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExpanded(false)
    }, 10000)
    
    return () => clearTimeout(timer)
  }, [location.pathname]) // Reset timer on route change
  
  if (isDismissed || shortcuts.length === 0) {
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
            {shortcuts.map((shortcut, index) => {
              if (!shortcut) return null
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
                    {formatShortcut(shortcut)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    {shortcut.description}
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