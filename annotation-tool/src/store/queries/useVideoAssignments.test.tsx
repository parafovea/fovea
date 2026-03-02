/**
 * Tests for useVideoAssignments TanStack Query hooks.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import {
  useProjectVideos,
  useAssignmentRules,
  useAssignVideo,
  useUnassignVideo,
  videoAssignmentKeys,
} from './useVideoAssignments'
import { server } from '@test/setup'
import { http, HttpResponse } from 'msw'

const mockProjectVideos = [
  {
    id: 'va-1',
    videoId: 'video-1',
    projectId: 'proj-1',
    video: { id: 'video-1', filename: 'test.mp4', title: 'Test Video' },
    assignedAt: '2025-01-10T00:00:00Z',
  },
  {
    id: 'va-2',
    videoId: 'video-2',
    projectId: 'proj-1',
    video: { id: 'video-2', filename: 'demo.mp4', title: 'Demo Video' },
    assignedAt: '2025-01-11T00:00:00Z',
  },
]

const mockRules = [
  {
    id: 'rule-1',
    name: 'Auto-assign uploaded',
    criteria: { uploader: 'user-1' },
    projectId: 'proj-1',
    createdAt: '2025-01-01T00:00:00Z',
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

describe('useVideoAssignments hooks', () => {
  describe('videoAssignmentKeys', () => {
    it('generates correct query keys', () => {
      expect(videoAssignmentKeys.all).toEqual(['video-assignments'])
      expect(videoAssignmentKeys.projectVideos('proj-1')).toEqual([
        'video-assignments',
        'project',
        'proj-1',
      ])
      expect(videoAssignmentKeys.rules()).toEqual(['video-assignments', 'rules'])
      expect(videoAssignmentKeys.rule('rule-1')).toEqual([
        'video-assignments',
        'rule',
        'rule-1',
      ])
    })
  })

  describe('useProjectVideos', () => {
    beforeEach(() => {
      server.use(
        http.get('*/api/projects/:projectId/videos', () => {
          return HttpResponse.json(mockProjectVideos)
        })
      )
    })

    it('fetches video assignments for a project', async () => {
      const { result } = renderHook(() => useProjectVideos('proj-1'), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toHaveLength(2)
      expect(result.current.data?.[0].videoId).toBe('video-1')
    })

    it('does not fetch when projectId is undefined', () => {
      const { result } = renderHook(() => useProjectVideos(undefined), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toBeUndefined()
    })

    it('handles error on failed request', async () => {
      server.use(
        http.get('*/api/projects/:projectId/videos', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      const { result } = renderHook(() => useProjectVideos('proj-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
    })
  })

  describe('useAssignmentRules', () => {
    beforeEach(() => {
      server.use(
        http.get('*/api/admin/video-assignments/rules', () => {
          return HttpResponse.json(mockRules)
        })
      )
    })

    it('fetches assignment rules', async () => {
      const { result } = renderHook(() => useAssignmentRules(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toHaveLength(1)
      expect(result.current.data?.[0].name).toBe('Auto-assign uploaded')
    })
  })

  describe('useAssignVideo', () => {
    it('assigns a video to a project', async () => {
      server.use(
        http.post('*/api/projects/:projectId/videos', () => {
          return HttpResponse.json({ success: true }, { status: 201 })
        })
      )

      const { result } = renderHook(() => useAssignVideo(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        result.current.mutate({ projectId: 'proj-1', videoId: 'video-3' })
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })
    })

    it('handles error when assignment fails', async () => {
      server.use(
        http.post('*/api/projects/:projectId/videos', () => {
          return HttpResponse.json(
            { message: 'Video already assigned' },
            { status: 409 }
          )
        })
      )

      const { result } = renderHook(() => useAssignVideo(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        result.current.mutate({ projectId: 'proj-1', videoId: 'video-1' })
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('Video already assigned')
    })
  })

  describe('useUnassignVideo', () => {
    it('unassigns a video from a project', async () => {
      server.use(
        http.delete('*/api/projects/:projectId/videos/:videoId', () => {
          return new HttpResponse(null, { status: 204 })
        })
      )

      const { result } = renderHook(() => useUnassignVideo(), {
        wrapper: createWrapper(),
      })

      await act(async () => {
        result.current.mutate({ projectId: 'proj-1', videoId: 'video-1' })
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })
    })
  })
})
