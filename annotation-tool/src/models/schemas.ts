/**
 * Zod schemas for runtime type validation.
 *
 * These schemas provide:
 * 1. Runtime validation with safeParse (never throws)
 * 2. Type inference via z.infer<typeof Schema> (single source of truth)
 * 3. Detailed error messages for debugging
 *
 * @module models/schemas
 */
import { z } from 'zod'

// =============================================================================
// BASE SCHEMAS
// =============================================================================

/**
 * Gloss item schema - rich text with references.
 */
export const GlossItemSchema = z.object({
  type: z.enum(['text', 'typeRef', 'objectRef', 'annotationRef']),
  content: z.string(),
  refType: z.enum([
    'entity', 'role', 'event', 'relation',
    'entity-object', 'event-object', 'time-object', 'location-object',
    'annotation'
  ]).optional(),
  refPersonaId: z.string().uuid().optional(),
})

/**
 * Type constraint schema for ontology types.
 */
export const TypeConstraintSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('allowedTypes'),
    value: z.array(z.string()),
  }),
  z.object({
    type: z.literal('requiredProperties'),
    value: z.array(z.string()),
  }),
  z.object({
    type: z.literal('valueRange'),
    value: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
    }),
  }),
])

// =============================================================================
// TIME SCHEMAS
// =============================================================================

const BaseTimeSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  videoReferences: z.array(z.object({
    videoId: z.string(),
    frameNumber: z.number().optional(),
    frameRange: z.tuple([z.number(), z.number()]).optional(),
    milliseconds: z.number().optional(),
    millisecondRange: z.tuple([z.number(), z.number()]).optional(),
  })).optional(),
  vagueness: z.object({
    type: z.enum(['approximate', 'bounded', 'fuzzy']),
    description: z.string().optional(),
    bounds: z.object({
      earliest: z.string().optional(),
      latest: z.string().optional(),
      typical: z.string().optional(),
    }).optional(),
    granularity: z.enum(['millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year']).optional(),
  }).optional(),
  certainty: z.number().min(0).max(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const TimeInstantSchema = BaseTimeSchema.extend({
  type: z.literal('instant'),
  timestamp: z.string(),
})

export const TimeIntervalSchema = BaseTimeSchema.extend({
  type: z.literal('interval'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
})

export const TimeSchema = z.discriminatedUnion('type', [
  TimeInstantSchema,
  TimeIntervalSchema,
])

// =============================================================================
// LOCATION SCHEMAS
// =============================================================================

const BaseLocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.array(GlossItemSchema),
  typeAssignments: z.array(z.object({
    personaId: z.string(),
    entityTypeId: z.string(),
    confidence: z.number().min(0).max(1).optional(),
    justification: z.string().optional(),
  })),
  metadata: z.object({
    alternateNames: z.array(z.string()).optional(),
    externalIds: z.record(z.string(), z.string()).optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const LocationPointSchema = BaseLocationSchema.extend({
  locationType: z.literal('point'),
  coordinates: z.object({
    latitude: z.number(),
    longitude: z.number(),
    altitude: z.number().optional(),
  }),
})

export const LocationExtentSchema = BaseLocationSchema.extend({
  locationType: z.literal('extent'),
  boundary: z.array(z.object({
    latitude: z.number(),
    longitude: z.number(),
  })).optional(),
  boundingBox: z.object({
    north: z.number(),
    south: z.number(),
    east: z.number(),
    west: z.number(),
  }).optional(),
})

export const LocationSchema = z.discriminatedUnion('locationType', [
  LocationPointSchema,
  LocationExtentSchema,
])

// =============================================================================
// ENTITY & EVENT SCHEMAS
// =============================================================================

export const EntityTypeAssignmentSchema = z.object({
  personaId: z.string(),
  entityTypeId: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  justification: z.string().optional(),
})

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.array(GlossItemSchema),
  typeAssignments: z.array(EntityTypeAssignmentSchema),
  metadata: z.object({
    alternateNames: z.array(z.string()).optional(),
    externalIds: z.record(z.string(), z.string()).optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const EventInterpretationSchema = z.object({
  personaId: z.string(),
  eventTypeId: z.string(),
  roleAssignments: z.array(z.object({
    roleTypeId: z.string(),
    fillerId: z.string(),
    fillerType: z.enum(['entity', 'event']),
  })),
  confidence: z.number().min(0).max(1).optional(),
  justification: z.string().optional(),
})

export const EventSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.array(GlossItemSchema),
  personaInterpretations: z.array(EventInterpretationSchema),
  time: TimeSchema.optional(),
  location: LocationSchema.optional(),
  metadata: z.object({
    alternateNames: z.array(z.string()).optional(),
    externalIds: z.record(z.string(), z.string()).optional(),
    properties: z.record(z.string(), z.unknown()).optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// =============================================================================
// COLLECTION SCHEMAS
// =============================================================================

export const EntityCollectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.array(GlossItemSchema).optional(),
  entityIds: z.array(z.string()),
  collectionType: z.enum(['group', 'kind', 'functional', 'stage', 'portion', 'variant']),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const EventCollectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.array(GlossItemSchema).optional(),
  eventIds: z.array(z.string()),
  collectionType: z.enum(['sequence', 'iteration', 'complex', 'alternative', 'group']),
  ordering: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const TimeCollectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.array(GlossItemSchema).optional(),
  times: z.array(TimeSchema),
  collectionType: z.enum(['periodic', 'cyclical', 'calendar', 'irregular', 'anchored']),
  recurrence: z.object({
    pattern: z.string().optional(),
    interval: z.number().optional(),
    unit: z.enum(['millisecond', 'second', 'minute', 'hour', 'day', 'week', 'month', 'year']).optional(),
  }).optional(),
  anchorTime: TimeSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// =============================================================================
// ANNOTATION SCHEMAS
// =============================================================================

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  frameNumber: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  isKeyframe: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const InterpolationSegmentSchema = z.object({
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().nonnegative(),
  type: z.enum(['linear', 'bezier', 'ease-in', 'ease-out', 'ease-in-out', 'hold', 'parametric']),
  controlPoints: z.unknown().optional(),
  parametric: z.unknown().optional(),
})

export const VisibilityRangeSchema = z.object({
  startFrame: z.number().int().nonnegative(),
  endFrame: z.number().int().nonnegative(),
  visible: z.boolean(),
})

export const BoundingBoxSequenceSchema = z.object({
  boxes: z.array(BoundingBoxSchema),
  interpolationSegments: z.array(InterpolationSegmentSchema),
  visibilityRanges: z.array(VisibilityRangeSchema),
  trackId: z.union([z.string(), z.number()]).optional(),
  trackingSource: z.enum(['manual', 'samurai', 'sam2long', 'sam2', 'yolo11seg']).optional(),
  trackingConfidence: z.number().min(0).max(1).optional(),
  totalFrames: z.number().int().nonnegative(),
  keyframeCount: z.number().int().nonnegative(),
  interpolatedFrameCount: z.number().int().nonnegative(),
})

const BaseAnnotationSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  boundingBoxSequence: BoundingBoxSequenceSchema.optional(),
  time: TimeSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const ObjectAnnotationSchema = BaseAnnotationSchema.extend({
  annotationType: z.literal('object'),
  linkedEntityId: z.string().optional(),
  linkedEventId: z.string().optional(),
  linkedTimeId: z.string().optional(),
  linkedLocationId: z.string().optional(),
  linkedCollectionId: z.string().optional(),
  linkedCollectionType: z.enum(['entity-collection', 'event-collection']).optional(),
})

export const TypeAnnotationSchema = BaseAnnotationSchema.extend({
  annotationType: z.literal('type'),
  personaId: z.string(),
  typeCategory: z.enum(['entity', 'event', 'role', 'relation']),
  typeId: z.string(),
  notes: z.string().optional(),
})

export const AnnotationSchema = z.discriminatedUnion('annotationType', [
  ObjectAnnotationSchema,
  TypeAnnotationSchema,
])

// =============================================================================
// TYPE INFERENCE EXPORTS
// =============================================================================

export type GlossItemZ = z.infer<typeof GlossItemSchema>
export type TypeConstraintZ = z.infer<typeof TypeConstraintSchema>
export type TimeZ = z.infer<typeof TimeSchema>
export type TimeInstantZ = z.infer<typeof TimeInstantSchema>
export type TimeIntervalZ = z.infer<typeof TimeIntervalSchema>
export type LocationZ = z.infer<typeof LocationSchema>
export type LocationPointZ = z.infer<typeof LocationPointSchema>
export type LocationExtentZ = z.infer<typeof LocationExtentSchema>
export type EntityZ = z.infer<typeof EntitySchema>
export type EventZ = z.infer<typeof EventSchema>
export type EntityCollectionZ = z.infer<typeof EntityCollectionSchema>
export type EventCollectionZ = z.infer<typeof EventCollectionSchema>
export type TimeCollectionZ = z.infer<typeof TimeCollectionSchema>
export type BoundingBoxZ = z.infer<typeof BoundingBoxSchema>
export type BoundingBoxSequenceZ = z.infer<typeof BoundingBoxSequenceSchema>
export type AnnotationZ = z.infer<typeof AnnotationSchema>
export type ObjectAnnotationZ = z.infer<typeof ObjectAnnotationSchema>
export type TypeAnnotationZ = z.infer<typeof TypeAnnotationSchema>

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Safely parse data with detailed error reporting.
 * Returns { success: true, data } or { success: false, error }.
 */
export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown) {
  return schema.safeParse(data)
}

/**
 * Type guard using Zod schema validation.
 */
export function isValidTime(data: unknown): data is TimeZ {
  return TimeSchema.safeParse(data).success
}

export function isValidTimeInstant(data: unknown): data is TimeInstantZ {
  return TimeInstantSchema.safeParse(data).success
}

export function isValidTimeInterval(data: unknown): data is TimeIntervalZ {
  return TimeIntervalSchema.safeParse(data).success
}

export function isValidLocation(data: unknown): data is LocationZ {
  return LocationSchema.safeParse(data).success
}

export function isValidEntity(data: unknown): data is EntityZ {
  return EntitySchema.safeParse(data).success
}

export function isValidEvent(data: unknown): data is EventZ {
  return EventSchema.safeParse(data).success
}

export function isValidEntityCollection(data: unknown): data is EntityCollectionZ {
  return EntityCollectionSchema.safeParse(data).success
}

export function isValidEventCollection(data: unknown): data is EventCollectionZ {
  return EventCollectionSchema.safeParse(data).success
}

export function isValidTimeCollection(data: unknown): data is TimeCollectionZ {
  return TimeCollectionSchema.safeParse(data).success
}

export function isValidAnnotation(data: unknown): data is AnnotationZ {
  return AnnotationSchema.safeParse(data).success
}

export function isValidObjectAnnotation(data: unknown): data is ObjectAnnotationZ {
  return ObjectAnnotationSchema.safeParse(data).success
}

export function isValidTypeAnnotation(data: unknown): data is TypeAnnotationZ {
  return TypeAnnotationSchema.safeParse(data).success
}
