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
 * Round-trips a sequence through the layers anchor and back, asserting the
 * reconstruction is bit-exact. This is the golden guarantee the P3 backfill
 * relies on: no field of the source `Annotation.frames` may drift.
 */
function assertRoundTrip(seq: BoundingBoxSequence, frameRate: number): void {
  const { anchor, features } = boundingBoxSequenceToSpatioTemporalAnchor(seq, { frameRate })
  const back = spatioTemporalAnchorToBoundingBoxSequence(anchor, features, { frameRate })
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
      boxes: [
        { x: 100.5, y: 150.25, width: 200.75, height: 300.1, frameNumber: 42, isKeyframe: true },
      ],
      interpolationSegments: [],
      visibilityRanges: [{ startFrame: 42, endFrame: 42, visible: true }],
      totalFrames: 1,
      keyframeCount: 1,
      interpolatedFrameCount: 0,
    }
    assertRoundTrip(seq, 30)
  })

  it('round-trips a multi-keyframe sequence with mixed interpolation', () => {
    const seq: BoundingBoxSequence = {
      boxes: [
        { x: 10, y: 10, width: 50, height: 50, frameNumber: 0, isKeyframe: true, confidence: 0.9 },
        { x: 80, y: 40, width: 55, height: 60, frameNumber: 30, isKeyframe: true, confidence: 0.75 },
        { x: 160, y: 90, width: 60, height: 65, frameNumber: 60, isKeyframe: true, confidence: 0.6 },
      ],
      interpolationSegments: [
        { startFrame: 0, endFrame: 30, type: 'linear' },
        { startFrame: 30, endFrame: 60, type: 'ease-in-out', controlPoints: { x: [{ x: 0.42, y: 0 }, { x: 0.58, y: 1 }] } },
      ],
      visibilityRanges: [{ startFrame: 0, endFrame: 60, visible: true }],
      totalFrames: 61,
      keyframeCount: 3,
      interpolatedFrameCount: 58,
    }
    assertRoundTrip(seq, 29.97)
  })

  it('round-trips a sequence with visibility gaps (occlusion)', () => {
    const seq: BoundingBoxSequence = {
      boxes: [
        { x: 0, y: 0, width: 20, height: 20, frameNumber: 0, isKeyframe: true },
        { x: 200, y: 100, width: 25, height: 25, frameNumber: 90, isKeyframe: true },
      ],
      interpolationSegments: [{ startFrame: 0, endFrame: 90, type: 'hold' }],
      visibilityRanges: [
        { startFrame: 0, endFrame: 30, visible: true },
        { startFrame: 31, endFrame: 59, visible: false },
        { startFrame: 60, endFrame: 90, visible: true },
      ],
      totalFrames: 91,
      keyframeCount: 2,
      interpolatedFrameCount: 89,
    }
    assertRoundTrip(seq, 30)
  })

  it('round-trips a tracker sequence with trackId, source, and metadata', () => {
    const seq: BoundingBoxSequence = {
      boxes: [
        {
          x: 12.3456,
          y: 78.9012,
          width: 34.5,
          height: 67.8,
          frameNumber: 5,
          isKeyframe: false,
          confidence: 0.333,
          metadata: { source: 'sam2', occlusion: 0.1, nested: { a: [1, 2, 3] } },
        },
        { x: 20, y: 80, width: 34, height: 68, frameNumber: 6, isKeyframe: false, confidence: 0.334 },
      ],
      interpolationSegments: [{ startFrame: 5, endFrame: 6, type: 'linear' }],
      visibilityRanges: [{ startFrame: 5, endFrame: 6, visible: true }],
      trackId: 'track-abc-123',
      trackingSource: 'sam2',
      trackingConfidence: 0.88,
      totalFrames: 2,
      keyframeCount: 2,
      interpolatedFrameCount: 0,
    }
    assertRoundTrip(seq, 24)
  })

  it('round-trips a numeric trackId and sub-pixel boxes clamped to a 1px minimum', () => {
    const seq: BoundingBoxSequence = {
      boxes: [
        { x: 0.4, y: 0.6, width: 0.3, height: 0.2, frameNumber: 0, isKeyframe: true },
      ],
      interpolationSegments: [],
      visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
      trackId: 7,
      totalFrames: 1,
      keyframeCount: 1,
      interpolatedFrameCount: 0,
    }
    // The layers bbox floors width/height to >= 1 while the exact floats
    // survive in features, so the reconstruction is still bit-exact.
    const { anchor } = boundingBoxSequenceToSpatioTemporalAnchor(seq, { frameRate: 30 })
    expect(anchor.keyframes?.[0].bbox).toEqual({ x: 0, y: 1, width: 1, height: 1 })
    assertRoundTrip(seq, 30)
  })
})
