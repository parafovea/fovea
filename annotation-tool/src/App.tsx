import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Box, CircularProgress, Typography } from '@mui/material'
import Layout from '@components/layout/Layout'
import VideoBrowser from '@components/video/VideoBrowser'
import AnnotationWorkspace from '@components/annotation/AnnotationWorkspace'
import OntologyWorkspace from './components/workspaces/OntologyWorkspace'
import ObjectWorkspace from './components/workspaces/ObjectWorkspace'
import Settings from './pages/Settings'
import LoginPage from './components/auth/LoginPage'
import RegisterPage from './components/auth/RegisterPage'
import AdminPanel from './components/admin/AdminPanel'
import { ErrorBoundary } from '@components/shared/ErrorBoundary'
import { SessionManager } from '@components/auth/SessionManager'
import { useAuthStore } from './store/zustand/authStore'
import { useAnnotationUiStore } from './store/zustand'
import { usePersonas } from './store/queries'
import { seedTestData, isTestDataEnabled } from './utils/seedTestData'
import { useSession } from './hooks/auth/useSession'
import { CommandPalette } from '@components/shared/CommandPalette'
import { commandRegistry } from './lib/commands/command-registry'

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
 * Closes issue #92 (unauthenticated user briefly sees Video Browser): the
 * previous gate read only `isLoading` and `mode`, with `mode` defaulting
 * to `'single-user'` in the auth store's initial state. When the initial
 * `/api/config` request transiently failed (the bug reporter saw this
 * under heavy load), `setConfig` was never invoked, mode stayed at
 * `'single-user'`, and the protected children rendered to a first-time
 * visitor with no session. We now additionally hold the loading screen
 * until `appConfig` has been fetched successfully — `appConfig === null`
 * is the only authoritative signal that the server's actual deployment
 * mode is known, so this is the fail-safe gate.
 *
 * @param children - Child components to render if authenticated
 * @returns Protected content or redirect to login
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const isLoading = useAuthStore(state => state.isLoading)
  const mode = useAuthStore(state => state.mode)
  const appConfig = useAuthStore(state => state.appConfig)
  const location = useLocation()

  // Hold loading until both the session check has completed AND the
  // server-side config has loaded; without the appConfig gate, a
  // transient /api/config failure left mode at its `'single-user'`
  // default and exposed protected routes to anonymous visitors.
  if (isLoading || appConfig === null) {
    return <LoadingScreen />
  }

  if (mode === 'multi-user' && !isAuthenticated) {
    const redirect = location.pathname + location.search
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />
  }

  return <>{children}</>
}

function App() {
  // Restore session on mount (also fetches config)
  useSession()

  // Fetch personas via TanStack Query - this triggers initial data loading
  const { data: personas = [] } = usePersonas()
  const selectedPersonaId = useAnnotationUiStore((state) => state.selectedPersonaId)
  const setSelectedPersonaId = useAnnotationUiStore((state) => state.setSelectedPersonaId)

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

  // Auto-select first persona if none selected
  useEffect(() => {
    if (personas.length > 0 && !selectedPersonaId) {
      setSelectedPersonaId(personas[0].id)
    }
  }, [personas, selectedPersonaId, setSelectedPersonaId])

  // Seed test data if enabled
  useEffect(() => {
    if (isTestDataEnabled()) {
      seedTestData()
    }
  }, [])

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
      <SessionManager />
    </ErrorBoundary>
  )
}

export default App