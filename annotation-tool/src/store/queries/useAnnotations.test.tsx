/**
 * Tests for annotation hooks.
 */

import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import {
  useAnnotations,
  useAddAnnotation,
  useUpdateAnnotation,
  useDeleteAnnotation,
  useSaveAnnotations,
} from './useAnnotations'
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

describe('useAnnotations hooks', () => {
  describe('useAnnotations', () => {
    it('fetches annotations for a video', async () => {
      server.use(
        http.get('/api/annotations/:videoId', () => {
          return HttpResponse.json([
            {
              id: 'annotation-1',
              videoId: 'video-1',
              boundingBox: { x: 100, y: 100, width: 50, height: 50 },
              frameNumber: 0,
            },
          ])
        })
      )

      const { result } = renderHook(() => useAnnotations('video-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toHaveLength(1)
      expect(result.current.data?.[0]).toMatchObject({
        id: 'annotation-1',
        videoId: 'video-1',
      })
    })

    it('returns empty array when videoId is null', async () => {
      const { result } = renderHook(() => useAnnotations(null), {
        wrapper: createWrapper(),
      })

      // Should not fetch when videoId is null
      expect(result.current.fetchStatus).toBe('idle')
    })

    it('handles errors', async () => {
      server.use(
        http.get('/api/annotations/:videoId', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useAnnotations('video-1'), {
        wrapper: createWrapper(),
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useAddAnnotation', () => {
    it('adds a new annotation', async () => {
      const { result } = renderHook(() => useAddAnnotation(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        videoId: 'video-1',
        boundingBox: { x: 100, y: 100, width: 50, height: 50 },
        frameNumber: 0,
        personaId: 'persona-1',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toMatchObject({
        id: 'annotation-new',
        videoId: 'video-1',
      })
    })

    it('handles errors', async () => {
      server.use(
        http.post('/api/annotations', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useAddAnnotation(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        videoId: 'video-1',
        boundingBox: { x: 100, y: 100, width: 50, height: 50 },
        frameNumber: 0,
        personaId: 'persona-1',
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useUpdateAnnotation', () => {
    it('updates an existing annotation', async () => {
      const { result } = renderHook(() => useUpdateAnnotation(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        id: 'annotation-1',
        videoId: 'video-1',
        boundingBox: { x: 150, y: 150, width: 60, height: 60 },
        frameNumber: 0,
        personaId: 'persona-1',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toMatchObject({
        id: 'annotation-1',
        boundingBox: { x: 150, y: 150, width: 60, height: 60 },
      })
    })

    it('handles errors', async () => {
      server.use(
        http.put('/api/annotations/:annotationId', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useUpdateAnnotation(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        id: 'annotation-1',
        videoId: 'video-1',
        boundingBox: { x: 150, y: 150, width: 60, height: 60 },
        frameNumber: 0,
        personaId: 'persona-1',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useDeleteAnnotation', () => {
    it('deletes an annotation', async () => {
      const { result } = renderHook(() => useDeleteAnnotation(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        annotationId: 'annotation-1',
        videoId: 'video-1',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('handles errors', async () => {
      server.use(
        http.delete('/api/annotations/:videoId/:annotationId', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useDeleteAnnotation(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        annotationId: 'annotation-1',
        videoId: 'video-1',
      })

      await waitFor(() => expect(result.current.isError).toBe(true))
      expect(result.current.error).toBeTruthy()
    })
  })

  describe('useSaveAnnotations', () => {
    it('saves multiple annotations', async () => {
      const { result } = renderHook(() => useSaveAnnotations(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        videoId: 'video-1',
        annotations: [
          {
            id: 'annotation-1',
            videoId: 'video-1',
            boundingBox: { x: 100, y: 100, width: 50, height: 50 },
            frameNumber: 0,
            personaId: 'persona-1',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
          {
            id: 'annotation-2',
            videoId: 'video-1',
            boundingBox: { x: 200, y: 200, width: 60, height: 60 },
            frameNumber: 30,
            personaId: 'persona-1',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))
    })

    it('handles errors', async () => {
      // Mock the POST endpoint for new annotations to return an error
      server.use(
        http.post('/api/annotations', () => {
          return HttpResponse.json(
            { message: 'Error' },
            { status: 500 }
          )
        })
      )

      const { result } = renderHook(() => useSaveAnnotations(), {
        wrapper: createWrapper(),
      })

      // Pass a new annotation (not in cache) to trigger POST
      result.current.mutate({
        videoId: 'video-1',
        annotations: [
          {
            id: 'new-annotation-1',
            videoId: 'video-1',
            boundingBox: { x: 100, y: 100, width: 50, height: 50 },
            frameNumber: 0,
            personaId: 'persona-1',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
      })

      // Note: useSaveAnnotations catches errors internally and reports them in results.errors
      // So the mutation itself succeeds, but with errors in the results
      await waitFor(() => expect(result.current.isSuccess).toBe(true))
      expect(result.current.data?.results.errors.length).toBeGreaterThan(0)
    })
  })
})
