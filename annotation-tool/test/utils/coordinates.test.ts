/**
 * @file coordinates.test.ts
 * @description Tests for coordinate transformation utilities.
 * Ensures bounding boxes maintain position across different display sizes and aspect ratios.
 */

import { describe, it, expect } from 'vitest'
import {
  pixelToNormalized,
  normalizedToPixel,
  isNormalized,
  ensureNormalized,
  calculateVideoDisplayRect,
  screenToVideoPixel,
  videoPixelToScreen,
  getDisplayScale,
} from '@utils/coordinates'
import { BoundingBox } from '@models/types'

describe('Coordinate Transformations', () => {
  describe('pixelToNormalized', () => {
    it('converts center point correctly for 1920x1080 video', () => {
      const box: BoundingBox = {
        x: 960,
        y: 540,
        width: 200,
        height: 100,
        frameNumber: 0,
      }
      const dimensions = { width: 1920, height: 1080 }

      const normalized = pixelToNormalized(box, dimensions)

      expect(normalized.nx).toBeCloseTo(0.5, 4)
      expect(normalized.ny).toBeCloseTo(0.5, 4)
      expect(normalized.nw).toBeCloseTo(0.1042, 4)
      expect(normalized.nh).toBeCloseTo(0.0926, 4)
    })

    it('converts corner point (0, 0) correctly', () => {
      const box: BoundingBox = {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        frameNumber: 0,
      }
      const dimensions = { width: 1920, height: 1080 }

      const normalized = pixelToNormalized(box, dimensions)

      expect(normalized.nx).toBe(0)
      expect(normalized.ny).toBe(0)
    })

    it('preserves metadata through conversion', () => {
      const box: BoundingBox = {
        x: 100,
        y: 100,
        width: 50,
        height: 50,
        frameNumber: 42,
        isKeyframe: true,
        confidence: 0.95,
        metadata: { label: 'test' },
      }
      const dimensions = { width: 1000, height: 1000 }

      const normalized = pixelToNormalized(box, dimensions)

      expect(normalized.frameNumber).toBe(42)
      expect(normalized.isKeyframe).toBe(true)
      expect(normalized.confidence).toBe(0.95)
      expect(normalized.metadata).toEqual({ label: 'test' })
    })

    it('handles different aspect ratios', () => {
      // 4:3 video
      const box: BoundingBox = { x: 512, y: 384, width: 100, height: 100, frameNumber: 0 }
      const dims4x3 = { width: 1024, height: 768 }

      const normalized = pixelToNormalized(box, dims4x3)

      expect(normalized.nx).toBeCloseTo(0.5, 4)
      expect(normalized.ny).toBeCloseTo(0.5, 4)
    })
  })

  describe('normalizedToPixel', () => {
    it('converts normalized center to pixels', () => {
      const normalized = {
        nx: 0.5,
        ny: 0.5,
        nw: 0.1,
        nh: 0.1,
        frameNumber: 0,
      }
      const dimensions = { width: 1920, height: 1080 }

      const pixel = normalizedToPixel(normalized, dimensions)

      expect(pixel.x).toBe(960)
      expect(pixel.y).toBe(540)
      expect(pixel.width).toBe(192)
      expect(pixel.height).toBe(108)
    })

    it('converts to different video dimensions', () => {
      const normalized = {
        nx: 0.25,
        ny: 0.25,
        nw: 0.5,
        nh: 0.5,
        frameNumber: 0,
      }

      // 1920x1080
      const hd = normalizedToPixel(normalized, { width: 1920, height: 1080 })
      expect(hd.x).toBe(480)
      expect(hd.y).toBe(270)

      // 1280x720
      const sd = normalizedToPixel(normalized, { width: 1280, height: 720 })
      expect(sd.x).toBe(320)
      expect(sd.y).toBe(180)
    })
  })

  describe('round-trip accuracy', () => {
    it('maintains precision through pixel→normalized→pixel conversion', () => {
      const original: BoundingBox = {
        x: 123.456,
        y: 789.012,
        width: 50.5,
        height: 75.25,
        frameNumber: 0,
      }
      const dimensions = { width: 1920, height: 1080 }

      const normalized = pixelToNormalized(original, dimensions)
      const restored = normalizedToPixel(normalized, dimensions)

      expect(restored.x).toBeCloseTo(original.x, 2)
      expect(restored.y).toBeCloseTo(original.y, 2)
      expect(restored.width).toBeCloseTo(original.width, 2)
      expect(restored.height).toBeCloseTo(original.height, 2)
    })

    it('maintains relative position across different display sizes', () => {
      const dims4x3 = { width: 1024, height: 768 }
      const dims16x9 = { width: 1920, height: 1080 }

      // Box at 10% from left, 10% from top in 4:3
      const box4x3: BoundingBox = {
        x: 102.4, // 10% of 1024
        y: 76.8, // 10% of 768
        width: 100,
        height: 100,
        frameNumber: 0,
      }

      // Convert to normalized
      const normalized = pixelToNormalized(box4x3, dims4x3)

      // Convert to 16:9 display
      const box16x9 = normalizedToPixel(normalized, dims16x9)

      // Relative position should be preserved
      expect(box16x9.x / dims16x9.width).toBeCloseTo(box4x3.x / dims4x3.width, 4)
      expect(box16x9.y / dims16x9.height).toBeCloseTo(box4x3.y / dims4x3.height, 4)
    })
  })

  describe('isNormalized', () => {
    it('returns true for normalized coordinates', () => {
      const normalized: BoundingBox = {
        x: 0.5,
        y: 0.5,
        width: 0.1,
        height: 0.1,
        frameNumber: 0,
      }

      expect(isNormalized(normalized)).toBe(true)
    })

    it('returns false for pixel coordinates', () => {
      const pixel: BoundingBox = {
        x: 100,
        y: 200,
        width: 50,
        height: 75,
        frameNumber: 0,
      }

      expect(isNormalized(pixel)).toBe(false)
    })

    it('returns true for edge case at exactly 1', () => {
      const edge: BoundingBox = {
        x: 1,
        y: 1,
        width: 1,
        height: 1,
        frameNumber: 0,
      }

      expect(isNormalized(edge)).toBe(true)
    })
  })

  describe('ensureNormalized', () => {
    it('returns normalized box unchanged', () => {
      const normalized: BoundingBox = {
        x: 0.5,
        y: 0.5,
        width: 0.1,
        height: 0.1,
        frameNumber: 0,
      }

      const result = ensureNormalized(normalized, { width: 1920, height: 1080 })

      expect(result.nx).toBe(0.5)
      expect(result.ny).toBe(0.5)
    })

    it('converts pixel coordinates to normalized', () => {
      const pixel: BoundingBox = {
        x: 960,
        y: 540,
        width: 192,
        height: 108,
        frameNumber: 0,
      }

      const result = ensureNormalized(pixel, { width: 1920, height: 1080 })

      expect(result.nx).toBeCloseTo(0.5, 4)
      expect(result.ny).toBeCloseTo(0.5, 4)
    })
  })
})

