/**
 * @module interpolation
 * @description Core interpolation engine for bounding box sequences.
 * Provides linear and bezier interpolation with lazy evaluation and caching.
 */

import {
  BoundingBox,
  BoundingBoxSequence,
  InterpolationSegment,
  InterpolationType,
  BezierControlPoint,
  ParametricFunction,
} from '../models/types.js'

/**
 * @class BoundingBoxInterpolator
 * @description Interpolates bounding boxes between keyframes using various interpolation modes.
 */
export class BoundingBoxInterpolator {
  /**
   * Generate all frames for a bounding box sequence.
   *
   * @param keyframes - User-defined keyframes
   * @param segments - Interpolation configuration per segment
   * @param visibilityRanges - Optional visibility ranges for discontiguous sequences
   * @returns Complete sequence with interpolated frames
   */
  interpolate(
    keyframes: BoundingBox[],
    segments: InterpolationSegment[],
    visibilityRanges?: Array<{ startFrame: number; endFrame: number; visible: boolean }>
  ): BoundingBox[] {
    if (keyframes.length === 0) {
      return []
    }

    if (keyframes.length === 1) {
      return [{ ...keyframes[0], isKeyframe: true }]
    }

    // Sort keyframes by frame number
    const sortedKeyframes = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)

    const result: BoundingBox[] = []

    // Process each segment between keyframes
    for (let i = 0; i < sortedKeyframes.length - 1; i++) {
      const startKeyframe = sortedKeyframes[i]
      const endKeyframe = sortedKeyframes[i + 1]

      // Find segment configuration for this range
      const segment = segments.find(
        s => s.startFrame === startKeyframe.frameNumber && s.endFrame === endKeyframe.frameNumber
      ) || { startFrame: startKeyframe.frameNumber, endFrame: endKeyframe.frameNumber, type: 'linear' as InterpolationType }

      // Add start keyframe (if visible)
      if (!visibilityRanges || getVisibilityAtFrame(visibilityRanges, startKeyframe.frameNumber)) {
        result.push({ ...startKeyframe, isKeyframe: true })
      }

      // Generate interpolated frames (only for visible frames)
      for (let frame = startKeyframe.frameNumber + 1; frame < endKeyframe.frameNumber; frame++) {
        // Check visibility
        if (visibilityRanges && !getVisibilityAtFrame(visibilityRanges, frame)) {
          continue // Skip hidden frames
        }

        const interpolatedBox = this.interpolateFrame(
          startKeyframe,
          endKeyframe,
          frame,
          segment
        )
        result.push(interpolatedBox)
      }
    }

    // Add final keyframe (if visible)
    const finalKeyframe = sortedKeyframes[sortedKeyframes.length - 1]
    if (!visibilityRanges || getVisibilityAtFrame(visibilityRanges, finalKeyframe.frameNumber)) {
      result.push({ ...finalKeyframe, isKeyframe: true })
    }

