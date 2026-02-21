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
      logWarning('Session expired - user logged out', {
        url: error.config?.url,
        method: error.config?.method,
        component: 'axiosInstance',
      })
      useAuthStore.getState().logoutSuccess()
      window.dispatchEvent(new CustomEvent('session:expired'))
    }
    return Promise.reject(error)
  }
)

export default axiosInstance
