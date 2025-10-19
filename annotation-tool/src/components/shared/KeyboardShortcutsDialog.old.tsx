import { useState } from 'react'
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
import {
  globalShortcuts,
  videoBrowserShortcuts,
  ontologyWorkspaceShortcuts,
  objectWorkspaceShortcuts,
  annotationWorkspaceShortcuts,
  formatShortcut,
  ShortcutDefinition,
} from '../../utils/shortcuts'
import { useDialogKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'

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

function ShortcutTable({ shortcuts }: { shortcuts: ShortcutDefinition[] }) {
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
          {shortcuts.map((shortcut, index) => (
            <TableRow key={index}>
              <TableCell>
                <Chip
                  label={formatShortcut(shortcut)}
                  size="small"
                  sx={{
                    fontFamily: 'monospace',
                    backgroundColor: 'grey.200',
                    color: 'grey.800',
                  }}
                />
              </TableCell>
              <TableCell>{shortcut.description}</TableCell>
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
  const [tabValue, setTabValue] = useState(0)
  
  // Setup dialog keyboard shortcuts
  useDialogKeyboardShortcuts(
    {
      'dialog.close': onClose,
    },
    open
  )
  
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue)
  }
  
  // Set initial tab based on current context
  useState(() => {
    if (currentContext === 'videoBrowser') setTabValue(1)
    else if (currentContext === 'ontologyWorkspace') setTabValue(2)
    else if (currentContext === 'objectWorkspace') setTabValue(3)
    else if (currentContext === 'annotationWorkspace') setTabValue(4)
    else setTabValue(0)
  })
  
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
          <ShortcutTable shortcuts={globalShortcuts} />
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
            Available when browsing videos
          </Typography>
          <ShortcutTable shortcuts={videoBrowserShortcuts} />
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
            Available in the Ontology Builder workspace
          </Typography>
          <ShortcutTable shortcuts={ontologyWorkspaceShortcuts} />
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
            Available in the Object Builder workspace
          </Typography>
          <ShortcutTable shortcuts={objectWorkspaceShortcuts} />
        </TabPanel>

        <TabPanel value={tabValue} index={4}>
          <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
            Available in the Annotation Workspace (video annotation)
          </Typography>
          <ShortcutTable shortcuts={annotationWorkspaceShortcuts} />
        </TabPanel>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}