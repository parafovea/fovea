import { Annotation, Keyframe, InterpolationMode } from '../../src/types/annotation.js'

/**
 * Factory function to create test annotation objects.
 * Provides sensible defaults while allowing customization.
 *
 * @param overrides - Partial annotation properties to override defaults
 * @returns A complete Annotation object for testing
 *
 * @example
 * ```ts
 * const annotation = createAnnotation({ entityTypeId: 'my-entity-type' })
 * ```
 */
export function createAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'test-annotation-1',
    videoId: 'test-video-1',
    personaId: 'test-persona-1',
    entityTypeId: 'test-entity-type-1',
    eventTypeId: null,
    entityId: null,
    eventId: null,
    locationId: null,
    collectionId: null,
    keyframes: [
      createKeyframe({ frameNumber: 0 }),
      createKeyframe({ frameNumber: 100 }),
    ],
    interpolationMode: 'linear',
    visibilityRanges: [[0, 100]],
    metadata: {},
    createdAt: '2025-10-01T10:00:00Z',
    updatedAt: '2025-10-01T10:00:00Z',
    ...overrides,
  }
}

/**
 * Factory function to create test keyframe objects.
 *
 * @param overrides - Partial keyframe properties to override defaults
 * @returns A complete Keyframe object for testing
 *
 * @example
 * ```ts
 * const keyframe = createKeyframe({ frameNumber: 50, x: 0.5 })
 * ```
 */
export function createKeyframe(overrides: Partial<Keyframe> = {}): Keyframe {
  return {
    frameNumber: 0,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    ...overrides,
  }
}

/**
 * Creates a series of keyframes at regular intervals.
 * Useful for testing interpolation and tracking.
 *
 * @param count - Number of keyframes to create
 * @param startFrame - Starting frame number (default: 0)
 * @param interval - Frame interval between keyframes (default: 10)
 * @returns Array of keyframes
 *
 * @example
 * ```ts
 * const keyframes = createKeyframeSequence(5, 0, 10)
 * // Creates keyframes at frames 0, 10, 20, 30, 40
 * ```
 */
export function createKeyframeSequence(
  count: number,
  startFrame = 0,
  interval = 10
): Keyframe[] {
  return Array.from({ length: count }, (_, i) =>
    createKeyframe({
      frameNumber: startFrame + i * interval,
      x: 0.1 + i * 0.05,
      y: 0.1 + i * 0.05,
    })
  )
}

/**
 * Creates an annotation with tracking-style keyframes.
 * Each keyframe has slight position changes to simulate object movement.
 *
 * @param frameCount - Number of frames to track
 * @returns Annotation with dense keyframe sequence
 *
 * @example
 * ```ts
 * const trackingAnnotation = createTrackingAnnotation(50)
 * ```
 */
export function createTrackingAnnotation(frameCount: number): Annotation {
  const keyframes = Array.from({ length: frameCount }, (_, i) =>
    createKeyframe({
      frameNumber: i,
      x: 0.3 + Math.sin(i * 0.1) * 0.1,
      y: 0.4 + Math.cos(i * 0.1) * 0.1,
      width: 0.15,
      height: 0.15,
    })
  )

  return createAnnotation({
    keyframes,
    visibilityRanges: [[0, frameCount - 1]],
  })
}

/**
 * Creates an annotation with discontiguous visibility ranges.
 * Useful for testing visibility gap handling.
 *
 * @returns Annotation with multiple visibility ranges
 *
 * @example
 * ```ts
 * const annotation = createDiscontiguousAnnotation()
 * // Has visibility gaps: [0-50], [100-150], [200-250]
 * ```
 */
export function createDiscontiguousAnnotation(): Annotation {
  return createAnnotation({
    keyframes: [
      createKeyframe({ frameNumber: 0 }),
      createKeyframe({ frameNumber: 50 }),
      createKeyframe({ frameNumber: 100 }),
      createKeyframe({ frameNumber: 150 }),
      createKeyframe({ frameNumber: 200 }),
      createKeyframe({ frameNumber: 250 }),
    ],
    visibilityRanges: [
      [0, 50],
      [100, 150],
      [200, 250],
    ],
  })
}

/**
 * Available interpolation modes for testing.
 */
export const interpolationModes: InterpolationMode[] = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'bezier',
]

/**
 * Creates annotations with different interpolation modes.
 * Useful for testing interpolation algorithm switching.
 *
 * @returns Array of annotations, one for each interpolation mode
 *
 * @example
 * ```ts
 * const annotations = createAnnotationsWithAllInterpolationModes()
 * ```
 */
export function createAnnotationsWithAllInterpolationModes(): Annotation[] {
  return interpolationModes.map((mode, i) =>
    createAnnotation({
      id: `annotation-${mode}`,
      interpolationMode: mode,
      keyframes: createKeyframeSequence(3, i * 100, 50),
    })
  )
}
