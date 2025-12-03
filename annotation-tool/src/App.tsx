import { useEffect, useCallback } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { Box, CircularProgress, Typography } from '@mui/material'
import Layout from './components/Layout'
import VideoBrowser from './components/VideoBrowser'
import AnnotationWorkspace from './components/AnnotationWorkspace'
import OntologyWorkspace from './components/workspaces/OntologyWorkspace'
import ObjectWorkspace from './components/workspaces/ObjectWorkspace'
import Settings from './pages/Settings'
import LoginPage from './components/auth/LoginPage.js'
import RegisterPage from './components/auth/RegisterPage.js'
import AdminPanel from './components/admin/AdminPanel.js'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppDispatch, RootState } from './store/store'
import { setPersonas, setPersonaOntologies, setActivePersona } from './store/personaSlice'
import { setWorldData } from './store/worldSlice'
import { api } from './services/api'
import { seedTestData, isTestDataEnabled } from './utils/seedTestData'
import { useSession } from './hooks/auth/useSession.js'
import { CommandPalette } from './components/CommandPalette.js'
import { initializeCommands, initializeGlobalContext } from './lib/commands/init-commands.js'
import { commandRegistry } from './lib/commands/command-registry.js'

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

  // Initialize command registry
  useEffect(() => {
    initializeCommands()
    initializeGlobalContext()
  }, [])

  // Track input focus globally to prevent shortcuts when typing
  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      const isInputElement =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.contentEditable === 'true'

      commandRegistry.setContext('inputFocused', isInputElement)
    }

    const handleFocusOut = (event: FocusEvent) => {
      const target = event.target as HTMLElement
      const isInputElement =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.contentEditable === 'true'

      if (isInputElement) {
        commandRegistry.setContext('inputFocused', false)
      }
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  const loadOntology = useCallback(async () => {
    try {
      const ontology = await api.getOntology()

      if (ontology) {
        dispatch(setPersonas(ontology.personas))
        dispatch(setPersonaOntologies(ontology.personaOntologies))

        if (ontology.world) {
          dispatch(setWorldData(ontology.world))
        }

        if (ontology.personas.length > 0) {
          dispatch(setActivePersona(ontology.personas[0].id))
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
        await seedTestData()
      } else {
        // Normal mode: load from API
        await loadOntology()
      }
    }

    initializeData()
  }, [loadOntology])

  return (
    <ErrorBoundary context={{ component: 'App' }}>
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
          <Route
            path="annotate/:videoId"
            element={
              <ErrorBoundary context={{ route: 'AnnotationWorkspace' }}>
                <AnnotationWorkspace />
              </ErrorBoundary>
            }
          />
          <Route
            path="ontology"
            element={
              <ErrorBoundary context={{ route: 'OntologyWorkspace' }}>
                <OntologyWorkspace />
              </ErrorBoundary>
            }
          />
          <Route
            path="objects"
            element={
              <ErrorBoundary context={{ route: 'ObjectWorkspace' }}>
                <ObjectWorkspace />
              </ErrorBoundary>
            }
          />
          <Route path="settings" element={<Settings />} />
          <Route
            path="admin"
            element={
              <ErrorBoundary context={{ route: 'AdminPanel' }}>
                <AdminPanel />
              </ErrorBoundary>
            }
          />
        </Route>
      </Routes>
      <CommandPalette />
    </ErrorBoundary>
  )
}

export default App