import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import App from './App'
import { store } from './store/store'
import './index.css'

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#4e878c',
      dark: '#00241b',
      light: '#65b891',
    },
    secondary: {
      main: '#4e878c',
      light: '#65b891',
      dark: '#00241b',
    },
    error: {
      main: '#4e878c',
      light: '#65b891',
      dark: '#00241b',
    },
    warning: {
      main: '#65b891',
      light: '#93e5ab',
      dark: '#4e878c',
    },
    background: {
      default: '#f8f9fa',
      paper: '#ffffff',
    },
    success: {
      main: '#65b891',
      light: '#93e5ab',
      dark: '#4e878c',
    },
    info: {
      main: '#4e878c',
      light: '#65b891',
      dark: '#00241b',
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
      <Provider store={store}>
        <BrowserRouter>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <App />
            <ReactQueryDevtools initialIsOpen={false} />
          </ThemeProvider>
        </BrowserRouter>
      </Provider>
    </QueryClientProvider>
  </React.StrictMode>,
)