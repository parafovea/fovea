/**
 * Tests for useGroups TanStack Query hooks.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useMyGroups,
  useGroup,
  useGroupMembers,
  useCreateGroup,
  groupKeys,
} from './useGroups'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

const mockGroups = [
  {
    id: 'grp-1',
    name: 'Annotators',
    slug: 'annotators',
    description: 'Main annotation team',
    memberCount: 5,
    userRole: 'group_owner',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'grp-2',
    name: 'Reviewers',
    slug: 'reviewers',
    description: null,
    memberCount: 3,
    userRole: 'group_member',
    createdAt: '2025-02-01T00:00:00Z',
  },
]

const mockMembers = [
  {
    id: 'membership-1',
    userId: 'user-1',
    role: 'group_owner',
    joinedAt: '2025-01-01T00:00:00Z',
    user: { displayName: 'Alice' },
  },
  {
    id: 'membership-2',
    userId: 'user-2',
    role: 'group_member',
    joinedAt: '2025-01-15T00:00:00Z',
    user: { displayName: 'Bob' },
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

describe('useGroups hooks', () => {
  describe('groupKeys', () => {
    it('generates correct query keys', () => {
      expect(groupKeys.all).toEqual(['groups'])
      expect(groupKeys.lists()).toEqual(['groups', 'list'])
      expect(groupKeys.detail('grp-1')).toEqual(['groups', 'detail', 'grp-1'])
      expect(groupKeys.members('grp-1')).toEqual(['groups', 'members', 'grp-1'])
    })
  })

  describe('useMyGroups', () => {
    beforeEach(() => {
      server.use(
        http.get('*/api/groups', () => {
          return HttpResponse.json(mockGroups)
        })
      )
    })

    it('fetches and returns groups', async () => {
      const { result } = renderHook(() => useMyGroups(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockGroups)
      expect(result.current.data).toHaveLength(2)
    })

    it('handles error on failed request', async () => {
      server.use(
        http.get('*/api/groups', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      const { result } = renderHook(() => useMyGroups(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toBeDefined()
    })
  })

  describe('useGroup', () => {
    it('fetches a single group by ID', async () => {
      server.use(
        http.get('*/api/groups/:groupId', ({ params }) => {
          return HttpResponse.json({
            id: params.groupId,
            name: 'Custom Group',
            slug: 'custom-group',
            description: 'A custom group',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          })
        })
      )

      const { result } = renderHook(() => useGroup('grp-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.name).toBe('Custom Group')
      expect(result.current.data?.id).toBe('grp-1')
    })

    it('does not fetch when groupId is undefined', () => {
      const { result } = renderHook(() => useGroup(undefined), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toBeUndefined()
    })
  })

  describe('useGroupMembers', () => {
    beforeEach(() => {
      server.use(
        http.get('*/api/groups/:groupId/members', () => {
          return HttpResponse.json(mockMembers)
        })
      )
    })

    it('returns member list', async () => {
      const { result } = renderHook(() => useGroupMembers('grp-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toHaveLength(2)
      expect(result.current.data?.[0].user?.displayName).toBe('Alice')
      expect(result.current.data?.[1].role).toBe('group_member')
    })

    it('does not fetch when groupId is undefined', () => {
      const { result } = renderHook(() => useGroupMembers(undefined), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toBeUndefined()
    })
  })

  describe('useCreateGroup', () => {
    it('creates a group and returns the result', async () => {
      server.use(
        http.post('*/api/groups', async ({ request }) => {
          const body = await request.json() as Record<string, unknown>
          return HttpResponse.json({
            id: 'grp-new',
            name: body.name,
            slug: body.slug,
            description: body.description ?? null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { status: 201 })
        })
      )

      const { result } = renderHook(() => useCreateGroup(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        result.current.mutate({ name: 'New Group', slug: 'new-group', description: 'A new group' })
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toMatchObject({
        id: 'grp-new',
        name: 'New Group',
        slug: 'new-group',
      })
    })

    it('handles error when creation fails', async () => {
      server.use(
        http.post('*/api/groups', () => {
          return HttpResponse.json(
            { message: 'Slug already taken' },
            { status: 409 }
          )
        })
      )

      const { result } = renderHook(() => useCreateGroup(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        result.current.mutate({ name: 'Dupe Group' })
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('Slug already taken')
    })
  })
})
