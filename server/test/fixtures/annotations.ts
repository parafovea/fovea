import { Annotation } from '@prisma/client'

/**
 * Factory function to create test annotation objects.
 *
 * @param overrides - Partial annotation properties to override defaults
 * @returns A complete Annotation object for testing
 *
 * @example
 * ```ts
 * const annotation = createAnnotation({ videoId: 'my-video' })
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
      {
        frameNumber: 0,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.2,
      },
      {
        frameNumber: 100,
        x: 0.15,
        y: 0.15,
        width: 0.2,
        height: 0.2,
      },
    ],
    interpolationMode: 'linear',
    visibilityRanges: [[0, 100]],
    metadata: {},
    createdAt: new Date('2025-10-01T10:00:00Z'),
    updatedAt: new Date('2025-10-01T10:00:00Z'),
    ...overrides,
  }
}

/**
 * Creates a series of annotations for testing batch operations.
 *
 * @param count - Number of annotations to create
 * @param videoId - Video ID for all annotations
 * @returns Array of annotations
 *
 * @example
 * ```ts
 * const annotations = createAnnotationBatch(5, 'video-1')
 * ```
 */
export function createAnnotationBatch(count: number, videoId: string): Annotation[] {
  return Array.from({ length: count }, (_, i) =>
    createAnnotation({
      id: `annotation-${i}`,
      videoId,
    })
  )
}

// =============================================================================
// EXPORT-SPECIFIC FIXTURES
// =============================================================================

/**
 * BoundingBox type for export fixtures.
 */
interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  frameNumber: number
  isKeyframe?: boolean
  confidence?: number
}

/**
 * BoundingBoxSequence type for export fixtures.
 */
interface BoundingBoxSequence {
  boxes: BoundingBox[]
  interpolationSegments: Array<{
    startFrame: number
    endFrame: number
    type: 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold' | 'parametric'
  }>
  visibilityRanges: Array<{
    startFrame: number
    endFrame: number
    visible: boolean
  }>
  trackId?: string | number
  trackingSource?: 'manual' | 'samurai' | 'sam2long' | 'sam2' | 'yolo11seg'
  trackingConfidence?: number
  totalFrames: number
  keyframeCount: number
  interpolatedFrameCount: number
}

/**
 * Creates a BoundingBoxSequence for export testing.
 * Generates keyframes at specified positions with linear interpolation.
 *
 * @param keyframeCount - Number of keyframes to create
 * @param startFrame - First frame number
 * @param endFrame - Last frame number
 * @returns A valid BoundingBoxSequence
 *
 * @example
 * ```ts
 * const sequence = createBoundingBoxSequence(3, 0, 300)
 * // Creates keyframes at frames 0, 150, 300 with linear interpolation
 * ```
 */
export function createBoundingBoxSequence(
  keyframeCount: number,
  startFrame: number,
  endFrame: number
): BoundingBoxSequence {
  const frameStep = keyframeCount > 1 ? (endFrame - startFrame) / (keyframeCount - 1) : 0

  const boxes: BoundingBox[] = []
  for (let i = 0; i < keyframeCount; i++) {
    const frameNumber = Math.round(startFrame + i * frameStep)
    boxes.push({
      x: 100 + i * 10,
      y: 100 + i * 5,
      width: 200,
      height: 150,
      frameNumber,
      isKeyframe: true,
      confidence: 0.95
    })
  }

  const interpolationSegments = []
  for (let i = 0; i < keyframeCount - 1; i++) {
    interpolationSegments.push({
      startFrame: boxes[i].frameNumber,
      endFrame: boxes[i + 1].frameNumber,
      type: 'linear' as const
    })
  }

  const visibilityRanges = [{
    startFrame,
    endFrame,
    visible: true
  }]

  return {
    boxes,
    interpolationSegments,
    visibilityRanges,
    trackId: 'track-1',
    trackingSource: 'manual',
    totalFrames: endFrame - startFrame + 1,
    keyframeCount,
    interpolatedFrameCount: 0
  }
}

