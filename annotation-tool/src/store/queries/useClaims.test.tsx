/**
 * Tests for claim hooks.
 */

import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useClaims,
  useCreateClaim,
  useUpdateClaim,
  useDeleteClaim,
  useCreateClaimRelation,
  useDeleteClaimRelation,
} from './useClaims'
import { server } from '../../../test/setup'
import { http, HttpResponse } from 'msw'

/**
 * Create a wrapper component with QueryClient for testing hooks.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useClaims hooks', () => {
  describe('useClaims', () => {
    it('fetches claims for a summary', async () => {
      server.use(
        http.get('/api/summaries/:summaryId/claims', () => {
          return HttpResponse.json([
            {
              id: 'claim-1',
              summaryId: 'summary-1',
              text: 'Test claim about baseball',
              confidence: 0.9,
              source: 'manual',
            },
          ])
        })
      )

      const { result } = renderHook(() => useClaims('summary-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toHaveLength(1)
      expect(result.current.data?.[0]).toMatchObject({
        id: 'claim-1',
        text: 'Test claim about baseball',
      })
    })

    it('returns empty array when summaryId is undefined', async () => {
      const { result } = renderHook(() => useClaims(undefined), {
        wrapper: createWrapper(),
      })

      // Should not fetch when summaryId is undefined
      expect(result.current.fetchStatus).toBe('idle')
    })

    it('handles errors', async () => {
      server.use(
        http.get('/api/summaries/:summaryId/claims', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useClaims('summary-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useCreateClaim', () => {
    it('creates a new claim', async () => {
      const { result } = renderHook(() => useCreateClaim(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        summaryId: 'summary-1',
        claim: {
          text: 'New test claim',
          confidence: 0.85,
          source: 'manual',
        },
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('handles errors', async () => {
      server.use(
        http.post('/api/summaries/:summaryId/claims', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useCreateClaim(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        summaryId: 'summary-1',
        claim: {
          text: 'New test claim',
          confidence: 0.85,
          source: 'manual',
        },
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useUpdateClaim', () => {
    it('updates an existing claim', async () => {
      const { result } = renderHook(() => useUpdateClaim(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        summaryId: 'summary-1',
        claimId: 'claim-1',
        updates: {
          text: 'Updated claim text',
          confidence: 0.95,
        },
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('handles errors', async () => {
      server.use(
        http.put('/api/summaries/:summaryId/claims/:claimId', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useUpdateClaim(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        summaryId: 'summary-1',
        claimId: 'claim-1',
        updates: {
          text: 'Updated claim text',
          confidence: 0.95,
        },
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useDeleteClaim', () => {
    it('deletes a claim', async () => {
      const { result } = renderHook(() => useDeleteClaim(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        summaryId: 'summary-1',
        claimId: 'claim-1',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('handles errors', async () => {
      server.use(
        http.delete('/api/summaries/:summaryId/claims/:claimId', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useDeleteClaim(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        summaryId: 'summary-1',
        claimId: 'claim-1',
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useCreateClaimRelation', () => {
    it('creates a claim relation', async () => {
      const { result } = renderHook(() => useCreateClaimRelation(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        summaryId: 'summary-1',
        sourceClaimId: 'claim-1',
        relation: {
          targetClaimId: 'claim-2',
          relationTypeId: 'supports',
        },
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('handles errors', async () => {
      server.use(
        http.post('/api/summaries/:summaryId/claims/:sourceClaimId/relations', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useCreateClaimRelation(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        summaryId: 'summary-1',
        sourceClaimId: 'claim-1',
        relation: {
          targetClaimId: 'claim-2',
          relationTypeId: 'supports',
        },
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useDeleteClaimRelation', () => {
    it('deletes a claim relation', async () => {
      const { result } = renderHook(() => useDeleteClaimRelation(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        summaryId: 'summary-1',
        relationId: 'relation-1',
        sourceClaimId: 'claim-1',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('handles errors', async () => {
      server.use(
        http.delete('/api/summaries/:summaryId/claims/relations/:relationId', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useDeleteClaimRelation(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        summaryId: 'summary-1',
        relationId: 'relation-1',
        sourceClaimId: 'claim-1',
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })
})
