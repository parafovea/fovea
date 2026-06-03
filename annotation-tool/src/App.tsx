import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/ui/spinner'
import Layout from '@components/layout/Layout'
import VideoBrowser from '@components/video/VideoBrowser'
import { TourCataloguePage } from '@/pages/TourCataloguePage'

/**
 * On demo.fovea.video the SPA is built with VITE_DEMO_PUBLIC=1. The
 * QR-code visitor lands on a public tour catalogue (no auth, no
 * server round-trips, fully MSW-mocked via VITE_TOUR_DEMO=1) and only
 * crosses into the authenticated app via the explicit "Sign in" link.
 */
const DEMO_PUBLIC = import.meta.env.VITE_DEMO_PUBLIC === '1'
import AnnotationWorkspace from '@components/annotation/AnnotationWorkspace'
import OntologyWorkspace from './components/workspaces/OntologyWorkspace'
import ObjectWorkspace from './components/workspaces/ObjectWorkspace'
import Settings from './pages/Settings'
import GroupsPage from './pages/GroupsPage'
import GroupDetailPage from './pages/GroupDetailPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import SharedAnnotationsPage from './pages/SharedAnnotationsPage'
import { LoginPage } from './components/auth/LoginPage'
import { RegisterPage } from './components/auth/RegisterPage'
import { AdminPanel } from './components/admin/AdminPanel'
import { ErrorBoundary } from '@components/shared/ErrorBoundary'
import { SessionManager } from '@components/auth/SessionManager'
import { useAuthStore } from './store/zustand/authStore'
import { useAnnotationUiStore } from './store/zustand'
import { usePersonas } from './store/queries'
import { seedTestData, isTestDataEnabled } from './utils/seedTestData'
import { useSession } from './hooks/auth/useSession'
import { CommandPalette } from '@components/shared/CommandPalette'
import { commandRegistry } from './lib/commands/command-registry'
import { AbilityContext } from './lib/ability'
import { useAbilityStore } from './store/zustand/abilityStore'
import { useAbilities } from './store/queries/useAbilities'

/**
 * Loading screen component.
 * Displays while checking authentication status.
 */
function LoadingScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Spinner className="h-[60px] w-[60px]" />
      <p className="text-base font-semibold text-muted-foreground">
        Loading...
      </p>
    </div>
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
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const isLoading = useAuthStore(state => state.isLoading)
  const mode = useAuthStore(state => state.mode)
  const location = useLocation()

  if (isLoading) {
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

  // CASL ability management
  const ability = useAbilityStore(state => state.ability)
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  useAbilities(isAuthenticated)

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
    <AbilityContext.Provider value={ability}>
      <ErrorBoundary context={{ component: 'App' }}>
        {/*
          TourProvider is mounted exactly ONCE per deployment, but not
          here. Stock builds mount it in main.tsx around <App />; demo
          builds mount it in DemoShell so the demo's seed-on-launch
          hook can wrap the engine. Mounting it here too would nest
          providers and the inner reset would clobber the outer
          state — Start clicks would seed the workspace but the runner
          would never appear because the inner provider's `active`
          state stays null.
        */}
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          {DEMO_PUBLIC && (
            <Route path="/" element={<TourCataloguePage />} />
          )}

          {/* Protected routes. On demo.fovea.video the public catalogue
              above claims `/`, so the authenticated app moves under
              `/app/...`. Booth visitors who click Sign in still land
              on `/login`, then are redirected to `/app` after auth. */}
          <Route
            path={DEMO_PUBLIC ? '/app' : '/'}
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
            <Route
              path="groups"
              element={
                <ErrorBoundary context={{ route: 'GroupsPage' }}>
                  <GroupsPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="groups/:groupId"
              element={
                <ErrorBoundary context={{ route: 'GroupDetailPage' }}>
                  <GroupDetailPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="projects"
              element={
                <ErrorBoundary context={{ route: 'ProjectsPage' }}>
                  <ProjectsPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="projects/:projectId"
              element={
                <ErrorBoundary context={{ route: 'ProjectDetailPage' }}>
                  <ProjectDetailPage />
                </ErrorBoundary>
              }
            />
            <Route
              path="shared"
              element={
                <ErrorBoundary context={{ route: 'SharedAnnotationsPage' }}>
                  <SharedAnnotationsPage />
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
    </AbilityContext.Provider>
  )
}

export default App