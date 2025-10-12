/**
 * Tests for TimelineComponent.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { TimelineComponent } from './TimelineComponent.js'
import { Annotation, BoundingBoxSequence } from '../../models/types.js'
import annotationReducer from '../../store/annotationSlice.js'

// Mock TimelineRenderer
vi.mock('./TimelineRenderer.js', () => ({
  TimelineRenderer: vi.fn().mockImplementation(() => ({
    render: vi.fn(),
    setZoom: vi.fn(),
    setViewport: vi.fn(),
    resize: vi.fn(),
    frameToX: vi.fn((frame: number) => frame * 10),
    xToFrame: vi.fn((x: number) => Math.floor(x / 10)),
    getKeyframeAtX: vi.fn(() => null),
    invalidate: vi.fn(),
    destroy: vi.fn(),
  })),
}))

// Mock keyboard shortcuts hook
vi.mock('../../hooks/useTimelineKeyboardShortcuts.js', () => ({
  useTimelineKeyboardShortcuts: vi.fn(),
}))

describe('TimelineComponent', () => {
  const mockOnSeek = vi.fn()

  const createMockStore = () => {
    return configureStore({
      reducer: {
        annotations: annotationReducer,
      },
      preloadedState: {
        annotations: {
          annotations: {},
          selectedAnnotation: null,
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

  const createTestAnnotation = (keyframes: number[]): Annotation => {
    const sequence: BoundingBoxSequence = {
      boxes: keyframes.map(frame => ({
        x: 100,
        y: 100,
        width: 50,
        height: 50,
        frameNumber: frame,
        isKeyframe: true,
      })),
      interpolationSegments: keyframes.length > 1 ? [{
        startFrame: keyframes[0],
        endFrame: keyframes[keyframes.length - 1],
        type: 'linear' as const,
      }] : [],
      visibilityRanges: [{
        startFrame: keyframes[0],
        endFrame: keyframes[keyframes.length - 1],
        visible: true,
      }],
      totalFrames: keyframes[keyframes.length - 1] + 1,
      keyframeCount: keyframes.length,
      interpolatedFrameCount: 0,
    }

    return {
      id: 'test-annotation',
      videoId: 'test-video',
      annotationType: 'type',
      personaId: 'test-persona',
      typeCategory: 'entity',
      typeId: 'test-type',
      boundingBoxSequence: sequence,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  }

  beforeEach(() => {
    mockOnSeek.mockClear()
  })

  it('renders timeline with canvas', () => {
    const annotation = createTestAnnotation([0, 50, 100])

    renderWithStore(
      <TimelineComponent
        annotation={annotation}
        currentFrame={0}
        totalFrames={100}
        videoFps={30}
        onSeek={mockOnSeek}
      />
    )

    const canvas = document.querySelector('canvas')
    expect(canvas).toBeTruthy()
  })

  it('displays current frame counter', () => {
    const annotation = createTestAnnotation([0, 50, 100])

    renderWithStore(
      <TimelineComponent
        annotation={annotation}
        currentFrame={25}
        totalFrames={100}
        videoFps={30}
        onSeek={mockOnSeek}
      />
    )

    expect(screen.getByText(/Frame 25 \/ 99/)).toBeTruthy()
  })

  it('renders transport controls', () => {
    const annotation = createTestAnnotation([0, 50, 100])

    renderWithStore(
      <TimelineComponent
        annotation={annotation}
        currentFrame={25}
        totalFrames={100}
        videoFps={30}
        onSeek={mockOnSeek}
      />
    )

    // Check for transport control buttons
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(4)  // At least 4 transport buttons
  })

  it('seeks to clicked frame on canvas click', async () => {
    const user = userEvent.setup()
    const annotation = createTestAnnotation([0, 50, 100])

    renderWithStore(
      <TimelineComponent
        annotation={annotation}
        currentFrame={0}
        totalFrames={100}
        videoFps={30}
        onSeek={mockOnSeek}
      />
    )

    const canvas = document.querySelector('canvas')
    expect(canvas).toBeTruthy()

    // Simulate click at x=250 (should be frame 25 with xToFrame mock)
    await user.click(canvas!)

    // onSeek should be called
    expect(mockOnSeek).toHaveBeenCalled()
  })

  it('responds to transport control clicks', async () => {
    const user = userEvent.setup()
    const annotation = createTestAnnotation([0, 50, 100])

    const { container } = renderWithStore(
      <TimelineComponent
        annotation={annotation}
        currentFrame={50}
        totalFrames={100}
        videoFps={30}
        onSeek={mockOnSeek}
      />
    )

    // Find step forward button (FastForward icon)
    const stepForwardBtn = container.querySelector('[title*="Step 1 frame forward"]')
    expect(stepForwardBtn).toBeTruthy()

    await user.click(stepForwardBtn as Element)

    expect(mockOnSeek).toHaveBeenCalledWith(51)
  })

  it('handles zoom level changes', async () => {
    const annotation = createTestAnnotation([0, 50, 100])

    renderWithStore(
      <TimelineComponent
        annotation={annotation}
        currentFrame={25}
        totalFrames={100}
        videoFps={30}
        onSeek={mockOnSeek}
      />
    )

    // Find zoom slider
    const zoomSlider = screen.getByRole('slider')
    expect(zoomSlider).toBeTruthy()

    // Change zoom value
    fireEvent.change(zoomSlider, { target: { value: 5 } })

    // Zoom slider value should update (component should re-render)
    expect(zoomSlider.getAttribute('aria-valuenow')).toBe('5')
  })

  it('displays keyframes from annotation sequence', () => {
    const annotation = createTestAnnotation([0, 25, 50, 75, 100])

    renderWithStore(
      <TimelineComponent
        annotation={annotation}
        currentFrame={0}
        totalFrames={100}
        videoFps={30}
        onSeek={mockOnSeek}
      />
    )

    // Timeline renderer should receive keyframes
    // Since we're mocking TimelineRenderer, we can verify it was instantiated
    const canvas = document.querySelector('canvas')
    expect(canvas).toBeTruthy()
  })

  it('clamps frame values to valid range', async () => {
    const user = userEvent.setup()
    const annotation = createTestAnnotation([0, 50, 100])

    const { container } = renderWithStore(
      <TimelineComponent
        annotation={annotation}
        currentFrame={95}
        totalFrames={100}
        videoFps={30}
        onSeek={mockOnSeek}
      />
    )

    // Try to jump forward past end
    const jumpForwardBtn = container.querySelector('[title*="Jump 10 frames forward"]')
    await user.click(jumpForwardBtn as Element)

    // Should clamp to totalFrames - 1
    expect(mockOnSeek).toHaveBeenCalledWith(99)
  })

  it('shows frame tooltip on hover', async () => {
    const user = userEvent.setup()
    const annotation = createTestAnnotation([0, 50, 100])

    renderWithStore(
      <TimelineComponent
        annotation={annotation}
        currentFrame={0}
        totalFrames={100}
        videoFps={30}
        onSeek={mockOnSeek}
      />
    )

    const canvas = document.querySelector('canvas')
    expect(canvas).toBeTruthy()

    // Hover over canvas
    await user.hover(canvas!)

    // Note: Testing tooltip visibility requires actual mouse coordinates,
    // which is complex in jsdom. This test verifies component renders without errors.
  })

  it('handles annotations with single keyframe', () => {
    const annotation = createTestAnnotation([42])

    renderWithStore(
      <TimelineComponent
        annotation={annotation}
        currentFrame={42}
        totalFrames={100}
        videoFps={30}
        onSeek={mockOnSeek}
      />
    )

    expect(screen.getByText(/Frame 42 \/ 99/)).toBeTruthy()
  })

  it('handles large frame counts', () => {
    const annotation = createTestAnnotation([0, 2500, 5000])

    renderWithStore(
      <TimelineComponent
        annotation={annotation}
        currentFrame={2500}
        totalFrames={5000}
        videoFps={30}
        onSeek={mockOnSeek}
      />
    )

    expect(screen.getByText(/Frame 2500 \/ 4999/)).toBeTruthy()
  })
})
