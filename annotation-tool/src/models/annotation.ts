import type { BoundingBoxSequence } from './bounding-box'
import type { Time } from './temporal'

/**
 * @interface BaseAnnotation
 * @description Base interface for all annotation types with common fields.
 * All annotations use bounding box sequences for spatial data.
 *
 * @remarks
 * BaseAnnotation provides the foundation for both ObjectAnnotation and TypeAnnotation.
 * It includes spatial data (bounding box sequences), temporal references, and metadata.
 */
interface BaseAnnotation {
  /** Unique identifier for the annotation */
  id: string
  /** ID of the video this annotation belongs to */
  videoId: string

  /** Bounding box sequence containing all spatial keyframes and interpolation data */
  boundingBoxSequence: BoundingBoxSequence

  /** Optional temporal reference linking to a Time object */
  time?: Time

  /** Confidence score for this annotation (0-1) */
  confidence?: number
  /**
   * Display name of the linked world object, resolved server-side from the
   * annotation owner's world. Lets a reviewer reading another annotator's
   * object annotation show the object's name even though the object lives in
   * the owner's private world (not the reviewer's). Used only as a fallback
   * when the local world lookup cannot resolve the object.
   */
  linkedObjectName?: string | null
  /** User notes attached to this annotation */
  notes?: string
  /** Additional metadata */
  metadata?: Record<string, unknown>
  /** ID of the user who created this annotation */
  createdBy?: string
  /** ISO 8601 timestamp of creation */
  createdAt: string
  /** ISO 8601 timestamp of last update */
  updatedAt: string

  /**
   * Ephemeral UI state (not persisted to database).
   * Used for editor state management.
   */
  _ui?: {
    /** Currently selected keyframe numbers */
    selectedKeyframes?: number[]
    /** Whether to display the motion path overlay */
    showMotionPath?: boolean
    /** Whether the timeline is expanded in the UI */
    timelineExpanded?: boolean
  }
}

/**
 * @interface ObjectAnnotation
 * @description Annotation that links a spatial region to a world object.
 * Used to mark where entities, events, times, or locations appear in video.
 *
 * @remarks
 * ObjectAnnotations connect visual regions (bounding boxes) to semantic objects
 * in the world model. Each annotation links to exactly one world object or collection.
 *
 * @example
 * ```typescript
 * const annotation: ObjectAnnotation = {
 *   id: 'ann-123',
 *   videoId: 'video-456',
 *   annotationType: 'object',
 *   linkedEntityId: 'entity-789',
 *   boundingBoxSequence: { ... },
 *   createdAt: '2024-01-01T00:00:00Z',
 *   updatedAt: '2024-01-01T00:00:00Z'
 * };
 * ```
 */
export interface ObjectAnnotation extends BaseAnnotation {
  /** Discriminator for object annotation type */
  annotationType: 'object'

  /** ID of linked entity (mutually exclusive with other linked IDs) */
  linkedEntityId?: string
  /** ID of linked event (mutually exclusive with other linked IDs) */
  linkedEventId?: string
  /** ID of linked time object (mutually exclusive with other linked IDs) */
  linkedTimeId?: string
  /** ID of linked location (Location is a special type of Entity) */
  linkedLocationId?: string

  /** ID of linked collection (alternative to individual object links) */
  linkedCollectionId?: string
  /** Type of collection being linked */
  linkedCollectionType?: 'entity' | 'event' | 'time'
}

/**
 * @interface TypeAnnotation
 * @description Annotation that assigns an ontology type to a spatial region.
 * Used to classify visual regions according to a persona's type system.
 *
 * @remarks
 * TypeAnnotations are persona-specific - the same visual region can have
 * different type annotations from different personas' perspectives.
 *
 * @example
 * ```typescript
 * const annotation: TypeAnnotation = {
 *   id: 'ann-123',
 *   videoId: 'video-456',
 *   annotationType: 'type',
 *   personaId: 'persona-789',
 *   typeCategory: 'entity',
 *   typeId: 'entity-type-abc',
 *   boundingBoxSequence: { ... },
 *   createdAt: '2024-01-01T00:00:00Z',
 *   updatedAt: '2024-01-01T00:00:00Z'
 * };
 * ```
 */
export interface TypeAnnotation extends BaseAnnotation {
  /** Discriminator for type annotation type */
  annotationType: 'type'
  /** ID of the persona whose ontology contains the type */
  personaId: string

  /** Category of the assigned type */
  typeCategory: 'entity' | 'role' | 'event'
  /** ID of the type being assigned */
  typeId: string
}

/**
 * @description Union type representing all annotation types.
 * Use discriminated union on `annotationType` field to narrow the type.
 */
export type Annotation = ObjectAnnotation | TypeAnnotation

/**
 * @interface AnnotationTimeBounds
 * @description Time bounds derived from an annotation's bounding box sequence.
 * Used for displaying and filtering annotations by time.
 */
export interface AnnotationTimeBounds {
  /** Start time in seconds */
  startTime: number
  /** End time in seconds */
  endTime: number
  /** Start frame number */
  startFrame: number
  /** End frame number */
  endFrame: number
}

/**
 * @function getAnnotationTimeBounds
 * @description Computes time bounds from an annotation's bounding box sequence.
 * Returns start/end times in seconds based on keyframe positions and video FPS.
 *
 * @param annotation - The annotation to compute bounds for
 * @param fps - Frames per second of the video (default: 30)
 * @returns Time bounds object or null if no keyframes exist
 *
 * @example
 * ```typescript
 * const bounds = getAnnotationTimeBounds(annotation, 30)
 * if (bounds) {
 *   console.log(`${bounds.startTime}s - ${bounds.endTime}s`)
 * }
 * ```
 */
export function getAnnotationTimeBounds(
  annotation: Annotation,
  fps: number = 30
): AnnotationTimeBounds | null {
  const keyframes = annotation.boundingBoxSequence?.boxes?.filter(
    b => b.isKeyframe || b.isKeyframe === undefined
  ) ?? []

  if (keyframes.length === 0) {
    return null
  }

  const sortedKeyframes = [...keyframes].sort((a, b) => a.frameNumber - b.frameNumber)
  const startFrame = sortedKeyframes[0].frameNumber
  const endFrame = sortedKeyframes[sortedKeyframes.length - 1].frameNumber

  return {
    startFrame,
    endFrame,
    startTime: startFrame / fps,
    endTime: endFrame / fps,
  }
}
