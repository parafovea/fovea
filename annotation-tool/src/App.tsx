import { useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Box, CircularProgress, Typography } from '@mui/material'
import { generateId } from './utils/uuid'
import Layout from './components/Layout'
import VideoBrowser from './components/VideoBrowser'
import AnnotationWorkspace from './components/AnnotationWorkspace'
import OntologyWorkspace from './components/workspaces/OntologyWorkspace'
import ObjectWorkspace from './components/workspaces/ObjectWorkspace'
import Settings from './pages/Settings'
import LoginPage from './components/auth/LoginPage.js'
import RegisterPage from './components/auth/RegisterPage.js'
import AdminPanel from './components/admin/AdminPanel.js'
import { AppDispatch, RootState } from './store/store'
import { setPersonas, setPersonaOntologies, setActivePersona } from './store/personaSlice'
import { setWorldData } from './store/worldSlice'
import { api } from './services/api'
import { seedTestData, isTestDataEnabled } from './utils/seedTestData'
import { useSession } from './hooks/auth/useSession.js'

/**
 * Loading screen component.
 * Displays while checking authentication status.
 */
function LoadingScreen() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
      }}
    >
      <CircularProgress size={60} />
      <Typography variant="h6" color="text.secondary">
        Loading...
      </Typography>
    </Box>
  )
}

/**
 * Protected route wrapper.
 * Redirects to login if user is not authenticated in multi-user mode.
 *
 * @param children - Child components to render if authenticated
 * @returns Protected content or redirect to login
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, mode } = useSelector((state: RootState) => state.user)
  const location = useLocation()

  if (isLoading) {
    return <LoadingScreen />
  }

  if (mode === 'multi-user' && !isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

function App() {
  const dispatch = useDispatch<AppDispatch>()

  // Restore session on mount (also fetches config)
  useSession()

  const loadOntology = useCallback(async () => {
    try {
      const ontology = await api.getOntology()

      // Convert old format to new multi-persona format if needed
      if (ontology) {
        if (ontology.personas && ontology.personaOntologies) {
          // New format
          dispatch(setPersonas(ontology.personas))
          dispatch(setPersonaOntologies(ontology.personaOntologies))

          // Load world state if it exists
          if (ontology.world) {
            dispatch(setWorldData(ontology.world))
          }

          if (ontology.personas.length > 0) {
            dispatch(setActivePersona(ontology.personas[0].id))
          }
        } else if ((ontology as any).persona) {
          // Old format - convert to new
          const oldOntology = ontology as any
          const persona = {
            ...oldOntology.persona,
            name: oldOntology.persona.role,
          }
          const personaOntology = {
            id: generateId(),
            personaId: persona.id,
            entities: oldOntology.entities || [],
            roles: oldOntology.roles || [],
            events: oldOntology.events || [],
            relationTypes: [],
            relations: [],
            createdAt: ontology.createdAt,
            updatedAt: ontology.updatedAt,
          }
          dispatch(setPersonas([persona]))
          dispatch(setPersonaOntologies([personaOntology]))
          dispatch(setActivePersona(persona.id))
        } else {
          // Create default persona
          const defaultPersona = {
            id: generateId(),
            name: 'Default Persona',
            role: 'Analyst',
            informationNeed: 'General information extraction',
            details: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          const defaultOntology = {
            id: generateId(),
            personaId: defaultPersona.id,
            entities: [],
            roles: [],
            events: [],
            relationTypes: [],
            relations: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          dispatch(setPersonas([defaultPersona]))
          dispatch(setPersonaOntologies([defaultOntology]))
          dispatch(setActivePersona(defaultPersona.id))
        }
      }
    } catch (error) {
      console.error('Failed to load ontology:', error)
    }
  }, [dispatch])

  useEffect(() => {
    const initializeData = async () => {
      // Check if developer test mode is enabled
      if (isTestDataEnabled()) {
        console.warn('⚠️  DEVELOPER TEST MODE ENABLED')
        console.warn('⚠️  Pre-populating with test data')
        console.warn('⚠️  Set VITE_ENABLE_TEST_DATA=false to disable')
        await seedTestData()
      } else {
        // Normal mode: load from API
        await loadOntology()
      }
    }

    initializeData()
  }, [loadOntology])

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<VideoBrowser />} />
        <Route path="annotate/:videoId" element={<AnnotationWorkspace />} />
        <Route path="ontology" element={<OntologyWorkspace />} />
        <Route path="objects" element={<ObjectWorkspace />} />
        <Route path="settings" element={<Settings />} />
        <Route path="admin" element={<AdminPanel />} />
      </Route>
    </Routes>
  )
}

export default App