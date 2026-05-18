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
    // Clear persisted state so a prior test's localStorage write does
    // not bleed into the next test's hydration cycle (the auth store
    // uses zustand/persist, which writes `currentUser` and
    // `isAuthenticated` to localStorage on every loginSuccess).
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
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
    // ProtectedRoute now also holds on `appConfig === null` (the #92 fix), so
    // seed appConfig synchronously to bypass the loading-screen gate during
    // this test — without this the route stays on the loading screen and
    // never reaches the multi-user redirect branch.
    useAuthStore.getState().setConfig({
      mode: 'multi-user',
      allowRegistration: true,
      wikidata: {
        mode: 'online',
        url: 'https://www.wikidata.org/w/api.php',
        idMapping: null,
        allowExternalLinks: true,
      },
      externalLinks: { wikidata: true, videoSources: true },
    })

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
    // After the #92 fix, ProtectedRoute also holds on `appConfig === null`,
    // so seed the appConfig synchronously to bypass the loading-screen
    // gate during this test (the OTHER tests in this file already do
    // this; only the original "renders protected routes when authenticated"
    // test was relying on the dual-React bug to short-circuit the render
    // before any of these state assumptions mattered).
    useAuthStore.getState().setConfig({
      mode: 'multi-user',
      allowRegistration: true,
      wikidata: {
        mode: 'online',
        url: 'https://www.wikidata.org/w/api.php',
        idMapping: null,
        allowExternalLinks: true,
      },
      externalLinks: { wikidata: true, videoSources: true },
    })

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json({
          mode: 'multi-user',
          allowRegistration: true,
        })
      }),
      // /api/auth/me must return the same user so that useSession's
      // session-restoration check keeps isAuthenticated=true; without
      // this handler MSW falls back to its default which surfaces a
      // 404 / 401 and useSession's `logoutSuccess()` then flips the
      // auth state back to unauthenticated, causing the protected
      // route to redirect to /login (which is what masks this test's
      // real intent — it is *meant* to verify the post-login render).
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ user: mockUser })
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

  it('holds the loading screen when appConfig is null even after isLoading clears (regression for #92)', async () => {
    // Reproduce the issue #92 scenario as a state-machine assertion:
    // the auth store ends up with isLoading=false (session check done)
    // but appConfig=null (config endpoint failed transiently). Before
    // the fix, the ProtectedRoute checked only isLoading + the default
    // mode='single-user', so it rendered protected content for an
    // unauthenticated visitor. After the fix, `appConfig === null` is
    // an additional gate that holds the loading screen.
    useAuthStore.getState().reset()
    useAuthStore.getState().setLoading(false)
    // Intentionally do NOT call setConfig — leave appConfig=null to
    // simulate the failed-config branch.

    // /api/config returns 500 so useSession does NOT successfully
    // hydrate appConfig, mirroring the transient-failure path.
    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json({ error: 'server-error' }, { status: 500 })
      }),
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ error: 'not-authenticated' }, { status: 401 })
      }),
    )

    renderApp(['/'])

    // The user must see the loading screen — NOT the VideoBrowser or
    // any other protected content — while appConfig is still null.
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    // Specifically, no login form (we don't know we're multi-user yet)
    // and no VideoBrowser shell either.
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument()
  })

  it('allows access to protected routes in single-user mode without authentication', async () => {
    // The ProtectedRoute now also holds on `appConfig === null` (the
    // closure of #92), so a single-user-mode test must satisfy that
    // precondition by writing a non-null appConfig as well as the
    // legacy mode + isLoading state, otherwise the route stays on the
    // loading screen until useSession's /api/config call lands.
    useAuthStore.getState().setLoading(false)
    useAuthStore.getState().setConfig({
      mode: 'single-user',
      allowRegistration: false,
      wikidata: {
        mode: 'online',
        url: 'https://www.wikidata.org/w/api.php',
        idMapping: null,
        allowExternalLinks: true,
      },
      externalLinks: { wikidata: true, videoSources: true },
    })

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json({
          mode: 'single-user',
          allowRegistration: false,
        })
      }),
      http.get('/api/auth/me', () => {
        // Single-user mode: useSession still pings /api/auth/me, return
        // 401 so logoutSuccess fires (consistent with the test contract
        // — there's no authenticated user in single-user mode).
        return HttpResponse.json({ error: 'not-authenticated' }, { status: 401 })
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
