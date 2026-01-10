/**
 * Tests for useCurrentUser hook.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCurrentUser } from './useCurrentUser.js'
import { useAuthStore } from '../../store/zustand/authStore.js'

describe('useCurrentUser', () => {
  beforeEach(() => {
    // Reset Zustand store before each test
    useAuthStore.getState().reset()
  })

  it('returns null user when not authenticated', () => {
    const { result } = renderHook(() => useCurrentUser())

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isLoading).toBe(true) // Default isLoading is true
  })

  it('returns user data when authenticated', () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      isAdmin: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }

    // Set up store state before rendering hook
    useAuthStore.getState().loginSuccess(mockUser)

    const { result } = renderHook(() => useCurrentUser())

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
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }

    useAuthStore.getState().loginSuccess(mockAdminUser)

    const { result } = renderHook(() => useCurrentUser())

    expect(result.current.user).toEqual(mockAdminUser)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.isAdmin).toBe(true)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns isLoading true when loading', () => {
    // Default state has isLoading: true
    const { result } = renderHook(() => useCurrentUser())

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isLoading).toBe(true)
  })

  it('reactively updates when user state changes', () => {
    const { result } = renderHook(() => useCurrentUser())

    expect(result.current.isAuthenticated).toBe(false)

    // Login
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      isAdmin: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }

    act(() => {
      useAuthStore.getState().loginSuccess(mockUser)
    })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('handles user without email field', () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      isAdmin: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }

    useAuthStore.getState().loginSuccess(mockUser)

    const { result } = renderHook(() => useCurrentUser())

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it('updates when logout is called', () => {
    const mockUser = {
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      isAdmin: false,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }

    useAuthStore.getState().loginSuccess(mockUser)

    const { result } = renderHook(() => useCurrentUser())

    expect(result.current.isAuthenticated).toBe(true)

    act(() => {
      useAuthStore.getState().logoutSuccess()
    })

    expect(result.current.user).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.isAdmin).toBe(false)
  })
})
