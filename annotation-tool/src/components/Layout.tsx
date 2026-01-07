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
import logo from '../assets/fovea-logo.svg'
import {
  VideoLibrary as VideoIcon,
  Category as OntologyIcon,
  Inventory2 as ObjectIcon,
  Save as SaveIcon,
  Download as ExportIcon,
  Upload as ImportIcon,
  Menu as MenuIcon,
  Keyboard as KeyboardIcon,
} from '@mui/icons-material'
import { useState, useCallback } from 'react'
import { usePersonas, useAllPersonaOntologies, useWorld } from '../store/queries'
import { useVideoUiStore } from '../store/zustand/videoUiStore'
import { useDialog } from '../store/zustand/dialogStore'
import { api } from '../services/api'
import { Ontology } from '../models/types'
import { useCommands, useCommandContext } from '../hooks/useCommands.js'
import KeyboardShortcutsDialog from './shared/KeyboardShortcutsDialog'
import BreadcrumbNavigation from './shared/BreadcrumbNavigation'
import ImportDataDialog from './ImportDataDialog'
import ExportDialog from './ExportDialog'
import UserMenu from './auth/UserMenu.js'
import UserSettingsDialog from './settings/UserSettingsDialog.js'
import ModelSettingsDialog from './settings/ModelSettingsDialog.js'
import AboutDialog from './settings/AboutDialog.js'
import AdminPanelDialog from './settings/AdminPanelDialog.js'

