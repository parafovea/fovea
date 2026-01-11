/**
 * @interface BoundingBox
 * @description Represents a spatial bounding box at a specific video frame.
 * All bounding boxes must have a frame number for sequence support.
 * Coordinates are relative to the video dimensions (0-1 normalized or pixel values).
 *
 * @remarks
 * Bounding boxes are the fundamental spatial unit for annotations. They can be
 * user-created keyframes or model-generated detections. In sequences, keyframes
 * are interpolated to generate intermediate frames.
 *
 * @example
 * ```typescript
 * const box: BoundingBox = {
 *   x: 100,
 *   y: 150,
 *   width: 200,
 *   height: 300,
 *   frameNumber: 42,
 *   isKeyframe: true,
 *   confidence: 0.95
 * };
 * ```
 */
export interface BoundingBox {
  /** X coordinate of the top-left corner (in pixels) */
  x: number
  /** Y coordinate of the top-left corner (in pixels) */
  y: number
  /** Width of the bounding box (in pixels) */
  width: number
  /** Height of the bounding box (in pixels) */
  height: number
  /** Frame number in the video sequence (required for all boxes) */
  frameNumber: number
  /** Confidence score from model detection (0-1), undefined for manual annotations */
  confidence?: number
  /** Whether this is a user-set keyframe vs. an interpolated frame */
  isKeyframe?: boolean
  /** Additional metadata attached to this bounding box */
  metadata?: Record<string, unknown>
}

/**
 * @description Supported interpolation modes for bounding box sequences.
 * Determines how intermediate frames are calculated between keyframes.
 *
 * @remarks
 * - `linear`: Constant velocity, straight-line interpolation
 * - `bezier`: Cubic Bezier curves for smooth motion paths
 * - `ease-in`: Gradual acceleration from rest
 * - `ease-out`: Gradual deceleration to rest
 * - `ease-in-out`: Smooth start and end with acceleration in middle
 * - `hold`: No interpolation, maintains previous keyframe value
 * - `parametric`: Custom mathematical functions for physics-based motion
 */
export type InterpolationType =
  | 'linear'
  | 'bezier'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'hold'
  | 'parametric'

/**
 * @interface BezierControlPoint
 * @description Control point for cubic Bezier curve interpolation.
 * Defines the curve shape between keyframes using normalized coordinates.
 *
 * @remarks
 * Bezier control points follow the CSS cubic-bezier convention where:
 * - x represents the temporal position (0 = start keyframe, 1 = end keyframe)
 * - y represents the interpolation value (0 = start value, 1 = end value)
 */
export interface BezierControlPoint {
  /** Temporal position between keyframes (0-1) */
  x: number
  /** Value interpolation factor (0-1, can exceed for overshoot) */
  y: number
}

/**
 * @interface ParametricFunction
 * @description Configuration for parametric motion functions.
 * Enables physics-based or mathematical interpolation between keyframes.
 *
 * @example
 * ```typescript
 * // Gravity-based falling motion
 * const gravity: ParametricFunction = {
 *   type: 'quadratic',
 *   parameters: { a: 9.8 }
 * };
 *
 * // Custom expression for sinusoidal motion
 * const wave: ParametricFunction = {
 *   type: 'custom',
 *   parameters: { amplitude: 50, frequency: 2 },
 *   expression: 'amplitude * sin(frequency * t * PI)'
 * };
 * ```
 */
export interface ParametricFunction {
  /** Type of parametric function */
  type: 'linear' | 'quadratic' | 'sinusoidal' | 'custom'
  /** Parameters for the function (e.g., acceleration, amplitude) */
  parameters: Record<string, number>
  /** Custom expression for 'custom' type functions */
  expression?: string
}

/**
 * @interface InterpolationSegment
 * @description Defines interpolation behavior between two keyframes.
 * Each segment can have its own interpolation type and control points.
 *
 * @remarks
 * Segments allow different interpolation modes within the same sequence.
 * For example, an object might ease-in at the start, move linearly,
 * then ease-out at the end.
 */
export interface InterpolationSegment {
  /** Frame number where this segment begins */
  startFrame: number
  /** Frame number where this segment ends */
  endFrame: number
  /** Interpolation type for this segment */
  type: InterpolationType

  /**
   * Bezier control points for each property.
   * Only used when type is 'bezier'.
   */
  controlPoints?: {
    /** Control points for x-coordinate interpolation */
    x?: BezierControlPoint[]
    /** Control points for y-coordinate interpolation */
    y?: BezierControlPoint[]
    /** Control points for width interpolation */
    width?: BezierControlPoint[]
    /** Control points for height interpolation */
    height?: BezierControlPoint[]
  }

