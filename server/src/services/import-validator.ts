import { ValidationResult } from './import-types.js'

/**
 * @interface BoundingBox
 * @description Represents a spatial bounding box at a specific video frame.
 */
interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  frameNumber: number
  confidence?: number
  isKeyframe?: boolean
  metadata?: Record<string, unknown>
}

/**
 * @interface InterpolationSegment
 * @description Defines interpolation behavior between two keyframes.
 */
interface InterpolationSegment {
  startFrame: number
  endFrame: number
  type: 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold' | 'parametric'
  controlPoints?: unknown
  parametric?: unknown
}

/**
 * @interface BoundingBoxSequence
 * @description Complete sequence of bounding boxes with interpolation configuration.
 */
interface BoundingBoxSequence {
  boxes: BoundingBox[]
  interpolationSegments?: InterpolationSegment[]
  visibilityRanges?: Array<{
    startFrame: number
    endFrame: number
    visible: boolean
  }>
  trackId?: string | number
  trackingSource?: 'manual' | 'samurai' | 'sam2long' | 'sam2' | 'yolo11seg'
  trackingConfidence?: number
  totalFrames?: number
  keyframeCount?: number
  interpolatedFrameCount?: number
}

/**
 * @interface VideoMetadata
 * @description Video metadata for validation.
 */
interface VideoMetadata {
  width: number
  height: number
  fps?: number
  duration?: number
}

/**
 * Supported interpolation types.
 */
const SUPPORTED_INTERPOLATION_TYPES = [
  'linear',
  'bezier',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'hold',
  'parametric'
] as const

/**
 * @class SequenceValidator
 * @description Validates bounding box sequences for import.
 */
export class SequenceValidator {
  /**
   * Validate a bounding box sequence.
   *
   * @param sequence - Bounding box sequence to validate
   * @param videoMeta - Optional video metadata for boundary validation
   * @returns Validation result with errors and warnings
   */
  validateSequence(
    sequence: BoundingBoxSequence,
    videoMeta?: VideoMetadata
  ): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // 1. Keyframe validation
    const keyframes = sequence.boxes.filter(box => box.isKeyframe)

    // At least 1 keyframe required (single-keyframe sequences are valid)
    if (keyframes.length === 0) {
      errors.push('Sequence must have at least 1 keyframe')
    }

    // Keyframes must be sorted by frameNumber
    for (let i = 1; i < keyframes.length; i++) {
      if (keyframes[i].frameNumber <= keyframes[i - 1].frameNumber) {
        errors.push(
          `Keyframes not sorted: frame ${keyframes[i - 1].frameNumber} >= ${keyframes[i].frameNumber}`
        )
      }
    }

    // No duplicate frame numbers among keyframes
    const frameNumbers = new Set<number>()
    for (const keyframe of keyframes) {
      if (frameNumbers.has(keyframe.frameNumber)) {
        errors.push(`Duplicate keyframe at frame ${keyframe.frameNumber}`)
      }
      frameNumbers.add(keyframe.frameNumber)
    }

    // 2. Interpolation segment validation
    if (keyframes.length > 1 && sequence.interpolationSegments) {
      const firstFrame = keyframes[0].frameNumber
      const lastFrame = keyframes[keyframes.length - 1].frameNumber

      // Sort segments by startFrame
      const sortedSegments = [...sequence.interpolationSegments].sort(
        (a, b) => a.startFrame - b.startFrame
      )

      // Check segments cover range between keyframes
      let expectedFrame = firstFrame
      for (let i = 0; i < sortedSegments.length; i++) {
        const segment = sortedSegments[i]

        // Validate segment boundaries
        if (segment.startFrame < firstFrame || segment.endFrame > lastFrame) {
          errors.push(
            `Interpolation segment [${segment.startFrame}, ${segment.endFrame}] ` +
            `outside keyframe range [${firstFrame}, ${lastFrame}]`
          )
        }

        // Check for gaps
        if (segment.startFrame > expectedFrame) {
          errors.push(
            `Gap in interpolation segments: expected frame ${expectedFrame}, got ${segment.startFrame}`
          )
        }

        // Check for overlaps with next segment
        if (i < sortedSegments.length - 1) {
          const nextSegment = sortedSegments[i + 1]
          if (segment.endFrame >= nextSegment.startFrame) {
            errors.push(
              `Overlapping interpolation segments: [${segment.startFrame}, ${segment.endFrame}] ` +
              `and [${nextSegment.startFrame}, ${nextSegment.endFrame}]`
            )
          }
        }

        // Validate interpolation type
        if (!SUPPORTED_INTERPOLATION_TYPES.includes(segment.type as typeof SUPPORTED_INTERPOLATION_TYPES[number])) {
          errors.push(
            `Unsupported interpolation type: ${segment.type}. ` +
            `Supported types: ${SUPPORTED_INTERPOLATION_TYPES.join(', ')}`
          )
        }

        // Validate bezier control points
        if (segment.type === 'bezier' && segment.controlPoints) {
          const validateControlPoints = (points: Array<{ x: number; y: number }>) => {
            if (!Array.isArray(points)) return
            for (const point of points) {
              if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) {
                errors.push(
                  `Bezier control point out of range [0, 1]: x=${point.x}, y=${point.y}`
                )
              }
            }
          }

          const cp = segment.controlPoints as Record<string, unknown>
          if (cp.x && Array.isArray(cp.x)) validateControlPoints(cp.x as Array<{ x: number; y: number }>)
          if (cp.y && Array.isArray(cp.y)) validateControlPoints(cp.y as Array<{ x: number; y: number }>)
          if (cp.width && Array.isArray(cp.width)) validateControlPoints(cp.width as Array<{ x: number; y: number }>)
          if (cp.height && Array.isArray(cp.height)) validateControlPoints(cp.height as Array<{ x: number; y: number }>)
        }

        expectedFrame = segment.endFrame + 1
      }

