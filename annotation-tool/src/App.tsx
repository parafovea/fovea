import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/ui/spinner'
import Layout from '@components/layout/Layout'
import VideoBrowser from '@components/video/VideoBrowser'
import { TourCataloguePage } from '@/pages/TourCataloguePage'
import { config } from '@/config'

/**
 * Public-demo builds show anonymous visitors a tour catalogue at the root.
 * Tours use the authenticated workspace under /app; signed-in users use the
 * workspace at either root route.
 *
 * Route components are imported eagerly (no React.lazy). A Suspense
 * fallback for the workspace, ontology, and admin chunks unmounts the
 * tour anchors the engine resolves a step against, so step 1 of every
 * annotation-workspace-bound tour would race a fresh chunk download
 * against the engine's bounded anchor wait and intermittently strand
 * visitors on the missing-anchor banner. Eager imports keep those
 * anchors mounted from first paint; the perf cost of the larger initial
 * download is the right trade-off for the demo's reliability.
 */
const DEMO_PUBLIC = config.deploymentMode.publicBooth
import AnnotationWorkspace from '@components/annotation/AnnotationWorkspace'
import OntologyWorkspace from './components/workspaces/OntologyWorkspace'
import ObjectWorkspace from './components/workspaces/ObjectWorkspace'
import { DocumentWorkspace } from './components/document'
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
  const appConfig = useAuthStore(state => state.appConfig)
  const location = useLocation()

  if (isLoading) {
    return <LoadingScreen />
  }

  // Public-demo visitors enter workspaces through the anonymous session
  // established during bootstrap. The backend still enforces API permissions.
  if (DEMO_PUBLIC) {
    return <>{children}</>
  }

  // Hold the loading screen until the server's deployment mode is actually
  // known. `appConfig === null` is the only authoritative "config not yet
  // fetched" signal — the default `mode: 'single-user'` is a placeholder, not
  // a real answer. Without this gate a transient /api/config 5xx under load
  // leaves appConfig null with mode at the single-user default, and a 401 from
  // /api/auth/me then clears isLoading, so a logged-out visitor briefly falls
  // through to the protected Layout before the next request lands them on
  // /login. useSession retries /api/config with backoff so this is a transient
  // hold, not a permanent one, on a healthy server.
  if (appConfig === null) {
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
  const currentUser = useAuthStore(state => state.currentUser)
  const showTourCatalogue = DEMO_PUBLIC &&
    !(currentUser?.username && !currentUser.username.startsWith('demo-anonymous-'))
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

  // Auto-select a persona on first paint when none is selected. In
  // demo deployments we prefer the legacy 'Automated' system persona
  // (a deliberately generic baseline) so the workspace-level effect
  // that switches the persona to match a video's seeded fixture
  // annotations has somewhere clean to override from. Without the
  // 'Automated' preference, persona[0] is whichever domain-shaped
  // demo persona happens to sort first (Port Safety or Ballpark),
  // and on a fresh tour entry the workspace briefly renders that
  // mis-matched persona before the per-video switch lands, painting
  // 'All Annotations (0)' even though the fixture rows for the
  // correct persona were already on the wire.
  useEffect(() => {
    if (personas.length === 0 || selectedPersonaId) return
    const isDemoPublic = config.deploymentMode.publicBooth
    const preferred = isDemoPublic
      ? personas.find((p) => p.name === 'Automated') ?? personas[0]
      : personas[0]
    setSelectedPersonaId(preferred.id)
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
          {/* Anonymous public-demo visitors use the catalogue at the root.
              Omit the workspace index in this state: index routes rank above
              a sibling path="/" route regardless of declaration order. */}
          {showTourCatalogue && (
            <Route path="/" element={<TourCataloguePage />} />
          )}

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {!showTourCatalogue && <Route index element={<VideoBrowser />} />}
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
              path="documents"
              element={
                <ErrorBoundary context={{ route: 'DocumentWorkspace' }}>
                  <DocumentWorkspace />
                </ErrorBoundary>
              }
            />
            <Route
              path="documents/:documentId"
              element={
                <ErrorBoundary context={{ route: 'DocumentWorkspace' }}>
                  <DocumentWorkspace />
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
          {/* /app/* alias of the top-level workspace tree. Tour scripts
              author every navigation URL as '/app/annotate/:videoId',
              '/app/ontology', '/app/objects', etc. so the engine
              navigate() calls land on routes that exist even when the
              top-level path was claimed by the tour catalogue (the old
              demo build's /app prefix). With the catalogue gated on
              anonymous-demo above, a logged-in user gets the workspace
              at `/`, but the tour engine's hard-coded /app URLs still
              need to resolve so a non-demo visitor running a tour does
              not 404. Re-mount Layout under /app pointing at the same
              children so both '/' and '/app' render the same screens. */}
          <Route
            path="/app"
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
              path="documents"
              element={
                <ErrorBoundary context={{ route: 'DocumentWorkspace' }}>
                  <DocumentWorkspace />
                </ErrorBoundary>
              }
            />
            <Route
              path="documents/:documentId"
              element={
                <ErrorBoundary context={{ route: 'DocumentWorkspace' }}>
                  <DocumentWorkspace />
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