/**
 * Core interpolation engine for bounding box sequences.
 *
 * @remarks
 * Supports linear, bezier, easing, and parametric interpolation modes
 * with lazy evaluation and frame-level caching for performance.
 *
 * @packageDocumentation
 */

import {
  BoundingBox,
  BoundingBoxSequence,
  InterpolationSegment,
  InterpolationType,
  BezierControlPoint,
  ParametricFunction,
} from '@models/types'

/**
 * Interpolates bounding boxes between keyframes using configurable easing modes.
 */
export class BoundingBoxInterpolator {
  /**
   * Generates all frames for a bounding box sequence by interpolating between keyframes.
   *
   * @param visibilityRanges - When provided, frames outside visible ranges are skipped
   * @returns Sorted array of boxes including keyframes and interpolated frames
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
   * Interpolates a single frame between two keyframes.
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
   * Interpolates a single numeric property between two values using the specified easing.
   *
   * @param config - Bezier control points or parametric function configuration
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

  private linearInterpolate(startValue: number, endValue: number, t: number): number {
    return startValue + (endValue - startValue) * t
  }

  private easeIn(startValue: number, endValue: number, t: number): number {
    const easedT = t * t
    return startValue + (endValue - startValue) * easedT
  }

  private easeOut(startValue: number, endValue: number, t: number): number {
    const easedT = t * (2 - t)
    return startValue + (endValue - startValue) * easedT
  }

  private easeInOut(startValue: number, endValue: number, t: number): number {
    const easedT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    return startValue + (endValue - startValue) * easedT
  }

  /**
   * Evaluates a cubic Bezier curve using Newton-Raphson iteration to solve for t.
   *
   * @param controlPoints - Must contain exactly 2 control points
   * @returns Falls back to linear interpolation if control points are invalid
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
   * Solves for t parameter in Bezier curve given x value using Newton-Raphson iteration.
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
   * Evaluates a parametric function (quadratic physics, sinusoidal oscillation, etc.).
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
   * Updates a keyframe and re-interpolates the sequence.
   *
   * @returns New sequence with updated keyframe (original unchanged)
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
   * Adds a new keyframe at the specified frame.
   *
   * @remarks
   * If the frame already has a keyframe, returns the original sequence unchanged.
   * If no box exists at the frame, interpolates from surrounding keyframes.
   * Creates interpolation segments if none exist.
   */
  addKeyframe(sequence: BoundingBoxSequence, frameNumber: number): BoundingBoxSequence {
    // Check if keyframe already exists
    const existingKeyframe = sequence.boxes.find(
      b => b.frameNumber === frameNumber && (b.isKeyframe || b.isKeyframe === undefined)
    )
    if (existingKeyframe) {
      return sequence
    }

    // Generate current interpolated value (ignore visibility for interpolation)
    const allBoxes = this.interpolate(sequence.boxes, sequence.interpolationSegments)
    let interpolatedBox = allBoxes.find(b => b.frameNumber === frameNumber)

    // If no interpolated box exists, create one from nearest keyframe
    if (!interpolatedBox) {
      const keyframes = sequence.boxes.filter(b => b.isKeyframe || b.isKeyframe === undefined)
      if (keyframes.length === 0) return sequence

      const sorted = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
      const prevKeyframes = sorted.filter(k => k.frameNumber < frameNumber)
      const nextKeyframes = sorted.filter(k => k.frameNumber > frameNumber)

      if (prevKeyframes.length === 0 && nextKeyframes.length === 0) {
        return sequence
      } else if (prevKeyframes.length === 0) {
        interpolatedBox = { ...nextKeyframes[0], frameNumber, isKeyframe: false }
      } else if (nextKeyframes.length === 0) {
        interpolatedBox = { ...prevKeyframes[prevKeyframes.length - 1], frameNumber, isKeyframe: false }
      } else {
        // Linear interpolation
        const prev = prevKeyframes[prevKeyframes.length - 1]
        const next = nextKeyframes[0]
        const t = (frameNumber - prev.frameNumber) / (next.frameNumber - prev.frameNumber)
        interpolatedBox = {
          x: prev.x + (next.x - prev.x) * t,
          y: prev.y + (next.y - prev.y) * t,
          width: prev.width + (next.width - prev.width) * t,
          height: prev.height + (next.height - prev.height) * t,
          frameNumber,
          isKeyframe: false,
        }
      }
    }

    // Add as keyframe
    const newKeyframe: BoundingBox = {
      ...interpolatedBox,
      isKeyframe: true,
    }

    const updatedKeyframes = [...sequence.boxes, newKeyframe].sort(
      (a, b) => a.frameNumber - b.frameNumber
    )

    // Update interpolation segments (pass keyframes to create segments if empty)
    const updatedSegments = this.updateSegmentsForNewKeyframe(
      sequence.interpolationSegments,
      frameNumber,
      updatedKeyframes
    )

    // Update visibility ranges to include new keyframe
    const updatedVisibilityRanges = this.expandVisibilityForKeyframe(
      sequence.visibilityRanges || [],
      frameNumber,
      updatedKeyframes
    )

    // Re-interpolate
    const interpolatedBoxes = this.interpolate(updatedKeyframes, updatedSegments, updatedVisibilityRanges)

    return {
      ...sequence,
      boxes: interpolatedBoxes.filter(b => b.isKeyframe),
      interpolationSegments: updatedSegments,
      visibilityRanges: updatedVisibilityRanges,
      keyframeCount: updatedKeyframes.length,
      interpolatedFrameCount: interpolatedBoxes.length - updatedKeyframes.length,
      totalFrames: interpolatedBoxes.length,
    }
  }

