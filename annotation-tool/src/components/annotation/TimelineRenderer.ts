/**
 * @module TimelineRenderer
 * @description Canvas-based timeline rendering with 60fps performance target.
 * Uses offscreen canvas for double buffering and virtual scrolling for large videos.
 */

import { BoundingBox, InterpolationSegment } from '../../models/types.js'

/**
 * @interface RenderOptions
 * @description Configuration options for timeline rendering.
 */
export interface RenderOptions {
  totalFrames: number
  currentFrame: number
  keyframes: BoundingBox[]
  interpolationSegments: InterpolationSegment[]
  zoom: number  // 1-10x
  theme: {
    backgroundColor: string
    textColor: string
    textSecondary: string
    dividerColor: string
    primaryMain: string
    primaryLight: string
    errorMain: string
  }
}

/**
 * @class TimelineRenderer
 * @description High-performance canvas renderer for timeline component.
 */
export class TimelineRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private offscreenCanvas: OffscreenCanvas | null = null
  private offscreenCtx: OffscreenCanvasRenderingContext2D | null = null
  private needsRedraw: boolean = true
  private animationFrameId: number | null = null

  // Viewport state
  private viewportStartFrame: number = 0
  private viewportEndFrame: number = 100
  private pixelsPerFrame: number = 10

  // Layout constants
  private readonly FRAME_RULER_HEIGHT = 20
  private readonly KEYFRAME_TRACK_HEIGHT = 30
  private readonly PADDING = 5

  /**
   * Create a timeline renderer.
   *
   * @param canvas - Canvas element to render to
   * @param totalFrames - Total number of frames in video
   */
  constructor(canvas: HTMLCanvasElement, totalFrames: number) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get 2D context from canvas')
    }
    this.ctx = ctx

    // Scale canvas for high-DPI displays to avoid grainy appearance
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    // Initialize offscreen canvas for double buffering
    if (typeof OffscreenCanvas !== 'undefined') {
      this.offscreenCanvas = new OffscreenCanvas(canvas.width, canvas.height)
      this.offscreenCtx = this.offscreenCanvas.getContext('2d')
      if (this.offscreenCtx) {
        this.offscreenCtx.scale(dpr, dpr)
      }
    }

    this.viewportEndFrame = Math.min(totalFrames - 1, this.viewportEndFrame)
  }

  /**
   * Set zoom level (1-10x).
   *
   * @param level - Zoom level
   */
  setZoom(level: number): void {
    this.pixelsPerFrame = level * 10  // Base 10 pixels per frame at 1x zoom
    this.needsRedraw = true
  }

  /**
   * Set viewport to display specific frame range.
   *
   * @param startFrame - First visible frame
   * @param endFrame - Last visible frame
   */
  setViewport(startFrame: number, endFrame: number): void {
    this.viewportStartFrame = startFrame
    this.viewportEndFrame = endFrame
    this.needsRedraw = true
  }

  /**
   * Resize canvas and offscreen canvas.
   *
   * @param width - New width (CSS pixels)
   * @param height - New height (CSS pixels)
   */
  resize(width: number, height: number): void {
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = width * dpr
    this.canvas.height = height * dpr
    this.ctx.scale(dpr, dpr)

    if (this.offscreenCanvas && this.offscreenCtx) {
      this.offscreenCanvas.width = width * dpr
      this.offscreenCanvas.height = height * dpr
      this.offscreenCtx.scale(dpr, dpr)
    }

    this.needsRedraw = true
  }

  /**
   * Main render loop using requestAnimationFrame.
   *
   * @param options - Render options
   * @param selectedKeyframes - Array of selected keyframe frame numbers
   */
  render(options: RenderOptions, selectedKeyframes: number[] = []): void {
    if (!this.needsRedraw) {
      return
    }

    // Use offscreen canvas if available, otherwise render directly
    const targetCanvas = this.offscreenCanvas || this.canvas
    const targetCtx = (this.offscreenCtx || this.ctx)!

    // Clear canvas
    targetCtx.clearRect(0, 0, targetCanvas.width, targetCanvas.height)

    // Fill background
    targetCtx.fillStyle = options.theme.backgroundColor
    targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height)

    // Calculate viewport based on zoom and current frame
    this.updateViewport(options)

    // Render timeline elements
    this.renderFrameRuler(targetCtx, options)
    this.renderKeyframes(targetCtx, options, selectedKeyframes)
    this.renderPlayhead(targetCtx, options)

    // Copy offscreen canvas to visible canvas if using double buffering
    if (this.offscreenCanvas && targetCtx !== this.ctx) {
      this.ctx.drawImage(this.offscreenCanvas, 0, 0)
    }

    this.needsRedraw = false
  }

  /**
   * Update viewport to keep current frame centered when zooming.
   *
   * @param options - Render options
   */
  private updateViewport(options: RenderOptions): void {
    const visibleFrames = Math.floor(this.canvas.width / this.pixelsPerFrame)

    // Center viewport on current frame
    const halfVisible = Math.floor(visibleFrames / 2)
    let startFrame = options.currentFrame - halfVisible
    let endFrame = options.currentFrame + halfVisible

    // Clamp to valid range
    if (startFrame < 0) {
      startFrame = 0
      endFrame = Math.min(options.totalFrames - 1, visibleFrames)
    }

    if (endFrame >= options.totalFrames) {
      endFrame = options.totalFrames - 1
      startFrame = Math.max(0, endFrame - visibleFrames)
    }

    this.viewportStartFrame = startFrame
    this.viewportEndFrame = endFrame
  }

  /**
   * Render frame ruler with tick marks and frame numbers.
   *
   * @param ctx - Canvas rendering context
   * @param options - Render options
   */
  private renderFrameRuler(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    options: RenderOptions
  ): void {
    const y = this.PADDING
    const height = this.FRAME_RULER_HEIGHT

    // Draw ruler background
    ctx.fillStyle = options.theme.backgroundColor
    ctx.fillRect(0, y, this.canvas.width, height)

    // Calculate tick interval based on zoom
    const majorTickInterval = this.getMajorTickInterval(options.zoom)
    const minorTickInterval = Math.max(1, Math.floor(majorTickInterval / 5))

    // Draw ticks and numbers
    ctx.strokeStyle = options.theme.dividerColor
    ctx.fillStyle = options.theme.textSecondary
    ctx.font = '9px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    for (let frame = this.viewportStartFrame; frame <= this.viewportEndFrame; frame++) {
      const x = this.frameToX(frame)

      // Draw major ticks with frame numbers
      if (frame % majorTickInterval === 0) {
        ctx.beginPath()
        ctx.moveTo(x, y + height - 7)
        ctx.lineTo(x, y + height)
        ctx.stroke()

        ctx.fillText(frame.toString(), x, y + 1)
      }
      // Draw minor ticks
      else if (frame % minorTickInterval === 0) {
        ctx.beginPath()
        ctx.moveTo(x, y + height - 3)
        ctx.lineTo(x, y + height)
        ctx.stroke()
      }
    }

    // Draw bottom border
    ctx.strokeStyle = options.theme.dividerColor
    ctx.beginPath()
    ctx.moveTo(0, y + height)
    ctx.lineTo(this.canvas.width, y + height)
    ctx.stroke()
  }

  /**
   * Render keyframes and interpolation segments.
   *
   * @param ctx - Canvas rendering context
   * @param options - Render options
   * @param selectedKeyframes - Array of selected keyframe frame numbers
   */
  private renderKeyframes(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    options: RenderOptions,
    selectedKeyframes: number[] = []
  ): void {
    const y = this.PADDING + this.FRAME_RULER_HEIGHT + this.PADDING
    const height = this.KEYFRAME_TRACK_HEIGHT
    const centerY = y + height / 2

    // Draw track background
    ctx.fillStyle = options.theme.backgroundColor
    ctx.fillRect(0, y, this.canvas.width, height)

    // Draw interpolation segment lines
    ctx.strokeStyle = options.theme.primaryLight
    ctx.lineWidth = 2

    for (const segment of options.interpolationSegments) {
      if (segment.endFrame < this.viewportStartFrame || segment.startFrame > this.viewportEndFrame) {
        continue
      }

      const startX = this.frameToX(segment.startFrame)
      const endX = this.frameToX(segment.endFrame)

      // Draw straight line for linear interpolation
      // For bezier, will draw curves in Session 5
      ctx.beginPath()
      ctx.moveTo(startX, centerY)

      if (segment.type === 'linear' || !segment.type) {
        ctx.lineTo(endX, centerY)
      } else if (segment.type === 'hold') {
        // Step function for hold
        ctx.lineTo(endX - 5, centerY)
        ctx.lineTo(endX - 5, centerY - 10)
        ctx.lineTo(endX, centerY - 10)
      } else {
        // For other types (bezier, easing), draw straight for now
        // Session 5 will add curve visualization
        ctx.lineTo(endX, centerY)
      }

      ctx.stroke()
    }

    // Draw keyframe dots
    for (const keyframe of options.keyframes) {
      if (keyframe.frameNumber < this.viewportStartFrame || keyframe.frameNumber > this.viewportEndFrame) {
        continue
      }

      const x = this.frameToX(keyframe.frameNumber)
      const isSelected = selectedKeyframes.includes(keyframe.frameNumber)

      // Draw circle
      ctx.beginPath()
      ctx.arc(x, centerY, 6, 0, Math.PI * 2)
      ctx.fillStyle = options.theme.primaryMain
      ctx.fill()

      // Draw border (blue if selected, white otherwise)
      ctx.strokeStyle = isSelected ? options.theme.primaryMain : '#ffffff'
      ctx.lineWidth = isSelected ? 3 : 2
      ctx.stroke()

      // Draw selection highlight
      if (isSelected) {
        ctx.beginPath()
        ctx.arc(x, centerY, 9, 0, Math.PI * 2)
        ctx.strokeStyle = options.theme.primaryMain
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
  }

  /**
   * Get keyframe at specific canvas X coordinate (within 10px radius).
   *
   * @param x - Canvas X coordinate
   * @param keyframes - Array of keyframe bounding boxes
   * @returns Frame number if keyframe found, null otherwise
   */
  getKeyframeAtX(x: number, keyframes: any[]): number | null {
    const clickRadius = 10

    for (const keyframe of keyframes) {
      const keyframeX = this.frameToX(keyframe.frameNumber)
      const distance = Math.abs(x - keyframeX)

      if (distance <= clickRadius) {
        return keyframe.frameNumber
      }
    }

    return null
  }

  /**
   * Render playhead as vertical red line.
   *
   * @param ctx - Canvas rendering context
   * @param options - Render options
   */
  private renderPlayhead(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    options: RenderOptions
  ): void {
    const x = this.frameToX(options.currentFrame)
    const rulerY = this.PADDING
    const rulerHeight = this.FRAME_RULER_HEIGHT
    const trackY = rulerY + rulerHeight + this.PADDING
    const trackHeight = this.KEYFRAME_TRACK_HEIGHT

    // Draw vertical line
    ctx.strokeStyle = options.theme.errorMain
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, rulerY)
    ctx.lineTo(x, trackY + trackHeight)
    ctx.stroke()

    // Draw draggable triangle handle at top
    ctx.fillStyle = options.theme.errorMain
    ctx.beginPath()
    ctx.moveTo(x, rulerY + 6)
    ctx.lineTo(x - 6, rulerY)
    ctx.lineTo(x + 6, rulerY)
    ctx.closePath()
    ctx.fill()

    // Draw white border on triangle
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  /**
   * Get major tick interval based on zoom level.
   *
   * @param zoom - Zoom level (1-10x)
   * @returns Frame interval for major ticks
   */
  private getMajorTickInterval(zoom: number): number {
    if (zoom >= 8) return 1
    if (zoom >= 5) return 5
    if (zoom >= 3) return 10
    if (zoom >= 2) return 20
    return 50
  }

  /**
   * Convert frame number to canvas X coordinate.
   *
   * @param frame - Frame number
   * @returns X coordinate on canvas
   */
  frameToX(frame: number): number {
    return (frame - this.viewportStartFrame) * this.pixelsPerFrame
  }

  /**
   * Convert canvas X coordinate to frame number.
   *
   * @param x - X coordinate on canvas
   * @returns Frame number
   */
  xToFrame(x: number): number {
    return Math.round(this.viewportStartFrame + x / this.pixelsPerFrame)
  }

  /**
   * Mark timeline as needing redraw and schedule render.
   */
  invalidate(): void {
    this.needsRedraw = true
  }

  /**
   * Cancel any pending animation frame.
   */
  destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }
}