    return result
  }

  /**
   * Interpolate a single frame between two keyframes.
   *
   * @param startKeyframe - Starting keyframe
   * @param endKeyframe - Ending keyframe
   * @param currentFrame - Frame to interpolate
   * @param segment - Interpolation configuration
   * @returns Interpolated bounding box
   */
  private interpolateFrame(
    startKeyframe: BoundingBox,
    endKeyframe: BoundingBox,
    currentFrame: number,
    segment: InterpolationSegment
  ): BoundingBox {
    const x = this.interpolateProperty(
      startKeyframe.x,
      endKeyframe.x,
      startKeyframe.frameNumber,
      endKeyframe.frameNumber,
      currentFrame,
      segment.type,
      segment.controlPoints?.x
    )

    const y = this.interpolateProperty(
      startKeyframe.y,
      endKeyframe.y,
      startKeyframe.frameNumber,
      endKeyframe.frameNumber,
      currentFrame,
      segment.type,
      segment.controlPoints?.y
    )

    const width = this.interpolateProperty(
      startKeyframe.width,
      endKeyframe.width,
      startKeyframe.frameNumber,
      endKeyframe.frameNumber,
      currentFrame,
      segment.type,
      segment.controlPoints?.width
    )

    const height = this.interpolateProperty(
      startKeyframe.height,
      endKeyframe.height,
      startKeyframe.frameNumber,
      endKeyframe.frameNumber,
      currentFrame,
      segment.type,
      segment.controlPoints?.height
    )

    return {
      x,
      y,
      width,
      height,
      frameNumber: currentFrame,
      isKeyframe: false,
    }
  }

  /**
   * Interpolate a single property between two keyframes.
   *
   * @param startValue - Starting value
   * @param endValue - Ending value
   * @param startFrame - Starting frame number
   * @param endFrame - Ending frame number
   * @param currentFrame - Current frame number
   * @param type - Interpolation type
   * @param config - Optional bezier control points or parametric function
   * @returns Interpolated value
   */
  interpolateProperty(
    startValue: number,
    endValue: number,
    startFrame: number,
    endFrame: number,
    currentFrame: number,
    type: InterpolationType,
    config?: BezierControlPoint[] | ParametricFunction
  ): number {
    // Normalize time (0-1)
    const t = (currentFrame - startFrame) / (endFrame - startFrame)

    switch (type) {
      case 'linear':
        return this.linearInterpolate(startValue, endValue, t)

      case 'bezier':
        if (config && Array.isArray(config)) {
          return this.evaluateBezier(t, startValue, endValue, config)
        }
        return this.linearInterpolate(startValue, endValue, t)

      case 'ease-in':
        return this.easeIn(startValue, endValue, t)

      case 'ease-out':
        return this.easeOut(startValue, endValue, t)

      case 'ease-in-out':
        return this.easeInOut(startValue, endValue, t)

      case 'hold':
        return startValue

      case 'parametric':
        if (config && !Array.isArray(config)) {
          return this.evaluateParametric(t, startValue, endValue, config)
        }
        return this.linearInterpolate(startValue, endValue, t)

      default:
        return this.linearInterpolate(startValue, endValue, t)
    }
  }

  /**
   * Linear interpolation.
   *
   * @param startValue - Starting value
   * @param endValue - Ending value
   * @param t - Normalized time (0-1)
   * @returns Interpolated value
   */
  private linearInterpolate(startValue: number, endValue: number, t: number): number {
    return startValue + (endValue - startValue) * t
  }

  /**
   * Ease-in interpolation (gradual acceleration).
   *
   * @param startValue - Starting value
   * @param endValue - Ending value
   * @param t - Normalized time (0-1)
   * @returns Interpolated value
   */
  private easeIn(startValue: number, endValue: number, t: number): number {
    const easedT = t * t
    return startValue + (endValue - startValue) * easedT
  }

  /**
   * Ease-out interpolation (gradual deceleration).
   *
   * @param startValue - Starting value
   * @param endValue - Ending value
   * @param t - Normalized time (0-1)
   * @returns Interpolated value
   */
  private easeOut(startValue: number, endValue: number, t: number): number {
    const easedT = t * (2 - t)
    return startValue + (endValue - startValue) * easedT
  }

  /**
   * Ease-in-out interpolation (smooth acceleration and deceleration).
   *
   * @param startValue - Starting value
   * @param endValue - Ending value
   * @param t - Normalized time (0-1)
   * @returns Interpolated value
   */
  private easeInOut(startValue: number, endValue: number, t: number): number {
    const easedT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    return startValue + (endValue - startValue) * easedT
  }

  /**
   * Evaluate cubic Bezier curve.
   *
   * @param t - Normalized time (0-1)
   * @param p0 - Start value
   * @param p3 - End value
   * @param controlPoints - Bezier control points
   * @returns Interpolated value
   */
  evaluateBezier(
    t: number,
    p0: number,
    p3: number,
    controlPoints: BezierControlPoint[]
  ): number {
    if (controlPoints.length !== 2) {
      return this.linearInterpolate(p0, p3, t)
    }

    // Solve for t given x (temporal position) using Newton-Raphson
    const tSolved = this.solveBezierT(t, controlPoints[0].x, controlPoints[1].x)

    // Evaluate Bezier curve at solved t
    const p1 = controlPoints[0].y
    const p2 = controlPoints[1].y

    const mt = 1 - tSolved
    const bezierValue =
      mt * mt * mt * 0 +
      3 * mt * mt * tSolved * p1 +
      3 * mt * tSolved * tSolved * p2 +
      tSolved * tSolved * tSolved * 1

    return p0 + (p3 - p0) * bezierValue
  }

  /**
   * Solve for t parameter in Bezier curve given x value using Newton-Raphson iteration.
   *
   * @param x - Target x value (temporal position, 0-1)
   * @param p1x - First control point x
   * @param p2x - Second control point x
   * @returns Solved t parameter
   */
  private solveBezierT(x: number, p1x: number, p2x: number): number {
    // Newton-Raphson iteration
    let t = x
    const epsilon = 0.0001
    const maxIterations = 10

    for (let i = 0; i < maxIterations; i++) {
      const mt = 1 - t
      const currentX =
        3 * mt * mt * t * p1x +
        3 * mt * t * t * p2x +
        t * t * t

      const error = currentX - x
      if (Math.abs(error) < epsilon) {
        break
      }

      // Derivative of Bezier x
      const derivative =
        3 * mt * mt * p1x +
        6 * mt * t * (p2x - p1x) +
        3 * t * t * (1 - p2x)

      if (Math.abs(derivative) < epsilon) {
        break
      }

      t = t - error / derivative
      t = Math.max(0, Math.min(1, t)) // Clamp to [0, 1]
    }

    return t
  }

  /**
   * Evaluate parametric function.
   *
   * @param t - Normalized time (0-1)
   * @param startValue - Starting value
   * @param endValue - Ending value
   * @param func - Parametric function configuration
   * @returns Interpolated value
   */
  evaluateParametric(
    t: number,
    startValue: number,
    endValue: number,
    func: ParametricFunction
  ): number {
    const totalDist = endValue - startValue

    switch (func.type) {
      case 'linear':
        return startValue + totalDist * t

      case 'quadratic': {
        // Gravity: s = s₀ + v₀t + ½at²
        const a = func.parameters.a || 9.8
        const v0 = totalDist - 0.5 * a
        return startValue + v0 * t + 0.5 * a * t * t
      }

      case 'sinusoidal': {
        // Oscillation
        const frequency = func.parameters.frequency || 1
        const amplitude = func.parameters.amplitude || 0.2
        const linear = startValue + totalDist * t
        const oscillation = amplitude * Math.sin(2 * Math.PI * frequency * t)
        return linear + oscillation * totalDist
      }

      case 'custom':
        // Custom expressions not implemented in this session
        return this.linearInterpolate(startValue, endValue, t)

      default:
        return this.linearInterpolate(startValue, endValue, t)
    }
  }

  /**
   * Update a keyframe in the sequence (immutable).
   *
   * @param sequence - Bounding box sequence
   * @param frameNumber - Frame number to update
   * @param newBox - New bounding box values
   * @returns Updated sequence
   */
  updateKeyframe(
    sequence: BoundingBoxSequence,
    frameNumber: number,
    newBox: Partial<BoundingBox>
  ): BoundingBoxSequence {
    const keyframes = sequence.boxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)
    const keyframeIndex = keyframes.findIndex(b => b.frameNumber === frameNumber)

    if (keyframeIndex === -1) {
      return sequence
    }

    const updatedKeyframes = [...keyframes]
    updatedKeyframes[keyframeIndex] = {
      ...keyframes[keyframeIndex],
      ...newBox,
      frameNumber,
      isKeyframe: true,
    }

    // Re-interpolate sequence
    const interpolatedBoxes = this.interpolate(updatedKeyframes, sequence.interpolationSegments)

    return {
      ...sequence,
      boxes: interpolatedBoxes.filter(b => b.isKeyframe),
      keyframeCount: updatedKeyframes.length,
      interpolatedFrameCount: interpolatedBoxes.length - updatedKeyframes.length,
      totalFrames: interpolatedBoxes.length,
    }
  }

  /**
   * Add a new keyframe at the specified frame.
   *
   * @param sequence - Bounding box sequence
   * @param frameNumber - Frame number for new keyframe
   * @returns Updated sequence
   */
  addKeyframe(sequence: BoundingBoxSequence, frameNumber: number): BoundingBoxSequence {
    // Check if keyframe already exists
    const existingKeyframe = sequence.boxes.find(
      b => b.frameNumber === frameNumber && (b.isKeyframe || b.isKeyframe === undefined)
    )
    if (existingKeyframe) {
      return sequence
    }

    // Generate current interpolated value
    const allBoxes = this.interpolate(sequence.boxes, sequence.interpolationSegments)
    const interpolatedBox = allBoxes.find(b => b.frameNumber === frameNumber)

    if (!interpolatedBox) {
      return sequence
    }

    // Add as keyframe
    const newKeyframe: BoundingBox = {
      ...interpolatedBox,
      isKeyframe: true,
    }

    const updatedKeyframes = [...sequence.boxes, newKeyframe].sort(
      (a, b) => a.frameNumber - b.frameNumber
    )

    // Update interpolation segments
    const updatedSegments = this.updateSegmentsForNewKeyframe(
      sequence.interpolationSegments,
      frameNumber
    )

    // Re-interpolate
    const interpolatedBoxes = this.interpolate(updatedKeyframes, updatedSegments)

    return {
      ...sequence,
      boxes: interpolatedBoxes.filter(b => b.isKeyframe),
      interpolationSegments: updatedSegments,
      keyframeCount: updatedKeyframes.length,
      interpolatedFrameCount: interpolatedBoxes.length - updatedKeyframes.length,
      totalFrames: interpolatedBoxes.length,
    }
  }

  /**
   * Remove a keyframe from the sequence.
   *
   * @param sequence - Bounding box sequence
   * @param frameNumber - Frame number to remove
   * @returns Updated sequence
   */
  removeKeyframe(sequence: BoundingBoxSequence, frameNumber: number): BoundingBoxSequence {
    const keyframes = sequence.boxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)

    // Cannot remove if less than 2 keyframes
    if (keyframes.length <= 1) {
      return sequence
    }

    // Cannot remove first or last keyframe
    const sortedKeyframes = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
    if (
      frameNumber === sortedKeyframes[0].frameNumber ||
      frameNumber === sortedKeyframes[sortedKeyframes.length - 1].frameNumber
    ) {
      return sequence
    }

    const updatedKeyframes = keyframes.filter(b => b.frameNumber !== frameNumber)

    // Update interpolation segments
    const updatedSegments = this.updateSegmentsForRemovedKeyframe(
      sequence.interpolationSegments,
      frameNumber
    )

    // Re-interpolate
    const interpolatedBoxes = this.interpolate(updatedKeyframes, updatedSegments)

    return {
      ...sequence,
      boxes: interpolatedBoxes.filter(b => b.isKeyframe),
      interpolationSegments: updatedSegments,
      keyframeCount: updatedKeyframes.length,
      interpolatedFrameCount: interpolatedBoxes.length - updatedKeyframes.length,
      totalFrames: interpolatedBoxes.length,
    }
  }

  /**
   * Update interpolation segments when adding a new keyframe.
   *
   * @param segments - Current interpolation segments
   * @param frameNumber - New keyframe frame number
   * @returns Updated segments
   */
  private updateSegmentsForNewKeyframe(
    segments: InterpolationSegment[],
    frameNumber: number
  ): InterpolationSegment[] {
    const updatedSegments: InterpolationSegment[] = []

    for (const segment of segments) {
      if (frameNumber > segment.startFrame && frameNumber < segment.endFrame) {
        // Split segment
        updatedSegments.push({
          ...segment,
          endFrame: frameNumber,
        })
        updatedSegments.push({
          ...segment,
          startFrame: frameNumber,
        })
      } else {
        updatedSegments.push(segment)
      }
    }

    return updatedSegments
  }

  /**
   * Update interpolation segments when removing a keyframe.
   *
   * @param segments - Current interpolation segments
   * @param frameNumber - Removed keyframe frame number
   * @returns Updated segments
   */
  private updateSegmentsForRemovedKeyframe(
    segments: InterpolationSegment[],
    frameNumber: number
  ): InterpolationSegment[] {
    const updatedSegments: InterpolationSegment[] = []

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]

      if (segment.endFrame === frameNumber && i + 1 < segments.length) {
        // Merge with next segment
        const nextSegment = segments[i + 1]
        updatedSegments.push({
          ...segment,
          endFrame: nextSegment.endFrame,
        })
        i++ // Skip next segment
      } else if (segment.startFrame === frameNumber) {
        // Skip this segment (will be merged in previous iteration)
        continue
      } else {
        updatedSegments.push(segment)
      }
    }

    return updatedSegments
  }
}

