/**
 * Tests for TimelineComponent.
 *
 * Exercises the modern DOM-based timeline surface: transport bar controls,
 * SMPTE/frame readouts, keyframe buttons gated by context, interpolation
 * trigger, zoom controls, track header actions, and the keyboard shortcut
 * palette.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TimelineComponent, TimelineComponentProps } from './TimelineComponent.js'
import { Annotation, BoundingBoxSequence, InterpolationType } from '@models/types.js'

vi.mock('@hooks/preferences/useTimelineKeyboardShortcuts', () => ({
  useTimelineKeyboardShortcuts: vi.fn(),
}))

describe('TimelineComponent', () => {
  const mockOnSeek = vi.fn()
  const mockOnAddKeyframe = vi.fn()
  const mockOnDeleteKeyframe = vi.fn()
  const mockOnCopyPreviousFrame = vi.fn()
  const mockOnUpdateInterpolationSegment = vi.fn()
  const mockOnClose = vi.fn()
  const mockOnAnnotationSelect = vi.fn()

  const createQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })

  const renderWithQueryClient = (component: React.ReactElement) =>
    render(<QueryClientProvider client={createQueryClient()}>{component}</QueryClientProvider>)

  const createTestAnnotation = (keyframes: number[], id = 'test-annotation'): Annotation => {
    const sequence: BoundingBoxSequence = {
      boxes: keyframes.map((frame) => ({
        x: 100,
        y: 100,
        width: 50,
        height: 50,
        frameNumber: frame,
        isKeyframe: true,
      })),
      interpolationSegments:
        keyframes.length > 1
          ? [
              {
                startFrame: keyframes[0],
                endFrame: keyframes[keyframes.length - 1],
                type: 'linear' as const,
              },
            ]
          : [],
      visibilityRanges: [
        {
          startFrame: keyframes[0],
          endFrame: keyframes[keyframes.length - 1],
          visible: true,
        },
      ],
      totalFrames: keyframes[keyframes.length - 1] + 1,
      keyframeCount: keyframes.length,
      interpolatedFrameCount: 0,
    }
    return {
      id,
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

  const makeProps = (
    overrides: Partial<TimelineComponentProps> & { annotation: Annotation | null },
  ): TimelineComponentProps => ({
    annotation: overrides.annotation,
    annotations: overrides.annotation ? [overrides.annotation] : [],
    currentFrame: 0,
    totalFrames: 100,
    videoFps: 30,
    onSeek: mockOnSeek,
    onAnnotationSelect: mockOnAnnotationSelect,
    onAddKeyframe: mockOnAddKeyframe,
    onDeleteKeyframe: mockOnDeleteKeyframe,
    onCopyPreviousFrame: mockOnCopyPreviousFrame,
    onUpdateInterpolationSegment: mockOnUpdateInterpolationSegment as unknown as (
      segmentIndex: number,
      type: InterpolationType,
    ) => void,
    onClose: mockOnClose,
    ...overrides,
  })

  beforeEach(() => {
    mockOnSeek.mockClear()
    mockOnAddKeyframe.mockClear()
    mockOnDeleteKeyframe.mockClear()
    mockOnCopyPreviousFrame.mockClear()
    mockOnUpdateInterpolationSegment.mockClear()
    mockOnClose.mockClear()
    mockOnAnnotationSelect.mockClear()
  })

  it('renders the timeline root surface', () => {
    const annotation = createTestAnnotation([0, 50, 100])
    renderWithQueryClient(<TimelineComponent {...makeProps({ annotation })} />)

    expect(screen.getByLabelText('Video annotation timeline')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="timeline-transport"]')).toBeTruthy()
    expect(document.querySelector('[data-slot="timeline-ruler"]')).toBeTruthy()
  })

  it('shows a SMPTE timecode readout and frame counter in the transport', () => {
    const annotation = createTestAnnotation([0, 50, 100])
    renderWithQueryClient(
      <TimelineComponent {...makeProps({ annotation, currentFrame: 25 })} />,
    )

    const transport = document.querySelector('[data-slot="timeline-transport"]') as HTMLElement
    expect(transport).toBeTruthy()
    // 30 fps, frame 25 → 00:00:00:25
    expect(within(transport).getByText('00:00:00:25')).toBeInTheDocument()
    expect(within(transport).getByText(/frame 25 \/ 99/)).toBeInTheDocument()
  })

  it('renders the full transport cluster with all four navigation buttons', () => {
    const annotation = createTestAnnotation([0, 50, 100])
    renderWithQueryClient(<TimelineComponent {...makeProps({ annotation })} />)

    expect(screen.getByRole('button', { name: /Jump 10 frames back/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Step 1 frame back/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Step 1 frame forward/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Jump 10 frames forward/ })).toBeTruthy()
  })

  it('seeks one frame forward when the step-forward button is clicked', async () => {
    const user = userEvent.setup()
    const annotation = createTestAnnotation([0, 50, 100])
    renderWithQueryClient(
      <TimelineComponent {...makeProps({ annotation, currentFrame: 50 })} />,
    )

    await user.click(screen.getByRole('button', { name: /Step 1 frame forward/ }))
    expect(mockOnSeek).toHaveBeenCalledWith(51)
  })

  it('seeks ten frames back when the jump-backward button is clicked', async () => {
    const user = userEvent.setup()
    const annotation = createTestAnnotation([0, 50, 100])
    renderWithQueryClient(
      <TimelineComponent {...makeProps({ annotation, currentFrame: 50 })} />,
    )

    await user.click(screen.getByRole('button', { name: /Jump 10 frames back/ }))
    expect(mockOnSeek).toHaveBeenCalledWith(40)
  })

  it('renders a keyframe marker for every keyframe in the active annotation', () => {
    const annotation = createTestAnnotation([0, 25, 50, 75, 100])
    renderWithQueryClient(<TimelineComponent {...makeProps({ annotation })} />)

    const keyframes = document.querySelectorAll('[data-slot="timeline-keyframe"]')
    expect(keyframes.length).toBe(5)
  })

  it('marks the keyframe at the current frame with data-current', () => {
    const annotation = createTestAnnotation([0, 50, 100])
    renderWithQueryClient(
      <TimelineComponent {...makeProps({ annotation, currentFrame: 50 })} />,
    )

    const current = document.querySelector(
      '[data-slot="timeline-keyframe"][data-current="true"]',
    )
    expect(current).toBeTruthy()
    expect(current?.getAttribute('aria-label')).toContain('Keyframe at frame 50')
  })

  it('exposes keyboard shortcuts via the shortcuts button', async () => {
    const user = userEvent.setup()
    const annotation = createTestAnnotation([0, 50, 100])
    renderWithQueryClient(<TimelineComponent {...makeProps({ annotation })} />)

    expect(document.querySelector('[data-slot="timeline-shortcut-palette"]')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Keyboard shortcuts/ }))
    expect(document.querySelector('[data-slot="timeline-shortcut-palette"]')).toBeTruthy()
  })

  describe('keyframe operations', () => {
    it('enables Add Keyframe when currentFrame is not a keyframe', () => {
      const annotation = createTestAnnotation([0, 100])
      renderWithQueryClient(
        <TimelineComponent {...makeProps({ annotation, currentFrame: 50 })} />,
      )

      const button = screen.getByRole('button', { name: /Add Keyframe/ })
      expect(button).not.toBeDisabled()
    })

    it('disables Add Keyframe when currentFrame is already a keyframe', () => {
      const annotation = createTestAnnotation([0, 50, 100])
      renderWithQueryClient(
        <TimelineComponent {...makeProps({ annotation, currentFrame: 50 })} />,
      )

      const button = screen.getByRole('button', { name: /Already a keyframe/ })
      expect(button).toBeDisabled()
    })

    it('enables Delete Keyframe only for non-boundary keyframes', () => {
      const annotation = createTestAnnotation([0, 25, 50, 75, 100])
      renderWithQueryClient(
        <TimelineComponent {...makeProps({ annotation, currentFrame: 50 })} />,
      )

      const deleteBtn = screen.getByRole('button', { name: /Delete Keyframe/ })
      expect(deleteBtn).not.toBeDisabled()
    })

    it('disables Delete Keyframe for the first keyframe', () => {
      const annotation = createTestAnnotation([0, 50, 100])
      renderWithQueryClient(
        <TimelineComponent {...makeProps({ annotation, currentFrame: 0 })} />,
      )

      const deleteBtn = screen.getByRole('button', { name: /Delete Keyframe/ })
      expect(deleteBtn).toBeDisabled()
    })

    it('disables Delete Keyframe for the last keyframe', () => {
      const annotation = createTestAnnotation([0, 50, 100])
      renderWithQueryClient(
        <TimelineComponent {...makeProps({ annotation, currentFrame: 100 })} />,
      )

      const deleteBtn = screen.getByRole('button', { name: /Delete Keyframe/ })
      expect(deleteBtn).toBeDisabled()
    })

    it('enables Copy Previous Frame at any frame past 0', () => {
      const annotation = createTestAnnotation([0, 100])
      renderWithQueryClient(
        <TimelineComponent {...makeProps({ annotation, currentFrame: 10 })} />,
      )

      const copyBtn = screen.getByRole('button', { name: /Copy Previous Frame/ })
      expect(copyBtn).not.toBeDisabled()
    })

    it('disables Copy Previous Frame at frame 0', () => {
      const annotation = createTestAnnotation([0, 100])
      renderWithQueryClient(
        <TimelineComponent {...makeProps({ annotation, currentFrame: 0 })} />,
      )

      const copyBtn = screen.getByRole('button', { name: /Copy Previous Frame/ })
      expect(copyBtn).toBeDisabled()
    })

    it('enables Interpolation Mode when the track has two or more keyframes', () => {
      const annotation = createTestAnnotation([0, 50, 100])
      renderWithQueryClient(
        <TimelineComponent {...makeProps({ annotation, currentFrame: 25 })} />,
      )

      const interpBtn = screen.getByRole('button', { name: /Interpolation Mode/ })
      expect(interpBtn).not.toBeDisabled()
    })

    it('disables Interpolation Mode for a single-keyframe track', () => {
      const annotation = createTestAnnotation([0])
      renderWithQueryClient(<TimelineComponent {...makeProps({ annotation })} />)

      const interpBtn = screen.getByRole('button', { name: /Interpolation Mode/ })
      expect(interpBtn).toBeDisabled()
    })

    it('calls onClose when the hide-timeline button is clicked', async () => {
      const user = userEvent.setup()
      const annotation = createTestAnnotation([0, 50, 100])
      renderWithQueryClient(<TimelineComponent {...makeProps({ annotation })} />)

      await user.click(
        screen.getByRole('button', { name: /Hide timeline and show standard controls/ }),
      )
      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    it('renders without crashing when annotation is null', () => {
      renderWithQueryClient(<TimelineComponent {...makeProps({ annotation: null })} />)
      expect(screen.getByLabelText('Video annotation timeline')).toBeInTheDocument()
    })

    it('tolerates a currentFrame beyond totalFrames', () => {
      const annotation = createTestAnnotation([0, 50, 100])
      renderWithQueryClient(
        <TimelineComponent {...makeProps({ annotation, currentFrame: 500 })} />,
      )
      expect(screen.getByLabelText('Video annotation timeline')).toBeInTheDocument()
    })

    it('tolerates a negative currentFrame', () => {
      const annotation = createTestAnnotation([0, 50, 100])
      renderWithQueryClient(
        <TimelineComponent {...makeProps({ annotation, currentFrame: -10 })} />,
      )
      expect(screen.getByLabelText('Video annotation timeline')).toBeInTheDocument()
    })
  })

  describe('track surface', () => {
    it('renders one track header per annotation', () => {
      const a = createTestAnnotation([0, 50, 100], 'ann-a')
      const b = createTestAnnotation([10, 90], 'ann-b')
      renderWithQueryClient(
        <TimelineComponent
          {...makeProps({ annotation: a, annotations: [a, b], currentFrame: 25 })}
        />,
      )

      const headers = document.querySelectorAll('[data-slot="timeline-track-header"]')
      expect(headers.length).toBe(2)
    })

    it('selects a track when its header is clicked', async () => {
      const user = userEvent.setup()
      const a = createTestAnnotation([0, 50, 100], 'ann-a')
      const b = createTestAnnotation([10, 90], 'ann-b')
      renderWithQueryClient(
        <TimelineComponent
          {...makeProps({ annotation: a, annotations: [a, b], currentFrame: 25 })}
        />,
      )

      const headers = document.querySelectorAll('[data-slot="timeline-track-header"]')
      await user.click(headers[1] as Element)
      expect(mockOnAnnotationSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ann-b' }),
      )
    })
  })
})
