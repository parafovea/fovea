/**
 * Authentication Store (Zustand)
 *
 * Manages authentication state, current user, and application configuration.
 * Uses persist middleware for session persistence across page reloads.
 *
 * **Replaces Redux userSlice**
 *
 * This store handles:
 * - Current user authentication state
 * - Application configuration (mode, registration, Wikidata settings)
 * - Session persistence with localStorage
 */

import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { User } from '@models/types'

/**
 * Wikidata/Wikibase configuration.
 */
export interface WikidataConfig {
  /** Mode: 'online' for public Wikidata, 'offline' for local Wikibase */
  mode: 'online' | 'offline'
  /** API endpoint URL */
  url: string
  /** ID mapping from Wikidata IDs to local Wikibase IDs (offline mode only) */
  idMapping: Record<string, string> | null
  /** Whether external Wikidata links are allowed */
  allowExternalLinks: boolean
}

/**
 * External links configuration.
 */
export interface ExternalLinksConfig {
  /** Whether external Wikidata entity page links are allowed */
  wikidata: boolean
  /** Whether external video source links are allowed */
  videoSources: boolean
}

/**
 * Full application configuration from /api/config.
 */
export interface AppConfig {
  /** Application mode */
  mode: 'single-user' | 'multi-user'
  /** Whether user registration is allowed */
  allowRegistration: boolean
  /** Wikidata/Wikibase configuration */
  wikidata: WikidataConfig
  /** External links configuration */
  externalLinks: ExternalLinksConfig
}

/**
 * Authentication state interface.
 */
export interface AuthState {
  // ========== User State ==========
  /** Currently authenticated user */
  currentUser: User | null
  /** Whether user is authenticated */
  isAuthenticated: boolean
  /** Whether authentication is being checked */
  isLoading: boolean

  // ========== Config State ==========
  /** Application mode (single-user or multi-user) */
  mode: 'single-user' | 'multi-user'
  /** Whether registration is allowed */
  allowRegistration: boolean
  /** Full application configuration */
  appConfig: AppConfig | null

  // ========== Actions ==========
  /** Set user on successful login */
  loginSuccess: (user: User) => void
  /** Clear user on logout */
  logoutSuccess: () => void
  /** Update current user data */
  updateUser: (user: User) => void
  /** Set application mode */
  setMode: (mode: 'single-user' | 'multi-user') => void
  /** Set full application configuration */
  setConfig: (config: AppConfig) => void
  /** Set loading state */
  setLoading: (loading: boolean) => void
  /** Reset all auth state */
  reset: () => void
}

/**
 * Initial state values
 */
const initialState = {
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,
  mode: 'single-user' as const,
  allowRegistration: false,
  appConfig: null,
}

/**
 * Authentication Store
 *
 * Use this store for all authentication-related state.
 *
 * @example
 * ```typescript
 * import { useAuthStore } from '@/store/zustand/authStore'
 *
 * function UserMenu() {
 *   const currentUser = useAuthStore(state => state.currentUser)
 *   const isAuthenticated = useAuthStore(state => state.isAuthenticated)
 *   const logout = useAuthStore(state => state.logoutSuccess)
 *
 *   if (!isAuthenticated) {
 *     return <LoginButton />
 *   }
 *
 *   return (
 *     <Menu>
 *       <MenuItem>{currentUser?.displayName}</MenuItem>
 *       <MenuItem onClick={logout}>Logout</MenuItem>
 *     </Menu>
 *   )
 * }
 * ```
 */
export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        loginSuccess: (user) =>
          set(
            {
              currentUser: user,
              isAuthenticated: true,
              isLoading: false,
            },
            false,
            'loginSuccess'
          ),

        logoutSuccess: () =>
          set(
            {
              currentUser: null,
              isAuthenticated: false,
              isLoading: false,
            },
            false,
            'logoutSuccess'
          ),

        updateUser: (user) =>
          set({ currentUser: user }, false, 'updateUser'),

        setMode: (mode) =>
          set({ mode }, false, 'setMode'),

        setConfig: (config) =>
          set(
            {
              appConfig: config,
              // Backward compatibility: also set top-level mode and allowRegistration
              mode: config.mode,
              allowRegistration: config.allowRegistration,
            },
            false,
            'setConfig'
          ),

        setLoading: (isLoading) =>
          set({ isLoading }, false, 'setLoading'),

        reset: () =>
          set(initialState, false, 'reset'),
      }),
      {
        name: 'auth-storage',
        // Only persist user-related data, not config (config comes from server)
        partialize: (state) => ({
          currentUser: state.currentUser,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    ),
    { name: 'AuthStore' }
  )
)