/**
 * Creates an annotation without bounding boxes (for ontology-only annotations).
 * This is valid for summaries, claims, and other non-spatial data.
 *
 * @param overrides - Partial annotation properties to override defaults
 * @returns An annotation with empty frames
 *
 * @example
 * ```ts
 * const annotation = createAnnotationWithoutBoundingBoxes({ videoId: 'my-video' })
 * ```
 */
export function createAnnotationWithoutBoundingBoxes(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'test-annotation-no-bbox',
    videoId: 'test-video-1',
    personaId: 'test-persona-1',
    entityTypeId: 'test-entity-type-1',
    eventTypeId: null,
    entityId: null,
    eventId: null,
    locationId: null,
    collectionId: null,
    keyframes: [],
    interpolationMode: null,
    visibilityRanges: [],
    metadata: {},
    createdAt: new Date('2025-10-01T10:00:00Z'),
    updatedAt: new Date('2025-10-01T10:00:00Z'),
    ...overrides,
  }
}

/**
 * Creates an annotation with all required fields for export testing.
 * Includes a valid bounding box sequence.
 *
 * @param overrides - Partial annotation properties to override defaults
 * @returns A complete annotation ready for export
 *
 * @example
 * ```ts
 * const annotation = createExportableAnnotation({ videoId: 'export-video' })
 * ```
 */
export function createExportableAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  const sequence = createBoundingBoxSequence(2, 0, 100)

  return {
    id: 'test-annotation-export',
    videoId: 'test-video-1',
    personaId: 'test-persona-1',
    entityTypeId: 'test-entity-type-1',
    eventTypeId: null,
    entityId: null,
    eventId: null,
    locationId: null,
    collectionId: null,
    keyframes: sequence.boxes.map(box => ({
      frameNumber: box.frameNumber,
      x: box.x / 1920, // Normalize to 0-1 range
      y: box.y / 1080,
      width: box.width / 1920,
      height: box.height / 1080,
    })),
    interpolationMode: 'linear',
    visibilityRanges: sequence.visibilityRanges.map(r => [r.startFrame, r.endFrame] as [number, number]),
    metadata: {
      exportTest: true,
      sequence // Include full sequence for export handler
    },
    createdAt: new Date('2025-10-01T10:00:00Z'),
    updatedAt: new Date('2025-10-01T10:00:00Z'),
    ...overrides,
  }
}

/**
 * Creates a set of annotations for round-trip export/import testing.
 * Includes both type and object annotations with various configurations.
 *
 * @param videoId - Video ID for all annotations
 * @param personaId - Persona ID for type annotations
 * @returns Array of diverse annotations for comprehensive testing
 */
export function createExportTestSet(videoId: string, personaId: string): Annotation[] {
  return [
    // Type annotation with bounding boxes
    createExportableAnnotation({
      id: 'export-type-annotation-1',
      videoId,
      personaId,
      entityTypeId: 'entity-type-1',
    }),

    // Type annotation without bounding boxes
    createAnnotationWithoutBoundingBoxes({
      id: 'export-type-annotation-2',
      videoId,
      personaId,
      entityTypeId: 'entity-type-2',
    }),

    // Object annotation with bounding boxes
    createExportableAnnotation({
      id: 'export-object-annotation-1',
      videoId,
      personaId: null,
      entityTypeId: null,
      entityId: 'entity-1',
    }),

    // Annotation with multiple keyframes
    {
      ...createExportableAnnotation({
        id: 'export-multi-keyframe',
        videoId,
        personaId,
      }),
      keyframes: [
        { frameNumber: 0, x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
        { frameNumber: 50, x: 0.15, y: 0.15, width: 0.2, height: 0.2 },
        { frameNumber: 100, x: 0.2, y: 0.2, width: 0.2, height: 0.2 },
        { frameNumber: 150, x: 0.25, y: 0.1, width: 0.2, height: 0.2 },
      ],
      visibilityRanges: [[0, 150]],
    },
  ]
}