  /**
   * Expands visibility ranges to include a new keyframe.
   */
  private expandVisibilityForKeyframe(
    ranges: Array<{ startFrame: number; endFrame: number; visible: boolean }>,
    _frameNumber: number,
    keyframes: BoundingBox[]
  ): Array<{ startFrame: number; endFrame: number; visible: boolean }> {
    // Sort keyframes to find first and last
    const sorted = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
    const firstFrame = sorted[0].frameNumber
    const lastFrame = sorted[sorted.length - 1].frameNumber

    if (ranges.length === 0) {
      // Create initial range spanning all keyframes
      return [{
        startFrame: firstFrame,
        endFrame: lastFrame,
        visible: true,
      }]
    }

    // Check if new keyframe extends beyond current range
    const visibleRanges = ranges.filter(r => r.visible)

    if (visibleRanges.length === 0) {
      // No visible ranges, create one spanning all keyframes
      return [...ranges, { startFrame: firstFrame, endFrame: lastFrame, visible: true }]
    }

    // Expand main visible range to include all keyframes
    const mainRange = visibleRanges[0]
    const otherRanges = ranges.filter(r => r !== mainRange)

    return [
      {
        ...mainRange,
        startFrame: Math.min(mainRange.startFrame, firstFrame),
        endFrame: Math.max(mainRange.endFrame, lastFrame),
      },
      ...otherRanges
    ]
  }

  /**
   * Removes a keyframe from the sequence and re-interpolates.
   *
   * @remarks
   * Cannot remove first or last keyframe, or if only one keyframe exists.
   * Returns original sequence if removal is not allowed.
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
   * Updates interpolation segments when adding a new keyframe.
   *
   * @remarks
   * If segments array is empty but we have 2+ keyframes, creates linear segments
   * between all keyframe pairs. Otherwise, splits the segment containing the new frame.
   */
  private updateSegmentsForNewKeyframe(
    segments: InterpolationSegment[],
    frameNumber: number,
    keyframes: BoundingBox[]
  ): InterpolationSegment[] {
    // If segments array is empty but we have 2+ keyframes, create segments
    if (segments.length === 0 && keyframes.length >= 2) {
      const sorted = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
      const newSegments: InterpolationSegment[] = []
      for (let i = 0; i < sorted.length - 1; i++) {
        newSegments.push({
          type: 'linear',
          startFrame: sorted[i].frameNumber,
          endFrame: sorted[i + 1].frameNumber,
        })
      }
      return newSegments
    }

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
   * Merges adjacent segments when a keyframe is removed.
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
 * Lazy evaluation wrapper for bounding box sequences with frame-level caching.
 *
 * @remarks
 * Computes interpolated frames on-demand and caches results to avoid recalculation
 * during rapid scrubbing. Use {@link invalidateCache} when the sequence changes.
 */
export class LazyBoundingBoxSequence {
  private keyframes: BoundingBox[]
  private segments: InterpolationSegment[]
  private cache: Map<number, BoundingBox> = new Map()
  private interpolator: BoundingBoxInterpolator

  constructor(keyframes: BoundingBox[], segments: InterpolationSegment[]) {
    this.keyframes = keyframes
    this.segments = segments
    this.interpolator = new BoundingBoxInterpolator()
  }

  /**
   * Gets the bounding box at a specific frame, computing and caching if needed.
   *
   * @returns The box, or null if the frame is outside all segments
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
   * Invalidates cached frames. Call after modifying keyframes or segments.
   *
   * @param affectedFrameRange - Specific range to invalidate, or omit to clear all
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

  getCacheSize(): number {
    return this.cache.size
  }
}

/**
 * Checks whether a frame is visible based on visibility ranges.
 *
 * @returns True if visible (defaults to true if no ranges defined)
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
 * Convenience function to get the interpolated box at a specific frame.
 *
 * @returns The box, or null if frame is hidden or outside the sequence
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

function findPreviousKeyframe(keyframes: BoundingBox[], frameNumber: number): BoundingBox | null {
  const sorted = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].frameNumber <= frameNumber) {
      return sorted[i]
    }
  }
  return null
}

function findNextKeyframe(keyframes: BoundingBox[], frameNumber: number): BoundingBox | null {
  const sorted = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].frameNumber >= frameNumber) {
      return sorted[i]
    }
  }
  return null
}
