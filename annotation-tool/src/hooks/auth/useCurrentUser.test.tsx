/**
 * Tests for useCurrentUser hook.
 */

import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { useCurrentUser } from './useCurrentUser.js'
import userReducer from '../../store/userSlice.js'

describe('useCurrentUser', () => {
  it('returns null user when not authenticated', () => {
    const store = configureStore({
      reducer: {
        user: userReducer,
      },
      preloadedState: {
        user: {
          currentUser: null,
          isAuthenticated: false,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns user data when authenticated', () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      isAdmin: false,
    }

    const store = configureStore({
      reducer: {
        user: userReducer,
      },
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns isAdmin true for admin users', () => {
    const mockAdminUser = {
      id: 'admin-1',
      username: 'admin',
      displayName: 'Admin User',
      email: 'admin@example.com',
      isAdmin: true,
    }

    const store = configureStore({
      reducer: {
        user: userReducer,
      },
      preloadedState: {
        user: {
          currentUser: mockAdminUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    expect(result.current.user).toEqual(mockAdminUser)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns isLoading true when loading', () => {
    const store = configureStore({
      reducer: {
        user: userReducer,
      },
      preloadedState: {
        user: {
          currentUser: null,
          isAuthenticated: false,
          isLoading: true,
          mode: 'multi-user',
        },
      },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isLoading).toBe(true)
  })

  it('reactively updates when user state changes', () => {
    const store = configureStore({
      reducer: {
        user: userReducer,
      },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )

    const { result, rerender } = renderHook(() => useCurrentUser(), { wrapper })

    expect(result.current.isAuthenticated).toBe(false)

    // Dispatch login action
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      isAdmin: false,
    }
    store.dispatch({ type: 'user/loginSuccess', payload: mockUser })

    rerender()

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('handles user without email field', () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      isAdmin: false,
    }

    const store = configureStore({
      reducer: {
        user: userReducer,
      },
      preloadedState: {
        user: {
          currentUser: mockUser,
          isAuthenticated: true,
          isLoading: false,
          mode: 'multi-user',
        },
      },
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    )

    const { result } = renderHook(() => useCurrentUser(), { wrapper })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
  })
})
