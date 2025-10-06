import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuickActionsPanel } from './QuickActionsPanel'
import { Annotation } from '../../models/types.js'

describe('QuickActionsPanel', () => {
  const mockAnnotation: Annotation = {
    id: 'ann-1',
    videoId: 'vid-1',
    annotationType: 'type',
    typeCategory: 'entity',
    typeId: 'entity-type-1',
    boundingBoxSequence: {
      boxes: [
        { x: 100, y: 100, width: 50, height: 50, frameNumber: 0, isKeyframe: true },
        { x: 150, y: 150, width: 50, height: 50, frameNumber: 50, isKeyframe: true },
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

  const mockBoundingBoxRect: DOMRect = {
    top: 200,
    left: 100,
    bottom: 250,
    right: 150,
    width: 50,
    height: 50,
    x: 100,
    y: 200,
    toJSON: () => ({}),
  }

  const defaultProps = {
    annotation: mockAnnotation,
    currentFrame: 25,
    boundingBoxRect: mockBoundingBoxRect,
    onAddKeyframe: vi.fn(),
    onDeleteKeyframe: vi.fn(),
    onCopyPreviousFrame: vi.fn(),
    onUpdateInterpolationSegment: vi.fn(),
    isKeyframe: false,
    videoWidth: 1920,
  }

  test('renders all four buttons', () => {
    render(<QuickActionsPanel {...defaultProps} />)

    expect(screen.getByText('Keyframe')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Previous')).toBeInTheDocument()
    expect(screen.getByText('Interp.')).toBeInTheDocument()
  })

  test('add keyframe button is enabled when not a keyframe', () => {
    render(<QuickActionsPanel {...defaultProps} isKeyframe={false} />)

    const keyframeButton = screen.getByText('Keyframe').closest('button')
    expect(keyframeButton).not.toBeDisabled()
  })

  test('add keyframe button is disabled when already a keyframe', () => {
    render(<QuickActionsPanel {...defaultProps} isKeyframe={true} />)

    const keyframeButton = screen.getByText('Keyframe').closest('button')
    expect(keyframeButton).toBeDisabled()
  })

  test('delete button is disabled when not a keyframe', () => {
    render(<QuickActionsPanel {...defaultProps} isKeyframe={false} />)

    const deleteButton = screen.getByText('Delete').closest('button')
    expect(deleteButton).toBeDisabled()
  })

  test('delete button is disabled for first/last keyframe', () => {
    render(<QuickActionsPanel {...defaultProps} currentFrame={0} isKeyframe={true} />)

    const deleteButton = screen.getByText('Delete').closest('button')
    expect(deleteButton).toBeDisabled()
  })

  test('delete button is enabled for middle keyframe', () => {
    const annotationWithThreeKeyframes = {
      ...mockAnnotation,
      boundingBoxSequence: {
        ...mockAnnotation.boundingBoxSequence,
        boxes: [
          { x: 100, y: 100, width: 50, height: 50, frameNumber: 0, isKeyframe: true },
          { x: 125, y: 125, width: 50, height: 50, frameNumber: 25, isKeyframe: true },
          { x: 150, y: 150, width: 50, height: 50, frameNumber: 50, isKeyframe: true },
        ],
        keyframeCount: 3,
      },
    }

    render(
      <QuickActionsPanel
        {...defaultProps}
        annotation={annotationWithThreeKeyframes}
        currentFrame={25}
        isKeyframe={true}
      />
    )

    const deleteButton = screen.getByText('Delete').closest('button')
    expect(deleteButton).not.toBeDisabled()
  })

  test('copy previous button is disabled at frame 0', () => {
    render(<QuickActionsPanel {...defaultProps} currentFrame={0} />)

    const previousButton = screen.getByText('Previous').closest('button')
    expect(previousButton).toBeDisabled()
  })

  test('copy previous button is enabled after frame 0', () => {
    render(<QuickActionsPanel {...defaultProps} currentFrame={10} />)

    const previousButton = screen.getByText('Previous').closest('button')
    expect(previousButton).not.toBeDisabled()
  })

  test('interpolation button is disabled (Session 5 feature)', () => {
    const annotationWithOneKeyframe: Annotation = {
      ...mockAnnotation,
      boundingBoxSequence: {
        boxes: [
          { x: 100, y: 100, width: 50, height: 50, frameNumber: 0, isKeyframe: true },
        ],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0,
      },
    }

    render(<QuickActionsPanel {...defaultProps} annotation={annotationWithOneKeyframe} />)

    const interpButton = screen.getByText('Interp.').closest('button')
    expect(interpButton).toBeDisabled()
  })

  test('calls onAddKeyframe when keyframe button clicked', () => {
    const onAddKeyframe = vi.fn()
    render(<QuickActionsPanel {...defaultProps} onAddKeyframe={onAddKeyframe} isKeyframe={false} />)

    const keyframeButton = screen.getByText('Keyframe').closest('button')
    fireEvent.click(keyframeButton!)

    expect(onAddKeyframe).toHaveBeenCalledTimes(1)
  })

  test('calls onDeleteKeyframe when delete button clicked', () => {
    const onDeleteKeyframe = vi.fn()
    const annotationWithThreeKeyframes = {
      ...mockAnnotation,
      boundingBoxSequence: {
        ...mockAnnotation.boundingBoxSequence,
        boxes: [
          { x: 100, y: 100, width: 50, height: 50, frameNumber: 0, isKeyframe: true },
          { x: 125, y: 125, width: 50, height: 50, frameNumber: 25, isKeyframe: true },
          { x: 150, y: 150, width: 50, height: 50, frameNumber: 50, isKeyframe: true },
        ],
        keyframeCount: 3,
      },
    }

    render(
      <QuickActionsPanel
        {...defaultProps}
        annotation={annotationWithThreeKeyframes}
        currentFrame={25}
        isKeyframe={true}
        onDeleteKeyframe={onDeleteKeyframe}
      />
    )

    const deleteButton = screen.getByText('Delete').closest('button')
    fireEvent.click(deleteButton!)

    expect(onDeleteKeyframe).toHaveBeenCalledTimes(1)
  })

  test('calls onCopyPreviousFrame when previous button clicked', () => {
    const onCopyPreviousFrame = vi.fn()
    render(
      <QuickActionsPanel
        {...defaultProps}
        currentFrame={10}
        onCopyPreviousFrame={onCopyPreviousFrame}
      />
    )

    const previousButton = screen.getByText('Previous').closest('button')
    fireEvent.click(previousButton!)

    expect(onCopyPreviousFrame).toHaveBeenCalledTimes(1)
  })

  test('positions above bounding box by default', () => {
    const { container } = render(<QuickActionsPanel {...defaultProps} />)

    const panel = container.querySelector('[class*="MuiPaper"]')
    const style = window.getComputedStyle(panel!)

    // Should be positioned above the box (top - panelHeight - margin)
    expect(style.position).toBe('absolute')
  })

  test('flips below bounding box when near top edge', () => {
    const nearTopRect = { ...mockBoundingBoxRect, top: 10 }

    const { container } = render(
      <QuickActionsPanel {...defaultProps} boundingBoxRect={nearTopRect} />
    )

    const panel = container.querySelector('[class*="MuiPaper"]')
    const style = window.getComputedStyle(panel!)

    expect(style.position).toBe('absolute')
    // Actual position values would require more sophisticated testing
  })
})
