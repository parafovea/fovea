/**
 * Tests for useProjects TanStack Query hooks.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useMyProjects,
  useProject,
  useProjectMembers,
  useCreateProject,
  projectKeys,
} from './useProjects'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

const mockProjects = [
  {
    id: 'proj-1',
    name: 'Gesture Study',
    slug: 'gesture-study',
    description: 'Analysis of hand gestures',
    ownerUserId: 'user-1',
    ownerGroupId: null,
    isArchived: false,
    _count: { members: 3 },
    myRole: 'project_owner',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'proj-2',
    name: 'Bird Migration',
    slug: 'bird-migration',
    description: null,
    ownerUserId: null,
    ownerGroupId: 'grp-1',
    isArchived: false,
    _count: { members: 5 },
    myRole: 'annotator',
    createdAt: '2025-02-01T00:00:00Z',
  },
]

const mockMembers = [
  {
    id: 'pm-1',
    userId: 'user-1',
    role: 'project_owner',
    joinedAt: '2025-01-01T00:00:00Z',
    user: { displayName: 'Alice' },
  },
  {
    id: 'pm-2',
    userId: 'user-2',
    role: 'annotator',
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

describe('useProjects hooks', () => {
  describe('projectKeys', () => {
    it('generates correct query keys', () => {
      expect(projectKeys.all).toEqual(['projects'])
      expect(projectKeys.lists()).toEqual(['projects', 'list'])
      expect(projectKeys.list('owned')).toEqual(['projects', 'list', { scope: 'owned' }])
      expect(projectKeys.list()).toEqual(['projects', 'list', { scope: undefined }])
      expect(projectKeys.detail('proj-1')).toEqual(['projects', 'detail', 'proj-1'])
      expect(projectKeys.members('proj-1')).toEqual(['projects', 'members', 'proj-1'])
      expect(projectKeys.personas('proj-1')).toEqual(['projects', 'personas', 'proj-1'])
    })
  })

  describe('useMyProjects', () => {
    beforeEach(() => {
      server.use(
        http.get('*/api/projects', () => {
          return HttpResponse.json(mockProjects)
        })
      )
    })

    it('fetches and returns projects', async () => {
      const { result } = renderHook(() => useMyProjects(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockProjects)
      expect(result.current.data).toHaveLength(2)
    })

    it('passes scope parameter as query string', async () => {
      let capturedUrl: string | undefined
      server.use(
        http.get('*/api/projects', ({ request }) => {
          capturedUrl = request.url
          return HttpResponse.json([mockProjects[0]])
        })
      )

      const { result } = renderHook(() => useMyProjects('owned'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(capturedUrl).toContain('scope=owned')
      expect(result.current.data).toHaveLength(1)
    })

    it('handles error on failed request', async () => {
      server.use(
        http.get('*/api/projects', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      const { result } = renderHook(() => useMyProjects(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toBeDefined()
    })
  })

  describe('useProject', () => {
    it('fetches a single project by ID', async () => {
      server.use(
        http.get('*/api/projects/:projectId', ({ params }) => {
          return HttpResponse.json({
            id: params.projectId,
            name: 'Gesture Study',
            slug: 'gesture-study',
            description: 'Analysis of hand gestures',
            ownerUserId: 'user-1',
            ownerGroupId: null,
            isArchived: false,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            videoAssignmentCount: 5,
          })
        })
      )

      const { result } = renderHook(() => useProject('proj-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.name).toBe('Gesture Study')
      expect(result.current.data?.id).toBe('proj-1')
      expect(result.current.data?.videoAssignmentCount).toBe(5)
    })

    it('does not fetch when projectId is undefined', () => {
      const { result } = renderHook(() => useProject(undefined), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toBeUndefined()
    })
  })

  describe('useProjectMembers', () => {
    beforeEach(() => {
      server.use(
        http.get('*/api/projects/:projectId/members', () => {
          return HttpResponse.json(mockMembers)
        })
      )
    })

    it('returns member list', async () => {
      const { result } = renderHook(() => useProjectMembers('proj-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toHaveLength(2)
      expect(result.current.data?.[0].user?.displayName).toBe('Alice')
      expect(result.current.data?.[1].role).toBe('annotator')
    })

    it('does not fetch when projectId is undefined', () => {
      const { result } = renderHook(() => useProjectMembers(undefined), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toBeUndefined()
    })
  })

  describe('useCreateProject', () => {
    it('creates a project and returns the result', async () => {
      server.use(
        http.post('*/api/projects', async ({ request }) => {
          const body = await request.json() as Record<string, unknown>
          return HttpResponse.json({
            id: 'proj-new',
            name: body.name,
            slug: body.slug,
            description: body.description ?? null,
            ownerUserId: 'user-1',
            ownerGroupId: null,
            isArchived: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { status: 201 })
        })
      )

      const { result } = renderHook(() => useCreateProject(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        result.current.mutate({
          name: 'New Project',
          slug: 'new-project',
          description: 'A new project',
        })
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toMatchObject({
        id: 'proj-new',
        name: 'New Project',
        slug: 'new-project',
      })
    })
  })
})
