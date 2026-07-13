/**
 * Shared TanStack Query client for the app.
 *
 * @module
 */

import { QueryClient } from '@tanstack/react-query'
import axios from 'axios'

/**
 * TanStack Query client configuration.
 * Manages caching, refetching, and background updates for API requests.
 *
 * Exported so DemoShell's onBeforeLaunch can invalidate cached queries
 * after seeding the demo user's WorldState — without this the
 * GlossEditor's useWorld() returns the stale empty cache for up to
 * staleTime=5 min and the @-popup keeps reading "No objects found"
 * even though the backend was just populated.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Do not retry client errors (4xx, including 429 rate limits); a retry
      // cannot fix a bad request and only amplifies request fan-out. For other
      // failures (network, 5xx) allow a single retry.
      retry: (failureCount, error) => {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined
        if (status && status >= 400 && status < 500) return false
        return failureCount < 1
      },
      // Refetching on window focus multiplies request volume across the app
      // and is not needed given staleTime + explicit invalidation on mutations.
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})
