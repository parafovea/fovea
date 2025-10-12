/**
 * Integration tests for AnnotationOverlay component.
 * Tests annotation creation flow with boundingBoxSequence structure.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import AnnotationOverlay from './AnnotationOverlay'
import annotationSlice from '../store/annotationSlice'
import worldSlice from '../store/worldSlice'

/**
 * Mock InteractiveBoundingBox to avoid complex rendering.
 */
vi.mock('./annotation/InteractiveBoundingBox', () => ({
  default: ({ annotation, isActive, onSelect }: any) => (
    <rect
      data-testid={`annotation-${annotation.id}`}
      data-active={isActive}
      onClick={onSelect}
      x={0}
      y={0}
      width={100}
      height={100}
    />
  ),
}))

/**
 * Creates test Redux store with annotation and world slices.
 */
function createTestStore(initialState = {}) {
  return configureStore({
    reducer: {
      annotations: annotationSlice,
      world: worldSlice,
    },
    preloadedState: initialState,
  })
}

/**
 * Creates wrapper with React Router for accessing useParams.
 */
function createWrapper(store: ReturnType<typeof createTestStore>, videoId = 'test-video') {
  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/annotate/${videoId}`]}>
        <Routes>
          <Route path="/annotate/:videoId" element={children} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
}

/**
 * Default test state with type mode configured.
 */
function createDefaultState() {
  return {
    annotations: {
      annotations: {},
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
    },
    world: {
      entities: [],
      events: [],
      entityCollections: [],
      eventCollections: [],
      locations: [],
      times: [],
      relations: [],
    },
  }
}

describe('AnnotationOverlay', () => {
  const mockVideoElement = document.createElement('video')
  const videoWidth = 1920
  const videoHeight = 1080
  const currentTime = 5.0

  describe('Annotation Creation with boundingBoxSequence', () => {
    it('creates annotation with correct boundingBoxSequence structure', async () => {
      const store = createTestStore(createDefaultState())
      const Wrapper = createWrapper(store)

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

      // Get created annotation from store
      const state = store.getState()
      const annotations = state.annotations.annotations['test-video'] || []

      expect(annotations).toHaveLength(1)

      const annotation = annotations[0]

      // Verify boundingBoxSequence structure exists
      expect(annotation.boundingBoxSequence).toBeDefined()
      expect(annotation.boundingBoxSequence.boxes).toBeDefined()
      expect(annotation.boundingBoxSequence.interpolationSegments).toBeDefined()
      expect(annotation.boundingBoxSequence.visibilityRanges).toBeDefined()

      // Verify boxes array has one keyframe
      expect(annotation.boundingBoxSequence.boxes).toHaveLength(1)
      expect(annotation.boundingBoxSequence.boxes[0].isKeyframe).toBe(true)
      expect(annotation.boundingBoxSequence.boxes[0].frameNumber).toBe(150) // 5.0s * 30fps

      // Verify visibility ranges
      expect(annotation.boundingBoxSequence.visibilityRanges).toHaveLength(1)
      expect(annotation.boundingBoxSequence.visibilityRanges[0].visible).toBe(true)

      // Verify metadata
      expect(annotation.boundingBoxSequence.totalFrames).toBe(1)
      expect(annotation.boundingBoxSequence.keyframeCount).toBe(1)
      expect(annotation.boundingBoxSequence.interpolatedFrameCount).toBe(0)
    })

    it('creates type annotation with persona and type IDs', async () => {
      const store = createTestStore(createDefaultState())
      const Wrapper = createWrapper(store)

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

      const state = store.getState()
      const annotations = state.annotations.annotations['test-video'] || []
      const annotation = annotations[0]

      expect(annotation.annotationType).toBe('type')
      expect(annotation.personaId).toBe('persona-1')
      expect(annotation.typeCategory).toBe('entity')
      expect(annotation.typeId).toBe('test-type')
    })

    it('creates object annotation with linked entity', async () => {
      const stateWithObjectMode = createDefaultState()
      stateWithObjectMode.annotations.annotationMode = 'object'
      stateWithObjectMode.annotations.linkTargetId = 'entity-1'
      stateWithObjectMode.annotations.linkTargetType = 'entity'
      stateWithObjectMode.world.entities = [{
        id: 'entity-1',
        name: 'Test Entity',
        description: 'Test Description',
        wikidataId: null,
      }]

      const store = createTestStore(stateWithObjectMode)
      const Wrapper = createWrapper(store)

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

      const state = store.getState()
      const annotations = state.annotations.annotations['test-video'] || []
      const annotation = annotations[0]

      expect(annotation.annotationType).toBe('object')
      expect(annotation.linkedEntityId).toBe('entity-1')
    })

    it('does not create annotation if box is too small', async () => {
      const store = createTestStore(createDefaultState())
      const Wrapper = createWrapper(store)

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

      const state = store.getState()
      const annotations = state.annotations.annotations['test-video'] || []

      expect(annotations).toHaveLength(0)
    })
  })

  describe('Annotation Rendering with boundingBoxSequence', () => {
    it('renders existing annotations with boundingBoxSequence', async () => {
      const stateWithAnnotations = createDefaultState()
      stateWithAnnotations.annotations.annotations['test-video'] = [
        {
          id: 'ann-1',
          videoId: 'test-video',
          annotationType: 'type',
          personaId: 'persona-1',
          typeCategory: 'entity',
          typeId: 'test-type',
          boundingBoxSequence: {
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
          timeSpan: {
            startTime: 5.0,
            endTime: 6.0,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      const store = createTestStore(stateWithAnnotations)
      const Wrapper = createWrapper(store)

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
      const stateWithInvalidAnnotation = createDefaultState()
      stateWithInvalidAnnotation.annotations.annotations['test-video'] = [
        {
          id: 'ann-invalid',
          videoId: 'test-video',
          annotationType: 'type',
          personaId: 'persona-1',
          typeCategory: 'entity',
          typeId: 'test-type',
          // Missing boundingBoxSequence - should not crash
          timeSpan: {
            startTime: 5.0,
            endTime: 6.0,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      const store = createTestStore(stateWithInvalidAnnotation)
      const Wrapper = createWrapper(store)

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

      // Annotation should not be rendered
      const annotationElement = screen.queryByTestId('annotation-ann-invalid')
      expect(annotationElement).not.toBeInTheDocument()

      // SVG should still be present
      expect(container.querySelector('svg')).toBeInTheDocument()
    })

    it('filters annotations by selected persona in type mode', async () => {
      const stateWithMultiplePersonas = createDefaultState()
      stateWithMultiplePersonas.annotations.selectedPersonaId = 'persona-1'
      stateWithMultiplePersonas.annotations.annotations['test-video'] = [
        {
          id: 'ann-1',
          videoId: 'test-video',
          annotationType: 'type',
          personaId: 'persona-1',
          typeCategory: 'entity',
          typeId: 'test-type',
          boundingBoxSequence: {
            boxes: [{ x: 100, y: 100, width: 200, height: 200, frameNumber: 150, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [{ startFrame: 150, endFrame: 150, visible: true }],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
          timeSpan: { startTime: 5.0, endTime: 6.0 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'ann-2',
          videoId: 'test-video',
          annotationType: 'type',
          personaId: 'persona-2', // Different persona
          typeCategory: 'entity',
          typeId: 'test-type',
          boundingBoxSequence: {
            boxes: [{ x: 300, y: 300, width: 200, height: 200, frameNumber: 150, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [{ startFrame: 150, endFrame: 150, visible: true }],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0,
          },
          timeSpan: { startTime: 5.0, endTime: 6.0 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]

      const store = createTestStore(stateWithMultiplePersonas)
      const Wrapper = createWrapper(store)

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
      const store = createTestStore(createDefaultState())
      const Wrapper = createWrapper(store)

      const mockDetectionResults = {
        video_id: 'test-video',
        frames: [
          {
            frame_number: 150,
            timestamp: 5.0,
            detections: [
              {
                label: 'person',
                confidence: 0.95,
                bounding_box: {
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
