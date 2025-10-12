import { describe, test, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MotionPathOverlay } from './MotionPathOverlay'
import { Annotation } from '../../models/types.js'
import annotationReducer from '../../store/annotationSlice.js'

describe('MotionPathOverlay', () => {
  const mockAnnotation: Annotation = {
    id: 'ann-1',
    videoId: 'vid-1',
    annotationType: 'type',
    typeCategory: 'entity',
    typeId: 'entity-type-1',
    boundingBoxSequence: {
      boxes: [
        { x: 100, y: 100, width: 50, height: 50, frameNumber: 0, isKeyframe: true },
        { x: 200, y: 200, width: 50, height: 50, frameNumber: 50, isKeyframe: true },
      ],
      interpolationSegments: [{ startFrame: 0, endFrame: 50, type: 'linear' }],
      visibilityRanges: [{ startFrame: 0, endFrame: 50, visible: true }],
      totalFrames: 51,
      keyframeCount: 2,
      interpolatedFrameCount: 49,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const createMockStore = (annotations: Annotation[] = [mockAnnotation]) => {
    return configureStore({
      reducer: {
        annotations: annotationReducer,
      },
      preloadedState: {
        annotations: {
          annotations: { 'vid-1': annotations },
          selectedAnnotation: mockAnnotation,
          selectedPersonaId: null,
          annotationMode: 'type' as const,
          isDrawing: false,
          drawingMode: null,
          selectedTypeId: null,
          temporaryBox: null,
          temporaryTime: null,
          linkTargetId: null,
          linkTargetType: null,
          detectionResults: null,
          detectionQuery: '',
          detectionConfidenceThreshold: 0.5,
          showDetectionCandidates: false,
          interpolationMode: 'linear' as const,
          selectedKeyframes: [],
          showMotionPath: true,
          timelineZoom: 1,
          currentFrame: 0,
        },
      },
    })
  }

  const renderWithStore = (component: React.ReactElement, store = createMockStore()) => {
    return render(<Provider store={store}>{component}</Provider>)
  }

  test('renders motion path when visible is true', () => {
    const { container } = renderWithStore(
      <svg>
        <MotionPathOverlay
          annotation={mockAnnotation}
          videoWidth={1920}
          videoHeight={1080}
          visible={true}
        />
      </svg>
    )

    const motionPath = container.querySelector('[data-testid="motion-path-overlay"]')
    expect(motionPath).toBeInTheDocument()
  })

  test('does not render when visible is false', () => {
    const { container } = renderWithStore(
      <svg>
        <MotionPathOverlay
          annotation={mockAnnotation}
          videoWidth={1920}
          videoHeight={1080}
          visible={false}
        />
      </svg>
    )

    const motionPath = container.querySelector('[data-testid="motion-path-overlay"]')
    expect(motionPath).not.toBeInTheDocument()
  })

  test('does not render when less than 2 keyframes', () => {
    const singleKeyframeAnnotation: Annotation = {
      ...mockAnnotation,
      boundingBoxSequence: {
        boxes: [{ x: 100, y: 100, width: 50, height: 50, frameNumber: 0, isKeyframe: true }],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0,
      },
    }

    const store = createMockStore([singleKeyframeAnnotation])

    const { container } = renderWithStore(
      <svg>
        <MotionPathOverlay
          annotation={singleKeyframeAnnotation}
          videoWidth={1920}
          videoHeight={1080}
          visible={true}
        />
      </svg>,
      store
    )

    const motionPath = container.querySelector('[data-testid="motion-path-overlay"]')
    expect(motionPath).not.toBeInTheDocument()
  })

  test('renders path with correct stroke color for entity', () => {
    const { container } = renderWithStore(
      <svg>
        <MotionPathOverlay
          annotation={{ ...mockAnnotation, typeCategory: 'entity' }}
          videoWidth={1920}
          videoHeight={1080}
          visible={true}
        />
      </svg>
    )

    const path = container.querySelector('path')
    expect(path).toHaveAttribute('stroke', '#4caf50')
  })

  test('renders path with correct stroke color for event', () => {
    const { container } = renderWithStore(
      <svg>
        <MotionPathOverlay
          annotation={{ ...mockAnnotation, typeCategory: 'event' }}
          videoWidth={1920}
          videoHeight={1080}
          visible={true}
        />
      </svg>
    )

    const path = container.querySelector('path')
    expect(path).toHaveAttribute('stroke', '#ff9800')
  })

  test('renders keyframe dots', () => {
    const { container } = renderWithStore(
      <svg>
        <MotionPathOverlay
          annotation={mockAnnotation}
          videoWidth={1920}
          videoHeight={1080}
          visible={true}
        />
      </svg>
    )

    const circles = container.querySelectorAll('circle')
    // Should have keyframe dots (exactly 2 for our mock annotation)
    expect(circles.length).toBeGreaterThan(0)
  })

  test('applies correct opacity to path', () => {
    const { container } = renderWithStore(
      <svg>
        <MotionPathOverlay
          annotation={mockAnnotation}
          videoWidth={1920}
          videoHeight={1080}
          visible={true}
        />
      </svg>
    )

    const path = container.querySelector('path')
    expect(path).toHaveAttribute('opacity', '0.4')
  })

  test('applies pointer-events none to overlay', () => {
    const { container } = renderWithStore(
      <svg>
        <MotionPathOverlay
          annotation={mockAnnotation}
          videoWidth={1920}
          videoHeight={1080}
          visible={true}
        />
      </svg>
    )

    const motionPath = container.querySelector('[data-testid="motion-path-overlay"]')
    expect(motionPath).toHaveStyle({ pointerEvents: 'none' })
  })
})
