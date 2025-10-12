import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../test/setup.js'
import { renderWithProviders } from '../test/utils/test-utils.js'
import App from './App.js'

// Mock the useSession hook to prevent actual session checks during tests
vi.mock('./hooks/auth/useSession.js', () => ({
  useSession: vi.fn(),
}))

// Mock API module
vi.mock('./services/api', () => ({
  api: {
    getOntology: vi.fn().mockResolvedValue({
      personas: [],
      personaOntologies: [],
      world: {},
    }),
  },
}))

// Mock seed test data
vi.mock('./utils/seedTestData', () => ({
  seedTestData: vi.fn(),
  isTestDataEnabled: () => false,
}))

describe('App', () => {
  beforeEach(() => {
    server.resetHandlers()
    vi.clearAllMocks()
  })

  it('renders loading screen while authentication is in progress', () => {
    renderWithProviders(<App />, {
      withRouter: true,
      preloadedState: {
        user: {
          currentUser: null,
          isAuthenticated: false,
          isLoading: true,
          mode: 'multi-user',
          allowRegistration: true,
        },
      },
    })

    expect(screen.getByText('Loading...')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('redirects to login when accessing protected route while unauthenticated', async () => {
    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json({
          mode: 'multi-user',
          allowRegistration: true,
        })
      })
    )

    renderWithProviders(<App />, {
      withRouter: true,
      initialEntries: ['/'],
      preloadedState: {
        user: {
          currentUser: null,
          isAuthenticated: false,
          isLoading: false,
          mode: 'multi-user',
          allowRegistration: true,
        },
      },
    })

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

    renderWithProviders(<App />, {
      withRouter: true,
      initialEntries: ['/'],
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
          allowRegistration: true,
        },
      },
    })

    // Should not show loading screen
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Should not show login form
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument()
  })

  it('allows access to login page when unauthenticated', async () => {
    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json({
          mode: 'multi-user',
          allowRegistration: true,
        })
      })
    )

    renderWithProviders(<App />, {
      withRouter: true,
      initialEntries: ['/login'],
      preloadedState: {
        user: {
          currentUser: null,
          isAuthenticated: false,
          isLoading: false,
          mode: 'multi-user',
          allowRegistration: true,
        },
      },
    })

    // Login page should be accessible
    await waitFor(() => {
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    })
  })

  it('allows access to register page when unauthenticated', async () => {
    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json({
          mode: 'multi-user',
          allowRegistration: true,
        })
      })
    )

    renderWithProviders(<App />, {
      withRouter: true,
      initialEntries: ['/register'],
      preloadedState: {
        user: {
          currentUser: null,
          isAuthenticated: false,
          isLoading: false,
          mode: 'multi-user',
          allowRegistration: true,
        },
      },
    })

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

    renderWithProviders(<App />, {
      withRouter: true,
      initialEntries: ['/login'],
      preloadedState: {
        user: {
          currentUser: null,
          isAuthenticated: false,
          isLoading: false,
          mode: 'multi-user',
          allowRegistration: true,
        },
      },
    })

    await waitFor(() => {
      expect(configFetched).toBe(true)
    })
  })

  it('allows access to protected routes in single-user mode without authentication', async () => {
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

    renderWithProviders(<App />, {
      withRouter: true,
      initialEntries: ['/'],
      preloadedState: {
        user: {
          currentUser: null,
          isAuthenticated: false,
          isLoading: false,
          mode: 'single-user',
          allowRegistration: false,
        },
      },
    })

    // Should render the protected route (VideoBrowser) even without authentication
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })

    // Should not show login form in single-user mode
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument()
  })
})
