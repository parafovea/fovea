/**
 * Tests for Authentication Store
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore, AppConfig } from './authStore'
import { User } from '../../models/types'

describe('AuthStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useAuthStore.getState().reset()
  })

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState()
      expect(state.currentUser).toBe(null)
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(true)
      expect(state.mode).toBe('single-user')
      expect(state.allowRegistration).toBe(false)
      expect(state.appConfig).toBe(null)
    })
  })

  describe('Login Actions', () => {
    const mockUser: User = {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      isAdmin: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }

    it('should set user on loginSuccess', () => {
      const { loginSuccess } = useAuthStore.getState()

      loginSuccess(mockUser)

      const state = useAuthStore.getState()
      expect(state.currentUser).toEqual(mockUser)
      expect(state.isAuthenticated).toBe(true)
      expect(state.isLoading).toBe(false)
    })

    it('should clear user on logoutSuccess', () => {
      const { loginSuccess, logoutSuccess } = useAuthStore.getState()

      // First login
      loginSuccess(mockUser)
      expect(useAuthStore.getState().isAuthenticated).toBe(true)

      // Then logout
      logoutSuccess()

      const state = useAuthStore.getState()
      expect(state.currentUser).toBe(null)
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(false)
    })

    it('should update user data', () => {
      const { loginSuccess, updateUser } = useAuthStore.getState()

      loginSuccess(mockUser)

      const updatedUser = {
        ...mockUser,
        displayName: 'Updated Name',
        email: 'updated@example.com',
      }
      updateUser(updatedUser)

      const state = useAuthStore.getState()
      expect(state.currentUser?.displayName).toBe('Updated Name')
      expect(state.currentUser?.email).toBe('updated@example.com')
    })
  })

  describe('Config Actions', () => {
    it('should set mode', () => {
      const { setMode } = useAuthStore.getState()

      setMode('multi-user')
      expect(useAuthStore.getState().mode).toBe('multi-user')

      setMode('single-user')
      expect(useAuthStore.getState().mode).toBe('single-user')
    })

    it('should set full config', () => {
      const { setConfig } = useAuthStore.getState()

      const config: AppConfig = {
        mode: 'multi-user',
        allowRegistration: true,
        wikidata: {
          mode: 'offline',
          url: 'http://localhost:8181/api',
          idMapping: { Q123: 'Q1' },
          allowExternalLinks: false,
        },
        externalLinks: {
          wikidata: false,
          videoSources: true,
        },
      }

      setConfig(config)

      const state = useAuthStore.getState()
      expect(state.appConfig).toEqual(config)
      // Check backward compatibility fields
      expect(state.mode).toBe('multi-user')
      expect(state.allowRegistration).toBe(true)
    })

    it('should update backward compatibility fields when setting config', () => {
      const { setConfig, setMode } = useAuthStore.getState()

      // Start with single-user mode
      setMode('single-user')
      expect(useAuthStore.getState().mode).toBe('single-user')

      // Set config with multi-user
      setConfig({
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

      // Mode should be updated from config
      expect(useAuthStore.getState().mode).toBe('multi-user')
      expect(useAuthStore.getState().allowRegistration).toBe(true)
    })
  })

  describe('Loading State', () => {
    it('should set loading state', () => {
      const { setLoading } = useAuthStore.getState()

      setLoading(false)
      expect(useAuthStore.getState().isLoading).toBe(false)

      setLoading(true)
      expect(useAuthStore.getState().isLoading).toBe(true)
    })

    it('should be false after login', () => {
      const { loginSuccess } = useAuthStore.getState()

      // Initial state has isLoading: true
      expect(useAuthStore.getState().isLoading).toBe(true)

      loginSuccess({
        id: 'user-1',
        username: 'test',
        displayName: 'Test',
        isAdmin: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      })

      expect(useAuthStore.getState().isLoading).toBe(false)
    })

    it('should be false after logout', () => {
      const { logoutSuccess, setLoading } = useAuthStore.getState()

      setLoading(true)
      expect(useAuthStore.getState().isLoading).toBe(true)

      logoutSuccess()
      expect(useAuthStore.getState().isLoading).toBe(false)
    })
  })

  describe('Reset', () => {
    it('should reset all state to initial values', () => {
      const store = useAuthStore.getState()

      // Modify state
      store.loginSuccess({
        id: 'user-1',
        username: 'test',
        displayName: 'Test',
        isAdmin: true,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      })
      store.setMode('multi-user')
      store.setConfig({
        mode: 'multi-user',
        allowRegistration: true,
        wikidata: {
          mode: 'offline',
          url: 'http://localhost',
          idMapping: null,
          allowExternalLinks: false,
        },
        externalLinks: {
          wikidata: false,
          videoSources: false,
        },
      })

      // Verify state was modified
      expect(useAuthStore.getState().isAuthenticated).toBe(true)
      expect(useAuthStore.getState().mode).toBe('multi-user')

      // Reset
      store.reset()

      // Verify reset to initial state
      const state = useAuthStore.getState()
      expect(state.currentUser).toBe(null)
      expect(state.isAuthenticated).toBe(false)
      expect(state.isLoading).toBe(true)
      expect(state.mode).toBe('single-user')
      expect(state.allowRegistration).toBe(false)
      expect(state.appConfig).toBe(null)
    })
  })

  describe('Store Integration', () => {
    it('should update state immediately', () => {
      const { loginSuccess, logoutSuccess } = useAuthStore.getState()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)

      loginSuccess({
        id: 'user-1',
        username: 'test',
        displayName: 'Test',
        isAdmin: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      })

      expect(useAuthStore.getState().isAuthenticated).toBe(true)

      logoutSuccess()

      expect(useAuthStore.getState().isAuthenticated).toBe(false)
    })

    it('should maintain consistent state across multiple consumers', () => {
      const { loginSuccess } = useAuthStore.getState()

      const user = {
        id: 'user-1',
        username: 'test',
        displayName: 'Test',
        isAdmin: false,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      }

      loginSuccess(user)

      // Multiple calls to getState should return same values
      const state1 = useAuthStore.getState()
      const state2 = useAuthStore.getState()

      expect(state1.currentUser).toEqual(state2.currentUser)
      expect(state1.isAuthenticated).toBe(state2.isAuthenticated)
    })
  })
})
