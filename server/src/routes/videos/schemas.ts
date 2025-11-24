import { Type } from '@sinclair/typebox'

/**
 * Shared TypeBox schemas for video routes.
 * Centralizes request/response validation schemas.
 */

/**
 * Video metadata schema.
 */
export const VideoSchema = Type.Object({
  id: Type.String(),
  filename: Type.String(),
  path: Type.String(),
  size: Type.Number(),
  createdAt: Type.String({ format: 'date-time' })
}, { additionalProperties: true })

/**
 * Detection query options schema.
 * Controls which elements to include in persona-based detection queries.
 */
export const DetectionQueryOptionsSchema = Type.Object({
  // Ontology type options
  includeEntityTypes: Type.Optional(Type.Boolean({ default: true })),
  includeEntityGlosses: Type.Optional(Type.Boolean({ default: false })),
  includeEventTypes: Type.Optional(Type.Boolean({ default: false })),
  includeEventGlosses: Type.Optional(Type.Boolean({ default: false })),
  includeRoleTypes: Type.Optional(Type.Boolean({ default: false })),
  includeRoleGlosses: Type.Optional(Type.Boolean({ default: false })),
  includeRelationTypes: Type.Optional(Type.Boolean({ default: false })),
  includeRelationGlosses: Type.Optional(Type.Boolean({ default: false })),
  // World state instance options
  includeEntityInstances: Type.Optional(Type.Boolean({ default: false })),
  includeEntityInstanceGlosses: Type.Optional(Type.Boolean({ default: false })),
  includeEventInstances: Type.Optional(Type.Boolean({ default: false })),
  includeEventInstanceGlosses: Type.Optional(Type.Boolean({ default: false })),
  includeLocationInstances: Type.Optional(Type.Boolean({ default: false })),
  includeLocationInstanceGlosses: Type.Optional(Type.Boolean({ default: false })),
  includeTimeInstances: Type.Optional(Type.Boolean({ default: false })),
  includeTimeInstanceGlosses: Type.Optional(Type.Boolean({ default: false })),
})

/**
 * Detection request schema.
 */
export const DetectionRequestSchema = Type.Object({
  personaId: Type.Optional(Type.String({ format: 'uuid' })),
  manualQuery: Type.Optional(Type.String()),
  queryOptions: Type.Optional(DetectionQueryOptionsSchema),
  confidenceThreshold: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 0.3 })),
  frameNumbers: Type.Optional(Type.Array(Type.Number())),
  enableTracking: Type.Optional(Type.Boolean({ default: false })),
})

/**
 * Detection bounding box schema.
 */
export const BoundingBoxSchema = Type.Object({
  x: Type.Number(),
  y: Type.Number(),
  width: Type.Number(),
  height: Type.Number(),
  confidence: Type.Number(),
  label: Type.String(),
})

/**
 * Detection response schema.
 */
export const DetectionResponseSchema = Type.Object({
  videoId: Type.String(),
  query: Type.String(),
  frameResults: Type.Array(Type.Object({
    frameNumber: Type.Number(),
    detections: Type.Array(BoundingBoxSchema),
  })),
})
