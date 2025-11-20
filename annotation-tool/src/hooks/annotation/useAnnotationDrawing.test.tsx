/**
 * @module useAnnotationDrawing.test
 * @description Unit tests for useAnnotationDrawing hook.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { useAnnotationDrawing } from './useAnnotationDrawing'
import annotationSlice from '../../store/annotationSlice'
import { RefObject } from 'react'

/**
 * Mock generateId to return predictable IDs for testing
 */
vi.mock('../../utils/uuid', () => ({
  generateId: vi.fn(() => 'test-annotation-id'),
}))

/**
 * Creates test Redux store with annotation slice
 */
function createTestStore(initialState = {}) {
  return configureStore({
    reducer: {
      annotations: annotationSlice,
    },
    preloadedState: initialState,
  })
}

/**
 * Creates wrapper with Redux Provider for hook testing
 */
function createWrapper(store: ReturnType<typeof createTestStore>) {
  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
}

/**
 * Creates mock SVG element with getBoundingClientRect
 */
function createMockSvgRef(width = 800, height = 600): RefObject<SVGSVGElement> {
  const mockElement = {
    getBoundingClientRect: vi.fn(() => ({
      left: 100,
      top: 50,
      width,
      height,
      right: 100 + width,
      bottom: 50 + height,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    })),
  } as unknown as SVGSVGElement

  return { current: mockElement }
}

/**
 * Creates mock mouse event
 */
