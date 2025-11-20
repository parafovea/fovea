/**
 * @module DrawingCanvas.test
 * @description Unit tests for DrawingCanvas component.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import DrawingCanvas from './DrawingCanvas'
import annotationSlice from '../../store/annotationSlice'
import type { DetectionResponse } from '../../api/client'

/**
 * Mock InteractiveBoundingBox component
 */
vi.mock('./InteractiveBoundingBox', () => ({
  default: ({ annotation, isActive, mode, onSelect }: any) => (
    <rect
      data-testid={`interactive-box-${annotation.id}`}
      data-active={isActive}
      data-mode={mode}
      onClick={onSelect}
      x={0}
      y={0}
      width={100}
      height={100}
    />
  ),
}))

/**
 * Mock useAnnotationDrawing hook
 */
vi.mock('../../hooks/annotation/useAnnotationDrawing', () => ({
  useAnnotationDrawing: () => ({
    temporaryBox: null,
    canDraw: true,
    handleMouseDown: vi.fn(),
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
  }),
}))

/**
 * Creates test Redux store
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
 * Creates wrapper with Redux Provider
 */
function createWrapper(store: ReturnType<typeof createTestStore>) {
  return ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  )
}

/**
 * Default test props
 */
const defaultProps = {
  videoId: 'test-video',
  currentTime: 5.0,
  videoWidth: 1920,
  videoHeight: 1080,
  annotations: [],
  selectedAnnotation: null,
  detectionResults: null,
  onAnnotationSelect: vi.fn(),
}

