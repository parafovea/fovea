import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  Box, 
  Button, 
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Snackbar,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import {
  VideoLibrary as VideoIcon,
  Category as OntologyIcon,
  Inventory2 as ObjectIcon,
  Save as SaveIcon,
  Download as ExportIcon,
  Menu as MenuIcon,
  Keyboard as KeyboardIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material'
import { useState, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState, AppDispatch } from '../store/store'
import { markSaved as markPersonaSaved } from '../store/personaSlice'
import { api } from '../services/api'
import { Ontology } from '../models/types'
import { useGlobalKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import KeyboardShortcutsDialog from './shared/KeyboardShortcutsDialog'
import KeyboardShortcutHint from './shared/KeyboardShortcutHint'
import BreadcrumbNavigation from './shared/BreadcrumbNavigation'

const DRAWER_WIDTH = 240

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false)
  const [notification, setNotification] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error' | 'info' | 'warning'
  }>({ open: false, message: '', severity: 'success' })
  
  const unsavedChanges = useSelector((state: RootState) =>
    state.persona.unsavedChanges
  )
  const { personas, personaOntologies } = useSelector((state: RootState) => state.persona)
  const lastAnnotation = useSelector((state: RootState) => state.videos.lastAnnotation)

  const menuItems = [
    { text: 'Video Browser', icon: <VideoIcon />, path: '/', shortcut: 'Cmd/Ctrl+1' },
    { text: 'Ontology Builder', icon: <OntologyIcon />, path: '/ontology', shortcut: 'Cmd/Ctrl+2' },
    { text: 'Object Builder', icon: <ObjectIcon />, path: '/objects', shortcut: 'Cmd/Ctrl+3' },
    { text: 'Settings', icon: <SettingsIcon />, path: '/settings', shortcut: 'Cmd/Ctrl+,' },
  ]

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // Create ontology in new format
      const ontology: Ontology = {
        id: `ont_${Date.now()}`,
        version: '1.0.0',
        personas,
        personaOntologies,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await api.saveOntology(ontology)
      dispatch(markPersonaSaved())
      setNotification({
        open: true,
        message: 'Ontology saved successfully',
        severity: 'success',
      })
    } catch (error) {
      console.error('Failed to save ontology:', error)
      setNotification({
        open: true,
        message: 'Failed to save ontology',
        severity: 'error',
      })
    } finally {
      setSaving(false)
    }
  }, [personas, personaOntologies, dispatch])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      await api.downloadExport()
      setNotification({
        open: true,
        message: 'Export downloaded successfully',
        severity: 'success',
      })
    } catch (error) {
      console.error('Failed to export:', error)
      setNotification({
        open: true,
        message: 'Failed to export data',
        severity: 'error',
      })
    } finally {
      setExporting(false)
    }
  }, [])

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false })
  }

  // Setup global keyboard shortcuts
  const getCurrentContext = () => {
    if (location.pathname === '/') return 'videoBrowser'
    if (location.pathname === '/ontology') return 'ontologyWorkspace'
    if (location.pathname === '/objects') return 'objectWorkspace'
    if (location.pathname === '/settings') return 'settings'
    return undefined
  }
  
  useGlobalKeyboardShortcuts({
    'navigate.videoBrowser': () => navigate('/'),
    'navigate.ontologyBuilder': () => navigate('/ontology'),
    'navigate.objectBuilder': () => navigate('/objects'),
    'navigate.settings': () => navigate('/settings'),
    'navigate.toggle': () => {
      // If we're in the ontology builder and there's a last annotation, go back to it
      if (location.pathname === '/ontology' && lastAnnotation.videoId) {
        navigate(`/annotate/${lastAnnotation.videoId}`)
      }
      // If we're in the object builder and there's a last annotation, go back to it
      else if (location.pathname === '/objects' && lastAnnotation.videoId) {
        navigate(`/annotate/${lastAnnotation.videoId}`)
      }
      // Otherwise, go to the ontology builder
      else if (location.pathname !== '/ontology') {
        navigate('/ontology')
      }
    },
    'file.save': () => {
      if (!saving) {
        handleSave()
      }
    },
    'file.export': () => {
      if (!exporting) {
        handleExport()
      }
    },
    'help.show': () => setShortcutsDialogOpen(true),
  })

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setDrawerOpen(!drawerOpen)}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            FOVEA: Flexible Ontology Visual Event Analyzer
          </Typography>
          {unsavedChanges && (
            <Typography variant="body2" sx={{ mr: 2, color: 'yellow' }}>
              Unsaved changes
            </Typography>
          )}
          <Tooltip title="Save (Cmd/Ctrl+S)">
            <span>
              <Button
                color="inherit"
                startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                onClick={handleSave}
                disabled={saving}
              >
                Save
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Export (Cmd/Ctrl+E)">
            <span>
              <Button 
                color="inherit" 
                startIcon={exporting ? <CircularProgress size={20} color="inherit" /> : <ExportIcon />}
                onClick={handleExport}
                disabled={exporting}
              >
                Export
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Keyboard Shortcuts (?)">
            <IconButton
              color="inherit"
              onClick={() => setShortcutsDialogOpen(true)}
              sx={{ ml: 1 }}
            >
              <KeyboardIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="temporary"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            top: '64px',
          },
        }}
      >
        <List>
          {menuItems.map((item) => (
            <ListItem
              key={item.path}
              component={Link}
              to={item.path}
              onClick={() => setDrawerOpen(false)}
              sx={{
                textDecoration: 'none',
                color: 'inherit',
                backgroundColor: location.pathname === item.path ? 'action.selected' : 'transparent',
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText 
                primary={item.text} 
                secondary={item.shortcut}
                secondaryTypographyProps={{ 
                  variant: 'caption',
                  sx: { opacity: 0.7 }
                }}
              />
            </ListItem>
          ))}
        </List>
        <Divider />
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          mt: '64px',
          height: 'calc(100vh - 64px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <BreadcrumbNavigation />
        <Box sx={{ flexGrow: 1, p: 3, overflow: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
      
      <Snackbar
        open={notification.open}
        autoHideDuration={6000}
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={handleCloseNotification}
          severity={notification.severity}
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>
      
      <KeyboardShortcutsDialog
        open={shortcutsDialogOpen}
        onClose={() => setShortcutsDialogOpen(false)}
        currentContext={getCurrentContext()}
      />
      
      <KeyboardShortcutHint />
    </Box>
  )
}