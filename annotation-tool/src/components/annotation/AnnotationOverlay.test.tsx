/**
 * Integration tests for AnnotationOverlay component.
 * Tests annotation creation flow with boundingBoxSequence structure.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import AnnotationOverlay from './AnnotationOverlay'
import { useAnnotationUiStore } from '@store/zustand/annotationUiStore'
import { server } from '@test/setup'

/**
 * Mock InteractiveBoundingBox to avoid complex rendering.
 */
vi.mock('./InteractiveBoundingBox', () => ({
  default: ({ annotation, linkedObject, isActive, onSelect }: any) => (
    <rect
      data-testid={`annotation-${annotation.id}`}
      data-active={isActive}
      data-linked-name={linkedObject?.name ?? ''}
      onClick={onSelect}
      x={0}
      y={0}
      width={100}
      height={100}
    />
  ),
}))

/**
 * Creates QueryClient and wrapper for testing.
 */
function createWrapper(videoId = 'test-video') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/annotate/${videoId}`]}>
        <Routes>
          <Route path="/annotate/:videoId" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/**
 * Helper to set up Zustand store state for tests.
 */
function setupStoreState(state: Partial<ReturnType<typeof useAnnotationUiStore.getState>>) {
  useAnnotationUiStore.setState({
    annotationMode: 'type',
    selectedAnnotation: null,
    selectedPersonaId: 'persona-1',
    isDrawing: false,
    drawingMode: 'entity',
    selectedTypeId: 'test-type',
    temporaryBox: null,
    temporaryTime: null,
    linkTargetId: null,
    linkTargetType: null,
    detectionResults: null,
    detectionQuery: '',
    detectionConfidenceThreshold: 0.5,
    showDetectionCandidates: false,
    ...state,
  })
}

describe('AnnotationOverlay', () => {
  const mockVideoElement = document.createElement('video')
  const videoWidth = 1920
  const videoHeight = 1080
  const currentTime = 5.0

  beforeEach(() => {
    // Reset Zustand store before each test
    useAnnotationUiStore.getState().resetAllState()

    // Set up default store state
    setupStoreState({})

    // Set up default MSW handlers for world and annotations
    server.use(
      http.get('/api/world', () => {
        return HttpResponse.json({
          entities: [],
          events: [],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: [],
        })
      }),
      http.get('/api/annotations/:videoId', () => {
        return HttpResponse.json([])
      }),
      http.post('/api/annotations', async ({ request }) => {
        const body = await request.json() as Record<string, unknown>
        // Return in backend format which will be transformed
        return HttpResponse.json({
          id: 'new-annotation-id',
          videoId: body.videoId,
          personaId: body.personaId,
          type: body.type,
          label: body.label,
          frames: body.frames,
          confidence: body.confidence ?? null,
          source: body.source || 'manual',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, { status: 201 })
      })
    )
  })

  afterEach(() => {
    useAnnotationUiStore.getState().resetAllState()
  })

  describe('Annotation Creation with boundingBoxSequence', () => {
    it('creates annotation with correct boundingBoxSequence structure', async () => {
      let savedAnnotation: any = null

      server.use(
        http.post('/api/annotations', async ({ request }) => {
          savedAnnotation = await request.json()
          return HttpResponse.json({
            id: 'new-annotation-id',
            videoId: savedAnnotation.videoId,
            personaId: savedAnnotation.personaId,
            type: savedAnnotation.type,
            label: savedAnnotation.label,
            frames: savedAnnotation.frames,
            confidence: null,
            source: 'manual',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { status: 201 })
        })
      )

      const Wrapper = createWrapper()

      const { container } = render(
        <AnnotationOverlay
          videoElement={mockVideoElement}
          currentTime={currentTime}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          detectionResults={null}
        />,
        { wrapper: Wrapper }
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeInTheDocument()

      // Mock getBoundingClientRect for coordinate transformation
      svg!.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        right: videoWidth,
        bottom: videoHeight,
        width: videoWidth,
        height: videoHeight,
        x: 0,
        y: 0,
        toJSON: () => {},
      }))

      // Simulate mouse down to start drawing
      fireEvent.mouseDown(svg!, {
        clientX: 100,
        clientY: 100,
      })

      // Simulate mouse move to create box
      fireEvent.mouseMove(svg!, {
        clientX: 200,
        clientY: 200,
      })

      // Simulate mouse up to finalize annotation
      fireEvent.mouseUp(svg!)

      // Wait for mutation to complete
      await waitFor(() => {
        expect(savedAnnotation).not.toBeNull()
      }, { timeout: 2000 })

      // Verify frames structure exists (backend format for boundingBoxSequence)
      expect(savedAnnotation.frames).toBeDefined()
      expect(savedAnnotation.frames.boxes).toBeDefined()
      expect(savedAnnotation.frames.interpolationSegments).toBeDefined()
      expect(savedAnnotation.frames.visibilityRanges).toBeDefined()

      // Verify boxes array has one keyframe
      expect(savedAnnotation.frames.boxes).toHaveLength(1)
      expect(savedAnnotation.frames.boxes[0].isKeyframe).toBe(true)
      expect(savedAnnotation.frames.boxes[0].frameNumber).toBe(150) // 5.0s * 30fps

      // Verify visibility ranges
      expect(savedAnnotation.frames.visibilityRanges).toHaveLength(1)
      expect(savedAnnotation.frames.visibilityRanges[0].visible).toBe(true)

      // Verify metadata
      // Annotations have a 1-second default timespan at 30fps = 31 frames (0-30 inclusive)
      expect(savedAnnotation.frames.totalFrames).toBe(31)
      expect(savedAnnotation.frames.keyframeCount).toBe(1)
      expect(savedAnnotation.frames.interpolatedFrameCount).toBe(30)
    })

    it('creates type annotation with persona and type IDs', async () => {
      let savedAnnotation: any = null

      server.use(
        http.post('/api/annotations', async ({ request }) => {
          savedAnnotation = await request.json()
          return HttpResponse.json({
            id: 'new-annotation-id',
            videoId: savedAnnotation.videoId,
            personaId: savedAnnotation.personaId,
            type: savedAnnotation.type,
            label: savedAnnotation.label,
            frames: savedAnnotation.frames,
            confidence: null,
            source: 'manual',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { status: 201 })
        })
      )

      const Wrapper = createWrapper()

      const { container } = render(
        <AnnotationOverlay
          videoElement={mockVideoElement}
          currentTime={currentTime}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          detectionResults={null}
        />,
        { wrapper: Wrapper }
      )

      const svg = container.querySelector('svg')
      svg!.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        right: videoWidth,
        bottom: videoHeight,
        width: videoWidth,
        height: videoHeight,
        x: 0,
        y: 0,
        toJSON: () => {},
      }))

      fireEvent.mouseDown(svg!, { clientX: 100, clientY: 100 })
      fireEvent.mouseMove(svg!, { clientX: 200, clientY: 200 })
      fireEvent.mouseUp(svg!)

      await waitFor(() => {
        expect(savedAnnotation).not.toBeNull()
      }, { timeout: 2000 })

      // Check backend format (type/label) since that's what's sent to API
      expect(savedAnnotation.type).toBe('type')
      expect(savedAnnotation.personaId).toBe('persona-1')
      expect(savedAnnotation.label).toBe('test-type')
    })

    it('creates object annotation with linked entity', async () => {
      let savedAnnotation: any = null

      // Set up object mode
      setupStoreState({
        annotationMode: 'object',
        linkTargetId: 'entity-1',
        linkTargetType: 'entity',
      })

      server.use(
        http.get('/api/world', () => {
          return HttpResponse.json({
            entities: [{
              id: 'entity-1',
              name: 'Test Entity',
              description: 'Test Description',
              wikidataId: null,
            }],
            events: [],
            times: [],
            entityCollections: [],
            eventCollections: [],
            timeCollections: [],
            relations: [],
          })
        }),
        http.post('/api/annotations', async ({ request }) => {
          savedAnnotation = await request.json()
          return HttpResponse.json({
            id: 'new-annotation-id',
            videoId: savedAnnotation.videoId,
            personaId: savedAnnotation.personaId,
            type: savedAnnotation.type,
            label: savedAnnotation.label,
            frames: savedAnnotation.frames,
            confidence: null,
            source: 'manual',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { status: 201 })
        })
      )

      const Wrapper = createWrapper()

      const { container } = render(
        <AnnotationOverlay
          videoElement={mockVideoElement}
          currentTime={currentTime}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          detectionResults={null}
        />,
        { wrapper: Wrapper }
      )

      const svg = container.querySelector('svg')
      svg!.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        right: videoWidth,
        bottom: videoHeight,
        width: videoWidth,
        height: videoHeight,
        x: 0,
        y: 0,
        toJSON: () => {},
      }))

      fireEvent.mouseDown(svg!, { clientX: 100, clientY: 100 })
      fireEvent.mouseMove(svg!, { clientX: 200, clientY: 200 })
      fireEvent.mouseUp(svg!)

      await waitFor(() => {
        expect(savedAnnotation).not.toBeNull()
      }, { timeout: 2000 })

      // Check backend format - type is 'object', label is the entity ID
      expect(savedAnnotation.type).toBe('object')
      expect(savedAnnotation.label).toBe('entity-1')
    })

    it('does not create annotation if box is too small', async () => {
      let savedAnnotation: any = null

      server.use(
        http.post('/api/annotations', async ({ request }) => {
          savedAnnotation = await request.json()
          return HttpResponse.json({
            id: 'new-annotation-id',
            videoId: savedAnnotation.videoId,
            personaId: savedAnnotation.personaId,
            type: savedAnnotation.type,
            label: savedAnnotation.label,
            frames: savedAnnotation.frames,
            confidence: null,
            source: 'manual',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { status: 201 })
        })
      )

      const Wrapper = createWrapper()

      const { container } = render(
        <AnnotationOverlay
          videoElement={mockVideoElement}
          currentTime={currentTime}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          detectionResults={null}
        />,
        { wrapper: Wrapper }
      )

      const svg = container.querySelector('svg')
      svg!.getBoundingClientRect = vi.fn(() => ({
        left: 0,
        top: 0,
        right: videoWidth,
        bottom: videoHeight,
        width: videoWidth,
        height: videoHeight,
        x: 0,
        y: 0,
        toJSON: () => {},
      }))

      fireEvent.mouseDown(svg!, { clientX: 100, clientY: 100 })
      fireEvent.mouseMove(svg!, { clientX: 102, clientY: 102 }) // Only 2x2 pixels
      fireEvent.mouseUp(svg!)

      // Wait a bit to ensure no mutation was called
      await new Promise(r => setTimeout(r, 100))

      expect(savedAnnotation).toBeNull()
    })
  })

  describe('Annotation Rendering with boundingBoxSequence', () => {
    it('renders existing annotations with boundingBoxSequence', async () => {
      // Use backend format - the API transform will convert to frontend format
      server.use(
        http.get('/api/annotations/:videoId', () => {
          return HttpResponse.json([
            {
              id: 'ann-1',
              videoId: 'test-video',
              personaId: 'persona-1',
              type: 'type',
              label: 'test-type',
              frames: {
                boxes: [{
                  x: 100,
                  y: 100,
                  width: 200,
                  height: 200,
                  frameNumber: 150,
                  isKeyframe: true,
                }],
                interpolationSegments: [],
                visibilityRanges: [{
                  startFrame: 150,
                  endFrame: 150,
                  visible: true,
                }],
                totalFrames: 1,
                keyframeCount: 1,
                interpolatedFrameCount: 0,
              },
              confidence: null,
              source: 'manual',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ])
        })
      )

      const Wrapper = createWrapper()

      render(
        <AnnotationOverlay
          videoElement={mockVideoElement}
          currentTime={currentTime}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          detectionResults={null}
        />,
        { wrapper: Wrapper }
      )

      await waitFor(() => {
        const annotationElement = screen.getByTestId('annotation-ann-1')
        expect(annotationElement).toBeInTheDocument()
      })
    })

    it('safely handles annotations without boundingBoxSequence', async () => {
      // Use backend format - frames being null should be handled safely
      server.use(
        http.get('/api/annotations/:videoId', () => {
          return HttpResponse.json([
            {
              id: 'ann-invalid',
              videoId: 'test-video',
              personaId: 'persona-1',
              type: 'type',
              label: 'test-type',
              // Missing frames (boundingBoxSequence) - should not crash
              frames: null,
              confidence: null,
              source: 'manual',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ])
        })
      )

      const Wrapper = createWrapper()

      // Should not throw error
      const { container } = render(
        <AnnotationOverlay
          videoElement={mockVideoElement}
          currentTime={currentTime}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          detectionResults={null}
        />,
        { wrapper: Wrapper }
      )

      // Wait for query to resolve
      await waitFor(() => {
        // Annotation should not be rendered (no boundingBoxSequence)
        const annotationElement = screen.queryByTestId('annotation-ann-invalid')
        expect(annotationElement).not.toBeInTheDocument()
      })

      // SVG should still be present
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('falls back to linkedObjectName when the local world lacks the linked object', async () => {
      // Reviewer reading another annotator's object annotation: the linked
      // entity lives in the owner's world, not the reviewer's, so the local
      // world lookup resolves nothing. The server-resolved linkedObjectName
      // should drive the badge name instead of a generic kind label.
      server.use(
        http.get('/api/world', () => {
          // Reviewer's own world is empty (does not contain owner-entity-1).
          return HttpResponse.json({
            entities: [],
            events: [],
            times: [],
            entityCollections: [],
            eventCollections: [],
            timeCollections: [],
            relations: [],
          })
        }),
        http.get('/api/annotations/:videoId', () => {
          return HttpResponse.json([
            {
              id: 'ann-cross-user',
              videoId: 'test-video',
              personaId: null,
              type: 'object',
              label: 'owner-entity-1',
              linkType: 'entity',
              linkedObjectName: 'Owner Entity',
              frames: {
                boxes: [{ x: 100, y: 100, width: 200, height: 200, frameNumber: 150, isKeyframe: true }],
                interpolationSegments: [],
                visibilityRanges: [{ startFrame: 150, endFrame: 150, visible: true }],
                totalFrames: 1,
                keyframeCount: 1,
                interpolatedFrameCount: 0,
              },
              confidence: null,
              source: 'manual',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ])
        })
      )

      const Wrapper = createWrapper()

      render(
        <AnnotationOverlay
          videoElement={mockVideoElement}
          currentTime={currentTime}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          detectionResults={null}
        />,
        { wrapper: Wrapper }
      )

      await waitFor(() => {
        const annotationElement = screen.getByTestId('annotation-ann-cross-user')
        // The badge name comes from the server-resolved linkedObjectName
        // because the local world has no matching entity.
        expect(annotationElement).toHaveAttribute('data-linked-name', 'Owner Entity')
      })
    })

    it('filters annotations by selected persona in type mode', async () => {
      // Use backend format
      server.use(
        http.get('/api/annotations/:videoId', () => {
          return HttpResponse.json([
            {
              id: 'ann-1',
              videoId: 'test-video',
              personaId: 'persona-1',
              type: 'type',
              label: 'test-type',
              frames: {
                boxes: [{ x: 100, y: 100, width: 200, height: 200, frameNumber: 150, isKeyframe: true }],
                interpolationSegments: [],
                visibilityRanges: [{ startFrame: 150, endFrame: 150, visible: true }],
                totalFrames: 1,
                keyframeCount: 1,
                interpolatedFrameCount: 0,
              },
              confidence: null,
              source: 'manual',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            {
              id: 'ann-2',
              videoId: 'test-video',
              personaId: 'persona-2', // Different persona
              type: 'type',
              label: 'test-type',
              frames: {
                boxes: [{ x: 300, y: 300, width: 200, height: 200, frameNumber: 150, isKeyframe: true }],
                interpolationSegments: [],
                visibilityRanges: [{ startFrame: 150, endFrame: 150, visible: true }],
                totalFrames: 1,
                keyframeCount: 1,
                interpolatedFrameCount: 0,
              },
              confidence: null,
              source: 'manual',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ])
        })
      )

      const Wrapper = createWrapper()

      render(
        <AnnotationOverlay
          videoElement={mockVideoElement}
          currentTime={currentTime}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          detectionResults={null}
        />,
        { wrapper: Wrapper }
      )

      await waitFor(() => {
        // Should show persona-1 annotation
        expect(screen.getByTestId('annotation-ann-1')).toBeInTheDocument()
        // Should NOT show persona-2 annotation
        expect(screen.queryByTestId('annotation-ann-2')).not.toBeInTheDocument()
      })
    })
  })

  describe('Detection Results Display', () => {
    it('renders detection boxes from AI results', async () => {
      const Wrapper = createWrapper()

      const mockDetectionResults = {
        videoId: 'test-video',
        frames: [
          {
            frameNumber: 150,
            timestamp: 5.0,
            detections: [
              {
                label: 'person',
                confidence: 0.95,
                boundingBox: {
                  x: 0.1,
                  y: 0.2,
                  width: 0.3,
                  height: 0.4,
                },
              },
            ],
          },
        ],
      }

      const { container } = render(
        <AnnotationOverlay
          videoElement={mockVideoElement}
          currentTime={currentTime}
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          detectionResults={mockDetectionResults}
        />,
        { wrapper: Wrapper }
      )

      // Should render detection box
      const svg = container.querySelector('svg')
      const rects = svg?.querySelectorAll('rect')

      // Find yellow detection box (stroke="#ffeb3b")
      const detectionBox = Array.from(rects || []).find(
        rect => rect.getAttribute('stroke') === '#ffeb3b'
      )

      expect(detectionBox).toBeInTheDocument()
    })
  })
})
