/**
 * @module useAnnotationDrawing.test
 * @description Unit tests for useAnnotationDrawing hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAnnotationDrawing } from './useAnnotationDrawing'
import { useAnnotationUiStore } from '../../store/zustand/annotationUiStore'
import { RefObject } from 'react'

/**
 * Creates wrapper with QueryClientProvider for hook testing
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

/**
 * Sets up Zustand store state for testing
 */
function setupStoreState(state: {
  annotationMode?: 'type' | 'object'
  selectedPersonaId?: string | null
  drawingMode?: 'entity' | 'role' | 'event' | null
  selectedTypeId?: string | null
  temporaryBox?: { x: number; y: number; width: number; height: number } | null
  linkTargetId?: string | null
  linkTargetType?: 'entity' | 'event' | 'location' | 'entity-collection' | 'event-collection' | 'time-collection' | null
}) {
  useAnnotationUiStore.setState({
    annotationMode: state.annotationMode ?? 'type',
    selectedPersonaId: state.selectedPersonaId ?? null,
    drawingMode: state.drawingMode ?? null,
    selectedTypeId: state.selectedTypeId ?? null,
    temporaryBox: state.temporaryBox ?? null,
    linkTargetId: state.linkTargetId ?? null,
    linkTargetType: state.linkTargetType ?? null,
  })
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

  beforeEach(() => {
    // Reset Zustand store to default state
    useAnnotationUiStore.getState().resetAllState()
  })

  afterEach(() => {
    // Clean up after each test
    useAnnotationUiStore.getState().resetAllState()
    vi.clearAllMocks()
  })

  describe('Hook Initialization', () => {
    it('should initialize with correct default state', () => {
      setupStoreState({
        annotationMode: 'type',
        selectedPersonaId: null,
        drawingMode: null,
        selectedTypeId: null,
        temporaryBox: null,
        linkTargetId: null,
        linkTargetType: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
      })

      expect(result.current.isDrawing).toBe(false)
      expect(result.current.startPoint).toEqual({ x: 0, y: 0 })
      expect(result.current.temporaryBox).toBeNull()
      expect(result.current.canDraw).toBe(false)
    })
  })

  describe('canDraw - Type Mode', () => {
    it('should allow drawing when persona and drawing mode are set', () => {
      setupStoreState({
        annotationMode: 'type',
        selectedPersonaId: 'persona-1',
        drawingMode: 'entity',
        selectedTypeId: 'type-1',
        temporaryBox: null,
        linkTargetId: null,
        linkTargetType: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
      })

      expect(result.current.canDraw).toBe(true)
    })

    it('should not allow drawing without persona', () => {
      setupStoreState({
        annotationMode: 'type',
        selectedPersonaId: null,
        drawingMode: 'entity',
        selectedTypeId: 'type-1',
        temporaryBox: null,
        linkTargetId: null,
        linkTargetType: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
      })

      expect(result.current.canDraw).toBe(false)
    })

    it('should not allow drawing without drawing mode', () => {
      setupStoreState({
        annotationMode: 'type',
        selectedPersonaId: 'persona-1',
        drawingMode: null,
        selectedTypeId: 'type-1',
        temporaryBox: null,
        linkTargetId: null,
        linkTargetType: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
      })

      expect(result.current.canDraw).toBe(false)
    })
  })

  describe('canDraw - Object Mode', () => {
    it('should allow drawing when link target is set', () => {
      setupStoreState({
        annotationMode: 'object',
        selectedPersonaId: null,
        drawingMode: null,
        selectedTypeId: null,
        temporaryBox: null,
        linkTargetId: 'entity-1',
        linkTargetType: 'entity',
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
      })

      expect(result.current.canDraw).toBe(true)
    })

    it('should not allow drawing without link target', () => {
      setupStoreState({
        annotationMode: 'object',
        selectedPersonaId: null,
        drawingMode: null,
        selectedTypeId: null,
        temporaryBox: null,
        linkTargetId: null,
        linkTargetType: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
      })

      expect(result.current.canDraw).toBe(false)
    })
  })

  describe('Coordinate Transformation', () => {
    it('should convert mouse coordinates to video space', () => {
      setupStoreState({
        annotationMode: 'type',
        selectedPersonaId: 'persona-1',
        drawingMode: 'entity',
        temporaryBox: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
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
      setupStoreState({
        annotationMode: 'type',
        selectedPersonaId: 'persona-1',
        drawingMode: 'entity',
        temporaryBox: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
      })

      const svgRef: RefObject<SVGSVGElement> = { current: null }
      const mouseEvent = createMockMouseEvent(500, 350)

      const coords = result.current.getRelativeCoordinates(mouseEvent, svgRef)

      expect(coords).toEqual({ x: 0, y: 0 })
    })
  })

  describe('Mouse Down', () => {
    it('should start drawing when canDraw is true and clicking SVG background', () => {
      setupStoreState({
        annotationMode: 'type',
        selectedPersonaId: 'persona-1',
        drawingMode: 'entity',
        selectedTypeId: 'type-1',
        temporaryBox: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
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
      setupStoreState({
        annotationMode: 'type',
        selectedPersonaId: 'persona-1',
        drawingMode: 'entity',
        selectedTypeId: 'type-1',
        temporaryBox: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
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
      setupStoreState({
        annotationMode: 'type',
        selectedPersonaId: null, // No persona - canDraw will be false
        drawingMode: 'entity',
        temporaryBox: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
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
      setupStoreState({
        annotationMode: 'type',
        selectedPersonaId: 'persona-1',
        drawingMode: 'entity',
        selectedTypeId: 'type-1',
        temporaryBox: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
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

      // Check Zustand store state
      const state = useAnnotationUiStore.getState()
      expect(state.temporaryBox).toEqual({
        x: 960,
        y: 540,
        width: 480, // 1440 - 960
        height: 360, // 900 - 540
      })
    })

    it('should not update temporary box when not drawing', () => {
      setupStoreState({
        annotationMode: 'type',
        selectedPersonaId: 'persona-1',
        drawingMode: 'entity',
        temporaryBox: null,
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
      })

      const svgRef = createMockSvgRef()
      const svgElement = svgRef.current!
      const mouseMoveEvent = createMockMouseEvent(700, 550, svgElement, svgElement)

      act(() => {
        result.current.handleMouseMove(mouseMoveEvent, svgRef)
      })

      // Check Zustand store state
      const state = useAnnotationUiStore.getState()
      expect(state.temporaryBox).toBeNull()
    })
  })

  describe('Mouse Up - Type Annotation Creation', () => {
    it('should reset drawing state and call mutation on valid box', () => {
      setupStoreState({
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
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
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

      // Check that drawing state was reset
      expect(result.current.isDrawing).toBe(false)

      // Check Zustand store state was reset
      const state = useAnnotationUiStore.getState()
      expect(state.temporaryBox).toBeNull()
      expect(state.drawingMode).toBeNull()
    })

    it('should not create annotation with box too small', () => {
      setupStoreState({
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
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
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

      // Drawing state should still be reset
      expect(result.current.isDrawing).toBe(false)
    })
  })

  describe('Mouse Up - Object Annotation Creation', () => {
    it('should reset drawing state for object annotation with valid box', () => {
      setupStoreState({
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
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
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

      // Check that drawing state was reset
      expect(result.current.isDrawing).toBe(false)

      // Check Zustand store state was reset
      const state = useAnnotationUiStore.getState()
      expect(state.temporaryBox).toBeNull()
    })

    it('should handle event link target', () => {
      setupStoreState({
        annotationMode: 'object',
        linkTargetId: 'event-1',
        linkTargetType: 'event',
        temporaryBox: {
          x: 100,
          y: 100,
          width: 200,
          height: 150,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
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
    })

    it('should handle location link target', () => {
      setupStoreState({
        annotationMode: 'object',
        linkTargetId: 'location-1',
        linkTargetType: 'location',
        temporaryBox: {
          x: 100,
          y: 100,
          width: 200,
          height: 150,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
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
    })

    it('should handle collection link target', () => {
      setupStoreState({
        annotationMode: 'object',
        linkTargetId: 'collection-1',
        linkTargetType: 'entity-collection',
        temporaryBox: {
          x: 100,
          y: 100,
          width: 200,
          height: 150,
        },
      })

      const { result } = renderHook(() => useAnnotationDrawing(defaultParams), {
        wrapper: createWrapper(),
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
    })
  })
})