      // Check if segments cover entire range
      if (sortedSegments.length === 0) {
        warnings.push(
          `No interpolation segments defined for multi-keyframe sequence. ` +
          `Consider adding interpolation configuration.`
        )
      }
    } else if (keyframes.length === 1) {
      // Single-keyframe sequence
      if (sequence.interpolationSegments && sequence.interpolationSegments.length > 0) {
        warnings.push(
          `Single-keyframe sequence has interpolation segments. ` +
          `These will be ignored.`
        )
      }
    }

    // 3. Visibility range validation
    const visibilityRanges = sequence.visibilityRanges || []
    const sortedRanges = [...visibilityRanges].sort(
      (a, b) => a.startFrame - b.startFrame
    )

    // Check for overlaps
    for (let i = 0; i < sortedRanges.length; i++) {
      const range = sortedRanges[i]

      if (i < sortedRanges.length - 1) {
        const nextRange = sortedRanges[i + 1]
        if (range.endFrame >= nextRange.startFrame) {
          errors.push(
            `Overlapping visibility ranges: [${range.startFrame}, ${range.endFrame}] ` +
            `and [${nextRange.startFrame}, ${nextRange.endFrame}]`
          )
        }
      }
    }

    // All keyframes must be within visible ranges
    for (const keyframe of keyframes) {
      const inVisibleRange = visibilityRanges.some(
        range => range.visible &&
                 keyframe.frameNumber >= range.startFrame &&
                 keyframe.frameNumber <= range.endFrame
      )
      if (!inVisibleRange && visibilityRanges.length > 0) {
        errors.push(
          `Keyframe at frame ${keyframe.frameNumber} is not in a visible range`
        )
      }
    }

    // Warn if no visibility ranges defined
    if (visibilityRanges.length === 0 && keyframes.length > 0) {
      warnings.push(
        `No visibility ranges defined. Consider adding visibility ranges for discontiguous sequences.`
      )
    }

    // 4. Bounding box validation
    for (const box of sequence.boxes) {
      // Frame number validation
      if (box.frameNumber < 0) {
        errors.push(`Invalid frame number: ${box.frameNumber} (must be >= 0)`)
      }
      if (!Number.isInteger(box.frameNumber)) {
        errors.push(`Frame number must be an integer: ${box.frameNumber}`)
      }

      // Dimension validation
      if (box.width <= 0 || box.height <= 0) {
        errors.push(
          `Invalid box dimensions at frame ${box.frameNumber}: ` +
          `width=${box.width}, height=${box.height} (must be > 0)`
        )
      }

      // Position validation
      if (box.x < 0 || box.y < 0) {
        errors.push(
          `Invalid box position at frame ${box.frameNumber}: ` +
          `x=${box.x}, y=${box.y} (must be >= 0)`
        )
      }

      // Video boundary validation (if metadata provided)
      if (videoMeta) {
        if (box.x + box.width > videoMeta.width) {
          errors.push(
            `Box at frame ${box.frameNumber} exceeds video width: ` +
            `x=${box.x}, width=${box.width}, videoWidth=${videoMeta.width}`
          )
        }
        if (box.y + box.height > videoMeta.height) {
          errors.push(
            `Box at frame ${box.frameNumber} exceeds video height: ` +
            `y=${box.y}, height=${box.height}, videoHeight=${videoMeta.height}`
          )
        }
      }
    }

    // 5. Tracking metadata validation (optional fields)
    if (sequence.trackingSource) {
      const validSources = ['manual', 'samurai', 'sam2long', 'sam2', 'yolo11seg']
      if (!validSources.includes(sequence.trackingSource)) {
        errors.push(
          `Invalid trackingSource: ${sequence.trackingSource}. ` +
          `Valid values: ${validSources.join(', ')}`
        )
      }
    }

    if (sequence.trackingConfidence !== undefined) {
      if (sequence.trackingConfidence < 0 || sequence.trackingConfidence > 1) {
        errors.push(
          `Invalid trackingConfidence: ${sequence.trackingConfidence} (must be in range [0, 1])`
        )
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }
}