  /**
   * Parametric functions for each property.
   * Only used when type is 'parametric'.
   */
  parametric?: {
    /** Parametric function for x-coordinate */
    x?: ParametricFunction
    /** Parametric function for y-coordinate */
    y?: ParametricFunction
    /** Parametric function for width */
    width?: ParametricFunction
    /** Parametric function for height */
    height?: ParametricFunction
  }
}

/**
 * @interface BoundingBoxSequence
 * @description Complete sequence of bounding boxes with interpolation configuration.
 * ALL annotations use sequences - single-frame annotations are sequences with 1 keyframe.
 *
 * @remarks
 * Sequences are the core data structure for temporal annotations. They support:
 * - Multiple keyframes with configurable interpolation between them
 * - Discontiguous visibility (object can disappear and reappear)
 * - Integration with automated tracking models
 * - Frame-accurate playback and scrubbing
 *
 * @example
 * ```typescript
 * const sequence: BoundingBoxSequence = {
 *   boxes: [
 *     { x: 100, y: 100, width: 50, height: 50, frameNumber: 0, isKeyframe: true },
 *     { x: 200, y: 150, width: 60, height: 60, frameNumber: 30, isKeyframe: true }
 *   ],
 *   interpolationSegments: [
 *     { startFrame: 0, endFrame: 30, type: 'ease-in-out' }
 *   ],
 *   visibilityRanges: [
 *     { startFrame: 0, endFrame: 30, visible: true }
 *   ],
 *   totalFrames: 31,
 *   keyframeCount: 2,
 *   interpolatedFrameCount: 29
 * };
 * ```
 */
export interface BoundingBoxSequence {
  /** Keyframes only (interpolated frames are generated on demand) */
  boxes: BoundingBox[]
  /** Interpolation configuration for each segment between keyframes */
  interpolationSegments: InterpolationSegment[]

  /**
   * Visibility ranges for discontiguous tracking.
   * Allows objects to disappear (occlusion) and reappear.
   */
  visibilityRanges: Array<{
    /** First frame of this visibility range */
    startFrame: number
    /** Last frame of this visibility range */
    endFrame: number
    /** Whether the object is visible in this range */
    visible: boolean
  }>

  /** Links to automated tracking result (if generated by a tracker) */
  trackId?: string | number
  /** Source of tracking data */
  trackingSource?: 'manual' | 'samurai' | 'sam2long' | 'sam2' | 'yolo11seg'
  /** Overall confidence score for the tracked sequence (0-1) */
  trackingConfidence?: number

  /** Total number of frames in the sequence */
  totalFrames: number
  /** Number of user-set keyframes */
  keyframeCount: number
  /** Number of interpolated (generated) frames */
  interpolatedFrameCount: number
}

/**
 * @description Preset configurations for common interpolation modes.
 * Provides ready-to-use interpolation settings for typical use cases.
 *
 * @remarks
 * These presets match common animation easing functions and can be
 * selected by users in the UI for quick interpolation setup.
 */
export const INTERPOLATION_PRESETS = {
  /** Constant velocity, straight-line interpolation */
  linear: {
    name: 'Linear',
    description: 'Constant velocity',
    icon: '—',
    default: true
  },
  /** Smooth start and end with acceleration in middle */
  easeInOut: {
    name: 'Ease In-Out',
    description: 'Smooth start and end',
    icon: '~',
    controlPoints: {
      default: { x: [{ x: 0.42, y: 0 }, { x: 0.58, y: 1 }] }
    }
  },
  /** Gradual acceleration from rest */
  easeIn: {
    name: 'Ease In',
    description: 'Gradual acceleration',
    icon: '/',
    controlPoints: {
      default: { x: [{ x: 0.42, y: 0 }, { x: 1, y: 1 }] }
    }
  },
  /** Gradual deceleration to rest */
  easeOut: {
    name: 'Ease Out',
    description: 'Gradual deceleration',
    icon: '\\',
    controlPoints: {
      default: { x: [{ x: 0, y: 0 }, { x: 0.58, y: 1 }] }
    }
  },
  /** No interpolation, maintains previous keyframe value */
  hold: {
    name: 'Hold',
    description: 'No interpolation',
    icon: '⊏',
  },
  /** Physics-based falling motion simulation */
  parametricGravity: {
    name: 'Gravity',
    description: 'Falling object physics',
    icon: '↓',
    parametric: {
      y: { type: 'quadratic', parameters: { a: 9.8 } }
    }
  }
} as const
