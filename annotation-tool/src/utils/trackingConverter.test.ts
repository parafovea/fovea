/**
 * Unit tests for tracking converter utilities.
 */

import { describe, it, expect } from 'vitest'
import {
  convertTrackToSequence,
  detectVisibilityRanges,
  createInterpolationSegments,
  decimateKeyframes,
  calculateOptimalDecimation,
} from './trackingConverter.js'
import { TrackingResult, TrackFrame } from '../models/types.js'

describe('trackingConverter', () => {
  describe('convertTrackToSequence', () => {
    it('converts continuous track to sequence', () => {
      const track: TrackingResult = {
        trackId: 1,
        label: 'person',
        confidence: 0.92,
        model: 'samurai',
        frames: [
          { frameNumber: 0, box: { x: 10, y: 10, width: 50, height: 50 }, confidence: 0.9, occluded: false },
          { frameNumber: 1, box: { x: 15, y: 10, width: 50, height: 50 }, confidence: 0.92, occluded: false },
          { frameNumber: 2, box: { x: 20, y: 10, width: 50, height: 50 }, confidence: 0.94, occluded: false },
        ],
      }

      const sequence = convertTrackToSequence(track)

      expect(sequence.boxes.length).toBe(3)
      expect(sequence.boxes.every(b => b.isKeyframe)).toBe(true)
      expect(sequence.trackId).toBe(1)
      expect(sequence.trackingSource).toBe('samurai')
      expect(sequence.trackingConfidence).toBe(0.92)
      expect(sequence.keyframeCount).toBe(3)
      expect(sequence.interpolatedFrameCount).toBe(0)
    })

    it('detects discontiguous track', () => {
      const track: TrackingResult = {
        trackId: 2,
        label: 'car',
        confidence: 0.85,
        model: 'sam2',
        frames: [
          { frameNumber: 0, box: { x: 10, y: 10, width: 50, height: 50 }, confidence: 0.85, occluded: false },
          { frameNumber: 1, box: { x: 15, y: 10, width: 50, height: 50 }, confidence: 0.86, occluded: false },
          { frameNumber: 5, box: { x: 20, y: 10, width: 50, height: 50 }, confidence: 0.84, occluded: false },
          { frameNumber: 6, box: { x: 25, y: 10, width: 50, height: 50 }, confidence: 0.88, occluded: false },
        ],
      }

      const sequence = convertTrackToSequence(track)

      expect(sequence.visibilityRanges.length).toBe(3)
      expect(sequence.visibilityRanges[0]).toEqual({ startFrame: 0, endFrame: 1, visible: true })
      expect(sequence.visibilityRanges[1]).toEqual({ startFrame: 2, endFrame: 4, visible: false })
      expect(sequence.visibilityRanges[2]).toEqual({ startFrame: 5, endFrame: 6, visible: true })
    })
  })

  describe('detectVisibilityRanges', () => {
    it('returns continuous range for sequential frames', () => {
      const frames: TrackFrame[] = [
        { frameNumber: 0, box: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.9, occluded: false },
        { frameNumber: 1, box: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.9, occluded: false },
        { frameNumber: 2, box: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.9, occluded: false },
      ]

      const ranges = detectVisibilityRanges(frames)

      expect(ranges).toEqual([{ startFrame: 0, endFrame: 2, visible: true }])
    })

    it('detects gaps in tracking', () => {
      const frames: TrackFrame[] = [
        { frameNumber: 0, box: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.9, occluded: false },
        { frameNumber: 1, box: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.9, occluded: false },
        { frameNumber: 5, box: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.9, occluded: false },
      ]

      const ranges = detectVisibilityRanges(frames)

      expect(ranges.length).toBe(3)
      expect(ranges[0]).toEqual({ startFrame: 0, endFrame: 1, visible: true })
      expect(ranges[1]).toEqual({ startFrame: 2, endFrame: 4, visible: false })
      expect(ranges[2]).toEqual({ startFrame: 5, endFrame: 5, visible: true })
    })

    it('handles empty frames array', () => {
      const ranges = detectVisibilityRanges([])
      expect(ranges).toEqual([])
    })

    it('handles single frame', () => {
      const frames: TrackFrame[] = [
        { frameNumber: 0, box: { x: 0, y: 0, width: 10, height: 10 }, confidence: 0.9, occluded: false },
      ]

      const ranges = detectVisibilityRanges(frames)
      expect(ranges).toEqual([{ startFrame: 0, endFrame: 0, visible: true }])
    })
  })

  describe('createInterpolationSegments', () => {
    it('creates segments between keyframes', () => {
      const boxes = [
        { x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true },
        { x: 10, y: 10, width: 10, height: 10, frameNumber: 5, isKeyframe: true },
        { x: 20, y: 20, width: 10, height: 10, frameNumber: 10, isKeyframe: true },
      ]

      const segments = createInterpolationSegments(boxes)

      expect(segments.length).toBe(2)
      expect(segments[0]).toEqual({ startFrame: 0, endFrame: 5, type: 'linear' })
      expect(segments[1]).toEqual({ startFrame: 5, endFrame: 10, type: 'linear' })
    })

    it('handles single keyframe', () => {
      const boxes = [
        { x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true },
      ]

      const segments = createInterpolationSegments(boxes)
      expect(segments).toEqual([])
    })

    it('handles empty array', () => {
      const segments = createInterpolationSegments([])
      expect(segments).toEqual([])
    })
  })

  describe('decimateKeyframes', () => {
    it('keeps first and last frame', () => {
      const sequence = {
        boxes: [
          { x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true },
          { x: 1, y: 1, width: 10, height: 10, frameNumber: 1, isKeyframe: true },
          { x: 2, y: 2, width: 10, height: 10, frameNumber: 2, isKeyframe: true },
          { x: 3, y: 3, width: 10, height: 10, frameNumber: 3, isKeyframe: true },
          { x: 4, y: 4, width: 10, height: 10, frameNumber: 4, isKeyframe: true },
          { x: 5, y: 5, width: 10, height: 10, frameNumber: 5, isKeyframe: true },
        ],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 5, visible: true }],
        trackId: 1,
        trackingSource: 'samurai' as const,
        trackingConfidence: 0.9,
        totalFrames: 6,
        keyframeCount: 6,
        interpolatedFrameCount: 0,
      }

      const decimated = decimateKeyframes(sequence, 2)

      expect(decimated.boxes[0].frameNumber).toBe(0)
      expect(decimated.boxes[decimated.boxes.length - 1].frameNumber).toBe(5)
      expect(decimated.keyframeCount).toBe(4) // 0, 2, 4, 5
    })

    it('keeps every Nth frame', () => {
      const sequence = {
        boxes: Array.from({ length: 10 }, (_, i) => ({
          x: i,
          y: i,
          width: 10,
          height: 10,
          frameNumber: i,
          isKeyframe: true,
        })),
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 9, visible: true }],
        trackId: 1,
        trackingSource: 'samurai' as const,
        trackingConfidence: 0.9,
        totalFrames: 10,
        keyframeCount: 10,
        interpolatedFrameCount: 0,
      }

      const decimated = decimateKeyframes(sequence, 3)

      expect(decimated.boxes.map(b => b.frameNumber)).toEqual([0, 3, 6, 9])
    })

    it('does not decimate when keepEveryN is 1', () => {
      const sequence = {
        boxes: [
          { x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true },
          { x: 1, y: 1, width: 10, height: 10, frameNumber: 1, isKeyframe: true },
        ],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 1, visible: true }],
        trackId: 1,
        trackingSource: 'samurai' as const,
        trackingConfidence: 0.9,
        totalFrames: 2,
        keyframeCount: 2,
        interpolatedFrameCount: 0,
      }

      const decimated = decimateKeyframes(sequence, 1)
      expect(decimated.boxes.length).toBe(2)
    })

    it('recomputes interpolation segments', () => {
      const sequence = {
        boxes: [
          { x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true },
          { x: 1, y: 1, width: 10, height: 10, frameNumber: 1, isKeyframe: true },
          { x: 2, y: 2, width: 10, height: 10, frameNumber: 2, isKeyframe: true },
          { x: 3, y: 3, width: 10, height: 10, frameNumber: 3, isKeyframe: true },
        ],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 3, visible: true }],
        trackId: 1,
        trackingSource: 'samurai' as const,
        trackingConfidence: 0.9,
        totalFrames: 4,
        keyframeCount: 4,
        interpolatedFrameCount: 0,
      }

      const decimated = decimateKeyframes(sequence, 2)

      expect(decimated.interpolationSegments.length).toBe(2) // 0->2, 2->3
      expect(decimated.interpolationSegments[0]).toEqual({ startFrame: 0, endFrame: 2, type: 'linear' })
      expect(decimated.interpolationSegments[1]).toEqual({ startFrame: 2, endFrame: 3, type: 'linear' })
    })
  })

  describe('calculateOptimalDecimation', () => {
    it('returns 1 for small sequences', () => {
      expect(calculateOptimalDecimation(30)).toBe(1)
      expect(calculateOptimalDecimation(40)).toBe(1)
    })

    it('calculates factor for large sequences', () => {
      expect(calculateOptimalDecimation(100)).toBe(3) // 100/40 = 2.5 -> ceil = 3
      expect(calculateOptimalDecimation(200)).toBe(5) // 200/40 = 5
      expect(calculateOptimalDecimation(400)).toBe(10) // 400/40 = 10
    })

    it('caps at maximum factor', () => {
      expect(calculateOptimalDecimation(1000)).toBe(20) // Would be 25, capped at 20
    })
  })
})
