import { useSelector } from 'react-redux'
import { RootState } from '../../store/store.js'
import { User } from '../../models/types.js'

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
  const user = useSelector((state: RootState) => state.user.currentUser)
  const isAuthenticated = useSelector((state: RootState) => state.user.isAuthenticated)
  const isLoading = useSelector((state: RootState) => state.user.isLoading)
  const isAdmin = user?.isAdmin ?? false

  return { user, isAuthenticated, isAdmin, isLoading }
}
