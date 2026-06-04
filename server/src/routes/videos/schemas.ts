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
 * Detection response schema. Mirrors the camelcased model-service
 * `DetectionResponse` (id, video_id, query, frames[], total_detections,
 * processing_time) so this route can pass the upstream shape through
 * without manual reshaping. The previous schema renamed `frames` to
 * `frameResults` and flattened the inner `bounding_box: {x, y, width,
 * height}` to top-level coordinates on each detection, which then did
 * not match either the model-service emit (still `bounding_box`) or
 * the frontend `DetectionResponse` type (reads `boundingBox` and
 * iterates `frames`). The end result was a frontend TypeError when the
 * Detection Results dialog tried to read `detectionResults.frames`
 * which fast-json-stringify had silently dropped. Keeping a single
 * canonical shape across the three layers prevents that drift from
 * recurring.
 */
export const DetectionResponseSchema = Type.Object({
  id: Type.String(),
  videoId: Type.String(),
  query: Type.String(),
  frames: Type.Array(Type.Object({
    frameNumber: Type.Number(),
    timestamp: Type.Number(),
    detections: Type.Array(Type.Object({
      label: Type.String(),
      boundingBox: Type.Object({
        x: Type.Number(),
        y: Type.Number(),
        width: Type.Number(),
        height: Type.Number(),
      }),
      confidence: Type.Number(),
      trackId: Type.Union([Type.String(), Type.Null()]),
      // Tour-demo augmentation fields. The real model-service does
      // not emit these, but the MSW handler in
      // src/mocks/tourDemo/handlers.ts does, and the candidates list
      // renders a "snap to type" chip when present. Declared here as
      // optional so that if the model-service ever emits them they
      // survive fast-json-stringify rather than being silently
      // dropped from the response body.
      acceptAsLabel: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      acceptAsWikidataId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    })),
  })),
  totalDetections: Type.Number(),
  processingTime: Type.Number(),
})