/**
 * @class LazyBoundingBoxSequence
 * @description Lazy evaluation wrapper for bounding box sequences with caching.
 */
export class LazyBoundingBoxSequence {
  private keyframes: BoundingBox[]
  private segments: InterpolationSegment[]
  private cache: Map<number, BoundingBox> = new Map()
  private interpolator: BoundingBoxInterpolator

  /**
   * Create a lazy bounding box sequence.
   *
   * @param keyframes - Keyframe bounding boxes
   * @param segments - Interpolation segments
   */
  constructor(keyframes: BoundingBox[], segments: InterpolationSegment[]) {
    this.keyframes = keyframes
    this.segments = segments
    this.interpolator = new BoundingBoxInterpolator()
  }

  /**
   * Get bounding box at a specific frame with caching.
   *
   * @param frameNumber - Frame number
   * @returns Bounding box at frame
   */
  getBoxAtFrame(frameNumber: number): BoundingBox | null {
    // Check cache first
    if (this.cache.has(frameNumber)) {
      return this.cache.get(frameNumber)!
    }

    // Check if frame is a keyframe
    const keyframe = this.keyframes.find(k => k.frameNumber === frameNumber)
    if (keyframe) {
      this.cache.set(frameNumber, keyframe)
      return keyframe
    }

    // Find segment containing this frame
    const segment = this.segments.find(
      s => frameNumber >= s.startFrame && frameNumber <= s.endFrame
    )

    if (!segment) {
      return null
    }

    // Find surrounding keyframes
    const startKeyframe = this.keyframes.find(k => k.frameNumber === segment.startFrame)
    const endKeyframe = this.keyframes.find(k => k.frameNumber === segment.endFrame)

    if (!startKeyframe || !endKeyframe) {
      return null
    }

    // Interpolate
    const x = this.interpolator.interpolateProperty(
      startKeyframe.x,
      endKeyframe.x,
      startKeyframe.frameNumber,
      endKeyframe.frameNumber,
      frameNumber,
      segment.type,
      segment.controlPoints?.x
    )

    const y = this.interpolator.interpolateProperty(
      startKeyframe.y,
      endKeyframe.y,
      startKeyframe.frameNumber,
      endKeyframe.frameNumber,
      frameNumber,
      segment.type,
      segment.controlPoints?.y
    )

    const width = this.interpolator.interpolateProperty(
      startKeyframe.width,
      endKeyframe.width,
      startKeyframe.frameNumber,
      endKeyframe.frameNumber,
      frameNumber,
      segment.type,
      segment.controlPoints?.width
    )

    const height = this.interpolator.interpolateProperty(
      startKeyframe.height,
      endKeyframe.height,
      startKeyframe.frameNumber,
      endKeyframe.frameNumber,
      frameNumber,
      segment.type,
      segment.controlPoints?.height
    )

    const box: BoundingBox = {
      x,
      y,
      width,
      height,
      frameNumber,
      isKeyframe: false,
    }

    // Cache result
    this.cache.set(frameNumber, box)
    return box
  }

