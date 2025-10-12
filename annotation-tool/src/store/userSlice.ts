import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { User } from '../models/types.js'

/**
 * User authentication state.
 * Manages current user, authentication status, and application mode.
 */
export interface UserState {
  currentUser: User | null
  isAuthenticated: boolean
  isLoading: boolean
  mode: 'single-user' | 'multi-user'
  allowRegistration: boolean
}

const initialState: UserState = {
  currentUser: null,
  isAuthenticated: false,
  isLoading: true,
  mode: 'single-user',
  allowRegistration: false,
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
     * @param action - Payload containing mode and allowRegistration
     */
    setConfig: (state, action: PayloadAction<{ mode: 'single-user' | 'multi-user'; allowRegistration: boolean }>) => {
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
