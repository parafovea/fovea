import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
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

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#8c4e87',
      light: '#b87ab3',
      dark: '#633660',
    },
    secondary: {
      main: '#4e878c',
      light: '#7ab8b3',
      dark: '#366360',
    },
    error: {
      main: '#8c534e',
      light: '#b87a76',
      dark: '#633633',
    },
    warning: {
      main: '#8c7d4e',
      light: '#b8a87a',
      dark: '#635636',
    },
    background: {
      default: '#f8f9fa',
      paper: '#ffffff',
    },
    success: {
      main: '#4e8c53',
      light: '#7ab87e',
      dark: '#366338',
    },
    info: {
      main: '#4e678c',
      light: '#7a93b8',
      dark: '#364863',
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.87)',
      secondary: 'rgba(0, 0, 0, 0.70)',
      disabled: 'rgba(0, 0, 0, 0.50)',
    },
  },
})

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
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App />
          <ReactQueryDevtools initialIsOpen={false} />
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)