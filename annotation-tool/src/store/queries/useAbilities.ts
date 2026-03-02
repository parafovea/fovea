/**
 * TanStack Query hook for fetching CASL permission rules.
 *
 * Fetches the current user's ability rules from the server and updates
 * the abilityStore so that permission checks are available globally.
 */

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RawRuleOf } from '@casl/ability'
import type { AppAbility } from '@store/zustand/abilityStore'
import { useAbilityStore } from '@store/zustand/abilityStore'

/** Query key factory for abilities. */
export const abilityKeys = {
  all: ['abilities'] as const,
}

/**
 * Fetch CASL ability rules from the server.
 */
async function fetchAbilities(): Promise<{ rules: Array<Record<string, unknown>> }> {
  const response = await fetch('/api/auth/abilities', { credentials: 'include' })
  if (!response.ok) {
    throw new Error('Failed to fetch abilities')
  }
  return response.json()
}

/**
 * Hook that fetches CASL rules and synchronizes them into the ability store.
 *
 * @param enabled - whether to enable the query (default: true)
 * @returns TanStack Query result with the raw abilities response
 *
 * @example
 * ```typescript
 * // Fetch abilities when the user is authenticated
 * const { isLoading } = useAbilities(isAuthenticated)
 * ```
 */
export function useAbilities(enabled = true) {
  const setAbility = useAbilityStore(state => state.setAbility)

  const query = useQuery({
    queryKey: abilityKeys.all,
    queryFn: fetchAbilities,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  useEffect(() => {
    if (query.data?.rules) {
      setAbility(query.data.rules as unknown as RawRuleOf<AppAbility>[])
    }
  }, [query.data, setAbility])

  return query
}
