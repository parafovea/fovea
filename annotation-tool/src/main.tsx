import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import App from './App'
import { DemoShell } from './demo/DemoShell'
import { isDemoModeEnabled } from './demo/config'
import { TourProvider } from './tours'
import { loadTourContentBundle } from './tours/content/loader'
import type { TourContentBundle } from './tours/content/types'
import './index.css'

// Initialize command registry before React renders (must be before component mount effects)
import { initializeCommands, initializeGlobalContext } from '@lib/commands/init-commands'

// Initialize telemetry before React renders
import { initTracing } from '@telemetry/tracing'
import { initErrorLogging } from '@services/errorLogging'

// Initialize tracing first - must be before any other code that might make network requests
initTracing({
  enabled: import.meta.env.PROD,
  sampleRate: import.meta.env.PROD ? 0.2 : 1.0, // 20% in prod, 100% in dev
})

// Initialize error logging with backend reporting
initErrorLogging({
  enabled: import.meta.env.PROD,
  sampleRate: import.meta.env.PROD ? 0.2 : 1.0, // 20% in prod, 100% in dev
  consoleLogging: import.meta.env.DEV,
})

// Initialize commands synchronously so they're available when component effects run
initializeCommands()
initializeGlobalContext()

/**
 * Start the MSW tour-demo worker BEFORE React mounts so the first
 * model-service-bound request fired by any tour intro screen is
 * already intercepted. Production builds without VITE_TOUR_DEMO=1
 * tree-shake the entire `src/mocks/tourDemo` subtree out of the
 * bundle because the dynamic import below sits behind a statically-
 * analysable env-var guard.
 */
async function maybeStartTourDemoMocking(): Promise<void> {
  if (import.meta.env.VITE_TOUR_DEMO !== '1') return
  const { startTourDemoWorker } = await import('./mocks/tourDemo/browser')
  await startTourDemoWorker()
}

/**
 * TanStack Query client configuration.
 * Manages caching, refetching, and background updates for API requests.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

// Boot-time fetch of the deployment's tour content bundle from
// /tour-content.json (the admin's editable config). NO silent
// fallback: if the file is missing or malformed, render a visible
// banner and mount the app WITHOUT TourProvider so the admin can fix
// the JSON without an opaque "tours just don't work" failure mode.
function Root() {
  type LoadState =
    | { kind: 'loading' }
    | { kind: 'ready'; bundle: TourContentBundle }
    | { kind: 'error'; message: string }
  const [state, setState] = React.useState<LoadState>({ kind: 'loading' })
  React.useEffect(() => {
    loadTourContentBundle()
      .then((bundle) => setState({ kind: 'ready', bundle }))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[tours] content bundle load failed:', message)
        setState({ kind: 'error', message })
      })
  }, [])

  if (isDemoModeEnabled()) return <DemoShell />

  if (state.kind === 'error') {
    return (
      <>
        <div
          role="alert"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            background: '#b91c1c',
            color: 'white',
            padding: '12px 16px',
            zIndex: 9999,
            fontSize: 13,
          }}
        >
          <strong>Tours disabled: content config error.</strong>{' '}
          {state.message} See <code>docs/tour-customization.md</code>.
        </div>
        <App />
      </>
    )
  }
  if (state.kind === 'loading') {
    return <App />
  }
  return (
    <TourProvider contentBundle={state.bundle}>
      <App />
    </TourProvider>
  )
}

await maybeStartTourDemoMocking()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            {/*
              Demo deployments render <DemoShell />, which provides its
              own TourProvider with the seed-on-launch hook wrapped
              around App. Stock builds mount TourProvider here so the
              tour engine is available to <App /> directly (anchored
              mode against the user's real workspace). Either way the
              TourProvider is mounted EXACTLY ONCE. Nesting it would
              shadow the outer state and the runner would never paint.

              The tour content bundle comes from /tour-content.json
              (admin-editable JSON, loaded at boot via Root above).
              Edit that file to retheme the tour catalogue for your
              own domain. See docs/tour-customization.md.
            */}
            <Root />
            <Toaster position="bottom-right" />
          </TooltipProvider>
          {/*
            The TanStack Query devtools toggle button is fixed to the
            bottom-right corner with a large invisible hit area; the
            annotation-workspace and ontology-workspace FABs sit at the
            same corner and the devtools intercept their clicks. Skip in
            test/E2E (NODE_ENV=test or VITE_E2E=1) so Playwright can hit
            the FABs.
          */}
          {import.meta.env.MODE !== 'test' && !import.meta.env.VITE_E2E && (
            <ReactQueryDevtools initialIsOpen={false} />
          )}
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
