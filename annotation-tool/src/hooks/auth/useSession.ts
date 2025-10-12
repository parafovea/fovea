import { useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { loginSuccess, logoutSuccess, setLoading } from '../../store/userSlice.js'
import { AppDispatch } from '../../store/store.js'

/**
 * Session restoration hook.
 * Checks for existing session on mount and restores authentication state.
 * Call this hook in the root App component.
 */
export function useSession(): void {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    const checkSession = async () => {
      dispatch(setLoading(true))
      try {
        const response = await fetch('/api/auth/me', { credentials: 'include' })
        if (response.ok) {
          const { user } = await response.json()
          dispatch(loginSuccess(user))
        } else {
          dispatch(logoutSuccess())
        }
      } catch (error) {
        console.error('Session check error:', error)
        dispatch(logoutSuccess())
      }
    }

    checkSession()
  }, [dispatch])
}
