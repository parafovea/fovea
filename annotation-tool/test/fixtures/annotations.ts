import { Annotation, BoundingBox, InterpolationType } from '../../src/models/types.js'

/**
 * Helper to calculate metadata for a bounding box sequence.
 */
function calculateSequenceMetadata(boxes: BoundingBox[], endFrame: number) {
  const keyframes = boxes.filter(b => b.isKeyframe !== false)
  return {
    totalFrames: endFrame + 1,
    keyframeCount: keyframes.length,
    interpolatedFrameCount: Math.max(0, endFrame + 1 - keyframes.length),
  }
}

/**
 * Factory function to create test annotation objects.
 * Provides sensible defaults while allowing customization.
 *
 * @param overrides - Partial annotation properties to override defaults
 * @returns A complete Annotation object for testing
 *
 * @example
 * ```ts
 * const annotation = createAnnotation({ typeId: 'my-entity-type' })
 * ```
 */
export function createAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  const boxes = [
    createBoundingBox({ frameNumber: 0 }),
    createBoundingBox({ frameNumber: 100 }),
  ]
  const metadata = calculateSequenceMetadata(boxes, 100)

  return {
    id: 'test-annotation-1',
    videoId: 'test-video-1',
    annotationType: 'type',
    personaId: 'test-persona-1',
    typeCategory: 'entity',
    typeId: 'test-entity-type-1',
    boundingBoxSequence: {
      boxes,
      interpolationSegments: [
        {
          startFrame: 0,
          endFrame: 100,
          type: 'linear',
        },
      ],
      visibilityRanges: [
        {
          startFrame: 0,
          endFrame: 100,
          visible: true,
        },
      ],
      ...metadata,
    },
    createdAt: '2025-10-01T10:00:00Z',
    updatedAt: '2025-10-01T10:00:00Z',
    ...overrides,
  }
}

/**
 * Factory function to create test bounding box objects.
 *
 * @param overrides - Partial bounding box properties to override defaults
 * @returns A complete BoundingBox object for testing
 *
 * @example
 * ```ts
 * const box = createBoundingBox({ frameNumber: 50, x: 0.5 })
 * ```
 */
export function createBoundingBox(overrides: Partial<BoundingBox> = {}): BoundingBox {
  return {
    frameNumber: 0,
    x: 0.1,
    y: 0.1,
    width: 0.2,
    height: 0.2,
    isKeyframe: true,
    ...overrides,
  }
}

/**
 * Creates a series of bounding boxes at regular intervals.
 * Useful for testing interpolation and tracking.
 *
 * @param count - Number of boxes to create
 * @param startFrame - Starting frame number (default: 0)
 * @param interval - Frame interval between boxes (default: 10)
 * @returns Array of bounding boxes
 *
 * @example
 * ```ts
 * const boxes = createBoundingBoxSequence(5, 0, 10)
 * // Creates boxes at frames 0, 10, 20, 30, 40
 * ```
 */
export function createBoundingBoxSequence(
  count: number,
  startFrame = 0,
  interval = 10
): BoundingBox[] {
  return Array.from({ length: count }, (_, i) =>
    createBoundingBox({
      frameNumber: startFrame + i * interval,
      x: 0.1 + i * 0.05,
      y: 0.1 + i * 0.05,
    })
  )
}

/**
 * Creates an annotation with tracking-style boxes.
 * Each box has slight position changes to simulate object movement.
 *
 * @param frameCount - Number of frames to track
 * @returns Annotation with dense box sequence
 *
 * @example
 * ```ts
 * const trackingAnnotation = createTrackingAnnotation(50)
 * ```
 */
export function createTrackingAnnotation(frameCount: number): Annotation {
  const boxes = Array.from({ length: frameCount }, (_, i) =>
    createBoundingBox({
      frameNumber: i,
      x: 0.3 + Math.sin(i * 0.1) * 0.1,
      y: 0.4 + Math.cos(i * 0.1) * 0.1,
      width: 0.15,
      height: 0.15,
    })
  )
  const metadata = calculateSequenceMetadata(boxes, frameCount - 1)

  return createAnnotation({
    boundingBoxSequence: {
      boxes,
      interpolationSegments: [
        {
          startFrame: 0,
          endFrame: frameCount - 1,
          type: 'linear',
        },
      ],
      visibilityRanges: [
        {
          startFrame: 0,
          endFrame: frameCount - 1,
          visible: true,
        },
      ],
      ...metadata,
    },
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
  const boxes = [
    createBoundingBox({ frameNumber: 0 }),
    createBoundingBox({ frameNumber: 50 }),
    createBoundingBox({ frameNumber: 100 }),
    createBoundingBox({ frameNumber: 150 }),
    createBoundingBox({ frameNumber: 200 }),
    createBoundingBox({ frameNumber: 250 }),
  ]
  const metadata = calculateSequenceMetadata(boxes, 250)

  return createAnnotation({
    boundingBoxSequence: {
      boxes,
      interpolationSegments: [
        { startFrame: 0, endFrame: 50, type: 'linear' },
        { startFrame: 100, endFrame: 150, type: 'linear' },
        { startFrame: 200, endFrame: 250, type: 'linear' },
      ],
      visibilityRanges: [
        { startFrame: 0, endFrame: 50, visible: true },
        { startFrame: 100, endFrame: 150, visible: true },
        { startFrame: 200, endFrame: 250, visible: true },
      ],
      ...metadata,
    },
  })
}

/**
 * Available interpolation types for testing.
 */
export const interpolationTypes: InterpolationType[] = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'bezier',
]

/**
 * Creates annotations with different interpolation types.
 * Useful for testing interpolation algorithm switching.
 *
 * @returns Array of annotations, one for each interpolation type
 *
 * @example
 * ```ts
 * const annotations = createAnnotationsWithAllInterpolationTypes()
 * ```
 */
export function createAnnotationsWithAllInterpolationTypes(): Annotation[] {
  return interpolationTypes.map((mode, i) => {
    const boxes = createBoundingBoxSequence(3, i * 100, 50)
    const metadata = calculateSequenceMetadata(boxes, i * 100 + 100)

    return createAnnotation({
      id: `annotation-${mode}`,
      boundingBoxSequence: {
        boxes,
        interpolationSegments: [
          {
            startFrame: i * 100,
            endFrame: i * 100 + 100,
            type: mode,
          },
        ],
        visibilityRanges: [
          {
            startFrame: i * 100,
            endFrame: i * 100 + 100,
            visible: true,
          },
        ],
        ...metadata,
      },
    })
  })
}
