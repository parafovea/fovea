import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  Chip,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  FormControl,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Snackbar,
  Alert,
  CircularProgress,
  Tooltip,
} from '@mui/material'
import logo from '@/assets/fovea-logo.svg'
import {
  VideoLibrary as VideoIcon,
  Category as OntologyIcon,
  Inventory2 as ObjectIcon,
  Group as GroupIcon,
  Folder as FolderIcon,
  Share as ShareIcon,
  Save as SaveIcon,
  Download as ExportIcon,
  Upload as ImportIcon,
  Menu as MenuIcon,
  Keyboard as KeyboardIcon,
} from '@mui/icons-material'
import { useState, useCallback, useRef, useEffect } from 'react'
import { usePersonas, useAllPersonaOntologies, useWorld } from '@store/queries'
import { useMyProjects } from '@store/queries/useProjects'
import { useVideoUiStore } from '@store/zustand/videoUiStore'
import { useProjectContextStore } from '@store/zustand/projectContextStore'
import { useClaimsUiStore } from '@store/zustand/claimsUiStore'
import { useDialog } from '@store/zustand/dialogStore'
import { api } from '@services/api'
import { Ontology } from '@models/types'
import { useCommands, useCommandContext } from '@hooks/commands'
import KeyboardShortcutsDialog from '@components/shared/KeyboardShortcutsDialog'
import BreadcrumbNavigation from '@components/shared/BreadcrumbNavigation'
import ImportDataDialog from '@components/data-management/ImportDataDialog'
import ExportDialog from '@components/data-management/ExportDialog'
import UserMenu from '@components/auth/UserMenu'
import UserSettingsDialog from '@components/settings/UserSettingsDialog'
import ModelSettingsDialog from '@components/settings/ModelSettingsDialog'
import AboutDialog from '@components/settings/AboutDialog'
import AdminPanelDialog from '@components/settings/AdminPanelDialog'

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
  const activeProjectId = useProjectContextStore(state => state.activeProjectId)
  const activeProjectRole = useProjectContextStore(state => state.activeProjectRole)
  const setActiveProject = useProjectContextStore(state => state.setActiveProject)
  const clearProject = useProjectContextStore(state => state.clearProject)
  const draftClaim = useClaimsUiStore((state) => state.draftClaim)
  const clearDraftClaim = useClaimsUiStore((state) => state.clearDraftClaim)

  // Project context selector data
  const { data: myProjects = [] } = useMyProjects()

  const handleProjectChange = useCallback((event: SelectChangeEvent<string>) => {
    const value = event.target.value
    if (value === '') {
      clearProject()
    } else {
      const project = myProjects.find(p => p.id === value)
      if (project) {
        setActiveProject(project.id, project.name, project.myRole ?? 'member')
      }
    }
  }, [myProjects, setActiveProject, clearProject])

  // Note: unsavedChanges is no longer tracked - TanStack Query handles mutation state
  const unsavedChanges = false

  // Use ref to avoid stale closure in keyboard shortcut handlers
  const lastAnnotationRef = useRef(lastAnnotation)
  useEffect(() => {
    lastAnnotationRef.current = lastAnnotation
  }, [lastAnnotation])

  // Track the path we came from when toggling to each builder (separate refs for independent toggles)
  const ontologyReturnPathRef = useRef<string | null>(null)
  const objectsReturnPathRef = useRef<string | null>(null)
  const lastVideoPathRef = useRef<string | null>(null)

  // Track the last active video annotation path
  useEffect(() => {
    if (location.pathname.startsWith('/annotate/')) {
      lastVideoPathRef.current = location.pathname
    }
  }, [location.pathname])

  const menuItems = [
    { text: 'Video Browser', icon: <VideoIcon />, path: '/', shortcut: 'Cmd/Ctrl+1' },
    { text: 'Ontology Builder', icon: <OntologyIcon />, path: '/ontology', shortcut: 'Cmd/Ctrl+2' },
    { text: 'World Builder', icon: <ObjectIcon />, path: '/objects', shortcut: 'Cmd/Ctrl+3' },
  ]

  const collaborationItems = [
    { text: 'My Groups', icon: <GroupIcon />, path: '/groups' },
    { text: 'My Projects', icon: <FolderIcon />, path: '/projects' },
    { text: 'Shared', icon: <ShareIcon />, path: '/shared' },
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
  // Note: ontologyWorkspaceActive and personaBrowserActive are managed ONLY by OntologyWorkspace
  // We don't set them here to avoid parent effect overriding child effect
  useCommandContext({
    videoBrowserActive: location.pathname === '/',
    objectWorkspaceActive: location.pathname === '/objects',
    annotationWorkspaceActive: location.pathname.startsWith('/annotate'),
    dialogOpen: shortcutsDialog.open || exportDialog.open || importDialog.open || userSettingsDialog.open || modelSettingsDialog.open || aboutDialog.open,
    inputFocused: false, // Updated dynamically by App.tsx
  })

  useCommands({
    'navigate.videoBrowser': () => navigate('/'),
    'navigate.ontologyBuilder': () => navigate('/ontology'),
    'navigate.objectBuilder': () => navigate('/objects'),
    'navigate.toggleOntology': () => {
      const currentPath = window.location.pathname
      // If we're in the ontology builder, go back to where we came from
      if (currentPath === '/ontology') {
        const returnPath = ontologyReturnPathRef.current || '/'
        ontologyReturnPathRef.current = null
        navigate(returnPath)
      }
      // Otherwise, store current path and go to ontology builder
      else {
        ontologyReturnPathRef.current = currentPath
        navigate('/ontology')
      }
    },
    'navigate.toggleWorld': () => {
      const currentPath = window.location.pathname
      // If we're in the object builder, go back to where we came from
      if (currentPath === '/objects') {
        const returnPath = objectsReturnPathRef.current || '/'
        objectsReturnPathRef.current = null
        navigate(returnPath)
      }
      // Otherwise, store current path and go to object builder
      else {
        objectsReturnPathRef.current = currentPath
        navigate('/objects')
      }
    },
    'navigate.toggleVideo': () => {
      if (lastVideoPathRef.current) {
        navigate(lastVideoPathRef.current)
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
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: '#bdbdbd', color: 'text.primary' }}>
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
                color: 'text.primary',
                fontWeight: 300,
                display: { xs: 'none', md: 'block' }
              }}
            >
              Flexible Ontology Visual Event Analyzer
            </Typography>
          </Box>
          {/* Project Context Selector */}
          <FormControl
            size="small"
            variant="outlined"
            sx={{
              minWidth: 180,
              mr: 2,
            }}
          >
            <Select
              value={activeProjectId ?? ''}
              onChange={handleProjectChange}
              displayEmpty
            >
              <MenuItem value="">Personal Workspace</MenuItem>
              {myProjects.map((project) => (
                <MenuItem key={project.id} value={project.id}>
                  {project.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {activeProjectRole && (
            <Chip
              label={activeProjectRole}
              size="small"
              sx={{ mr: 2 }}
              variant="outlined"
            />
          )}
          {draftClaim && (
            <Chip
              label="Draft Claim"
              color="warning"
              size="small"
              onClick={() => navigate(`/annotate/${draftClaim.videoId}`)}
              onDelete={clearDraftClaim}
              sx={{ mr: 1 }}
            />
          )}
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
        <List>
          {collaborationItems.map((item) => (
            <ListItem
              key={item.path}
              component={Link}
              to={item.path}
              onClick={() => setDrawerOpen(false)}
              sx={{
                textDecoration: 'none',
                color: 'inherit',
                backgroundColor: location.pathname.startsWith(item.path) ? 'action.selected' : 'transparent',
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
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