/**
 * Tests for useVideos TanStack Query hooks.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useVideos, useVideo, videoKeys } from './useVideos'
import { server } from '../../../test/setup'
import { http, HttpResponse } from 'msw'

const mockVideos = [
  {
    id: 'video-1',
    title: 'Test Video 1',
    description: 'First test video',
    duration: 300,
    width: 1920,
    height: 1080,
  },
  {
    id: 'video-2',
    title: 'Test Video 2',
    description: 'Second test video',
    duration: 450,
    width: 1280,
    height: 720,
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

describe('useVideos hooks', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/videos', () => {
        return HttpResponse.json(mockVideos)
      }),
      http.get('/api/videos/:videoId', ({ params }) => {
        const video = mockVideos.find((v) => v.id === params.videoId)
        if (video) {
          return HttpResponse.json(video)
        }
        return new HttpResponse(null, { status: 404 })
      })
    )
  })

  describe('videoKeys', () => {
    it('generates correct query keys', () => {
      expect(videoKeys.all).toEqual(['videos'])
      expect(videoKeys.lists()).toEqual(['videos', 'list'])
      expect(videoKeys.list({ searchTerm: 'test' })).toEqual(['videos', 'list', { searchTerm: 'test' }])
      expect(videoKeys.details()).toEqual(['videos', 'detail'])
      expect(videoKeys.detail('video-1')).toEqual(['videos', 'detail', 'video-1'])
    })
  })

  describe('useVideos', () => {
    it('fetches all videos successfully', async () => {
      const { result } = renderHook(() => useVideos(), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockVideos)
      expect(result.current.data).toHaveLength(2)
    })

    it('handles error when fetching videos fails', async () => {
      server.use(
        http.get('/api/videos', () => {
          return new HttpResponse(null, { status: 500 })
        })
      )

      const { result } = renderHook(() => useVideos(), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toBeDefined()
    })
  })

  describe('useVideo', () => {
    it('fetches a single video by ID', async () => {
      const { result } = renderHook(() => useVideo('video-1'), {
        wrapper: createWrapper(),
      })

      expect(result.current.isLoading).toBe(true)

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockVideos[0])
      expect(result.current.data?.title).toBe('Test Video 1')
    })

    it('returns undefined when videoId is undefined', async () => {
      const { result } = renderHook(() => useVideo(undefined), {
        wrapper: createWrapper(),
      })

      // Query should not be enabled
      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toBeUndefined()
    })

    it('can be disabled via options', async () => {
      const { result } = renderHook(
        () => useVideo('video-1', { enabled: false }),
        {
          wrapper: createWrapper(),
        }
      )

      // Query should not run
      expect(result.current.isLoading).toBe(false)
      expect(result.current.data).toBeUndefined()
    })

    it('handles 404 error when video not found', async () => {
      const { result } = renderHook(() => useVideo('non-existent'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toBeDefined()
    })
  })
})
