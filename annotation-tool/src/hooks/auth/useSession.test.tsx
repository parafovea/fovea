import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'
import { useSession } from './useSession.js'
import userReducer from '../../store/userSlice.js'

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

  const createWrapper = () => {
    const store = configureStore({
      reducer: {
        user: userReducer,
      },
    })
    return ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )
  }

  beforeEach(() => {
    server.resetHandlers()
    vi.clearAllMocks()
  })

  it('checks session on mount', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let fetchCalled = false

    server.use(
      http.get('/api/auth/me', () => {
        fetchCalled = true
        return HttpResponse.json({ user: mockUser })
      })
    )

    renderHook(() => useSession(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(fetchCalled).toBe(true)
    })

    consoleErrorSpy.mockRestore()
  })

  it('dispatches loginSuccess on successful session restoration', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ user: mockUser })
      })
    )

    const store = configureStore({
      reducer: {
        user: userReducer,
      },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )

    renderHook(() => useSession(), { wrapper })

    await waitFor(() => {
      const state = store.getState()
      expect(state.user.currentUser).toEqual(mockUser)
      expect(state.user.isAuthenticated).toBe(true)
      expect(state.user.isLoading).toBe(false)
    })

    consoleErrorSpy.mockRestore()
  })

  it('dispatches logoutSuccess on failed session (401)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.json(
          { message: 'Unauthorized' },
          { status: 401 }
        )
      })
    )

    const store = configureStore({
      reducer: {
        user: userReducer,
      },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )

    renderHook(() => useSession(), { wrapper })

    await waitFor(() => {
      const state = store.getState()
      expect(state.user.currentUser).toBeNull()
      expect(state.user.isAuthenticated).toBe(false)
      expect(state.user.isLoading).toBe(false)
    })

    consoleErrorSpy.mockRestore()
  })

  it('dispatches logoutSuccess on failed session (404)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.json(
          { message: 'Not found' },
          { status: 404 }
        )
      })
    )

    const store = configureStore({
      reducer: {
        user: userReducer,
      },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )

    renderHook(() => useSession(), { wrapper })

    await waitFor(() => {
      const state = store.getState()
      expect(state.user.currentUser).toBeNull()
      expect(state.user.isAuthenticated).toBe(false)
      expect(state.user.isLoading).toBe(false)
    })

    consoleErrorSpy.mockRestore()
  })

  it('handles network errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    server.use(
      http.get('/api/auth/me', () => {
        return HttpResponse.error()
      })
    )

    const store = configureStore({
      reducer: {
        user: userReducer,
      },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )

    renderHook(() => useSession(), { wrapper })

    await waitFor(() => {
      const state = store.getState()
      expect(state.user.currentUser).toBeNull()
      expect(state.user.isAuthenticated).toBe(false)
      expect(state.user.isLoading).toBe(false)
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
      http.get('/api/auth/me', () => {
        return HttpResponse.json({ user: mockUser })
      })
    )

    const store = configureStore({
      reducer: {
        user: userReducer,
      },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )

    renderHook(() => useSession(), { wrapper })

    // Check that loading is set to true initially (this happens synchronously)
    const initialState = store.getState()
    expect(initialState.user.isLoading).toBe(true)

    // Wait for the async operation to complete
    await waitFor(() => {
      const state = store.getState()
      expect(state.user.isLoading).toBe(false)
      expect(state.user.isAuthenticated).toBe(true)
    })

    consoleErrorSpy.mockRestore()
  })
})
