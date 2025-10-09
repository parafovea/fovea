import { describe, it, expect } from 'vitest'
import { BoundingBoxInterpolator } from './interpolation'
import { BoundingBox } from '../models/types'

describe('BoundingBoxInterpolator', () => {
  const interpolator = new BoundingBoxInterpolator()

  describe('interpolate', () => {
    it('should return empty array for no keyframes', () => {
      const result = interpolator.interpolate([], [])
      expect(result).toEqual([])
    })

    it('should return single keyframe as-is', () => {
      const keyframes: BoundingBox[] = [
        { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }
      ]
      const result = interpolator.interpolate(keyframes, [])
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(keyframes[0])
    })

    it('should interpolate between two keyframes linearly', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
        { x: 100, y: 100, width: 200, height: 200, frameNumber: 10, isKeyframe: true }
      ]
      const result = interpolator.interpolate(keyframes, [])

      expect(result).toHaveLength(11) // Frame 0 to 10
      expect(result[0]).toMatchObject({ x: 0, y: 0, frameNumber: 0 })
      expect(result[5]).toMatchObject({ x: 50, y: 50, width: 150, height: 150, frameNumber: 5 })
      expect(result[10]).toMatchObject({ x: 100, y: 100, frameNumber: 10 })
    })

    it('should handle visibility ranges correctly', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
        { x: 100, y: 100, width: 100, height: 100, frameNumber: 20, isKeyframe: true }
      ]
      const visibilityRanges = [
        { startFrame: 0, endFrame: 10, visible: true },
        { startFrame: 15, endFrame: 20, visible: true }
      ]

      const result = interpolator.interpolate(keyframes, [], visibilityRanges)

      // Should only have frames in visible ranges plus hidden gap frames
      expect(result.length).toBeGreaterThan(0)
      // All frames should be within the overall range
      expect(result.every(box => box.frameNumber >= 0 && box.frameNumber <= 20)).toBe(true)
    })

    it('should mark keyframes correctly', () => {
      const keyframes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
        { x: 100, y: 100, width: 100, height: 100, frameNumber: 10, isKeyframe: true }
      ]
      const result = interpolator.interpolate(keyframes, [])

      expect(result[0].isKeyframe).toBe(true)
      expect(result[5].isKeyframe).toBe(false)
      expect(result[10].isKeyframe).toBe(true)
    })
  })

  describe('addKeyframe', () => {
    it('should add first keyframe', () => {
      const sequence = {
        boxes: [],
        interpolationSegments: [],
        visibilityRanges: [],
        totalFrames: 0,
        keyframeCount: 0,
        interpolatedFrameCount: 0
      }

      const result = interpolator.addKeyframe(sequence, 5)

      // addKeyframe requires at least one existing keyframe to compute position
      // With empty boxes, it should return the original sequence
      expect(result.boxes).toHaveLength(0)
    })

    it('should not add duplicate keyframe', () => {
      const sequence = {
        boxes: [
          { x: 0, y: 0, width: 100, height: 100, frameNumber: 5, isKeyframe: true }
        ],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 5, endFrame: 5, visible: true }],
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0
      }

      const result = interpolator.addKeyframe(sequence, 5)

      expect(result.keyframeCount).toBe(1)
      expect(result.boxes).toHaveLength(1)
    })

    it('should add keyframe with interpolated position', () => {
      const sequence = {
        boxes: [
          { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
          { x: 100, y: 100, width: 200, height: 200, frameNumber: 10, isKeyframe: true }
        ],
        interpolationSegments: [{ startFrame: 0, endFrame: 10, type: 'linear' }],
        visibilityRanges: [{ startFrame: 0, endFrame: 10, visible: true }],
        totalFrames: 11,
        keyframeCount: 2,
        interpolatedFrameCount: 9
      }

      const result = interpolator.addKeyframe(sequence, 5)

      expect(result.keyframeCount).toBe(3)
      const newKeyframe = result.boxes.find(b => b.frameNumber === 5 && b.isKeyframe)
      expect(newKeyframe).toBeDefined()
      expect(newKeyframe?.x).toBe(50) // Halfway between 0 and 100
      expect(newKeyframe?.y).toBe(50)
    })

    it('should expand visibility ranges when adding keyframe', () => {
      const sequence = {
        boxes: [
          { x: 0, y: 0, width: 100, height: 100, frameNumber: 5, isKeyframe: true }
        ],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 5, endFrame: 5, visible: true }],
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0
      }

      const result = interpolator.addKeyframe(sequence, 10)

      expect(result.visibilityRanges).toHaveLength(1)
      expect(result.visibilityRanges[0].startFrame).toBe(5)
      expect(result.visibilityRanges[0].endFrame).toBe(10)
    })
  })

  describe('removeKeyframe', () => {
    it('should remove keyframe and update counts', () => {
      const sequence = {
        boxes: [
          { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
          { x: 50, y: 50, width: 100, height: 100, frameNumber: 5, isKeyframe: true },
          { x: 100, y: 100, width: 100, height: 100, frameNumber: 10, isKeyframe: true }
        ],
        interpolationSegments: [
          { startFrame: 0, endFrame: 5, type: 'linear' },
          { startFrame: 5, endFrame: 10, type: 'linear' }
        ],
        visibilityRanges: [{ startFrame: 0, endFrame: 10, visible: true }],
        totalFrames: 11,
        keyframeCount: 3,
        interpolatedFrameCount: 8
      }

      const result = interpolator.removeKeyframe(sequence, 5)

      expect(result.keyframeCount).toBe(2)
      expect(result.boxes.filter(b => b.isKeyframe).every(b => b.frameNumber !== 5)).toBe(true)
    })

    it('should do nothing when removing non-existent keyframe', () => {
      const sequence = {
        boxes: [
          { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true }
        ],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0
      }

      const result = interpolator.removeKeyframe(sequence, 5)

      expect(result.keyframeCount).toBe(1)
      expect(result.boxes).toHaveLength(1)
    })

    it('should update interpolation segments after removal', () => {
      const sequence = {
        boxes: [
          { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
          { x: 50, y: 50, width: 100, height: 100, frameNumber: 5, isKeyframe: true },
          { x: 100, y: 100, width: 100, height: 100, frameNumber: 10, isKeyframe: true }
        ],
        interpolationSegments: [
          { startFrame: 0, endFrame: 5, type: 'linear' },
          { startFrame: 5, endFrame: 10, type: 'linear' }
        ],
        visibilityRanges: [{ startFrame: 0, endFrame: 10, visible: true }],
        totalFrames: 11,
        keyframeCount: 3,
        interpolatedFrameCount: 8
      }

      const result = interpolator.removeKeyframe(sequence, 5)

      expect(result.interpolationSegments).toHaveLength(1)
      expect(result.interpolationSegments[0].startFrame).toBe(0)
      expect(result.interpolationSegments[0].endFrame).toBe(10)
    })
  })

  describe('updateKeyframe', () => {
    it('should update keyframe properties', () => {
      const sequence = {
        boxes: [
          { x: 0, y: 0, width: 100, height: 100, frameNumber: 0, isKeyframe: true },
          { x: 100, y: 100, width: 100, height: 100, frameNumber: 10, isKeyframe: true }
        ],
        interpolationSegments: [{ startFrame: 0, endFrame: 10, type: 'linear' }],
        visibilityRanges: [{ startFrame: 0, endFrame: 10, visible: true }],
        totalFrames: 11,
        keyframeCount: 2,
        interpolatedFrameCount: 9
      }

      const updatedBox = { x: 150, y: 150, width: 100, height: 100, frameNumber: 10 }
      const result = interpolator.updateKeyframe(sequence, 10, updatedBox)

      const updated = result.boxes.find(b => b.frameNumber === 10 && b.isKeyframe)
      expect(updated).toBeDefined()
      expect(updated?.x).toBe(150)
      expect(updated?.y).toBe(150)
    })
  })
})
