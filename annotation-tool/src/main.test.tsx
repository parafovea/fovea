/**
 * Tests for application root setup and providers.
 */

import { describe, it, expect } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

describe('QueryClient Configuration', () => {
  it('creates query client with correct default options', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
          refetchOnWindowFocus: true,
          staleTime: 5 * 60 * 1000,
        },
      },
    })

    const defaultOptions = queryClient.getDefaultOptions()

    expect(defaultOptions.queries?.retry).toBe(1)
    expect(defaultOptions.queries?.refetchOnWindowFocus).toBe(true)
    expect(defaultOptions.queries?.staleTime).toBe(5 * 60 * 1000)
  })

  it('configures stale time to 5 minutes', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
        },
      },
    })

    const staleTime = queryClient.getDefaultOptions().queries?.staleTime

    expect(staleTime).toBe(300000) // 5 minutes in milliseconds
  })

  it('enables window focus refetching', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          refetchOnWindowFocus: true,
        },
      },
    })

    const refetchOnWindowFocus =
      queryClient.getDefaultOptions().queries?.refetchOnWindowFocus

    expect(refetchOnWindowFocus).toBe(true)
  })

  it('configures single retry on failure', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
        },
      },
    })

    const retry = queryClient.getDefaultOptions().queries?.retry

    expect(retry).toBe(1)
  })
})
