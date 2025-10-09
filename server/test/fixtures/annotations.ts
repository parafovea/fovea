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
