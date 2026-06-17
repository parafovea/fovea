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

/**
 * Build a full AppConfig for tests that render protected routes. ProtectedRoute
 * now holds the loading screen until appConfig is non-null, so a test that wants
 * to reach the protected Layout or the login redirect must seed config, not just
 * the legacy top-level mode.
 */
function appConfig(overrides: Partial<{ mode: 'single-user' | 'multi-user'; allowRegistration: boolean }> = {}) {
  return {
    mode: 'multi-user' as 'single-user' | 'multi-user',
    allowRegistration: true,
    wikidata: {
      mode: 'online' as const,
      url: 'https://www.wikidata.org/w/api.php',
      idMapping: null,
      allowExternalLinks: true,
    },
    externalLinks: {
      wikidata: true,
      videoSources: true,
    },
    ...overrides,
  }
}

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
  })

  it('redirects to login when accessing protected route while unauthenticated', async () => {
    // Set loading to false, not authenticated; seed config so the appConfig
    // gate does not hold the loading screen.
    useAuthStore.getState().setLoading(false)
    useAuthStore.getState().setConfig(appConfig({ mode: 'multi-user' }))

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
    useAuthStore.getState().setConfig(appConfig({ mode: 'multi-user' }))

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
    useAuthStore.getState().setConfig(appConfig({ mode: 'single-user', allowRegistration: false }))

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

  it('holds the loading screen on a protected route when appConfig is null even after loading clears', async () => {
    // The auth-race repro: under load /api/config 5xx leaves appConfig null
    // while mode sits at the 'single-user' default, then /api/auth/me 401
    // clears isLoading. Before the fix, ProtectedRoute fell through to the
    // protected Layout because mode !== 'multi-user'. With the gate, a null
    // appConfig must keep the loading screen up and never render protected
    // content or the login form. useSession is mocked here, so appConfig stays
    // null exactly as it would mid-outage.
    useAuthStore.getState().setLoading(false)
    // appConfig is null after reset(); mode is the 'single-user' default.
    expect(useAuthStore.getState().appConfig).toBeNull()

    server.use(
      http.get('/api/videos', () => {
        return HttpResponse.json([])
      })
    )

    renderApp(['/'])

    // Loading screen is held; no protected content, no login form.
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument()
  })
})
