import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/ui/spinner'
import Layout from '@components/layout/Layout'
import VideoBrowser from '@components/video/VideoBrowser'
import { TourCataloguePage } from '@/pages/TourCataloguePage'
import { config } from '@/config'

/**
 * On demo.fovea.video the SPA is built with VITE_DEMO_PUBLIC=1. The
 * QR-code visitor lands on a public tour catalogue (no auth, no
 * server round-trips, fully MSW-mocked via VITE_TOUR_DEMO=1) and only
 * crosses into the authenticated app via the explicit "Sign in" link.
 *
 * Route components are imported eagerly (no React.lazy). An earlier
 * lazy-load split shrank the catalogue's first paint, but the
 * Suspense fallback for the workspace + ontology + admin chunks
 * also unmounted the data-tour-id anchors the tour engine polls
 * for, which made step 1 of every annotation-workspace-bound tour
 * race a fresh chunk download against the engine's waitForAnchor
 * window and intermittently strand visitors on the missing-anchor
 * banner. Eager imports keep the data-tour-ids in the DOM from
 * first paint; the perf cost of the larger initial download is
 * the right trade-off for the demo's reliability.
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

  // VITE_DEMO_PUBLIC builds (demo.fovea.video) are public-by-design: the
  // catalogue lives at `/`, and clicking any tour navigates the visitor
  // to `/app/*` so the runner's anchors — sidebar, workspaces, video
  // browser — resolve inside the real Layout. The visitor is never
  // logged in, so a real auth check here would bounce every tour to
  // /login the moment the catalogue dispatches the navigation, and the
  // user would see the orange "Couldn't find this UI element" banner
  // (the engine briefly rendered against /login before the redirect
  // landed). Demo builds ship the MSW tour-demo worker (VITE_TOUR_DEMO=1)
  // which stubs every model-service round-trip the tours actually
  // exercise; data-shaped endpoints that the Layout idly hits without
  // visible UI consequence (auth/me, personas, videos) simply 401 and
  // the corresponding panes render their empty states — which is the
  // expected booth experience.
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
          {/* Tour catalogue mounts at `/` ONLY for the public-demo
              build AND ONLY while the visitor is an anonymous demo
              session (username starts with 'demo-anonymous-'). A real
              authenticated user — admin or otherwise, on demo OR on a
              self-hosted Fovea — falls through to the protected routes
              below where `/` renders the VideoBrowser exactly as on
              stock builds. Without this gate the same Layout sidebar
              link that opens the Video Browser on a self-hosted
              instance bounces a logged-in user on demo.fovea.video
              back to the tour catalogue, which is what the user
              reported: 'When I log in (even as admin) ... If I try to
              click any other workspace in the left panel, I am taken
              to a blank screen.' DEMO_PUBLIC is a build-time flag, so
              self-hosted production deployments (which do NOT set
              VITE_DEMO_PUBLIC=1) never reach this branch and behave
              exactly as before. */}
          {/* Show the catalogue at `/` UNLESS the visitor is a real
              authenticated non-anonymous user. The previous pair of
              conditions ('demo-anonymous- prefix' OR '!isAuthenticated')
              both failed during the race window after main.tsx
              bootstraps an anonymous-session: useSession() flips
              isAuthenticated=true the moment /api/auth/me resolves but
              currentUser stays null for another tick, so neither
              branch matched and the protected route mounted with the
              VideoBrowser instead of the catalogue. Replace with the
              inverse check — only HIDE the catalogue when the visitor
              is definitively a real signed-in non-anon user — so
              loading state, unauthenticated, AND anonymous-demo all
              land on the catalogue. */}
          {DEMO_PUBLIC && !(currentUser?.username && !currentUser.username.startsWith('demo-anonymous-')) && (
            <Route path="/" element={<TourCataloguePage />} />
          )}

          {/* Protected routes mount at the top level on every build.
              The tour catalogue route above (when active) is matched
              FIRST by React Router because it appears earlier in the
              <Routes> list, so an anonymous demo visitor sees the
              catalogue and a real signed-in user sees the workspace —
              no /app prefix, no per-build path divergence, no broken
              sidebar links. */}
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