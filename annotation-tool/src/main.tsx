import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import App from './App'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            <App />
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
