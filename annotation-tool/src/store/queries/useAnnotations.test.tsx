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
  useAddKeyframe,
  useRemoveKeyframe,
  useUpdateKeyframe,
} from './useAnnotations'
import type { Annotation } from '@models/types'
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
        http.get('/api/layers/videos/:videoId/annotations', () => {
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
        http.get('/api/layers/videos/:videoId/annotations', () => {
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
    it('preserves the client id through the create round-trip', async () => {
      // The client sends its stable local id in the create body and the
      // server keeps it, so the saved annotation carries the same id the
      // client minted. This is what keeps client and server ids in sync and
      // makes a lagged re-POST an idempotent update rather than a duplicate.
      const { result } = renderHook(() => useAddAnnotation(), {
        wrapper: createWrapper(),
      })

      result.current.mutate({
        id: 'client-local-id',
        videoId: 'video-1',
        boundingBox: { x: 100, y: 100, width: 50, height: 50 },
        frameNumber: 0,
        personaId: 'persona-1',
      })

      await waitFor(() => expect(result.current.isSuccess).toBe(true))

      expect(result.current.data).toMatchObject({
        id: 'client-local-id',
        videoId: 'video-1',
      })
    })

    it('handles errors', async () => {
      server.use(
        http.post('/api/layers/videos/:videoId/annotations',() => {
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
        http.put('/api/layers/videos/:videoId/annotations/:annotationId', () => {
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
        http.delete('/api/layers/videos/:videoId/annotations/:annotationId', () => {
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
        http.post('/api/layers/videos/:videoId/annotations',() => {
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
        http.post('/api/layers/videos/:videoId/annotations',async ({ request }) => {
          postCalls.push(await request.json())
          return HttpResponse.json(
            { id: 'should-not-fire', videoId: 'video-1', label: 'oops' },
          )
        }),
        http.put('/api/layers/videos/:videoId/annotations/:id',async ({ params, request }) => {
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

    it('sends the client id in the create POST body so client and server ids stay in sync', async () => {
      const postBodies: Array<Record<string, unknown>> = []
      server.use(
        http.post('/api/layers/videos/:videoId/annotations',async ({ request }) => {
          const body = await request.json() as Record<string, unknown>
          postBodies.push(body)
          return HttpResponse.json(
            {
              id: body.id,
              videoId: 'video-1',
              type: 'object',
              label: 'new box',
              linkType: 'entity',
              frames: body.frames,
              confidence: null,
              source: 'manual',
              createdAt: '2025-01-01T00:00:00Z',
              updatedAt: '2025-01-01T00:00:00Z',
            },
            { status: 201 },
          )
        }),
      )

      // Empty cache, so the annotation is treated as new and routed through POST.
      const { result } = renderHook(() => useSaveAnnotations(), {
        wrapper: createWrapper(),
      })

      const newId = 'client-generated-uuid'
      const saveResult = await result.current.mutateAsync({
        videoId: 'video-1',
        annotations: [
          {
            id: newId,
            videoId: 'video-1',
            annotationType: 'object',
            linkedEntityId: 'entity-1',
            boundingBoxSequence: {
              boxes: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2, frameNumber: 0 }],
              interpolationSegments: [],
              visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
              totalFrames: 1,
              keyframeCount: 1,
              interpolatedFrameCount: 0,
            },
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
        ],
      })

      expect(postBodies).toHaveLength(1)
      expect(postBodies[0].id).toBe(newId)
      expect(saveResult.results.created).toBe(1)
      expect(saveResult.results.updated).toBe(0)
    })

    it('issues no create POST when re-saving a set already present in the cache', async () => {
      // Under the autosave loop a lagged re-save of an already-persisted set
      // must not POST a duplicate. Because every id is already in the cache,
      // each annotation routes through PUT, so the POST handler never fires.
      const postCalls: unknown[] = []
      const putCalls: string[] = []
      server.use(
        http.post('/api/layers/videos/:videoId/annotations',async ({ request }) => {
          postCalls.push(await request.json())
          return HttpResponse.json({ id: 'should-not-fire' }, { status: 201 })
        }),
        http.put('/api/layers/videos/:videoId/annotations/:id',({ params }) => {
          putCalls.push(String(params.id))
          return HttpResponse.json({ id: String(params.id) })
        }),
      )

      const annotations = [
        {
          id: 'persisted-1',
          videoId: 'video-1',
          annotationType: 'object' as const,
          linkedEntityId: 'entity-1',
          boundingBoxSequence: {
            boxes: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2, frameNumber: 0 }],
            interpolationSegments: [],
            visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      ]

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
      expect(putCalls).toEqual(['persisted-1'])
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
        http.post('/api/layers/videos/:videoId/annotations',async ({ request }) => {
          postCalls.push(await request.json())
          return HttpResponse.json({ id: 'should-not-fire' })
        }),
        http.put('/api/layers/videos/:videoId/annotations/:id',({ params }) => {
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

  describe('keyframe mutation hooks return the updated array', () => {
    // The keyframe hooks update the query cache optimistically and ALSO return
    // the exact array they wrote. AnnotationWorkspace forwards that array to
    // forceSave so a keyframe edit persists immediately rather than relying on
    // the cache update propagating through a render first (which would let
    // forceSave read a stale, pre-keyframe value and silently drop the edit).

    function makeAnnotation(): Annotation {
      return {
        id: 'ann-1',
        videoId: 'video-1',
        annotationType: 'object',
        linkedEntityId: 'entity-1',
        boundingBoxSequence: {
          boxes: [
            { x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true },
          ],
          interpolationType: 'linear',
          interpolationSegments: [],
          visibilityRanges: [],
        },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      } as unknown as Annotation
    }

    function seededClient() {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
      queryClient.setQueryData(['annotations', 'video-1'], [makeAnnotation()])
      const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      )
      return { queryClient, wrapper }
    }

    it('useAddKeyframe returns an array containing the new keyframe and matches the cache', () => {
      const { queryClient, wrapper } = seededClient()
      const { result } = renderHook(() => useAddKeyframe(), { wrapper })

      const returned = result.current({
        videoId: 'video-1',
        annotationId: 'ann-1',
        frameNumber: 20,
        box: { x: 5, y: 5, width: 12, height: 12, frameNumber: 20 },
        fps: 30,
      })

      const frames = returned[0].boundingBoxSequence.boxes.map((b) => b.frameNumber)
      expect(frames).toContain(20)

      // The returned array is exactly what landed in the cache.
      const cached = queryClient.getQueryData<Annotation[]>(['annotations', 'video-1'])
      expect(cached).toEqual(returned)
    })

    it('useUpdateKeyframe returns the array with the updated box', () => {
      const { queryClient, wrapper } = seededClient()
      const { result } = renderHook(() => useUpdateKeyframe(), { wrapper })

      const returned = result.current({
        videoId: 'video-1',
        annotationId: 'ann-1',
        frameNumber: 0,
        box: { x: 99, y: 99 },
      })

      const box0 = returned[0].boundingBoxSequence.boxes.find((b) => b.frameNumber === 0)
      expect(box0?.x).toBe(99)
      const cached = queryClient.getQueryData<Annotation[]>(['annotations', 'video-1'])
      expect(cached).toEqual(returned)
    })

    it('useRemoveKeyframe returns the array without the removed keyframe', () => {
      const { queryClient, wrapper } = seededClient()
      const add = renderHook(() => useAddKeyframe(), { wrapper })
      // Seed two more keyframes so frame 20 is a removable middle keyframe
      // (the interpolator refuses to remove the first or last keyframe).
      add.result.current({
        videoId: 'video-1',
        annotationId: 'ann-1',
        frameNumber: 20,
        box: { x: 5, y: 5, width: 12, height: 12, frameNumber: 20 },
        fps: 30,
      })
      add.result.current({
        videoId: 'video-1',
        annotationId: 'ann-1',
        frameNumber: 40,
        box: { x: 8, y: 8, width: 14, height: 14, frameNumber: 40 },
        fps: 30,
      })

      const remove = renderHook(() => useRemoveKeyframe(), { wrapper })
      const returned = remove.result.current({
        videoId: 'video-1',
        annotationId: 'ann-1',
        frameNumber: 20,
        fps: 30,
      })

      const keyframeFrames = returned[0].boundingBoxSequence.boxes
        .filter((b) => b.isKeyframe || b.isKeyframe === undefined)
        .map((b) => b.frameNumber)
      expect(keyframeFrames).not.toContain(20)
      const cached = queryClient.getQueryData<Annotation[]>(['annotations', 'video-1'])
      expect(cached).toEqual(returned)
    })
  })
})
