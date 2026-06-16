import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@test/setup.js'
import { useSession } from './useSession.js'
import { useAuthStore } from '@store/zustand/authStore.js'

describe('useSession', () => {
  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    isAdmin: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  }

  const mockConfig = {
    mode: 'multi-user' as const,
    allowRegistration: true,
    wikidata: {
      mode: 'online' as const,
      url: 'https://www.wikidata.org/w/api.php',
    },
    externalLinks: {
      wikidata: true,
      videoSources: true,
    },
  }

  beforeEach(() => {
    server.resetHandlers()
    vi.clearAllMocks()
    // Reset Zustand store before each test
    useAuthStore.getState().reset()
  })

  it('checks session on mount', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let fetchCalled = false

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json(mockConfig)
      }),
      http.get('/api/auth/me', () => {
        fetchCalled = true
        return HttpResponse.json({ user: mockUser })
      })
    )

    renderHook(() => useSession())

    await waitFor(() => {
      expect(fetchCalled).toBe(true)
    })

    consoleErrorSpy.mockRestore()
  })

  it('updates auth store on successful session restoration', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json(mockConfig)
      }),
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ user: mockUser })
      })
    )

    renderHook(() => useSession())

    await waitFor(() => {
      expect(useAuthStore.getState().currentUser).toEqual(mockUser)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    consoleErrorSpy.mockRestore()
  })

  it('updates auth store on failed session (401)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json(mockConfig)
      }),
      http.get('/api/auth/me', () => {
        return HttpResponse.json(
          { message: 'Unauthorized' },
          { status: 401 }
        )
      })
    )

    renderHook(() => useSession())

    await waitFor(() => {
      expect(useAuthStore.getState().currentUser).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    consoleErrorSpy.mockRestore()
  })

  it('updates auth store on failed session (404)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json(mockConfig)
      }),
      http.get('/api/auth/me', () => {
        return HttpResponse.json(
          { message: 'Not found' },
          { status: 404 }
        )
      })
    )

    renderHook(() => useSession())

    await waitFor(() => {
      expect(useAuthStore.getState().currentUser).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    consoleErrorSpy.mockRestore()
  })

  it('handles network errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json(mockConfig)
      }),
      http.get('/api/auth/me', () => {
        return HttpResponse.error()
      })
    )

    renderHook(() => useSession())

    await waitFor(() => {
      expect(useAuthStore.getState().currentUser).toBeNull()
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Session check error:',
      expect.any(Error)
    )

    consoleErrorSpy.mockRestore()
  })

  it('sets loading state correctly during session check', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json(mockConfig)
      }),
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ user: mockUser })
      })
    )

    // Check initial loading state
    expect(useAuthStore.getState().isLoading).toBe(true)

    renderHook(() => useSession())

    // Wait for the async operation to complete
    await waitFor(() => {
      expect(useAuthStore.getState().isLoading).toBe(false)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
    })

    consoleErrorSpy.mockRestore()
  })

  it('fetches and stores config', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    server.use(
      http.get('/api/config', () => {
        return HttpResponse.json(mockConfig)
      }),
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ user: mockUser })
      })
    )

    renderHook(() => useSession())

    await waitFor(() => {
      expect(useAuthStore.getState().appConfig).not.toBeNull()
      expect(useAuthStore.getState().mode).toBe('multi-user')
      expect(useAuthStore.getState().allowRegistration).toBe(true)
    })

    consoleErrorSpy.mockRestore()
  })

  it('retries /api/config after a transient 5xx so appConfig is eventually set', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let configAttempts = 0

    server.use(
      http.get('/api/config', () => {
        configAttempts++
        // Fail the first attempt with a 503, succeed on the retry. The first
        // backoff delay is 500ms, so the second attempt lands quickly.
        if (configAttempts === 1) {
          return new HttpResponse(null, { status: 503 })
        }
        return HttpResponse.json(mockConfig)
      }),
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ user: mockUser })
      })
    )

    renderHook(() => useSession())

    await waitFor(
      () => {
        expect(useAuthStore.getState().appConfig).not.toBeNull()
      },
      { timeout: 4000 }
    )

    // The first 503 did not leave appConfig stuck null; the retry recovered it.
    expect(configAttempts).toBeGreaterThanOrEqual(2)
    expect(useAuthStore.getState().mode).toBe('multi-user')

    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
  })
})