const DRAWER_WIDTH = 240

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  // Use Zustand dialogStore for dialog state management
  const exportDialog = useDialog('export')
  const importDialog = useDialog('import')
  const shortcutsDialog = useDialog('keyboardShortcuts')
  const userSettingsDialog = useDialog('userSettings')
  const modelSettingsDialog = useDialog('modelSettings')
  const aboutDialog = useDialog('about')
  const adminPanelDialog = useDialog('adminPanel')

  const [notification, setNotification] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error' | 'info' | 'warning'
  }>({ open: false, message: '', severity: 'success' })

  // TanStack Query hooks
  const { data: personas = [] } = usePersonas()
  const personaIds = personas.map(p => p.id)
  const { data: personaOntologies = [] } = useAllPersonaOntologies(personaIds)
  const { data: world } = useWorld()

  // Zustand stores
  const lastAnnotation = useVideoUiStore((state) => state.lastAnnotation)

  // Note: unsavedChanges is no longer tracked - TanStack Query handles mutation state
  const unsavedChanges = false

  const menuItems = [
    { text: 'Video Browser', icon: <VideoIcon />, path: '/', shortcut: 'Cmd/Ctrl+1' },
    { text: 'Ontology Builder', icon: <OntologyIcon />, path: '/ontology', shortcut: 'Cmd/Ctrl+2' },
    { text: 'Object Builder', icon: <ObjectIcon />, path: '/objects', shortcut: 'Cmd/Ctrl+3' },
  ]

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const ontology: Ontology = {
        id: `ont_${Date.now()}`,
        version: '1.0.0',
        personas,
        personaOntologies,
        world: {
          entities: world?.entities || [],
          events: world?.events || [],
          times: world?.times || [],
          entityCollections: world?.entityCollections || [],
          eventCollections: world?.eventCollections || [],
          timeCollections: world?.timeCollections || [],
          relations: world?.relations || [],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await api.saveOntology(ontology)
      setNotification({
        open: true,
        message: 'Data saved successfully',
        severity: 'success',
      })
    } catch (error) {
      console.error('Failed to save data:', error)
      setNotification({
        open: true,
        message: 'Failed to save data',
        severity: 'error',
      })
    } finally {
      setSaving(false)
    }
  }, [personas, personaOntologies, world])

  const handleExport = useCallback(() => {
    exportDialog.openDialog()
  }, [exportDialog])

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false })
  }

  // Setup global keyboard shortcuts
  const getCurrentContext = () => {
    if (location.pathname === '/') return 'videoBrowser'
    if (location.pathname === '/ontology') return 'ontologyWorkspace'
    if (location.pathname === '/objects') return 'objectWorkspace'
    return undefined
  }

  // Set command context for global shortcuts
  useCommandContext({
    videoBrowserActive: location.pathname === '/',
    ontologyWorkspaceActive: location.pathname === '/ontology',
    objectWorkspaceActive: location.pathname === '/objects',
    annotationWorkspaceActive: location.pathname.startsWith('/annotate'),
    dialogOpen: shortcutsDialog.open || exportDialog.open || importDialog.open || userSettingsDialog.open || modelSettingsDialog.open || aboutDialog.open,
    inputFocused: false, // Updated dynamically by App.tsx
  })

  useCommands({
    'navigate.videoBrowser': () => navigate('/'),
    'navigate.ontologyBuilder': () => navigate('/ontology'),
    'navigate.objectBuilder': () => navigate('/objects'),
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
    'file.export': () => handleExport(),
    'help.show': () => shortcutsDialog.openDialog(),
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
            aria-label="Toggle navigation menu"
          >
            <MenuIcon />
          </IconButton>
          <Box
            component="img"
            src={logo}
            alt="FOVEA Logo"
            sx={{
              height: 40,
              width: 40,
              mr: 2,
            }}
          />
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography
              variant="h1"
              component="div"
              sx={{
                fontWeight: 700,
                letterSpacing: '0.05em',
                fontSize: '1.25rem'
              }}
            >
              FOVEA
            </Typography>
            <Typography
              variant="body2"
              component="div"
              sx={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontWeight: 300,
                display: { xs: 'none', md: 'block' }
              }}
            >
              Flexible Ontology Visual Event Analyzer
            </Typography>
          </Box>
          {unsavedChanges && (
            <Typography variant="body2" sx={{ mr: 2, color: '#FFFFFF' }}>
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
                startIcon={<ExportIcon />}
                onClick={handleExport}
              >
                Export
              </Button>
            </span>
          </Tooltip>
          <Button
            color="inherit"
            startIcon={<ImportIcon />}
            onClick={importDialog.openDialog}
          >
            Import
          </Button>
          <Tooltip title="Keyboard Shortcuts (?)">
            <IconButton
              color="inherit"
              onClick={shortcutsDialog.openDialog}
              sx={{ ml: 1 }}
              aria-label="Keyboard Shortcuts (?)"
            >
              <KeyboardIcon />
            </IconButton>
          </Tooltip>
          <UserMenu
            onSettingsClick={userSettingsDialog.openDialog}
            onModelSettingsClick={modelSettingsDialog.openDialog}
            onAboutClick={aboutDialog.openDialog}
            onAdminPanelClick={adminPanelDialog.openDialog}
          />
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
        open={shortcutsDialog.open}
        onClose={shortcutsDialog.close}
        currentContext={getCurrentContext()}
      />

      <ImportDataDialog
        open={importDialog.open}
        onClose={importDialog.close}
        onImportComplete={(result) => {
          console.log('Import completed:', result)
          setNotification({
            open: true,
            message: `Import successful: ${result.summary.importedItems.annotations} annotations imported`,
            severity: 'success',
          })
        }}
      />

      <ExportDialog
        open={exportDialog.open}
        onClose={exportDialog.close}
      />

      <UserSettingsDialog
        open={userSettingsDialog.open}
        onClose={userSettingsDialog.close}
      />

      <ModelSettingsDialog
        open={modelSettingsDialog.open}
        onClose={modelSettingsDialog.close}
      />

      <AboutDialog
        open={aboutDialog.open}
        onClose={aboutDialog.close}
      />

      <AdminPanelDialog
        open={adminPanelDialog.open}
        onClose={adminPanelDialog.close}
      />
    </Box>
  )
}