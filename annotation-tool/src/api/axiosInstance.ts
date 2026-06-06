/**
 * Shared axios instance with credentials configured.
 * All API calls should use this instance to ensure cookies are sent with requests.
 * This is required for Safari and other browsers with strict cookie policies.
 */

import axios from 'axios'

import { logWarning } from '@services/errorLogging'
import { useAuthStore } from '@store/zustand/authStore'

/**
 * Pre-configured axios instance with credentials enabled.
 * Use this for all API requests to ensure session cookies are included.
 */
const axiosInstance = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

/**
 * Response interceptor to handle 401 Unauthorized responses.
 * Clears auth state and dispatches session:expired event when session expires.
 */
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only treat the 401 as a session expiry if the user WAS
      // authenticated at the moment the request fired. An anonymous
      // visitor — the booth flow on demo.fovea.video, or any
      // first-load before useSession resolves — naturally receives
      // 401s from /api/auth/me, /api/auth/session-status, and the
      // data endpoints the Layout idles against. Treating those as
      // expiries fired session:expired, SessionManager redirected to
      // /login?redirect=/, and the TourCataloguePage at / flashed
      // for a frame before the visitor was bounced — the exact
      // "I go to demo.fovea.video and it kicks me to login" report
      // that prompted this fix.
      const wasAuthenticated = useAuthStore.getState().isAuthenticated
      if (wasAuthenticated) {
        logWarning('Session expired - user logged out', {
          url: error.config?.url,
          method: error.config?.method,
          component: 'axiosInstance',
        })
        useAuthStore.getState().logoutSuccess()
        window.dispatchEvent(new CustomEvent('session:expired'))
      }
    }
    return Promise.reject(error)
  }
)

export default axiosInstance