describe('Video Display Rect Calculations', () => {
  describe('calculateVideoDisplayRect', () => {
    it('fills container when aspect ratios match', () => {
      const video = { width: 1920, height: 1080 }
      const container = { width: 1920, height: 1080 }

      const rect = calculateVideoDisplayRect(video, container)

      expect(rect.x).toBe(0)
      expect(rect.y).toBe(0)
      expect(rect.width).toBe(1920)
      expect(rect.height).toBe(1080)
    })

    it('letterboxes when video is wider than container', () => {
      const video = { width: 1920, height: 1080 } // 16:9
      const container = { width: 800, height: 600 } // 4:3

      const rect = calculateVideoDisplayRect(video, container)

      expect(rect.width).toBe(800) // Full width
      expect(rect.height).toBe(450) // 800 / (16/9) = 450
      expect(rect.x).toBe(0)
      expect(rect.y).toBe(75) // (600 - 450) / 2
    })

    it('pillarboxes when video is taller than container', () => {
      const video = { width: 1024, height: 768 } // 4:3
      const container = { width: 1920, height: 1080 } // 16:9

      const rect = calculateVideoDisplayRect(video, container)

      expect(rect.height).toBe(1080) // Full height
      expect(rect.width).toBe(1440) // 1080 * (4/3) = 1440
      expect(rect.x).toBe(240) // (1920 - 1440) / 2
      expect(rect.y).toBe(0)
    })

    it('handles square container with widescreen video', () => {
      const video = { width: 1920, height: 1080 } // 16:9
      const container = { width: 500, height: 500 } // 1:1

      const rect = calculateVideoDisplayRect(video, container)

      expect(rect.width).toBe(500)
      expect(rect.height).toBeCloseTo(281.25, 2) // 500 / (16/9)
    })
  })

  describe('screenToVideoPixel', () => {
    it('converts screen coordinates when video fills container', () => {
      const container = { width: 1920, height: 1080 }
      const video = { width: 1920, height: 1080 }

      const result = screenToVideoPixel(960, 540, container, video)

      expect(result).not.toBeNull()
      expect(result!.x).toBe(960)
      expect(result!.y).toBe(540)
    })

    it('accounts for letterboxing', () => {
      const video = { width: 1920, height: 1080 } // 16:9
      const container = { width: 800, height: 600 } // 4:3

      // Video is at y=75 to y=525 (450px tall)
      // Click at center of video area
      const result = screenToVideoPixel(400, 300, container, video)

      expect(result).not.toBeNull()
      expect(result!.x).toBe(960) // Center of 1920
      expect(result!.y).toBe(540) // Center of 1080
    })

    it('returns null when clicking outside video area (letterbox)', () => {
      const video = { width: 1920, height: 1080 }
      const container = { width: 800, height: 600 }

      // Click in letterbox area (top black bar)
      const result = screenToVideoPixel(400, 50, container, video)

      expect(result).toBeNull()
    })

    it('accounts for pillarboxing', () => {
      const video = { width: 1024, height: 768 } // 4:3
      const container = { width: 1920, height: 1080 } // 16:9

      // Video is at x=240 to x=1680 (1440px wide)
      const result = screenToVideoPixel(960, 540, container, video)

      expect(result).not.toBeNull()
      expect(result!.x).toBe(512) // Center of 1024
      expect(result!.y).toBe(384) // Center of 768
    })

    it('returns null when clicking outside video area (pillarbox)', () => {
      const video = { width: 1024, height: 768 }
      const container = { width: 1920, height: 1080 }

      // Click in pillarbox area (left black bar)
      const result = screenToVideoPixel(100, 540, container, video)

      expect(result).toBeNull()
    })
  })

  describe('videoPixelToScreen', () => {
    it('converts video coordinates when video fills container', () => {
      const container = { width: 1920, height: 1080 }
      const video = { width: 1920, height: 1080 }

      const result = videoPixelToScreen(960, 540, container, video)

      expect(result.x).toBe(960)
      expect(result.y).toBe(540)
    })

    it('accounts for letterboxing offset', () => {
      const video = { width: 1920, height: 1080 }
      const container = { width: 800, height: 600 }

      // Video center should map to container center
      const result = videoPixelToScreen(960, 540, container, video)

      expect(result.x).toBe(400)
      expect(result.y).toBe(300) // 75 + 225 = 300
    })

    it('round-trips with screenToVideoPixel', () => {
      const video = { width: 1920, height: 1080 }
      const container = { width: 800, height: 600 }

      // Start with video coordinates
      const videoCoord = { x: 480, y: 270 }

      // Convert to screen
      const screen = videoPixelToScreen(videoCoord.x, videoCoord.y, container, video)

      // Convert back to video
      const roundTrip = screenToVideoPixel(screen.x, screen.y, container, video)

      expect(roundTrip).not.toBeNull()
      expect(roundTrip!.x).toBeCloseTo(videoCoord.x, 2)
      expect(roundTrip!.y).toBeCloseTo(videoCoord.y, 2)
    })
  })

  describe('getDisplayScale', () => {
    it('returns 1 when video matches container', () => {
      const video = { width: 1920, height: 1080 }
      const container = { width: 1920, height: 1080 }

      const scale = getDisplayScale(video, container)

      expect(scale).toBe(1)
    })

    it('returns correct scale for letterboxed video', () => {
      const video = { width: 1920, height: 1080 }
      const container = { width: 800, height: 600 }

      const scale = getDisplayScale(video, container)

      expect(scale).toBeCloseTo(800 / 1920, 4) // ~0.4167
    })

    it('returns correct scale for pillarboxed video', () => {
      const video = { width: 1024, height: 768 }
      const container = { width: 1920, height: 1080 }

      const scale = getDisplayScale(video, container)

      expect(scale).toBeCloseTo(1440 / 1024, 4) // ~1.406
    })
  })
})

