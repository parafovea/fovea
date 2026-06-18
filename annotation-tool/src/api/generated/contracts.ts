/**
 * Named, stable contract types aliased from the generated OpenAPI `paths`.
 *
 * The server's Fastify + TypeBox route schemas are the source of truth. This
 * module pulls the request/response shapes for the object-detection and
 * ontology-augmentation operations out of the generated `paths` interface and
 * gives them stable names so consumers never index into the raw path/operation
 * structure (and never re-declare the shapes by hand, which is what drifted).
 *
 * Regenerate `openapi.ts` with `pnpm gen:api-types` after changing server
 * schemas; these aliases then track the new shapes automatically.
 */
import type { paths } from './openapi'

/**
 * The `application/json` body of a 200 response for operation `paths[P][M]`.
 */
type JsonResponse200<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  responses: { 200: { content: { 'application/json': infer R } } }
}
  ? R
  : never

/**
 * The `application/json` request body for operation `paths[P][M]`.
 */
type JsonRequestBody<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  requestBody: { content: { 'application/json': infer B } }
}
  ? B
  : never

/**
 * Response of `POST /api/videos/{videoId}/detect`: the full detection result
 * with per-frame detections and bounding boxes.
 */
export type DetectionResponse = JsonResponse200<'/api/videos/{videoId}/detect', 'post'>

/**
 * Request body of `POST /api/videos/{videoId}/detect`, augmented with the
 * `videoId` path parameter the API client uses to build the URL. The server
 * carries `videoId` in the path, not the body, but the frontend passes a single
 * object to `apiClient.detectObjects`.
 */
export type DetectionRequest = JsonRequestBody<'/api/videos/{videoId}/detect', 'post'> & {
  videoId: string
}

/**
 * The `queryOptions` sub-object of a detection request: the persona-query
 * include flags.
 */
export type DetectionQueryOptions = NonNullable<
  JsonRequestBody<'/api/videos/{videoId}/detect', 'post'>['queryOptions']
>

/**
 * Detections for a single video frame.
 */
export type FrameDetections = DetectionResponse['frames'][number]

/**
 * A single object detection result.
 */
export type Detection = FrameDetections['detections'][number]

/**
 * Bounding-box coordinates for a detection (normalized 0-1).
 */
export type BoundingBox = Detection['boundingBox']

/**
 * Response of `POST /api/ontology/augment`: suggested ontology types with
 * reasoning.
 */
export type AugmentationResponse = JsonResponse200<'/api/ontology/augment', 'post'>

/**
 * Request body of `POST /api/ontology/augment`.
 */
export type AugmentOntologyRequest = JsonRequestBody<'/api/ontology/augment', 'post'>

/**
 * A single suggested ontology type from the augmenter.
 */
export type OntologySuggestion = AugmentationResponse['suggestions'][number]

/**
 * Category of ontology type to augment. The augment response carries this as a
 * plain string; the precise literal union is the request body's `targetCategory`.
 */
export type OntologyCategory = AugmentOntologyRequest['targetCategory']