  /**
   * Invalidate cache for specific frame range.
   *
   * @param affectedFrameRange - Optional frame range to invalidate
   */
  invalidateCache(affectedFrameRange?: [number, number]): void {
    if (affectedFrameRange) {
      const [startFrame, endFrame] = affectedFrameRange
      for (let f = startFrame; f <= endFrame; f++) {
        this.cache.delete(f)
      }
    } else {
      this.cache.clear()
    }
  }

  /**
   * Get cache statistics.
   *
   * @returns Cache size
   */
  getCacheSize(): number {
    return this.cache.size
  }
}

/**
 * Check visibility of a frame in a sequence.
 *
 * @param visibilityRanges - Visibility ranges from sequence
 * @param frameNumber - Frame to check
 * @returns True if frame is visible
 */
export function getVisibilityAtFrame(
  visibilityRanges: Array<{ startFrame: number; endFrame: number; visible: boolean }>,
  frameNumber: number
): boolean {
  if (visibilityRanges.length === 0) {
    return true // Default to visible if no ranges defined
  }

  const range = visibilityRanges.find(
    r => r.startFrame <= frameNumber && r.endFrame >= frameNumber
  )

  return range?.visible ?? true // Default to visible if no range found
}

/**
 * Interpolate a bounding box sequence and return the box at a specific frame.
 * This is a convenience function that respects visibility ranges.
 *
 * @param sequence - Bounding box sequence
 * @param frameNumber - Frame number to get box for
 * @returns Bounding box at frame, or null if frame is hidden
 */
