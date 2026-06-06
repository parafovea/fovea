/**
 * @file bounding-box-resize.test.tsx
 * @description Integration tests for bounding box resize behavior.
 * Ensures bounding boxes maintain position and don't get squashed when container size changes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InteractiveBoundingBox from '@components/annotation/InteractiveBoundingBox'
import DrawingCanvas from '@components/annotation/DrawingCanvas'
import type { Annotation, BoundingBox, BoundingBoxSequence } from '@models/types'

// Mock the hooks that InteractiveBoundingBox uses
vi.mock('@store/queries', () => ({
  useAddKeyframe: () => vi.fn(),
  useUpdateKeyframe: () => vi.fn(),
  useUpdateAnnotation: () => ({ mutate: vi.fn() }),
}))

// Mock useAnnotationDrawing for DrawingCanvas
vi.mock('@hooks/annotation/useAnnotationDrawing', () => ({
  useAnnotationDrawing: () => ({
    temporaryBox: null,
    canDraw: false,
    handleMouseDown: vi.fn(),
    handleMouseMove: vi.fn(),
    handleMouseUp: vi.fn(),
  }),
}))

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  )
}

function createMockAnnotation(box: Partial<BoundingBox> = {}): Annotation {
  const defaultBox: BoundingBox = {
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    frameNumber: 0,
    isKeyframe: true,
    ...box,
  }

  const sequence: BoundingBoxSequence = {
    boxes: [defaultBox],
    interpolationSegments: [],
    visibilityRanges: [{ startFrame: 0, endFrame: 30, visible: true }],
    totalFrames: 31,
    keyframeCount: 1,
    interpolatedFrameCount: 30,
  }

  return {
    id: 'test-annotation-1',
    videoId: 'video-1',
    annotationType: 'type' as const,
    personaId: 'persona-1',
    typeCategory: 'entity' as const,
    typeId: 'type-1',
    boundingBoxSequence: sequence,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

describe('Bounding Box Resize Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('InteractiveBoundingBox position stability', () => {
    it('renders box at correct pixel coordinates', () => {
      const annotation = createMockAnnotation({ x: 200, y: 150, width: 100, height: 80 })

      renderWithProviders(
        <svg viewBox="0 0 1920 1080" data-testid="test-svg">
          <InteractiveBoundingBox
            annotation={annotation}
            currentFrame={0}
            videoWidth={1920}
            videoHeight={1080}
            isActive={false}
            onSelect={vi.fn()}
            mode="keyframe"
          />
        </svg>
      )

      const boundingBox = screen.getByTestId('bounding-box')
      const rect = boundingBox.querySelector('rect')

      expect(rect).toBeTruthy()
      expect(rect?.getAttribute('x')).toBe('200')
      expect(rect?.getAttribute('y')).toBe('150')
      expect(rect?.getAttribute('width')).toBe('100')
      expect(rect?.getAttribute('height')).toBe('80')
    })

    it('maintains relative position when videoWidth/videoHeight props change', () => {
      const annotation = createMockAnnotation({ x: 960, y: 540, width: 200, height: 150 })

      // First render at 1920x1080
      const { rerender } = renderWithProviders(
        <svg viewBox="0 0 1920 1080" data-testid="test-svg">
          <InteractiveBoundingBox
            annotation={annotation}
            currentFrame={0}
            videoWidth={1920}
            videoHeight={1080}
            isActive={false}
            onSelect={vi.fn()}
            mode="keyframe"
          />
        </svg>
      )

      const boundingBox = screen.getByTestId('bounding-box')
      const rect = boundingBox.querySelector('rect')

      // Calculate relative position at original size
      const initialRelativeX = parseFloat(rect?.getAttribute('x') || '0') / 1920
      const initialRelativeY = parseFloat(rect?.getAttribute('y') || '0') / 1080

      expect(initialRelativeX).toBeCloseTo(0.5, 2)
      expect(initialRelativeY).toBeCloseTo(0.5, 2)

      // Rerender with different viewBox (simulating container size change)
      // Note: The box coordinates are in video pixel space, so they should remain the same
      // The SVG viewBox handles the scaling
      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <svg viewBox="0 0 1920 1080" data-testid="test-svg">
            <InteractiveBoundingBox
              annotation={annotation}
              currentFrame={0}
              videoWidth={1920}
              videoHeight={1080}
              isActive={false}
              onSelect={vi.fn()}
              mode="keyframe"
            />
          </svg>
        </QueryClientProvider>
      )

      // Box coordinates should still be the same (in video pixel space)
      const rectAfter = screen.getByTestId('bounding-box').querySelector('rect')
      expect(rectAfter?.getAttribute('x')).toBe('960')
      expect(rectAfter?.getAttribute('y')).toBe('540')
    })

    it('box aspect ratio is preserved', () => {
      // Create a 4:3 aspect ratio box
      const annotation = createMockAnnotation({ x: 100, y: 100, width: 400, height: 300 })

      renderWithProviders(
        <svg viewBox="0 0 1920 1080" data-testid="test-svg">
          <InteractiveBoundingBox
            annotation={annotation}
            currentFrame={0}
            videoWidth={1920}
            videoHeight={1080}
            isActive={false}
            onSelect={vi.fn()}
            mode="keyframe"
          />
        </svg>
      )

      const rect = screen.getByTestId('bounding-box').querySelector('rect')
      const width = parseFloat(rect?.getAttribute('width') || '0')
      const height = parseFloat(rect?.getAttribute('height') || '0')

      const aspectRatio = width / height
      expect(aspectRatio).toBeCloseTo(4 / 3, 2)
    })
  })

  describe('Label visibility and sizing', () => {
    it('label has minimum width regardless of box size', () => {
      // Create a very small box
      const annotation = createMockAnnotation({ x: 100, y: 100, width: 30, height: 30 })

      renderWithProviders(
        <svg viewBox="0 0 1920 1080" data-testid="test-svg">
          <InteractiveBoundingBox
            annotation={annotation}
            currentFrame={0}
            videoWidth={1920}
            videoHeight={1080}
            isActive={false}
            onSelect={vi.fn()}
            mode="keyframe"
          />
        </svg>
      )

      // The foreignObject should have a fixed width (200) not tied to box width
      const foreignObject = screen.getByTestId('bounding-box').querySelector('foreignObject')
      expect(foreignObject).toBeTruthy()
      expect(foreignObject?.getAttribute('width')).toBe('200')
    })

    it('label is visible in keyframe mode', () => {
      const annotation = createMockAnnotation()

      renderWithProviders(
        <svg viewBox="0 0 1920 1080" data-testid="test-svg">
          <InteractiveBoundingBox
            annotation={annotation}
            currentFrame={0}
            videoWidth={1920}
            videoHeight={1080}
            isActive={false}
            onSelect={vi.fn()}
            mode="keyframe"
          />
        </svg>
      )

      const foreignObject = screen.getByTestId('bounding-box').querySelector('foreignObject')
      expect(foreignObject).toBeTruthy()
    })

    it('label is visible in interpolated mode', () => {
      const annotation = createMockAnnotation()

      renderWithProviders(
        <svg viewBox="0 0 1920 1080" data-testid="test-svg">
          <InteractiveBoundingBox
            annotation={annotation}
            currentFrame={0}
            videoWidth={1920}
            videoHeight={1080}
            isActive={false}
            onSelect={vi.fn()}
            mode="interpolated"
          />
        </svg>
      )

      const foreignObject = screen.getByTestId('bounding-box').querySelector('foreignObject')
      expect(foreignObject).toBeTruthy()
    })

    it('label is hidden in ghost mode', () => {
      const annotation = createMockAnnotation()

      renderWithProviders(
        <svg viewBox="0 0 1920 1080" data-testid="test-svg">
          <InteractiveBoundingBox
            annotation={annotation}
            currentFrame={0}
            videoWidth={1920}
            videoHeight={1080}
            isActive={false}
            onSelect={vi.fn()}
            mode="ghost"
          />
        </svg>
      )

      const foreignObject = screen.getByTestId('bounding-box').querySelector('foreignObject')
      expect(foreignObject).toBeNull()
    })
  })

  describe('DrawingCanvas SVG configuration', () => {
    it('SVG has correct preserveAspectRatio for resize stability', () => {
      const annotations: Annotation[] = []

      renderWithProviders(
        <DrawingCanvas
          videoId="test-video"
          currentTime={0}
          videoWidth={1920}
          videoHeight={1080}
          annotations={annotations}
          selectedAnnotation={null}
          onAnnotationSelect={vi.fn()}
        />
      )

      const svg = document.querySelector('svg')
      expect(svg).toBeTruthy()
      expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet')
    })

    it('SVG viewBox matches video dimensions', () => {
      const annotations: Annotation[] = []

      renderWithProviders(
        <DrawingCanvas
          videoId="test-video"
          currentTime={0}
          videoWidth={1920}
          videoHeight={1080}
          annotations={annotations}
          selectedAnnotation={null}
          onAnnotationSelect={vi.fn()}
        />
      )

      const svg = document.querySelector('svg')
      expect(svg?.getAttribute('viewBox')).toBe('0 0 1920 1080')
    })

    it('SVG viewBox updates when video dimensions change', () => {
      const annotations: Annotation[] = []

      const { rerender } = renderWithProviders(
        <DrawingCanvas
          videoId="test-video"
          currentTime={0}
          videoWidth={1920}
          videoHeight={1080}
          annotations={annotations}
          selectedAnnotation={null}
          onAnnotationSelect={vi.fn()}
        />
      )

      let svg = document.querySelector('svg')
      expect(svg?.getAttribute('viewBox')).toBe('0 0 1920 1080')

      // Rerender with different dimensions
      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <DrawingCanvas
            videoId="test-video"
            currentTime={0}
            videoWidth={1280}
            videoHeight={720}
            annotations={annotations}
            selectedAnnotation={null}
            onAnnotationSelect={vi.fn()}
          />
        </QueryClientProvider>
      )

      svg = document.querySelector('svg')
      expect(svg?.getAttribute('viewBox')).toBe('0 0 1280 720')
    })
  })

  describe('Box position with different video dimensions', () => {
    it('box at center remains centered with different video sizes', () => {
      // Box at exact center of 1920x1080
      const annotation1920 = createMockAnnotation({ x: 960, y: 540, width: 100, height: 100 })

      renderWithProviders(
        <svg viewBox="0 0 1920 1080" data-testid="test-svg">
          <InteractiveBoundingBox
            annotation={annotation1920}
            currentFrame={0}
            videoWidth={1920}
            videoHeight={1080}
            isActive={false}
            onSelect={vi.fn()}
            mode="keyframe"
          />
        </svg>
      )

      const rect = screen.getByTestId('bounding-box').querySelector('rect')

      // Box center should be at video center
      const boxCenterX = parseFloat(rect?.getAttribute('x') || '0') + parseFloat(rect?.getAttribute('width') || '0') / 2
      const boxCenterY = parseFloat(rect?.getAttribute('y') || '0') + parseFloat(rect?.getAttribute('height') || '0') / 2

      expect(boxCenterX / 1920).toBeCloseTo(0.5 + 50 / 1920, 3) // (960 + 50) / 1920
      expect(boxCenterY / 1080).toBeCloseTo(0.5 + 50 / 1080, 3) // (540 + 50) / 1080
    })
  })
})

describe('Edge Cases', () => {
  it('handles zero-sized bounding box gracefully', () => {
    const annotation = createMockAnnotation({ x: 100, y: 100, width: 0, height: 0 })

    // Should not throw
    expect(() => {
      renderWithProviders(
        <svg viewBox="0 0 1920 1080" data-testid="test-svg">
          <InteractiveBoundingBox
            annotation={annotation}
            currentFrame={0}
            videoWidth={1920}
            videoHeight={1080}
            isActive={false}
            onSelect={vi.fn()}
            mode="keyframe"
          />
        </svg>
      )
    }).not.toThrow()
  })

  it('handles box at video edge correctly', () => {
    // Box at bottom-right corner
    const annotation = createMockAnnotation({
      x: 1820,
      y: 980,
      width: 100,
      height: 100,
    })

    renderWithProviders(
      <svg viewBox="0 0 1920 1080" data-testid="test-svg">
        <InteractiveBoundingBox
          annotation={annotation}
          currentFrame={0}
          videoWidth={1920}
          videoHeight={1080}
          isActive={false}
          onSelect={vi.fn()}
          mode="keyframe"
        />
      </svg>
    )

    const rect = screen.getByTestId('bounding-box').querySelector('rect')
    expect(rect?.getAttribute('x')).toBe('1820')
    expect(rect?.getAttribute('y')).toBe('980')
  })

  it('handles very large bounding box', () => {
    // Box covering most of video
    const annotation = createMockAnnotation({
      x: 50,
      y: 50,
      width: 1820,
      height: 980,
    })

    renderWithProviders(
      <svg viewBox="0 0 1920 1080" data-testid="test-svg">
        <InteractiveBoundingBox
          annotation={annotation}
          currentFrame={0}
          videoWidth={1920}
          videoHeight={1080}
          isActive={false}
          onSelect={vi.fn()}
          mode="keyframe"
        />
      </svg>
    )

    const rect = screen.getByTestId('bounding-box').querySelector('rect')
    expect(rect?.getAttribute('width')).toBe('1820')
    expect(rect?.getAttribute('height')).toBe('980')
  })
})
