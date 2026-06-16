/**
 * Tests for summary hooks.
 */

import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useVideoSummaries,
  useVideoSummary,
  useVideoSummariesLookup,
  useGenerateSummary,
  useSaveSummary,
  useDeleteSummary,
  summaryKeys,
} from './useSummaries'
import { server } from '@test/setup'
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

describe('useSummaries hooks', () => {
  describe('useVideoSummaries', () => {
    it('fetches video summaries', async () => {
      const { result } = renderHook(() => useVideoSummaries('video-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toHaveLength(1)
      expect(result.current.data?.[0]).toMatchObject({
        videoId: 'video-1',
        personaId: 'persona-1',
      })
    })

    it('handles errors', async () => {
      server.use(
        http.get('/api/videos/:videoId/summaries', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useVideoSummaries('video-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })

    it('respects enabled option', async () => {
      const { result } = renderHook(
        () => useVideoSummaries('video-1', { enabled: false }),
        {
          wrapper: createWrapper(),
        }
      )

      expect(result.current.isPending).toBe(true)
      expect(result.current.fetchStatus).toBe('idle')
    })
  })

  describe('useVideoSummary', () => {
    it('fetches a specific summary', async () => {
      const { result } = renderHook(
        () => useVideoSummary('video-1', 'persona-1'),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toMatchObject({
        videoId: 'video-1',
        personaId: 'persona-1',
        summary: expect.stringContaining('Wildlife researcher'),
      })
    })

    it('returns null for missing summaries', async () => {
      const { result } = renderHook(
        () => useVideoSummary('video-1', 'persona-missing'),
        {
          wrapper: createWrapper(),
        }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data).toBeNull()
    })
  })

  describe('useGenerateSummary', () => {
    it('generates a summary', async () => {
      const { result } = renderHook(() => useGenerateSummary(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        videoId: 'video-1',
        personaId: 'persona-1',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toMatchObject({
        jobId: 'job-123',
        videoId: 'video-1',
        personaId: 'persona-1',
      })
    })

    it('handles errors', async () => {
      server.use(
        http.post('/api/videos/summaries/generate', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useGenerateSummary(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        videoId: 'video-1',
        personaId: 'persona-1',
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useSaveSummary', () => {
    it('saves a summary', async () => {
      const { result } = renderHook(() => useSaveSummary(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        videoId: 'video-1',
        personaId: 'persona-1',
        summary: 'Test summary',
        visualAnalysis: 'Test analysis',
        audioTranscript: null,
        keyFrames: [0, 100],
        confidence: 0.9,
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toMatchObject({
        videoId: 'video-1',
        personaId: 'persona-1',
        summary: 'Test summary',
      })
    })
  })

  describe('useDeleteSummary', () => {
    it('deletes a summary', async () => {
      const { result } = renderHook(() => useDeleteSummary(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        videoId: 'video-1',
        personaId: 'persona-1',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('handles errors', async () => {
      server.use(
        http.delete('/api/videos/:videoId/summaries/:personaId', () => {
          return HttpResponse.json(
            { message: 'Not found' },
            { status: 404 }
          )
        })
      )

      const { result } = renderHook(() => useDeleteSummary(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        videoId: 'video-1',
        personaId: 'persona-1',
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useVideoSummariesLookup', () => {
    it('issues a single batched request and seeds the per-video cache (value and null)', async () => {
      let lookupCalls = 0
      server.use(
        http.post('/api/videos/summaries/lookup', async ({ request }) => {
          lookupCalls++
          const body = (await request.json()) as { videoIds: string[]; personaId: string }
          // Only vid-a has a summary; vid-b and vid-c do not.
          return HttpResponse.json(
            body.videoIds.includes('vid-a')
              ? [{ id: 's-a', videoId: 'vid-a', personaId: body.personaId, summary: [] }]
              : []
          )
        })
      )

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )

      const videoIds = ['vid-a', 'vid-b', 'vid-c']
      const { result } = renderHook(
        () => useVideoSummariesLookup(videoIds, 'persona-1'),
        { wrapper }
      )

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      // One request replaced what used to be one-per-video.
      expect(lookupCalls).toBe(1)
      expect(result.current.data).toHaveLength(1)

      // Every requested video's per-(video, persona) cache is seeded: the
      // existing summary for vid-a, and null for vid-b / vid-c, so the
      // per-card useVideoSummary never has to fetch.
      expect(queryClient.getQueryData(summaryKeys.summary('vid-a', 'persona-1'))).toMatchObject({
        videoId: 'vid-a',
      })
      expect(queryClient.getQueryData(summaryKeys.summary('vid-b', 'persona-1'))).toBeNull()
      expect(queryClient.getQueryData(summaryKeys.summary('vid-c', 'persona-1'))).toBeNull()
    })

    it('is disabled when no persona is selected', async () => {
      let lookupCalls = 0
      server.use(
        http.post('/api/videos/summaries/lookup', () => {
          lookupCalls++
          return HttpResponse.json([])
        })
      )

      const { result } = renderHook(() => useVideoSummariesLookup(['vid-a'], ''), {
        wrapper: createWrapper(),
      })

      // Give any erroneous request a chance to fire.
      await new Promise((r) => setTimeout(r, 50))
      expect(result.current.fetchStatus).toBe('idle')
      expect(lookupCalls).toBe(0)
    })
  })
})
