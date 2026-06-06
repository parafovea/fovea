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

    it('routes an annotation already in cache through PUT, not POST (the v0.4.2 cachedIdsRef regression)', async () => {
      // v0.4.1 shipped useSaveAnnotations with cachedIdsRef as a plain
      // { current: new Set() } literal. The literal was reconstructed on
      // every render, so onMutate's setQueryData triggered a re-render
      // that emptied the ref before mutationFn read it. Every existing
      // annotation then routed through api.saveAnnotation (POST = create),
      // which is what produced the "Add Keyframe duplicates every
      // annotation on the canvas" behaviour the user observed. v0.4.2
      // converts cachedIdsRef to useRef so the .current write made by
      // onMutate survives the optimistic-update re-render and mutationFn
      // sees the populated set. This test pins the fix.
      const postCalls: unknown[] = []
      const putCalls: Array<{ id: string; body: unknown }> = []
      server.use(
        http.post('/api/annotations', async ({ request }) => {
          postCalls.push(await request.json())
          return HttpResponse.json(
            { id: 'should-not-fire', videoId: 'video-1', label: 'oops' },
          )
        }),
        http.put('/api/annotations/:id', async ({ params, request }) => {
          putCalls.push({ id: String(params.id), body: await request.json() })
          return HttpResponse.json({
            id: String(params.id),
            videoId: 'video-1',
            label: 'existing-updated',
          })
        }),
      )

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })

      // Seed the cache with one existing annotation so onMutate's snapshot
      // captures its id as the "previous" set the mutationFn must respect.
      queryClient.setQueryData(['annotations', 'video-1'], [
        {
          id: 'existing-1',
          videoId: 'video-1',
          personaId: 'persona-1',
          label: 'shipping container',
          boundingBox: { x: 10, y: 10, width: 100, height: 100 },
          frameNumber: 0,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ])

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )

      const { result } = renderHook(() => useSaveAnnotations(), { wrapper })

      const saveResult = await result.current.mutateAsync({
        videoId: 'video-1',
        annotations: [
          {
            id: 'existing-1',
            videoId: 'video-1',
            personaId: 'persona-1',
            label: 'shipping container',
            boundingBox: { x: 10, y: 10, width: 100, height: 100 },
            frameNumber: 0,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
      })

      expect(postCalls).toHaveLength(0)
      expect(putCalls).toHaveLength(1)
      expect(putCalls[0].id).toBe('existing-1')
      expect(saveResult.results.created).toBe(0)
      expect(saveResult.results.updated).toBe(1)
    })

    it('does not duplicate every annotation when many existing rows are saved together (Add Keyframe simulation)', async () => {
      // Direct simulation of the Add Keyframe path: useAddKeyframe mutates
      // the cache then handleAutoSave fires saveAnnotationsMutation with
      // the full annotation list. Pre-v0.4.2 each existing annotation
      // routed through POST → N annotations in produced N new rows on the
      // server. This test asserts: zero POSTs across the whole save and
      // one PUT per existing annotation.
      const postCalls: unknown[] = []
      const putCalls: string[] = []
      server.use(
        http.post('/api/annotations', async ({ request }) => {
          postCalls.push(await request.json())
          return HttpResponse.json({ id: 'should-not-fire' })
        }),
        http.put('/api/annotations/:id', ({ params }) => {
          putCalls.push(String(params.id))
          return HttpResponse.json({ id: String(params.id) })
        }),
      )

      const ids = ['a1', 'a2', 'a3', 'a4'] as const
      const annotations = ids.map((id) => ({
        id,
        videoId: 'video-1',
        personaId: 'persona-1',
        label: `box-${id}`,
        boundingBox: { x: 0, y: 0, width: 10, height: 10 },
        frameNumber: 0,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      }))

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
      queryClient.setQueryData(['annotations', 'video-1'], annotations)

      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )

      const { result } = renderHook(() => useSaveAnnotations(), { wrapper })

      const saveResult = await result.current.mutateAsync({ videoId: 'video-1', annotations })

      expect(postCalls).toHaveLength(0)
      expect(putCalls.sort()).toEqual([...ids])
      expect(saveResult.results.created).toBe(0)
      expect(saveResult.results.updated).toBe(ids.length)
    })
  })
})
