import { describe, it, expect } from 'vitest'
import {
  boundingBoxSequenceToSpatioTemporalAnchor,
  spatioTemporalAnchorToBoundingBoxSequence,
  to1000,
  from1000,
  secToMs,
  msToSec,
  type BoundingBoxSequence,
} from '../layers-conversion-service.js'

/**
 * Round-trips a native-canonical sequence through the layers anchor and back,
 * asserting the reconstruction is exact. The native anchor is authoritative:
 * geometry is integer-pixel, confidence is the 0-1000 grid, times are integer
 * milliseconds, and interpolated frames are never stored — so a sequence already
 * in that canonical form round-trips without a sidecar.
 */
function assertRoundTrip(seq: BoundingBoxSequence, frameRate: number): void {
  const anchor = boundingBoxSequenceToSpatioTemporalAnchor(seq, { frameRate })
  const back = spatioTemporalAnchorToBoundingBoxSequence(anchor, { frameRate })
  expect(back).toEqual(seq)
}

describe('layers-conversion-service scalar helpers', () => {
  it('scales confidence to and from the 0-1000 integer scale', () => {
    expect(to1000(0.95)).toBe(950)
    expect(to1000(undefined)).toBeUndefined()
    expect(from1000(950)).toBe(0.95)
    expect(from1000(undefined)).toBeUndefined()
  })

  it('converts between seconds and milliseconds', () => {
    expect(secToMs(1.5)).toBe(1500)
    expect(msToSec(1500)).toBe(1.5)
  })
})

describe('layers-conversion-service bounding-box round-trips', () => {
  it('round-trips a single manual keyframe', () => {
    const seq: BoundingBoxSequence = {
      boxes: [{ x: 100, y: 150, width: 200, height: 300, frameNumber: 42, isKeyframe: true }],
      interpolationSegments: [],
      visibilityRanges: [{ startFrame: 42, endFrame: 42, visible: true }],
      totalFrames: 1,
      keyframeCount: 1,
      interpolatedFrameCount: 0,
    }
    assertRoundTrip(seq, 30)
  })

  it('round-trips a multi-keyframe sequence with per-box confidence and mixed interpolation', () => {
    const seq: BoundingBoxSequence = {
      boxes: [
        { x: 10, y: 10, width: 50, height: 50, frameNumber: 0, isKeyframe: true, confidence: 0.9 },
        { x: 80, y: 40, width: 55, height: 60, frameNumber: 30, isKeyframe: true, confidence: 0.75 },
        { x: 160, y: 90, width: 60, height: 65, frameNumber: 60, isKeyframe: true, confidence: 0.6 },
      ],
      interpolationSegments: [
        { startFrame: 0, endFrame: 30, type: 'linear' },
        {
          startFrame: 30,
          endFrame: 60,
          type: 'ease-in-out',
          controlPoints: { x: [{ x: 0.42, y: 0 }, { x: 0.58, y: 1 }] },
        },
      ],
      visibilityRanges: [{ startFrame: 0, endFrame: 60, visible: true }],
      totalFrames: 61,
      keyframeCount: 3,
      interpolatedFrameCount: 58,
    }
    assertRoundTrip(seq, 29.97)
  })

  it('round-trips keyframe-aligned visibility (occlusion) via per-keyframe flags', () => {
    const seq: BoundingBoxSequence = {
      boxes: [
        { x: 0, y: 0, width: 20, height: 20, frameNumber: 0, isKeyframe: true },
        { x: 100, y: 50, width: 22, height: 22, frameNumber: 30, isKeyframe: true },
        { x: 200, y: 100, width: 25, height: 25, frameNumber: 60, isKeyframe: true },
      ],
      interpolationSegments: [
        { startFrame: 0, endFrame: 30, type: 'hold' },
        { startFrame: 30, endFrame: 60, type: 'hold' },
      ],
      visibilityRanges: [
        { startFrame: 0, endFrame: 29, visible: true },
        { startFrame: 30, endFrame: 59, visible: false },
        { startFrame: 60, endFrame: 60, visible: true },
      ],
      totalFrames: 61,
      keyframeCount: 3,
      interpolatedFrameCount: 58,
    }
    assertRoundTrip(seq, 30)
  })

  it('round-trips per-box metadata carried on keyframe features', () => {
    const seq: BoundingBoxSequence = {
      boxes: [
        {
          x: 12,
          y: 78,
          width: 34,
          height: 67,
          frameNumber: 5,
          isKeyframe: true,
          confidence: 0.333,
          metadata: { sourceTag: 'sam2', occlusion: 0.1, nested: { a: [1, 2, 3] } },
        },
      ],
      interpolationSegments: [],
      visibilityRanges: [{ startFrame: 5, endFrame: 5, visible: true }],
      totalFrames: 1,
      keyframeCount: 1,
      interpolatedFrameCount: 0,
    }
    assertRoundTrip(seq, 24)
  })

  it('makes integer geometry canonical and the projection idempotent', () => {
    // A sub-pixel, UI-drawn box is rounded to the integer-pixel boundingBox the
    // layers schema defines; width/height floor to a 1px minimum.
    const drawn: BoundingBoxSequence = {
      boxes: [{ x: 0.4, y: 0.6, width: 0.3, height: 0.2, frameNumber: 0, isKeyframe: true }],
      interpolationSegments: [],
      visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
      totalFrames: 1,
      keyframeCount: 1,
      interpolatedFrameCount: 0,
    }
    const anchor = boundingBoxSequenceToSpatioTemporalAnchor(drawn, { frameRate: 30 })
    expect(anchor.keyframes?.[0].bbox).toEqual({ x: 0, y: 1, width: 1, height: 1 })

    // The canonicalized (integer) sequence is a fixed point of the round-trip.
    const canonical = spatioTemporalAnchorToBoundingBoxSequence(anchor, { frameRate: 30 })
    assertRoundTrip(canonical, 30)
  })
})
