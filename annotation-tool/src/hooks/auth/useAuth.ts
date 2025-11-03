import { useDispatch } from 'react-redux'
import { loginSuccess, logoutSuccess } from '../../store/userSlice.js'
import { User } from '../../models/types.js'
import { AppDispatch } from '../../store/store.js'

/**
 * Registration data for new user accounts.
 */
export interface RegisterData {
  username: string
  email?: string
  password: string
  displayName: string
}

/**
 * Authentication actions hook.
 * Provides login, logout, and registration functions with session management.
 *
 * @returns Object with login, logout, and register functions
 */
export function useAuth() {
  const dispatch = useDispatch<AppDispatch>()

  /**
   * Authenticates user with username and password.
   *
   * @param username - User's username
   * @param password - User's password
   * @param rememberMe - Extends session from 7 to 30 days if true
   * @returns Authenticated user data
   * @throws Error if authentication fails
   */
  const login = async (username: string, password: string, rememberMe?: boolean): Promise<User> => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password, rememberMe }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Login failed' }))
      throw new Error(error.error || 'Login failed')
    }

    const { user } = await response.json()
    dispatch(loginSuccess(user))
    return user
  }

  /**
   * Logs out current user and destroys session.
   */
  const logout = async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      dispatch(logoutSuccess())
    }
  }

  /**
   * Registers new user account.
   *
   * @param data - Registration data with username, email, password, and displayName
   * @returns Newly created user data
   * @throws Error if registration fails
   */
  const register = async (data: RegisterData): Promise<User> => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Registration failed' }))
      throw new Error(error.error || 'Registration failed')
    }

    const { user } = await response.json()
    dispatch(loginSuccess(user))
    return user
  }

  return { login, logout, register }
}