describe('DrawingCanvas', () => {
  let store: ReturnType<typeof createTestStore>

  beforeEach(() => {
    store = createTestStore({
      annotations: {
        annotations: {},
        annotationMode: 'type',
        selectedPersonaId: 'persona-1',
        drawingMode: 'entity',
        selectedTypeId: 'type-1',
        temporaryBox: null,
      },
    })
  })

  describe('SVG Rendering', () => {
    it('should render SVG element with correct viewBox', () => {
      const { container } = render(
        <DrawingCanvas {...defaultProps} />,
        { wrapper: createWrapper(store) }
      )

      const svg = container.querySelector('svg')
      expect(svg).toBeTruthy()
      expect(svg?.getAttribute('viewBox')).toBe('0 0 1920 1080')
    })

    it('should render SVG with crosshair cursor when canDraw is true', () => {
      const { container } = render(
        <DrawingCanvas {...defaultProps} />,
        { wrapper: createWrapper(store) }
      )

      const svg = container.querySelector('svg')
      expect(svg?.style.cursor).toBe('crosshair')
    })

    it('should preserve aspect ratio', () => {
      const { container } = render(
        <DrawingCanvas {...defaultProps} />,
        { wrapper: createWrapper(store) }
      )

      const svg = container.querySelector('svg')
      expect(svg?.getAttribute('preserveAspectRatio')).toBe('none')
    })
  })

  describe('Annotation Rendering', () => {
    it('should render annotations with InteractiveBoundingBox', () => {
      const annotations = [
        {
          id: 'ann-1',
          videoId: 'test-video',
          annotationType: 'type',
          boundingBoxSequence: {
            boxes: [
              { x: 100, y: 100, width: 200, height: 150, frameNumber: 150, isKeyframe: true },
            ],
            visibilityRanges: [{ startFrame: 150, endFrame: 180, visible: true }],
          },
        },
        {
          id: 'ann-2',
          videoId: 'test-video',
          annotationType: 'type',
          boundingBoxSequence: {
            boxes: [
              { x: 300, y: 200, width: 100, height: 100, frameNumber: 150, isKeyframe: true },
            ],
            visibilityRanges: [{ startFrame: 150, endFrame: 180, visible: true }],
          },
        },
      ]

      render(
        <DrawingCanvas {...defaultProps} annotations={annotations} />,
        { wrapper: createWrapper(store) }
      )

      expect(screen.getByTestId('interactive-box-ann-1')).toBeTruthy()
      expect(screen.getByTestId('interactive-box-ann-2')).toBeTruthy()
    })

    it('should not render annotations without bounding box sequence', () => {
      const annotations = [
        {
          id: 'ann-1',
          videoId: 'test-video',
          annotationType: 'type',
          boundingBoxSequence: null,
        },
      ]

      render(
        <DrawingCanvas {...defaultProps} annotations={annotations} />,
        { wrapper: createWrapper(store) }
      )

      expect(screen.queryByTestId('interactive-box-ann-1')).toBeNull()
    })

    it('should mark selected annotation as active', () => {
      const annotation = {
        id: 'ann-1',
        videoId: 'test-video',
        annotationType: 'type',
        boundingBoxSequence: {
          boxes: [
            { x: 100, y: 100, width: 200, height: 150, frameNumber: 150, isKeyframe: true },
          ],
          visibilityRanges: [{ startFrame: 150, endFrame: 180, visible: true }],
        },
      }

      render(
        <DrawingCanvas
          {...defaultProps}
          annotations={[annotation]}
          selectedAnnotation={annotation}
        />,
        { wrapper: createWrapper(store) }
      )

      const box = screen.getByTestId('interactive-box-ann-1')
      expect(box.getAttribute('data-active')).toBe('true')
    })

    it('should render keyframe mode when current frame is a keyframe', () => {
      const annotation = {
        id: 'ann-1',
        videoId: 'test-video',
        annotationType: 'type',
        boundingBoxSequence: {
          boxes: [
            { x: 100, y: 100, width: 200, height: 150, frameNumber: 150, isKeyframe: true },
          ],
          visibilityRanges: [{ startFrame: 150, endFrame: 180, visible: true }],
        },
      }

      render(
        <DrawingCanvas {...defaultProps} annotations={[annotation]} />,
        { wrapper: createWrapper(store) }
      )

      const box = screen.getByTestId('interactive-box-ann-1')
      expect(box.getAttribute('data-mode')).toBe('keyframe')
    })

    it('should render interpolated mode when current frame is not a keyframe but visible', () => {
      const annotation = {
        id: 'ann-1',
        videoId: 'test-video',
        annotationType: 'type',
        boundingBoxSequence: {
          boxes: [
            { x: 100, y: 100, width: 200, height: 150, frameNumber: 120, isKeyframe: true },
          ],
          visibilityRanges: [{ startFrame: 120, endFrame: 180, visible: true }],
        },
      }

      render(
        <DrawingCanvas {...defaultProps} currentTime={5.0} annotations={[annotation]} />,
        { wrapper: createWrapper(store) }
      )

      const box = screen.getByTestId('interactive-box-ann-1')
      expect(box.getAttribute('data-mode')).toBe('interpolated')
    })

    it('should render ghost mode when current frame is outside visibility range', () => {
      const annotation = {
        id: 'ann-1',
        videoId: 'test-video',
        annotationType: 'type',
        boundingBoxSequence: {
          boxes: [
            { x: 100, y: 100, width: 200, height: 150, frameNumber: 150, isKeyframe: true },
          ],
          visibilityRanges: [{ startFrame: 150, endFrame: 180, visible: true }],
        },
      }

      // currentTime = 10.0 -> frame 300 (30 fps), which is outside range
      render(
        <DrawingCanvas {...defaultProps} currentTime={10.0} annotations={[annotation]} />,
        { wrapper: createWrapper(store) }
      )

      const box = screen.getByTestId('interactive-box-ann-1')
      expect(box.getAttribute('data-mode')).toBe('ghost')
    })
  })

  describe('Detection Box Rendering', () => {
    it('should render detection boxes for current time', () => {
      const detectionResults: DetectionResponse = {
        query: 'person',
        frames: [
          {
            frameNumber: 150,
            timestamp: 5.0,
            detections: [
              {
                label: 'person',
                confidence: 0.95,
                boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
              },
            ],
          },
        ],
        totalDetections: 1,
        processingTime: 1.5,
      }

      const { container } = render(
        <DrawingCanvas {...defaultProps} detectionResults={detectionResults} />,
        { wrapper: createWrapper(store) }
      )

      const rects = container.querySelectorAll('rect[stroke="#ffeb3b"]')
      expect(rects.length).toBe(1)

      const rect = rects[0]
      expect(rect.getAttribute('x')).toBe(String(0.1 * 1920))
      expect(rect.getAttribute('y')).toBe(String(0.2 * 1080))
      expect(rect.getAttribute('width')).toBe(String(0.3 * 1920))
      expect(rect.getAttribute('height')).toBe(String(0.4 * 1080))
    })

    it('should render detection labels with confidence', () => {
      const detectionResults: DetectionResponse = {
        query: 'car',
        frames: [
          {
            frameNumber: 150,
            timestamp: 5.0,
            detections: [
              {
                label: 'car',
                confidence: 0.87,
                boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
              },
            ],
          },
        ],
        totalDetections: 1,
        processingTime: 1.5,
      }

      const { container } = render(
        <DrawingCanvas {...defaultProps} detectionResults={detectionResults} />,
        { wrapper: createWrapper(store) }
      )

      const text = container.querySelector('text[fill="#ffeb3b"]')
      expect(text?.textContent).toBe('car (87%)')
    })

    it('should not render detection boxes for different time', () => {
      const detectionResults: DetectionResponse = {
        query: 'person',
        frames: [
          {
            frameNumber: 300,
            timestamp: 10.0, // Different time
            detections: [
              {
                label: 'person',
                confidence: 0.95,
                boundingBox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
              },
            ],
          },
        ],
        totalDetections: 1,
        processingTime: 1.5,
      }

      const { container } = render(
        <DrawingCanvas {...defaultProps} currentTime={5.0} detectionResults={detectionResults} />,
        { wrapper: createWrapper(store) }
      )

      const rects = container.querySelectorAll('rect[stroke="#ffeb3b"]')
      expect(rects.length).toBe(0)
    })
  })

  describe('Temporary Box Rendering', () => {
    it('should not render temporary box when null', () => {
      const { container } = render(
        <DrawingCanvas {...defaultProps} />,
        { wrapper: createWrapper(store) }
      )

      const tempBox = container.querySelector('rect[stroke="#f50057"]')
      expect(tempBox).toBeNull()
    })

    // Note: Testing temporary box rendering requires integration with the hook
    // which gets the temporaryBox from Redux state. The hook is mocked at the
    // module level, so we can't easily test this in isolation. This is covered
    // by integration tests instead.
  })

  describe('Event Handling', () => {
    it('should call onAnnotationSelect when annotation is clicked', () => {
      const onAnnotationSelect = vi.fn()
      const annotation = {
        id: 'ann-1',
        videoId: 'test-video',
        annotationType: 'type',
        boundingBoxSequence: {
          boxes: [
            { x: 100, y: 100, width: 200, height: 150, frameNumber: 150, isKeyframe: true },
          ],
          visibilityRanges: [{ startFrame: 150, endFrame: 180, visible: true }],
        },
      }

      render(
        <DrawingCanvas
          {...defaultProps}
          annotations={[annotation]}
          onAnnotationSelect={onAnnotationSelect}
        />,
        { wrapper: createWrapper(store) }
      )

      const box = screen.getByTestId('interactive-box-ann-1')
      fireEvent.click(box)

      expect(onAnnotationSelect).toHaveBeenCalledWith(annotation)
    })
  })
})
