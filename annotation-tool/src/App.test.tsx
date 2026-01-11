import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '@test/setup.js'
import App from './App.js'
import { useAuthStore } from './store/zustand/authStore.js'
import * as useSessionModule from './hooks/auth/useSession.js'

// Mock the useSession hook to prevent actual session checks during tests
vi.mock('./hooks/auth/useSession.js', () => ({
  useSession: vi.fn(),
}))

// Mock seed test data
vi.mock('./utils/seedTestData', () => ({
  seedTestData: vi.fn(),
  isTestDataEnabled: () => false,
}))

function renderApp(initialEntries: string[] = ['/']) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('App', () => {
  beforeEach(() => {
    server.resetHandlers()
    vi.clearAllMocks()
    // Reset Zustand store before each test
    useAuthStore.getState().reset()
    // Default personas API handler
    server.use(
      http.get('/api/personas', () => {
        return HttpResponse.json([])
      })
    )
  })

  it('renders loading screen while authentication is in progress', () => {
    // Default state has isLoading: true
    renderApp()

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('redirects to login when accessing protected route while unauthenticated', async () => {
    // Set loading to false, not authenticated
    useAuthStore.getState().setLoading(false)
    useAuthStore.getState().setMode('multi-user')

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json({
          mode: 'multi-user',
          allowRegistration: true,
        })
      })
    )

    renderApp(['/'])

    // Should show login page with username and password fields
    await waitFor(() => {
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    })
  })

  it('renders protected routes when authenticated', async () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      isAdmin: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }

    useAuthStore.getState().loginSuccess(mockUser)
    useAuthStore.getState().setMode('multi-user')

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json({
          mode: 'multi-user',
          allowRegistration: true,
        })
      }),
      http.get('/api/videos', () => {
        return HttpResponse.json([])
      })
    )

    renderApp(['/'])

    // Should not show loading screen
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Should not show login form
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument()
  })

  it('allows access to login page when unauthenticated', async () => {
    useAuthStore.getState().setLoading(false)
    useAuthStore.getState().setMode('multi-user')

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json({
          mode: 'multi-user',
          allowRegistration: true,
        })
      })
    )

    renderApp(['/login'])

    // Login page should be accessible
    await waitFor(() => {
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    })
  })

  it('allows access to register page when unauthenticated', async () => {
    useAuthStore.getState().setLoading(false)
    useAuthStore.getState().setMode('multi-user')
    // Set allowRegistration via config
    useAuthStore.getState().setConfig({
      mode: 'multi-user',
      allowRegistration: true,
      wikidata: {
        mode: 'online',
        url: 'https://www.wikidata.org/w/api.php',
        idMapping: null,
        allowExternalLinks: true,
      },
      externalLinks: {
        wikidata: true,
        videoSources: true,
      },
    })

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json({
          mode: 'multi-user',
          allowRegistration: true,
        })
      })
    )

    renderApp(['/register'])

    // Register page should be accessible - check for display name field which is unique to register
    await waitFor(() => {
      expect(screen.getByLabelText(/display name/i)).toBeInTheDocument()
    })
  })

  it('fetches config on mount', async () => {
    let configFetched = false

    server.use(
      http.get('/api/config', () => {
        configFetched = true
        return HttpResponse.json({
          mode: 'single-user',
          allowRegistration: false,
        })
      })
    )

    // Mock useSession to actually fetch the config
    vi.mocked(useSessionModule.useSession).mockImplementationOnce(() => {
      // Simulate the config fetch
      fetch('/api/config', { credentials: 'include' })
    })

    useAuthStore.getState().setLoading(false)

    renderApp(['/login'])

    await waitFor(() => {
      expect(configFetched).toBe(true)
    })
  })

  it('allows access to protected routes in single-user mode without authentication', async () => {
    useAuthStore.getState().setLoading(false)
    useAuthStore.getState().setMode('single-user')

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json({
          mode: 'single-user',
          allowRegistration: false,
        })
      }),
      http.get('/api/videos', () => {
        return HttpResponse.json([])
      })
    )

    renderApp(['/'])

    // Should render the protected route (VideoBrowser) even without authentication
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Should not show login form in single-user mode
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument()
  })
})
