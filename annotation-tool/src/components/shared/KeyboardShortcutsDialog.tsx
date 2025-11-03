/**
 * Keyboard shortcuts help dialog.
 * Displays all available keyboard shortcuts organized by context.
 */

import { useState, useMemo } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tabs,
  Tab,
  Chip,
  IconButton,
} from '@mui/material'
import {
  Close as CloseIcon,
  Keyboard as KeyboardIcon,
} from '@mui/icons-material'
import { commandRegistry, Command } from '../../lib/commands/command-registry.js'
import { formatKeybinding } from '../../lib/commands/commands.js'

interface KeyboardShortcutsDialogProps {
  open: boolean
  onClose: () => void
  currentContext?: 'videoBrowser' | 'ontologyWorkspace' | 'objectWorkspace' | 'annotationWorkspace' | 'settings'
}

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`shortcuts-tabpanel-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  )
}

function ShortcutTable({ commands }: { commands: Command[] }) {
  if (commands.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No shortcuts available
        </Typography>
      </Box>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>Shortcut</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {commands
            .filter(cmd => cmd.keybinding) // Only show commands with keybindings
            .map((command) => (
              <TableRow key={command.id}>
                <TableCell>
                  <Chip
                    label={
                      Array.isArray(command.keybinding)
                        ? formatKeybinding(command.keybinding[0])
                        : formatKeybinding(command.keybinding!)
                    }
                    size="small"
                    sx={{
                      fontFamily: 'monospace',
                      backgroundColor: 'grey.200',
                      color: 'grey.800',
                    }}
                  />
                </TableCell>
                <TableCell>{command.description || command.title}</TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default function KeyboardShortcutsDialog({
  open,
  onClose,
  currentContext,
}: KeyboardShortcutsDialogProps) {
  const [tabValue, setTabValue] = useState(() => {
    if (currentContext === 'videoBrowser') return 1
    if (currentContext === 'ontologyWorkspace') return 2
    if (currentContext === 'objectWorkspace') return 3
    if (currentContext === 'annotationWorkspace') return 4
    return 0
  })

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }

  const commandsByCategory = useMemo(() => {
    const allCommands = commandRegistry.getCommands() || []

    return {
      global: allCommands.filter(cmd => cmd.category === 'global' || cmd.category === 'navigation' || cmd.category === 'file'),
      video: allCommands.filter(cmd => cmd.category === 'video'),
      annotation: allCommands.filter(cmd => cmd.category === 'annotation'),
      ontology: allCommands.filter(cmd => cmd.category === 'ontology'),
      object: allCommands.filter(cmd => cmd.category === 'object'),
    }
  }, [])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { minHeight: '60vh' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <KeyboardIcon color="primary" />
            <Typography variant="h6">Keyboard Shortcuts</Typography>
          </Box>
          <IconButton
            edge="end"
            color="inherit"
            onClick={onClose}
            aria-label="close"
            size="small"
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange}>
            <Tab label="Global" />
            <Tab label="Video Browser" />
            <Tab label="Ontology Builder" />
            <Tab label="Object Builder" />
            <Tab label="Annotation Workspace" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
            These shortcuts work everywhere in the application
          </Typography>
          <ShortcutTable commands={commandsByCategory.global} />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
            Available when browsing videos
          </Typography>
          <ShortcutTable commands={[]} />
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
            Available in the Ontology Builder workspace
          </Typography>
          <ShortcutTable commands={commandsByCategory.ontology} />
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
            Available in the Object Builder workspace
          </Typography>
          <ShortcutTable commands={commandsByCategory.object} />
        </TabPanel>

        <TabPanel value={tabValue} index={4}>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
            Available in the Annotation Workspace (video annotation)
          </Typography>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight="bold" gutterBottom>
              Video Playback
            </Typography>
            <ShortcutTable commands={commandsByCategory.video} />
          </Box>
          <Box>
            <Typography variant="body2" fontWeight="bold" gutterBottom>
              Annotation Controls
            </Typography>
            <ShortcutTable commands={commandsByCategory.annotation} />
          </Box>
        </TabPanel>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
