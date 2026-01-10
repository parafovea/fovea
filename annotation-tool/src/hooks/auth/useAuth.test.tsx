/**
 * Tests for useAuth hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/setup.js'
import { useAuth } from './useAuth.js'
import { useAuthStore } from '../../store/zustand/authStore.js'

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset Zustand store before each test
    useAuthStore.getState().reset()
  })

  describe('login', () => {
    it('logs in with valid credentials', async () => {
      const mockUser = {
        id: 'user-1',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        isAdmin: false,
      }

      server.use(
        http.post('/api/auth/login', async ({ request }) => {
          const body = await request.json()
          expect(body).toEqual({
            username: 'testuser',
            password: 'password123',
            rememberMe: false,
          })
          return HttpResponse.json({ user: mockUser })
        })
      )

      const { result } = renderHook(() => useAuth())

      const user = await result.current.login('testuser', 'password123', false)

      expect(user).toEqual(mockUser)
    })

    it('logs in with rememberMe option', async () => {
      const mockUser = {
        id: 'user-1',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        isAdmin: false,
      }

      server.use(
        http.post('/api/auth/login', async ({ request }) => {
          const body = await request.json()
          expect(body).toEqual({
            username: 'testuser',
            password: 'password123',
            rememberMe: true,
          })
          return HttpResponse.json({ user: mockUser })
        })
      )

      const { result } = renderHook(() => useAuth())

      const user = await result.current.login('testuser', 'password123', true)

      expect(user).toEqual(mockUser)
    })

    it('throws error on invalid credentials', async () => {
      server.use(
        http.post('/api/auth/login', () => {
          return HttpResponse.json(
            { error: 'Invalid username or password' },
            { status: 401 }
          )
        })
      )

      const { result } = renderHook(() => useAuth())

      await expect(
        result.current.login('testuser', 'wrongpassword', false)
      ).rejects.toThrow('Invalid username or password')
    })

    it('throws error on network failure', async () => {
      server.use(
        http.post('/api/auth/login', () => {
          return HttpResponse.error()
        })
      )

      const { result } = renderHook(() => useAuth())

      await expect(
        result.current.login('testuser', 'password123', false)
      ).rejects.toThrow()
    })

    it('updates auth store on successful login', async () => {
      const mockUser = {
        id: 'user-1',
        username: 'testuser',
        displayName: 'Test User',
        email: 'test@example.com',
        isAdmin: false,
      }

      server.use(
        http.post('/api/auth/login', () => {
          return HttpResponse.json({ user: mockUser })
        })
      )

      const { result } = renderHook(() => useAuth())

      // Verify initial state
      expect(useAuthStore.getState().isAuthenticated).toBe(false)
      expect(useAuthStore.getState().currentUser).toBe(null)

      await result.current.login('testuser', 'password123', false)

      // Verify state was updated
      await waitFor(() => {
        expect(useAuthStore.getState().isAuthenticated).toBe(true)
        expect(useAuthStore.getState().currentUser).toEqual(mockUser)
      })
    })
  })

  describe('logout', () => {
    it('logs out successfully', async () => {
      server.use(
        http.post('/api/auth/logout', () => {
          return HttpResponse.json({ success: true })
        })
      )

      const { result } = renderHook(() => useAuth())

      await expect(result.current.logout()).resolves.not.toThrow()
    })

    it('handles logout errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      server.use(
        http.post('/api/auth/logout', () => {
          return HttpResponse.error()
        })
      )

      const { result } = renderHook(() => useAuth())

      // Should not throw even if request fails
      await expect(result.current.logout()).resolves.not.toThrow()

      expect(consoleErrorSpy).toHaveBeenCalled()
      consoleErrorSpy.mockRestore()
    })

    it('updates auth store on logout', async () => {
      // First set up authenticated state
      useAuthStore.getState().loginSuccess({
        id: 'user-1',
        username: 'testuser',
        displayName: 'Test User',
        isAdmin: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      })

      server.use(
        http.post('/api/auth/logout', () => {
          return HttpResponse.json({ success: true })
        })
      )

      const { result } = renderHook(() => useAuth())

      // Verify initially authenticated
      expect(useAuthStore.getState().isAuthenticated).toBe(true)

      await result.current.logout()

      // Verify state was updated
      await waitFor(() => {
        expect(useAuthStore.getState().isAuthenticated).toBe(false)
        expect(useAuthStore.getState().currentUser).toBe(null)
      })
    })
  })

  describe('register', () => {
    it('registers with valid data', async () => {
      const mockUser = {
        id: 'user-2',
        username: 'newuser',
        displayName: 'New User',
        email: 'new@example.com',
        isAdmin: false,
      }

      server.use(
        http.post('/api/auth/register', async ({ request }) => {
          const body = await request.json()
          expect(body).toEqual({
            username: 'newuser',
            displayName: 'New User',
            email: 'new@example.com',
            password: 'password123',
          })
          return HttpResponse.json({ user: mockUser })
        })
      )

      const { result } = renderHook(() => useAuth())

      const user = await result.current.register({
        username: 'newuser',
        displayName: 'New User',
        email: 'new@example.com',
        password: 'password123',
      })

      expect(user).toEqual(mockUser)
    })

    it('throws error on registration failure', async () => {
      server.use(
        http.post('/api/auth/register', () => {
          return HttpResponse.json(
            { error: 'Username already exists' },
            { status: 409 }
          )
        })
      )

      const { result } = renderHook(() => useAuth())

      await expect(
        result.current.register({
          username: 'existinguser',
          displayName: 'Existing User',
          password: 'password123',
        })
      ).rejects.toThrow('Username already exists')
    })

    it('updates auth store on successful registration', async () => {
      const mockUser = {
        id: 'user-2',
        username: 'newuser',
        displayName: 'New User',
        email: 'new@example.com',
        isAdmin: false,
      }

      server.use(
        http.post('/api/auth/register', () => {
          return HttpResponse.json({ user: mockUser })
        })
      )

      const { result } = renderHook(() => useAuth())

      // Verify initial state
      expect(useAuthStore.getState().isAuthenticated).toBe(false)

      await result.current.register({
        username: 'newuser',
        displayName: 'New User',
        email: 'new@example.com',
        password: 'password123',
      })

      // Verify state was updated
      await waitFor(() => {
        expect(useAuthStore.getState().isAuthenticated).toBe(true)
        expect(useAuthStore.getState().currentUser).toEqual(mockUser)
      })
    })
  })
})
