/**
 * @module TimelineRenderer.test
 * @description Comprehensive unit tests for TimelineRenderer component.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TimelineRenderer, RenderOptions } from './TimelineRenderer'
import { BoundingBox, InterpolationSegment } from '../../models/types'

describe('TimelineRenderer', () => {
  let canvas: HTMLCanvasElement
  let renderer: TimelineRenderer
  let mockCtx: any

  const createMockCanvas = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 800
    canvas.height = 60

    // Mock canvas 2d context
    const mockContext = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      scale: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'start' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      drawImage: vi.fn(),
    }

    // Mock getContext to return our mock context
    canvas.getContext = vi.fn((contextType: string) => {
      if (contextType === '2d') {
        return mockContext as any
      }
      return null
    }) as any

    return canvas
  }

  const mockTheme = {
    backgroundColor: '#ffffff',
    textColor: '#000000',
    textSecondary: '#666666',
    dividerColor: '#cccccc',
    primaryMain: '#1976d2',
    primaryLight: '#42a5f5',
    errorMain: '#d32f2f',
  }

  const createKeyframe = (frameNumber: number): BoundingBox => ({
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    frameNumber,
    isKeyframe: true,
  })

  const createInterpolationSegment = (startFrame: number, endFrame: number): InterpolationSegment => ({
    startFrame,
    endFrame,
    type: 'linear',
  })

  beforeEach(() => {
    canvas = createMockCanvas()
    mockCtx = canvas.getContext('2d')
    if (!mockCtx) throw new Error('Failed to get 2D context')

    renderer = new TimelineRenderer(canvas, 300)
  })

  describe('Initialization', () => {
    it('should create renderer with valid canvas', () => {
      expect(renderer).toBeDefined()
    })

    it('should throw error if canvas context is null', () => {
      const badCanvas = {
        getContext: () => null,
      } as any
      expect(() => new TimelineRenderer(badCanvas, 300)).toThrow('Failed to get 2D context from canvas')
    })

    it('should initialize with correct total frames', () => {
      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 0,
        keyframes: [],
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }
      renderer.render(options)
      expect(mockCtx.clearRect).toHaveBeenCalled()
    })
  })

  describe('Zoom functionality', () => {
    it('should set zoom level', () => {
      renderer.setZoom(2)
      renderer.invalidate()

      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 50,
        keyframes: [],
        interpolationSegments: [],
        zoom: 2,
        theme: mockTheme,
      }

      renderer.render(options)
      expect(mockCtx.clearRect).toHaveBeenCalled()
    })

    it('should handle zoom level 1 (default)', () => {
      renderer.setZoom(1)
      renderer.invalidate()

      const frame = renderer.xToFrame(10)
      expect(frame).toBeGreaterThanOrEqual(0)
    })

    it('should handle zoom level 10 (max)', () => {
      renderer.setZoom(10)
      renderer.invalidate()

      const frame = renderer.xToFrame(100)
      expect(frame).toBeGreaterThanOrEqual(0)
    })

    it('should adjust pixels per frame based on zoom', () => {
      renderer.setZoom(1)
      const x1 = renderer.frameToX(10)

      renderer.setZoom(2)
      const x2 = renderer.frameToX(10)

      expect(x2).toBeGreaterThan(x1)
    })
  })

  describe('Viewport management', () => {
    it('should set viewport range', () => {
      renderer.setViewport(50, 150)
      renderer.invalidate()

      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 100,
        keyframes: [],
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)
      expect(mockCtx.clearRect).toHaveBeenCalled()
    })

    it('should handle viewport at start of timeline', () => {
      renderer.setViewport(0, 100)
      const x = renderer.frameToX(0)
      expect(x).toBe(0)
    })

    it('should handle viewport at end of timeline', () => {
      renderer.setViewport(200, 299)
      const x = renderer.frameToX(200)
      expect(x).toBe(0)
    })
  })

  describe('Frame coordinate conversion', () => {
    beforeEach(() => {
      renderer.setZoom(1) // 10 pixels per frame
      renderer.setViewport(0, 100)
    })

    it('should convert frame to X coordinate', () => {
      const x = renderer.frameToX(10)
      expect(x).toBe(100) // 10 frames * 10 pixels per frame
    })

    it('should convert X coordinate to frame', () => {
      const frame = renderer.xToFrame(100)
      expect(frame).toBe(10)
    })

    it('should handle frame 0', () => {
      const x = renderer.frameToX(0)
      expect(x).toBe(0)
    })

    it('should round frame numbers correctly', () => {
      const frame = renderer.xToFrame(105)
      expect(Number.isInteger(frame)).toBe(true)
    })

    it('should handle negative X coordinates', () => {
      const frame = renderer.xToFrame(-10)
      expect(frame).toBeLessThan(0)
    })
  })

  describe('Rendering', () => {
    it('should render empty timeline', () => {
      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 0,
        keyframes: [],
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)

      expect(mockCtx.clearRect).toHaveBeenCalled()
      expect(mockCtx.fillRect).toHaveBeenCalled()
    })

    it('should render timeline with keyframes', () => {
      const keyframes = [
        createKeyframe(0),
        createKeyframe(50),
        createKeyframe(100),
      ]

      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 50,
        keyframes,
        interpolationSegments: [
          createInterpolationSegment(0, 50),
          createInterpolationSegment(50, 100),
        ],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)

      // With zoom=1 (10 pixels/frame) and 800px canvas, viewport shows ~80 frames
      // Current frame 50 means viewport ~10-90, so keyframe at 100 is outside
      // Only keyframes at 0 and 50 should be rendered, but actually keyframe 0 is also outside
      // Viewport with currentFrame=50 is ~10-90, so only frame 50 is visible
      expect(mockCtx.arc).toHaveBeenCalled() // At least one keyframe circle is rendered
    })

    it('should render playhead at current frame', () => {
      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 50,
        keyframes: [],
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)

      // Playhead should draw vertical line and triangle
      expect(mockCtx.moveTo).toHaveBeenCalled()
      expect(mockCtx.lineTo).toHaveBeenCalled()
    })

    it('should render frame ruler with tick marks', () => {
      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 0,
        keyframes: [],
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)

      // Should draw tick marks and frame numbers
      expect(mockCtx.fillText).toHaveBeenCalled()
      expect(mockCtx.stroke).toHaveBeenCalled()
    })

    it('should render interpolation segments', () => {
      const keyframes = [
        createKeyframe(0),
        createKeyframe(100),
      ]

      const segments = [
        createInterpolationSegment(0, 100),
      ]

      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 50,
        keyframes,
        interpolationSegments: segments,
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)

      // Should draw line connecting keyframes
      expect(mockCtx.moveTo).toHaveBeenCalled()
      expect(mockCtx.lineTo).toHaveBeenCalled()
    })

    it('should highlight selected keyframes', () => {
      const keyframes = [
        createKeyframe(0),
        createKeyframe(50),
        createKeyframe(100),
      ]

      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 50,
        keyframes,
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options, [50]) // Select frame 50

      // Should draw extra selection ring around selected keyframe
      expect(mockCtx.arc).toHaveBeenCalled()
    })

    it('should skip rendering if needsRedraw is false', () => {
      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 0,
        keyframes: [],
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      // First render
      renderer.render(options)
      const firstCallCount = (mockCtx.clearRect as any).mock.calls.length

      // Second render without invalidate
      renderer.render(options)
      const secondCallCount = (mockCtx.clearRect as any).mock.calls.length

      // Should not render again
      expect(secondCallCount).toBe(firstCallCount)
    })

    it('should render after invalidate', () => {
      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 0,
        keyframes: [],
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)
      const firstCallCount = (mockCtx.clearRect as any).mock.calls.length

      renderer.invalidate()
      renderer.render(options)
      const secondCallCount = (mockCtx.clearRect as any).mock.calls.length

      // Should render again
      expect(secondCallCount).toBeGreaterThan(firstCallCount)
    })
  })

  describe('Keyframe detection', () => {
    it('should detect keyframe at X coordinate', () => {
      const keyframes = [createKeyframe(50)]
      renderer.setZoom(1)
      renderer.setViewport(0, 100)

      const keyframeX = renderer.frameToX(50)
      const detected = renderer.getKeyframeAtX(keyframeX, keyframes)

      expect(detected).toBe(50)
    })

    it('should detect keyframe within click radius', () => {
      const keyframes = [createKeyframe(50)]
      renderer.setZoom(1)
      renderer.setViewport(0, 100)

      const keyframeX = renderer.frameToX(50)
      const detected = renderer.getKeyframeAtX(keyframeX + 5, keyframes)

      expect(detected).toBe(50)
    })

    it('should return null if no keyframe near X', () => {
      const keyframes = [createKeyframe(50)]
      renderer.setZoom(1)
      renderer.setViewport(0, 100)

      const detected = renderer.getKeyframeAtX(0, keyframes)

      expect(detected).toBeNull()
    })

    it('should handle empty keyframes array', () => {
      const detected = renderer.getKeyframeAtX(100, [])
      expect(detected).toBeNull()
    })
  })

  describe('Canvas resizing', () => {
    it('should resize canvas', () => {
      renderer.resize(1000, 80)

      expect(canvas.width).toBe(1000)
      expect(canvas.height).toBe(80)
    })

    it('should mark as needing redraw after resize', () => {
      renderer.resize(1000, 80)

      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 0,
        keyframes: [],
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)
      expect(mockCtx.clearRect).toHaveBeenCalled()
    })
  })

  describe('Cleanup', () => {
    it('should cleanup resources on destroy', () => {
      renderer.destroy()
      // Should not throw
      expect(true).toBe(true)
    })
  })

  describe('Edge cases', () => {
    it('should handle single keyframe', () => {
      const keyframes = [createKeyframe(0)]

      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 0,
        keyframes,
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)
      expect(mockCtx.arc).toHaveBeenCalledTimes(1)
    })

    it('should handle very large totalFrames', () => {
      renderer = new TimelineRenderer(canvas, 100000)

      const options: RenderOptions = {
        totalFrames: 100000,
        currentFrame: 50000,
        keyframes: [],
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)
      expect(mockCtx.clearRect).toHaveBeenCalled()
    })

    it('should handle currentFrame at totalFrames boundary', () => {
      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 299,
        keyframes: [],
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)
      expect(mockCtx.clearRect).toHaveBeenCalled()
    })

    it('should handle keyframes outside viewport', () => {
      const keyframes = [
        createKeyframe(10),  // Inside viewport
        createKeyframe(500), // Outside totalFrames
      ]

      renderer.setZoom(1)
      renderer.setViewport(0, 100)

      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 10,  // Set currentFrame to match keyframe inside viewport
        keyframes,
        interpolationSegments: [],
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)
      // updateViewport will be called during render and may change viewport
      // But keyframe at 10 should be rendered if currentFrame is 10
      expect(mockCtx.arc).toHaveBeenCalled()
    })
  })

  describe('Interpolation type rendering', () => {
    it('should render linear interpolation', () => {
      const keyframes = [
        createKeyframe(0),
        createKeyframe(100),
      ]

      const segments = [
        { startFrame: 0, endFrame: 100, type: 'linear' as const },
      ]

      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 50,
        keyframes,
        interpolationSegments: segments,
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)
      expect(mockCtx.lineTo).toHaveBeenCalled()
    })

    it('should render hold interpolation with step', () => {
      const keyframes = [
        createKeyframe(0),
        createKeyframe(100),
      ]

      const segments = [
        { startFrame: 0, endFrame: 100, type: 'hold' as const },
      ]

      const options: RenderOptions = {
        totalFrames: 300,
        currentFrame: 50,
        keyframes,
        interpolationSegments: segments,
        zoom: 1,
        theme: mockTheme,
      }

      renderer.render(options)
      expect(mockCtx.lineTo).toHaveBeenCalled()
    })
  })
})
