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
} from '@mui/material'
import { generateId } from '../utils/uuid'
import {
  VideoLibrary as VideoIcon,
  Category as OntologyIcon,
  Inventory2 as ObjectIcon,
  Save as SaveIcon,
  Download as ExportIcon,
  Menu as MenuIcon,
} from '@mui/icons-material'
import { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { RootState, AppDispatch } from '../store/store'
import { markSaved } from '../store/ontologySlice'
import { markSaved as markPersonaSaved } from '../store/personaSlice'
import { api } from '../services/api'
import { Ontology } from '../models/types'

const DRAWER_WIDTH = 240

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [notification, setNotification] = useState<{
    open: boolean
    message: string
    severity: 'success' | 'error' | 'info' | 'warning'
  }>({ open: false, message: '', severity: 'success' })
  
  const unsavedChanges = useSelector((state: RootState) => 
    state.ontology.unsavedChanges || state.persona.unsavedChanges
  )
  const currentOntology = useSelector((state: RootState) => state.ontology.currentOntology)
  const { personas, personaOntologies } = useSelector((state: RootState) => state.persona)
  const lastAnnotation = useSelector((state: RootState) => state.videos.lastAnnotation)

  const menuItems = [
    { text: 'Video Browser', icon: <VideoIcon />, path: '/' },
    { text: 'Ontology Builder', icon: <OntologyIcon />, path: '/ontology' },
    { text: 'Object Builder', icon: <ObjectIcon />, path: '/objects' },
  ]

  const handleSave = async () => {
    setSaving(true)
    try {
      // Create ontology in new format
      const ontology: Ontology = {
        id: currentOntology?.id || `generateId()`,
        version: currentOntology?.version || '1.0.0',
        personas,
        personaOntologies,
        createdAt: currentOntology?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        description: currentOntology?.description,
      }
      
      await api.saveOntology(ontology)
      dispatch(markSaved())
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
  }

  const handleExport = async () => {
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
  }

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false })
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check for Cmd (Mac) or Ctrl (Windows/Linux)
      const isModifierKey = e.metaKey || e.ctrlKey
      
      if (isModifierKey && !e.shiftKey) {
        switch(e.key) {
          case '1':
            e.preventDefault()
            navigate('/')
            break
          case '2':
            e.preventDefault()
            navigate('/ontology')
            break
          case '3':
            e.preventDefault()
            navigate('/objects')
            break
          case 'o':
          case 'O':
            e.preventDefault()
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
            break
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [navigate, location.pathname, lastAnnotation.videoId])

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
            FOVEA: Frame-Oriented Video Event Annotator
          </Typography>
          {unsavedChanges && (
            <Typography variant="body2" sx={{ mr: 2, color: 'yellow' }}>
              Unsaved changes
            </Typography>
          )}
          <Button 
            color="inherit" 
            startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving || !currentOntology}
          >
            Save
          </Button>
          <Button 
            color="inherit" 
            startIcon={exporting ? <CircularProgress size={20} color="inherit" /> : <ExportIcon />}
            onClick={handleExport}
            disabled={exporting}
          >
            Export
          </Button>
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
          p: 3,
          mt: '64px',
          height: 'calc(100vh - 64px)',
          overflow: 'auto',
        }}
      >
        <Outlet />
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
    </Box>
  )
}