function createMockMouseEvent(
  clientX: number,
  clientY: number,
  target?: EventTarget,
  currentTarget?: EventTarget
): React.MouseEvent<SVGSVGElement> {
  const mockEvent = {
    clientX,
    clientY,
    target: target || currentTarget,
    currentTarget: currentTarget || { tagName: 'svg' },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent<SVGSVGElement>

  return mockEvent
}

describe('useAnnotationDrawing', () => {
  const defaultParams = {
    videoId: 'test-video',
    currentTime: 5.0,
    videoWidth: 1920,
    videoHeight: 1080,
  }

  describe('Hook Initialization', () => {
    it('should initialize with correct default state', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: null,
          drawingMode: null,
          selectedTypeId: null,
          temporaryBox: null,
          linkTargetId: null,
          linkTargetType: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      expect(result.current.isDrawing).toBe(false)
      expect(result.current.startPoint).toEqual({ x: 0, y: 0 })
      expect(result.current.temporaryBox).toBeNull()
      expect(result.current.canDraw).toBe(false)
    })
  })

  describe('canDraw - Type Mode', () => {
    it('should allow drawing when persona and drawing mode are set', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: 'persona-1',
          drawingMode: 'entity',
          selectedTypeId: 'type-1',
          temporaryBox: null,
          linkTargetId: null,
          linkTargetType: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      expect(result.current.canDraw).toBe(true)
    })

    it('should not allow drawing without persona', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: null,
          drawingMode: 'entity',
          selectedTypeId: 'type-1',
          temporaryBox: null,
          linkTargetId: null,
          linkTargetType: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      expect(result.current.canDraw).toBe(false)
    })

    it('should not allow drawing without drawing mode', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: 'persona-1',
          drawingMode: null,
          selectedTypeId: 'type-1',
          temporaryBox: null,
          linkTargetId: null,
          linkTargetType: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      expect(result.current.canDraw).toBe(false)
    })
  })

  describe('canDraw - Object Mode', () => {
    it('should allow drawing when link target is set', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'object',
          selectedPersonaId: null,
          drawingMode: null,
          selectedTypeId: null,
          temporaryBox: null,
          linkTargetId: 'entity-1',
          linkTargetType: 'entity',
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      expect(result.current.canDraw).toBe(true)
    })

    it('should not allow drawing without link target', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'object',
          selectedPersonaId: null,
          drawingMode: null,
          selectedTypeId: null,
          temporaryBox: null,
          linkTargetId: null,
          linkTargetType: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      expect(result.current.canDraw).toBe(false)
    })
  })

  describe('Coordinate Transformation', () => {
    it('should convert mouse coordinates to video space', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: 'persona-1',
          drawingMode: 'entity',
          temporaryBox: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef(800, 600)
      const mouseEvent = createMockMouseEvent(500, 350)

      const coords = result.current.getRelativeCoordinates(mouseEvent, svgRef)

      // mouseX = 500, svg left = 100, svg width = 800
      // relative X = (500 - 100) / 800 = 0.5
      // video X = 0.5 * 1920 = 960
      expect(coords.x).toBe(960)

      // mouseY = 350, svg top = 50, svg height = 600
      // relative Y = (350 - 50) / 600 = 0.5
      // video Y = 0.5 * 1080 = 540
      expect(coords.y).toBe(540)
    })

    it('should return (0, 0) when svgRef is null', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: 'persona-1',
          drawingMode: 'entity',
          temporaryBox: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef: RefObject<SVGSVGElement> = { current: null }
      const mouseEvent = createMockMouseEvent(500, 350)

      const coords = result.current.getRelativeCoordinates(mouseEvent, svgRef)

      expect(coords).toEqual({ x: 0, y: 0 })
    })
  })

  describe('Mouse Down', () => {
    it('should start drawing when canDraw is true and clicking SVG background', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: 'persona-1',
          drawingMode: 'entity',
          selectedTypeId: 'type-1',
          temporaryBox: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!
      const mouseEvent = createMockMouseEvent(500, 350, svgElement, svgElement)

      act(() => {
        result.current.handleMouseDown(mouseEvent, svgRef)
      })

      expect(result.current.isDrawing).toBe(true)
      expect(result.current.startPoint.x).toBe(960)
      expect(result.current.startPoint.y).toBe(540)
    })

    it('should not start drawing when clicking on annotation (not SVG background)', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: 'persona-1',
          drawingMode: 'entity',
          selectedTypeId: 'type-1',
          temporaryBox: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!
      const annotationRect = document.createElement('rect')
      const mouseEvent = createMockMouseEvent(500, 350, annotationRect, svgElement)

      act(() => {
        result.current.handleMouseDown(mouseEvent, svgRef)
      })

      expect(result.current.isDrawing).toBe(false)
    })

    it('should not start drawing when canDraw is false', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: null, // No persona - canDraw will be false
          drawingMode: 'entity',
          temporaryBox: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!
      const mouseEvent = createMockMouseEvent(500, 350, svgElement, svgElement)

      act(() => {
        result.current.handleMouseDown(mouseEvent, svgRef)
      })

      expect(result.current.isDrawing).toBe(false)
    })
  })

  describe('Mouse Move', () => {
    it('should update temporary box while drawing', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: 'persona-1',
          drawingMode: 'entity',
          selectedTypeId: 'type-1',
          temporaryBox: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!

      // Start drawing at (500, 350) -> video coords (960, 540)
      const mouseDownEvent = createMockMouseEvent(500, 350, svgElement, svgElement)
      act(() => {
        result.current.handleMouseDown(mouseDownEvent, svgRef)
      })

      // Move to (700, 550) -> video coords (1440, 900)
      const mouseMoveEvent = createMockMouseEvent(700, 550, svgElement, svgElement)
      act(() => {
        result.current.handleMouseMove(mouseMoveEvent, svgRef)
      })

      const state = store.getState()
      expect(state.annotations.temporaryBox).toEqual({
        x: 960,
        y: 540,
        width: 480, // 1440 - 960
        height: 360, // 900 - 540
      })
    })

    it('should not update temporary box when not drawing', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: 'persona-1',
          drawingMode: 'entity',
          temporaryBox: null,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!
      const mouseMoveEvent = createMockMouseEvent(700, 550, svgElement, svgElement)

      act(() => {
        result.current.handleMouseMove(mouseMoveEvent, svgRef)
      })

      const state = store.getState()
      expect(state.annotations.temporaryBox).toBeNull()
    })
  })

  describe('Mouse Up - Type Annotation Creation', () => {
    it('should create type annotation with valid box size', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: 'persona-1',
          drawingMode: 'entity',
          selectedTypeId: 'type-1',
          temporaryBox: {
            x: 100,
            y: 100,
            width: 200,
            height: 150,
          },
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!

      // Start drawing
      const mouseDownEvent = createMockMouseEvent(500, 350, svgElement, svgElement)
      act(() => {
        result.current.handleMouseDown(mouseDownEvent, svgRef)
      })

      // Complete drawing
      act(() => {
        result.current.handleMouseUp()
      })

      const state = store.getState()
      const annotations = state.annotations.annotations['test-video']

      expect(annotations).toHaveLength(1)
      expect(annotations[0]).toMatchObject({
        id: 'test-annotation-id',
        videoId: 'test-video',
        annotationType: 'type',
        personaId: 'persona-1',
        typeCategory: 'entity',
        typeId: 'type-1',
      })
      expect(annotations[0].boundingBoxSequence.boxes).toHaveLength(1)
      expect(annotations[0].boundingBoxSequence.boxes[0].isKeyframe).toBe(true)
      expect(result.current.isDrawing).toBe(false)
    })

    it('should not create annotation with box too small', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: 'persona-1',
          drawingMode: 'entity',
          selectedTypeId: 'type-1',
          temporaryBox: {
            x: 100,
            y: 100,
            width: 3, // Too small
            height: 3, // Too small
          },
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!

      const mouseDownEvent = createMockMouseEvent(500, 350, svgElement, svgElement)
      act(() => {
        result.current.handleMouseDown(mouseDownEvent, svgRef)
      })

      act(() => {
        result.current.handleMouseUp()
      })

      const state = store.getState()
      expect(state.annotations.annotations['test-video']).toBeUndefined()
      expect(result.current.isDrawing).toBe(false)
    })
  })

  describe('Mouse Up - Object Annotation Creation', () => {
    it('should create object annotation linked to entity', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'object',
          selectedPersonaId: null,
          drawingMode: null,
          linkTargetId: 'entity-1',
          linkTargetType: 'entity',
          temporaryBox: {
            x: 100,
            y: 100,
            width: 200,
            height: 150,
          },
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!

      const mouseDownEvent = createMockMouseEvent(500, 350, svgElement, svgElement)
      act(() => {
        result.current.handleMouseDown(mouseDownEvent, svgRef)
      })

      act(() => {
        result.current.handleMouseUp()
      })

      const state = store.getState()
      const annotations = state.annotations.annotations['test-video']

      expect(annotations).toHaveLength(1)
      expect(annotations[0]).toMatchObject({
        videoId: 'test-video',
        annotationType: 'object',
        linkedEntityId: 'entity-1',
      })
    })

    it('should create object annotation linked to event', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'object',
          linkTargetId: 'event-1',
          linkTargetType: 'event',
          temporaryBox: {
            x: 100,
            y: 100,
            width: 200,
            height: 150,
          },
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!

      const mouseDownEvent = createMockMouseEvent(500, 350, svgElement, svgElement)
      act(() => {
        result.current.handleMouseDown(mouseDownEvent, svgRef)
      })

      act(() => {
        result.current.handleMouseUp()
      })

      const state = store.getState()
      const annotations = state.annotations.annotations['test-video']

      expect(annotations[0]).toMatchObject({
        linkedEventId: 'event-1',
      })
    })

    it('should create object annotation linked to collection', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'object',
          linkTargetId: 'collection-1',
          linkTargetType: 'entity-collection',
          temporaryBox: {
            x: 100,
            y: 100,
            width: 200,
            height: 150,
          },
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!

      const mouseDownEvent = createMockMouseEvent(500, 350, svgElement, svgElement)
      act(() => {
        result.current.handleMouseDown(mouseDownEvent, svgRef)
      })

      act(() => {
        result.current.handleMouseUp()
      })

      const state = store.getState()
      const annotations = state.annotations.annotations['test-video']

      expect(annotations[0]).toMatchObject({
        linkedCollectionId: 'collection-1',
        linkedCollectionType: 'entity',
      })
    })
  })

  describe('Drawing State Cleanup', () => {
    it('should clear drawing state after successful annotation creation', () => {
      const store = createTestStore({
        annotations: {
          annotations: {},
          annotationMode: 'type',
          selectedPersonaId: 'persona-1',
          drawingMode: 'entity',
          selectedTypeId: 'type-1',
          temporaryBox: {
            x: 100,
            y: 100,
            width: 200,
            height: 150,
          },
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(store),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!

      const mouseDownEvent = createMockMouseEvent(500, 350, svgElement, svgElement)
      act(() => {
        result.current.handleMouseDown(mouseDownEvent, svgRef)
      })

      act(() => {
        result.current.handleMouseUp()
      })

      expect(result.current.isDrawing).toBe(false)
      const state = store.getState()
      expect(state.annotations.temporaryBox).toBeNull()
    })
  })
})
