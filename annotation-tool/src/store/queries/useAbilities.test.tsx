/**
 * Tests for useAbilities TanStack Query hook.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useAbilities, abilityKeys } from './useAbilities'
import { useAbilityStore } from '@store/zustand/abilityStore'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useAbilities hook', () => {
  beforeEach(() => {
    // Reset ability store to empty
    useAbilityStore.getState().setAbility([])
  })

  describe('abilityKeys', () => {
    it('generates correct query keys', () => {
      expect(abilityKeys.all).toEqual(['abilities'])
    })
  })

  describe('when enabled', () => {
    beforeEach(() => {
      server.use(
        http.get('*/api/auth/abilities', () => {
          return HttpResponse.json({
            rules: [
              { action: 'read', subject: 'Video' },
              { action: 'create', subject: 'Annotation' },
            ],
          })
        })
      )
    })

    it('fetches abilities from the server', async () => {
      const { result } = renderHook(() => useAbilities(true), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.rules).toHaveLength(2)
    })

    it('syncs rules to abilityStore', async () => {
      // Verify the store starts empty
      expect(useAbilityStore.getState().ability.can('read', 'Video')).toBe(false)

      const { result } = renderHook(() => useAbilities(true), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // After the hook fetches and the useEffect runs, the store should be updated
      await waitFor(() => {
        expect(useAbilityStore.getState().ability.can('read', 'Video')).toBe(true)
      })
      expect(useAbilityStore.getState().ability.can('create', 'Annotation')).toBe(true)
    })
  })

  describe('when disabled', () => {
    it('does not fetch when enabled is false', () => {
      const { result } = renderHook(() => useAbilities(false), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.isFetching).toBe(false)
      expect(result.current.data).toBeUndefined()
    })

    it('does not modify the abilityStore', () => {
      renderHook(() => useAbilities(false), {
        wrapper: createWrapper(),
      })

      // Store should remain empty
      expect(useAbilityStore.getState().ability.can('read', 'Video')).toBe(false)
    })
  })

  describe('error handling', () => {
    it('handles server error', async () => {
      server.use(
        http.get('*/api/auth/abilities', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      const { result } = renderHook(() => useAbilities(true), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      // Store should remain empty on error
      expect(useAbilityStore.getState().ability.can('read', 'Video')).toBe(false)
    })
  })
})