export function interpolate(
  sequence: BoundingBoxSequence,
  frameNumber: number
): BoundingBox | null {
  // Step 1: Check visibility
  const isVisible = getVisibilityAtFrame(sequence.visibilityRanges, frameNumber)
  if (!isVisible) {
    return null // Don't generate box for hidden frames
  }

  // Step 2: Find keyframes
  const keyframes = sequence.boxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)
  const prevKeyframe = findPreviousKeyframe(keyframes, frameNumber)
  const nextKeyframe = findNextKeyframe(keyframes, frameNumber)

  // If frame is exactly a keyframe, return it
  const exactKeyframe = keyframes.find(k => k.frameNumber === frameNumber)
  if (exactKeyframe) {
    return exactKeyframe
  }

  if (!prevKeyframe || !nextKeyframe) {
    return null
  }

  // Step 3: Get interpolation segment
  const segment = sequence.interpolationSegments.find(
    s => s.startFrame === prevKeyframe.frameNumber && s.endFrame === nextKeyframe.frameNumber
  )

  if (!segment) {
    // No segment defined, use linear interpolation
    const interpolator = new BoundingBoxInterpolator()
    return interpolator['interpolateFrame'](
      prevKeyframe,
      nextKeyframe,
      frameNumber,
      { startFrame: prevKeyframe.frameNumber, endFrame: nextKeyframe.frameNumber, type: 'linear' }
    )
  }

  // Step 4: Apply interpolation based on segment type
  const interpolator = new BoundingBoxInterpolator()
  return interpolator['interpolateFrame'](prevKeyframe, nextKeyframe, frameNumber, segment)
}

/**
 * Find the previous keyframe before a given frame.
 *
 * @param keyframes - Array of keyframes
 * @param frameNumber - Current frame
 * @returns Previous keyframe or null
 */
function findPreviousKeyframe(keyframes: BoundingBox[], frameNumber: number): BoundingBox | null {
  const sorted = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].frameNumber <= frameNumber) {
      return sorted[i]
    }
  }
  return null
}

/**
 * Find the next keyframe after a given frame.
 *
 * @param keyframes - Array of keyframes
 * @param frameNumber - Current frame
 * @returns Next keyframe or null
 */
function findNextKeyframe(keyframes: BoundingBox[], frameNumber: number): BoundingBox | null {
  const sorted = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].frameNumber >= frameNumber) {
      return sorted[i]
    }
  }
  return null
}
