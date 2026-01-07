/**
 * Shared axios instance with credentials configured.
 * All API calls should use this instance to ensure cookies are sent with requests.
 * This is required for Safari and other browsers with strict cookie policies.
 */

import axios from 'axios'

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

export default axiosInstance
