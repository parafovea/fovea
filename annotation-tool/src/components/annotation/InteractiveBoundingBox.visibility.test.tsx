/**
 * Visibility regression tests for the v0.4.1 InteractiveBoundingBox bump.
 *
 * Pins:
 *  - type annotation strokes 3px, object annotation strokes 6px (was 2/4).
 *  - the always-on annotation badge font size has a 13px floor and uses
 *    font-semibold so labels read against busy video frames.
 *
 * Earlier 2px / 4px stroke and `text-[clamp(10px,0.75rem,14px)]` badge
 * were nearly invisible — see the v0.4.1 CHANGELOG section.
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import InteractiveBoundingBox from './InteractiveBoundingBox'
import type { Annotation } from '@models/annotation'

vi.mock('@store/queries/useAnnotations', () => ({
  useAddKeyframe: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useUpdateKeyframe: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useUpdateAnnotation: () => ({ mutate: vi.fn() }),
}))

function baseAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'a1',
    videoId: 'v1',
    personaId: 'p1',
    userId: 'u1',
    type: 'object',
    label: 'cargo container',
    annotationType: 'object',
    boundingBoxSequence: {
      boxes: [
        { x: 50, y: 60, width: 200, height: 150, frameNumber: 0, isKeyframe: true },
      ],
      interpolationSegments: [],
      visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
      totalFrames: 1,
      keyframeCount: 1,
      interpolatedFrameCount: 0,
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Annotation
}

function renderInSvg(annotation: Annotation) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <svg width={800} height={600}>
        <InteractiveBoundingBox
          annotation={annotation}
          currentFrame={0}
          videoWidth={800}
          videoHeight={600}
          isActive={false}
          onSelect={() => {}}
          mode="keyframe"
        />
      </svg>
    </QueryClientProvider>,
  )
}

describe('InteractiveBoundingBox visibility (v0.4.1 bump)', () => {
  it('object annotation strokes at 6 px (was 4 px)', () => {
    const { container } = renderInSvg(baseAnnotation({ annotationType: 'object' }))
    const rect = container.querySelector(
      'rect[stroke-width]:not([stroke-width="1"])',
    ) as SVGRectElement | null
    expect(rect).not.toBeNull()
    expect(rect!.getAttribute('stroke-width')).toBe('6')
  })

  it('type annotation strokes at 3 px (was 2 px)', () => {
    const { container } = renderInSvg(
      baseAnnotation({
        annotationType: 'type',
        type: 'type',
        label: 'Q63443976',
        typeCategory: 'entity',
        typeId: 'spectator',
      } as Partial<Annotation>),
    )
    const rect = container.querySelector(
      'rect[stroke-width]:not([stroke-width="1"])',
    ) as SVGRectElement | null
    expect(rect).not.toBeNull()
    expect(rect!.getAttribute('stroke-width')).toBe('3')
  })

  it('label badge uses the readable v0.4.1 typography classes', () => {
    const { container } = renderInSvg(baseAnnotation())
    const badge = container.querySelector('[data-slot="badge"]') as HTMLElement | null
    expect(badge).not.toBeNull()
    const cls = badge!.className
    // The clamp() font-size floor is 13 px (was 10 px) and the badge runs at
    // h-8 (was h-6) with font-semibold so it is legible over the video frame.
    expect(cls).toMatch(/text-\[clamp\(13px,1rem,18px\)\]/)
    expect(cls).toMatch(/font-semibold/)
    expect(cls).toMatch(/h-8/)
    expect(cls).toMatch(/max-w-\[220px\]/)
  })

  it('label foreignObject is sized 240x38 with -38 y-offset so the bigger badge fits without truncation', () => {
    const { container } = renderInSvg(baseAnnotation())
    const fo = container.querySelector('foreignObject[height="38"]')
    expect(fo).not.toBeNull()
    expect(fo!.getAttribute('width')).toBe('240')
    // The box was rendered at y=60 in the fixture; the badge sits at y - 38 = 22.
    expect(fo!.getAttribute('y')).toBe('22')
  })
})
