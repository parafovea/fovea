/**
 * Tests for summary hooks.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { ReactNode } from 'react'
import {
  useVideoSummaries,
  useVideoSummary,
  useGenerateSummary,
  useSaveSummary,
  useDeleteSummary,
} from './useSummaries'
import { server } from '../../test/setup'
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
        http.get('http://localhost:3001/api/videos/:videoId/summaries', () => {
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
        http.post('http://localhost:3001/api/videos/summaries/generate', () => {
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
        http.delete('http://localhost:3001/api/videos/:videoId/summaries/:personaId', () => {
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
})
