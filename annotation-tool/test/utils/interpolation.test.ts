/**
 * @file interpolation.test.ts
 * @description Comprehensive tests for bounding box interpolation.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { BoundingBoxInterpolator, LazyBoundingBoxSequence } from '../../src/utils/interpolation.js'
import {
  BoundingBox,
  BoundingBoxSequence,
  InterpolationSegment,
  BezierControlPoint,
} from '../../src/models/types.js'

describe('BoundingBoxInterpolator', () => {
  let interpolator: BoundingBoxInterpolator

  beforeEach(() => {
    interpolator = new BoundingBoxInterpolator()
  })

  describe('linear interpolation', () => {
    it('should interpolate midpoint correctly', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 100, y: 50, width: 150, height: 120, frameNumber: 10 },
      ]

      const segments: InterpolationSegment[] = [
        { startFrame: 0, endFrame: 10, type: 'linear' },
      ]

      const result = interpolator.interpolate(keyframes, segments)

      // Find midpoint (frame 5)
      const midpoint = result.find(b => b.frameNumber === 5)

      expect(midpoint).toBeDefined()
      expect(midpoint?.x).toBe(50)
      expect(midpoint?.y).toBe(25)
      expect(midpoint?.width).toBe(125)
      expect(midpoint?.height).toBe(110)
      expect(midpoint?.isKeyframe).toBe(false)
    })

    it('should interpolate quarter points correctly', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 100, y: 100, width: 200, height: 200, frameNumber: 100 },
      ]

      const segments: InterpolationSegment[] = [
        { startFrame: 0, endFrame: 100, type: 'linear' },
      ]

      const result = interpolator.interpolate(keyframes, segments)

      // Quarter point (frame 25)
      const quarter = result.find(b => b.frameNumber === 25)
      expect(quarter?.x).toBe(25)
      expect(quarter?.y).toBe(25)
      expect(quarter?.width).toBe(125)
      expect(quarter?.height).toBe(125)

      // Three-quarter point (frame 75)
      const threeQuarter = result.find(b => b.frameNumber === 75)
      expect(threeQuarter?.x).toBe(75)
      expect(threeQuarter?.y).toBe(75)
      expect(threeQuarter?.width).toBe(175)
      expect(threeQuarter?.height).toBe(175)
    })

    it('should mark keyframes correctly', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 100, y: 50, width: 150, height: 120, frameNumber: 10 },
      ]

      const segments: InterpolationSegment[] = [
        { startFrame: 0, endFrame: 10, type: 'linear' },
      ]

      const result = interpolator.interpolate(keyframes, segments)

      // First keyframe
      const firstKeyframe = result.find(b => b.frameNumber === 0)
      expect(firstKeyframe?.isKeyframe).toBe(true)

      // Last keyframe
      const lastKeyframe = result.find(b => b.frameNumber === 10)
      expect(lastKeyframe?.isKeyframe).toBe(true)

      // Interpolated frame
      const interpolated = result.find(b => b.frameNumber === 5)
      expect(interpolated?.isKeyframe).toBe(false)
    })

    it('should handle multiple segments', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 50, y: 50, width: 100, height: 100, frameNumber: 10 },
        { x: 100, y: 100, width: 100, height: 100, frameNumber: 20 },
      ]

      const segments: InterpolationSegment[] = [
        { startFrame: 0, endFrame: 10, type: 'linear' },
        { startFrame: 10, endFrame: 20, type: 'linear' },
      ]

      const result = interpolator.interpolate(keyframes, segments)

      expect(result.length).toBe(21) // 0-20 inclusive

      // Check midpoint of first segment
      const mid1 = result.find(b => b.frameNumber === 5)
      expect(mid1?.x).toBe(25)

      // Check midpoint of second segment
      const mid2 = result.find(b => b.frameNumber === 15)
      expect(mid2?.x).toBe(75)
    })
  })

  describe('bezier interpolation', () => {
    it('should apply ease-in-out correctly', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 100, y: 0, width: 100, height: 100, frameNumber: 10 },
      ]

      const segments: InterpolationSegment[] = [
        {
          startFrame: 0,
          endFrame: 10,
          type: 'ease-in-out',
        },
      ]

      const result = interpolator.interpolate(keyframes, segments)

      // Ease-in-out should produce slower movement at start and end
      const frame1 = result.find(b => b.frameNumber === 1)
      const frame5 = result.find(b => b.frameNumber === 5)
      const frame9 = result.find(b => b.frameNumber === 9)

      // At frame 1, should be less than 10% of the way (slower start)
      expect(frame1!.x).toBeLessThan(10)

      // At frame 5 (midpoint), should be close to 50
      expect(frame5!.x).toBeCloseTo(50, 0)

      // At frame 9, should be more than 90% of the way (slower end)
      expect(frame9!.x).toBeGreaterThan(90)
    })

    it('should apply ease-in correctly', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 100, y: 0, width: 100, height: 100, frameNumber: 10 },
      ]

      const segments: InterpolationSegment[] = [
        { startFrame: 0, endFrame: 10, type: 'ease-in' },
      ]

      const result = interpolator.interpolate(keyframes, segments)

      // Ease-in should produce slower movement at start
      const frame1 = result.find(b => b.frameNumber === 1)
      const frame5 = result.find(b => b.frameNumber === 5)

      // At frame 1, should be very close to start (slow acceleration)
      expect(frame1!.x).toBeLessThan(5)

      // At frame 5, should be less than halfway (acceleration)
      expect(frame5!.x).toBeLessThan(50)
    })

    it('should apply ease-out correctly', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 100, y: 0, width: 100, height: 100, frameNumber: 10 },
      ]

      const segments: InterpolationSegment[] = [
        { startFrame: 0, endFrame: 10, type: 'ease-out' },
      ]

      const result = interpolator.interpolate(keyframes, segments)

      // Ease-out should produce faster movement at start, slower at end
      const frame5 = result.find(b => b.frameNumber === 5)
      const frame9 = result.find(b => b.frameNumber === 9)

      // At frame 5, should be more than halfway (deceleration)
      expect(frame5!.x).toBeGreaterThan(50)

      // At frame 9, should be very close to end but not quite there
      expect(frame9!.x).toBeGreaterThan(90)
      expect(frame9!.x).toBeLessThan(100)
    })

    it('should handle custom bezier control points', () => {
      const controlPoints: BezierControlPoint[] = [
        { x: 0.25, y: 0.1 },
        { x: 0.75, y: 0.9 },
      ]

      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 100, y: 0, width: 100, height: 100, frameNumber: 10 },
      ]

      const segments: InterpolationSegment[] = [
        {
          startFrame: 0,
          endFrame: 10,
          type: 'bezier',
          controlPoints: {
            x: controlPoints,
          },
        },
      ]

      const result = interpolator.interpolate(keyframes, segments)

      // Should produce a smooth curve
      expect(result.length).toBe(11)
      expect(result[0].x).toBe(0)
      expect(result[10].x).toBe(100)
    })
  })

  describe('hold interpolation', () => {
    it('should maintain start value throughout segment', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 100, y: 50, width: 150, height: 120, frameNumber: 10 },
      ]

      const segments: InterpolationSegment[] = [
        { startFrame: 0, endFrame: 10, type: 'hold' },
      ]

      const result = interpolator.interpolate(keyframes, segments)

      // All interpolated frames should match start keyframe
      for (let i = 1; i < 10; i++) {
        const frame = result.find(b => b.frameNumber === i)
        expect(frame?.x).toBe(0)
        expect(frame?.y).toBe(0)
        expect(frame?.width).toBe(100)
        expect(frame?.height).toBe(100)
      }
    })
  })

  describe('edge cases', () => {
    it('should handle single keyframe', () => {
      const keyframes: BoundingBox[] = [
        { x: 50, y: 50, width: 100, height: 100, frameNumber: 5 },
      ]

      const segments: InterpolationSegment[] = []

      const result = interpolator.interpolate(keyframes, segments)

      expect(result.length).toBe(1)
      expect(result[0]).toEqual({
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        frameNumber: 5,
        isKeyframe: true,
      })
    })

    it('should handle empty keyframes', () => {
      const keyframes: BoundingBox[] = []
      const segments: InterpolationSegment[] = []

      const result = interpolator.interpolate(keyframes, segments)

      expect(result.length).toBe(0)
    })

    it('should handle two keyframes at same position', () => {
      const keyframes: BoundingBox[] = [
        { x: 50, y: 50, width: 100, height: 100, frameNumber: 0 },
        { x: 50, y: 50, width: 100, height: 100, frameNumber: 10 },
      ]

      const segments: InterpolationSegment[] = [
        { startFrame: 0, endFrame: 10, type: 'linear' },
      ]

      const result = interpolator.interpolate(keyframes, segments)

      // All frames should have same position
      result.forEach(box => {
        expect(box.x).toBe(50)
        expect(box.y).toBe(50)
        expect(box.width).toBe(100)
        expect(box.height).toBe(100)
      })
    })

    it('should handle unsorted keyframes', () => {
      const keyframes: BoundingBox[] = [
        { x: 100, y: 100, width: 100, height: 100, frameNumber: 20 },
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 50, y: 50, width: 100, height: 100, frameNumber: 10 },
      ]

      const segments: InterpolationSegment[] = [
        { startFrame: 0, endFrame: 10, type: 'linear' },
        { startFrame: 10, endFrame: 20, type: 'linear' },
      ]

      const result = interpolator.interpolate(keyframes, segments)

      // Should sort and interpolate correctly
      expect(result[0].frameNumber).toBe(0)
      expect(result[result.length - 1].frameNumber).toBe(20)

      const mid = result.find(b => b.frameNumber === 10)
      expect(mid?.x).toBe(50)
    })
  })

  describe('keyframe manipulation', () => {
    let sequence: BoundingBoxSequence

    beforeEach(() => {
      sequence = {
        boxes: [
          { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
          { x: 100, y: 100, width: 100, height: 100, frameNumber: 20, isKeyframe: true },
        ],
        interpolationSegments: [
          { startFrame: 0, endFrame: 20, type: 'linear' },
        ],
        visibilityRanges: [
          { startFrame: 0, endFrame: 20, visible: true },
        ],
        trackingSource: 'manual',
        totalFrames: 21,
        keyframeCount: 2,
        interpolatedFrameCount: 19,
      }
    })

    it('should add keyframe at interpolated frame', () => {
      const updated = interpolator.addKeyframe(sequence, 10)

      expect(updated.keyframeCount).toBe(3)

      const newKeyframe = updated.boxes.find(b => b.frameNumber === 10)
      expect(newKeyframe).toBeDefined()
      expect(newKeyframe?.isKeyframe).toBe(true)
      expect(newKeyframe?.x).toBe(50) // Midpoint
      expect(newKeyframe?.y).toBe(50)
    })

    it('should not add duplicate keyframe', () => {
      const updated = interpolator.addKeyframe(sequence, 0)

      // Should not change
      expect(updated.keyframeCount).toBe(sequence.keyframeCount)
    })

    it('should remove keyframe', () => {
      // First add a keyframe
      const withKeyframe = interpolator.addKeyframe(sequence, 10)
      expect(withKeyframe.keyframeCount).toBe(3)

      // Then remove it
      const updated = interpolator.removeKeyframe(withKeyframe, 10)
      expect(updated.keyframeCount).toBe(2)

      const removed = updated.boxes.find(b => b.frameNumber === 10)
      expect(removed).toBeUndefined()
    })

    it('should not remove first or last keyframe', () => {
      const updated1 = interpolator.removeKeyframe(sequence, 0)
      expect(updated1.keyframeCount).toBe(sequence.keyframeCount)

      const updated2 = interpolator.removeKeyframe(sequence, 20)
      expect(updated2.keyframeCount).toBe(sequence.keyframeCount)
    })

    it('should not remove when only 1 keyframe exists', () => {
      const singleKeyframe: BoundingBoxSequence = {
        boxes: [{ x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true }],
        interpolationSegments: [],
        visibilityRanges: [],
        trackingSource: 'manual',
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0,
      }

      const updated = interpolator.removeKeyframe(singleKeyframe, 0)
      expect(updated.keyframeCount).toBe(1)
    })

    it('should update keyframe values', () => {
      const updated = interpolator.updateKeyframe(sequence, 0, {
        x: 10,
        y: 20,
        width: 120,
      })

      const updatedKeyframe = updated.boxes.find(b => b.frameNumber === 0)
      expect(updatedKeyframe?.x).toBe(10)
      expect(updatedKeyframe?.y).toBe(20)
      expect(updatedKeyframe?.width).toBe(120)
      expect(updatedKeyframe?.height).toBe(100) // Unchanged
    })

    it('should re-interpolate after keyframe update', () => {
      const updated = interpolator.updateKeyframe(sequence, 0, { x: 50 })

      // Midpoint should reflect new start value
      const allBoxes = interpolator.interpolate(updated.boxes, updated.interpolationSegments)
      const midpoint = allBoxes.find(b => b.frameNumber === 10)

      expect(midpoint?.x).toBe(75) // (50 + 100) / 2
    })
  })

  describe('performance tests', () => {
    it('should handle 10,000 frame sequence efficiently', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 10000, y: 5000, width: 150, height: 120, frameNumber: 10000 },
      ]

      const segments: InterpolationSegment[] = [
        { startFrame: 0, endFrame: 10000, type: 'linear' },
      ]

      const start = performance.now()
      const result = interpolator.interpolate(keyframes, segments)
      const duration = performance.now() - start

      expect(result.length).toBe(10001)
      expect(duration).toBeLessThan(100) // Should complete in <100ms
    })

    it('should update single keyframe efficiently', () => {
      // Create large sequence
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
        { x: 500, y: 500, width: 100, height: 100, frameNumber: 500 },
        { x: 1000, y: 1000, width: 100, height: 100, frameNumber: 1000 },
      ]

      const sequence: BoundingBoxSequence = {
        boxes: keyframes,
        interpolationSegments: [
          { startFrame: 0, endFrame: 500, type: 'linear' },
          { startFrame: 500, endFrame: 1000, type: 'linear' },
        ],
        visibilityRanges: [{ startFrame: 0, endFrame: 1000, visible: true }],
        trackingSource: 'manual',
        totalFrames: 1001,
        keyframeCount: 3,
        interpolatedFrameCount: 998,
      }

      const start = performance.now()
      interpolator.updateKeyframe(sequence, 500, { x: 600 })
      const duration = performance.now() - start

      expect(duration).toBeLessThan(50) // Should be fast
    })
  })
})

describe('LazyBoundingBoxSequence', () => {
  let keyframes: BoundingBox[]
  let segments: InterpolationSegment[]

  beforeEach(() => {
    keyframes = [
      { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
      { x: 100, y: 100, width: 150, height: 120, frameNumber: 100, isKeyframe: true },
    ]

    segments = [
      { startFrame: 0, endFrame: 100, type: 'linear' },
    ]
  })

  describe('lazy evaluation', () => {
    it('should return correct box at frame', () => {
      const lazy = new LazyBoundingBoxSequence(keyframes, segments)

      const box = lazy.getBoxAtFrame(50)

      expect(box).toBeDefined()
      expect(box?.x).toBe(50)
      expect(box?.y).toBe(50)
      expect(box?.width).toBe(125)
      expect(box?.height).toBe(110)
    })

    it('should return keyframe when requested', () => {
      const lazy = new LazyBoundingBoxSequence(keyframes, segments)

      const box = lazy.getBoxAtFrame(0)

      expect(box).toBeDefined()
      expect(box?.frameNumber).toBe(0)
      expect(box?.x).toBe(0)
    })

    it('should return null for frame outside range', () => {
      const lazy = new LazyBoundingBoxSequence(keyframes, segments)

      const box = lazy.getBoxAtFrame(200)

      expect(box).toBeNull()
    })
  })

  describe('caching', () => {
    it('should cache interpolated frames', () => {
      const lazy = new LazyBoundingBoxSequence(keyframes, segments)

      // First access
      lazy.getBoxAtFrame(50)
      expect(lazy.getCacheSize()).toBe(1)

      // Second access (should use cache)
      lazy.getBoxAtFrame(50)
      expect(lazy.getCacheSize()).toBe(1)

      // Different frame
      lazy.getBoxAtFrame(75)
      expect(lazy.getCacheSize()).toBe(2)
    })

    it('should invalidate entire cache', () => {
      const lazy = new LazyBoundingBoxSequence(keyframes, segments)

      lazy.getBoxAtFrame(50)
      lazy.getBoxAtFrame(75)
      expect(lazy.getCacheSize()).toBe(2)

      lazy.invalidateCache()
      expect(lazy.getCacheSize()).toBe(0)
    })

    it('should invalidate partial cache range', () => {
      const lazy = new LazyBoundingBoxSequence(keyframes, segments)

      // Cache several frames
      lazy.getBoxAtFrame(25)
      lazy.getBoxAtFrame(50)
      lazy.getBoxAtFrame(75)
      expect(lazy.getCacheSize()).toBe(3)

      // Invalidate middle range
      lazy.invalidateCache([40, 60])
      expect(lazy.getCacheSize()).toBe(2) // 25 and 75 remain

      // Verify correct frames remain
      const box25 = lazy.getBoxAtFrame(25)
      const box75 = lazy.getBoxAtFrame(75)
      expect(box25).toBeDefined()
      expect(box75).toBeDefined()
      expect(lazy.getCacheSize()).toBe(2)
    })

    it('should achieve high cache hit rate during scrubbing', () => {
      const lazy = new LazyBoundingBoxSequence(keyframes, segments)

      // Simulate scrubbing back and forth
      const frames = [0, 10, 20, 30, 20, 10, 0, 10, 20, 30, 40, 30, 20, 10]

      let cacheHits = 0
      let initialCacheSize = 0

      frames.forEach((frame, index) => {
        const sizeBefore = lazy.getCacheSize()
        lazy.getBoxAtFrame(frame)
        const sizeAfter = lazy.getCacheSize()

        if (index > 0 && sizeAfter === sizeBefore) {
          cacheHits++
        }

        if (index === 5) {
          initialCacheSize = sizeAfter
        }
      })

      // After initial pass, should have many cache hits
      const hitRate = cacheHits / (frames.length - 1)
      expect(hitRate).toBeGreaterThan(0.5) // >50% cache hits
    })
  })

  describe('cache performance', () => {
    it('should be faster on second access', () => {
      const lazy = new LazyBoundingBoxSequence(keyframes, segments)

      // First access (uncached)
      const start1 = performance.now()
      lazy.getBoxAtFrame(50)
      const duration1 = performance.now() - start1

      // Second access (cached)
      const start2 = performance.now()
      lazy.getBoxAtFrame(50)
      const duration2 = performance.now() - start2

      // Cached access should be much faster (though both might be very fast)
      expect(duration2).toBeLessThanOrEqual(duration1)
    })

    it('should handle 10,000 frame video with lazy evaluation', () => {
      const largeKeyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
        { x: 10000, y: 5000, width: 150, height: 120, frameNumber: 10000, isKeyframe: true },
      ]

      const largeSegments: InterpolationSegment[] = [
        { startFrame: 0, endFrame: 10000, type: 'linear' },
      ]

      const lazy = new LazyBoundingBoxSequence(largeKeyframes, largeSegments)

      // Access random frames
      const start = performance.now()
      for (let i = 0; i < 100; i++) {
        const randomFrame = Math.floor(Math.random() * 10000)
        lazy.getBoxAtFrame(randomFrame)
      }
      const duration = performance.now() - start

      // Should handle 100 random accesses quickly
      expect(duration).toBeLessThan(100)
      expect(lazy.getCacheSize()).toBeLessThanOrEqual(100)
    })
  })
})

describe('interpolation integration tests', () => {
  it('should handle complex multi-segment sequence', () => {
    const interpolator = new BoundingBoxInterpolator()

    const keyframes: BoundingBox[] = [
      { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
      { x: 50, y: 50, width: 110, height: 110, frameNumber: 25 },
      { x: 100, y: 25, width: 120, height: 105, frameNumber: 50 },
      { x: 150, y: 75, width: 130, height: 115, frameNumber: 75 },
    ]

    const segments: InterpolationSegment[] = [
      { startFrame: 0, endFrame: 25, type: 'linear' },
      { startFrame: 25, endFrame: 50, type: 'ease-in-out' },
      { startFrame: 50, endFrame: 75, type: 'linear' },
    ]

    const result = interpolator.interpolate(keyframes, segments)

    expect(result.length).toBe(76) // 0-75 inclusive
    expect(result[0].isKeyframe).toBe(true)
    expect(result[25].isKeyframe).toBe(true)
    expect(result[50].isKeyframe).toBe(true)
    expect(result[75].isKeyframe).toBe(true)

    // Check intermediate frames are interpolated
    expect(result[10].isKeyframe).toBe(false)
    expect(result[40].isKeyframe).toBe(false)
  })

  it('should produce smooth continuous motion across segments', () => {
    const interpolator = new BoundingBoxInterpolator()

    const keyframes: BoundingBox[] = [
      { x: 0, y: 0, width: 100, height: 100, frameNumber: 0 },
      { x: 100, y: 0, width: 100, height: 100, frameNumber: 50 },
      { x: 200, y: 0, width: 100, height: 100, frameNumber: 100 },
    ]

    const segments: InterpolationSegment[] = [
      { startFrame: 0, endFrame: 50, type: 'linear' },
      { startFrame: 50, endFrame: 100, type: 'linear' },
    ]

    const result = interpolator.interpolate(keyframes, segments)

    // Verify continuity at segment boundary
    const frame49 = result.find(b => b.frameNumber === 49)
    const frame50 = result.find(b => b.frameNumber === 50)
    const frame51 = result.find(b => b.frameNumber === 51)

    // Should increase smoothly
    expect(frame50!.x).toBeGreaterThan(frame49!.x)
    expect(frame51!.x).toBeGreaterThan(frame50!.x)

    // Velocity should be consistent (linear)
    const velocity1 = frame50!.x - frame49!.x
    const velocity2 = frame51!.x - frame50!.x
    expect(velocity2).toBeCloseTo(velocity1, 1)
  })
})
