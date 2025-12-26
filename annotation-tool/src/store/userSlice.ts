import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { User } from '../models/types.js'

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
 * User authentication state.
 * Manages current user, authentication status, and application configuration.
 */
export interface UserState {
  currentUser: User | null
  isAuthenticated: boolean
  isLoading: boolean
  /** Application mode (duplicated for backward compatibility) */
  mode: 'single-user' | 'multi-user'
  /** Whether registration is allowed (duplicated for backward compatibility) */
  allowRegistration: boolean
  /** Full application configuration */
  appConfig: AppConfig | null
}

const initialState: UserState = {
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,
  mode: 'single-user',
  allowRegistration: false,
  appConfig: null,
}

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    /**
     * Sets authenticated user and marks as authenticated.
     *
     * @param state - Current user state
     * @param action - Payload containing user data
     */
    loginSuccess: (state, action: PayloadAction<User>) => {
      state.currentUser = action.payload
      state.isAuthenticated = true
      state.isLoading = false
    },

    /**
     * Clears current user and marks as unauthenticated.
     *
     * @param state - Current user state
     */
    logoutSuccess: (state) => {
      state.currentUser = null
      state.isAuthenticated = false
      state.isLoading = false
    },

    /**
     * Updates current user data.
     *
     * @param state - Current user state
     * @param action - Payload containing updated user data
     */
    updateUser: (state, action: PayloadAction<User>) => {
      state.currentUser = action.payload
    },

    /**
     * Sets application mode.
     *
     * @param state - Current user state
     * @param action - Payload containing mode
     */
    setMode: (state, action: PayloadAction<'single-user' | 'multi-user'>) => {
      state.mode = action.payload
    },

    /**
     * Sets application configuration.
     *
     * @param state - Current user state
     * @param action - Payload containing full app config
     */
    setConfig: (state, action: PayloadAction<AppConfig>) => {
      state.appConfig = action.payload
      // Backward compatibility: also set top-level mode and allowRegistration
      state.mode = action.payload.mode
      state.allowRegistration = action.payload.allowRegistration
    },

    /**
     * Sets loading state.
     *
     * @param state - Current user state
     * @param action - Payload containing loading state
     */
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
  },
})

export const { loginSuccess, logoutSuccess, updateUser, setMode, setConfig, setLoading } = userSlice.actions
export default userSlice.reducer