describe('Bounding Box Position Stability', () => {
  it('box maintains relative position when container resizes', () => {
    const video = { width: 1920, height: 1080 }

    // Box at 25% from left, 25% from top
    const originalBox: BoundingBox = {
      x: 480,
      y: 270,
      width: 200,
      height: 150,
      frameNumber: 0,
    }

    // Normalize the box
    const normalized = pixelToNormalized(originalBox, video)

    // Simulate different container sizes
    const containers = [
      { width: 1920, height: 1080 }, // Full size
      { width: 1280, height: 720 }, // HD
      { width: 800, height: 600 }, // Small (letterboxed)
      { width: 600, height: 800 }, // Portrait (pillarboxed)
    ]

    for (const container of containers) {
      const displayRect = calculateVideoDisplayRect(video, container)
      const screenBox = videoPixelToScreen(originalBox.x, originalBox.y, container, video)

      // Relative position within the video display area should be constant
      const relativeX = (screenBox.x - displayRect.x) / displayRect.width
      const relativeY = (screenBox.y - displayRect.y) / displayRect.height

      expect(relativeX).toBeCloseTo(normalized.nx, 4)
      expect(relativeY).toBeCloseTo(normalized.ny, 4)
    }
  })

  it('box aspect ratio is preserved during resize', () => {
    const video = { width: 1920, height: 1080 }

    // Create a 4:3 aspect ratio box
    const box: BoundingBox = {
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      frameNumber: 0,
    }

    const originalAspect = box.width / box.height // 4/3 = 1.333...

    // Convert to normalized
    const normalized = pixelToNormalized(box, video)
    const normalizedAspect = (normalized.nw * video.width) / (normalized.nh * video.height)

    // Convert to different video size
    const smallVideo = { width: 1280, height: 720 }
    const resized = normalizedToPixel(normalized, smallVideo)
    const resizedAspect = resized.width / resized.height

    expect(normalizedAspect).toBeCloseTo(originalAspect, 4)
    expect(resizedAspect).toBeCloseTo(originalAspect, 4)
  })
})
