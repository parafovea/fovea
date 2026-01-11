import { useAuthStore } from '@store/zustand/authStore'
import { User } from '@models/types'

/**
 * Current user information.
 */
export interface CurrentUserInfo {
  user: User | null
  isAuthenticated: boolean
  isAdmin: boolean
  isLoading: boolean
}

/**
 * Current user hook.
 * Provides access to authenticated user data and authentication status.
 *
 * @returns Current user information with authentication flags
 */
export function useCurrentUser(): CurrentUserInfo {
  const user = useAuthStore(state => state.currentUser)
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const isLoading = useAuthStore(state => state.isLoading)
  const isAdmin = user?.isAdmin ?? false

  return { user, isAuthenticated, isAdmin, isLoading }
}
