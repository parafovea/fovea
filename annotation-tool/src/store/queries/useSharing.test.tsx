/**
 * Tests for useSharing TanStack Query hooks.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useReceivedShares,
  useSentShares,
  useShareResource,
  useRevokeShare,
  useForkShare,
  sharingKeys,
} from './useSharing'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

const mockReceived = [
  {
    id: 'share-1',
    resourceType: 'annotation',
    resourceId: 'ann-1',
    sharedByUserId: 'user-2',
    sharedByUser: { id: 'user-2', username: 'alice', displayName: 'Alice' },
    permissionLevel: 'forkable',
    expiresAt: null,
    createdAt: '2025-01-10T00:00:00Z',
  },
]

const mockSent = [
  {
    id: 'share-2',
    resourceType: 'summary',
    resourceId: 'sum-1',
    sharedWithUserId: 'user-3',
    sharedWithUser: { id: 'user-3', username: 'bob', displayName: 'Bob' },
    sharedWithGroupId: null,
    permissionLevel: 'read',
    expiresAt: '2025-12-31T00:00:00Z',
    createdAt: '2025-01-15T00:00:00Z',
  },
]

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

describe('useSharing hooks', () => {
  describe('sharingKeys', () => {
    it('generates correct query keys', () => {
      expect(sharingKeys.all).toEqual(['sharing'])
      expect(sharingKeys.received()).toEqual(['sharing', 'received'])
      expect(sharingKeys.sent()).toEqual(['sharing', 'sent'])
    })
  })

  describe('useReceivedShares', () => {
    beforeEach(() => {
      server.use(
        http.get('*/api/sharing/received', () => {
          return HttpResponse.json(mockReceived)
        })
      )
    })

    it('fetches received shares', async () => {
      const { result } = renderHook(() => useReceivedShares(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toHaveLength(1)
      expect(result.current.data?.[0].resourceType).toBe('annotation')
      expect(result.current.data?.[0].permissionLevel).toBe('forkable')
    })

    it('handles error on failed request', async () => {
      server.use(
        http.get('*/api/sharing/received', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      const { result } = renderHook(() => useReceivedShares(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })
  })

  describe('useSentShares', () => {
    beforeEach(() => {
      server.use(
        http.get('*/api/sharing/sent', () => {
          return HttpResponse.json(mockSent)
        })
      )
    })

    it('fetches sent shares', async () => {
      const { result } = renderHook(() => useSentShares(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toHaveLength(1)
      expect(result.current.data?.[0].resourceType).toBe('summary')
      expect(result.current.data?.[0].sharedWithUser?.displayName).toBe('Bob')
    })
  })

  describe('useShareResource', () => {
    it('shares a resource successfully', async () => {
      server.use(
        http.post('*/api/sharing', () => {
          return HttpResponse.json({ id: 'share-new' }, { status: 201 })
        })
      )

      const { result } = renderHook(() => useShareResource(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        result.current.mutate({
          resourceType: 'Video',
          resourceId: 'video-1',
          targetUserId: 'user-3',
          permission: 'read',
        })
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toMatchObject({ id: 'share-new' })
    })

    it('handles error when sharing fails', async () => {
      server.use(
        http.post('*/api/sharing', () => {
          return HttpResponse.json(
            { message: 'Resource not found' },
            { status: 404 }
          )
        })
      )

      const { result } = renderHook(() => useShareResource(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        result.current.mutate({
          resourceType: 'Video',
          resourceId: 'missing',
          targetUserId: 'user-3',
          permission: 'read',
        })
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('Resource not found')
    })
  })

  describe('useRevokeShare', () => {
    it('revokes a share successfully', async () => {
      server.use(
        http.delete('*/api/sharing/:shareId', () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      const { result } = renderHook(() => useRevokeShare(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        result.current.mutate('share-1')
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })
    })
  })

  describe('useForkShare', () => {
    it('forks a shared resource successfully', async () => {
      server.use(
        http.post('*/api/sharing/:shareId/fork', () => {
          return HttpResponse.json(
            { resourceType: 'annotation', resourceId: 'forked-1', resource: { id: 'forked-1' } },
            { status: 201 }
          )
        })
      )

      const { result } = renderHook(() => useForkShare(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        result.current.mutate('share-1')
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toMatchObject({
        resourceType: 'annotation',
        resourceId: 'forked-1',
      })
    })
  })
})
