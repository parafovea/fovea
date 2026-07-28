/**
 * The FOVEA video-annotation surface as a `@panproto/core` lens plus a
 * multi-record composition and a record<->row adapter.
 *
 * A FOVEA video annotation projects onto three layers records: a
 * `pub.layers.annotation.annotationLayer` grouping whose `annotations[]` holds
 * the annotation (anchored by a `defs#spatioTemporalAnchor` — keyframes carrying
 * a `bbox` plus a `temporalSpan`), a per-video track
 * `pub.layers.annotation.clusterSet`, and, when the annotation denotes a world
 * object, a `pub.layers.graph.graphNode`.
 *
 * The surface is carried by two compiled lenses, one per direction, so every
 * per-record value/structure/aggregate transform lives in a lens both ways:
 *
 *   - The forward lens ({@link VIDEO_ANNOTATION_LENS_DOC}, fovea -> layers) anchors
 *     at the annotation root and, on `getJson`, (i) regroups each keyframe's flat
 *     integer `x/y/width/height` into a nested `bbox` while carrying `timeMs` and
 *     the optional feature map through, (ii) derives the `temporalSpan` as the
 *     min/max keyframe time by a fold over the keyframe array, and (iii) scales the
 *     annotation `confidence` from a 0-1 float to the layers-native 0-1000 integer.
 *     {@link projectAnnotationCore} reads the transformed record back through
 *     `getJson`, so the lens is the mapper, not merely a specification of one.
 *   - The backward lens ({@link VIDEO_ANNOTATION_BACK_LENS_DOC}, layers -> fovea)
 *     anchors at the layers record root and, on `getJson`, inverts those value and
 *     structure transforms: it flattens each keyframe's nested `bbox` back to flat
 *     integer geometry (carrying `timeMs` and the feature map through) and descales
 *     the 0-1000 integer `confidence` to a 0-1 float. {@link projectBackView} reads
 *     it back, and {@link layersToAnnotationViaLens} reconstructs the FOVEA
 *     annotation from it. The backward direction runs the inverse lens's `getJson`
 *     rather than the forward lens's `putJson`: on `@panproto/core@0.66.0` the
 *     JSON `putJson` restore path does not apply a step's inverse expression and
 *     reorders array elements, so the reliable, value-inverting operation is the
 *     forward projection of a lens authored in the reverse direction.
 *
 * {@link composeVideoRecords} owns only what a single lens cannot: assembling the
 * annotation object, its grouping `annotationLayer`, the denoted world `graphNode`,
 * and the video's track `clusterSet`, and wiring their cross-record references
 * (`layerId`, the denoted node, the track cluster membership) by deterministic id.
 * {@link videoRecordsToRows} distributes those records to the Prisma-row shape the
 * persistence boundary uses. The frame-number/millisecond mapping and the
 * per-keyframe feature encode/decode stay at the ingress/egress boundary
 * ({@link toVideoAnnotationSource} / {@link layersToAnnotationViaLens}), since both
 * need the video frame rate and join across the sequence's visibility and
 * interpolation lists — neither is a per-keyframe lens step.
 *
 * @module
 */

import { z } from 'zod'

import {
  boundingBoxSequenceToSpatioTemporalAnchor,
  spatioTemporalAnchorToBoundingBoxSequence,
  to1000,
  from1000,
  type BoundingBoxSequence,
  type FoveaTrackingSource,
} from '../layers-conversion-service.js'
import { annotationLayerId, trackClusterSetId } from '../layers-id-map.js'
import { getPanproto, loadFoveaSchema } from './panproto-registry.js'
import type { LensHandle, ProtolensChainHandle } from '@panproto/core'
import type { SpatioTemporalAnchor, Keyframe, TemporalSpan } from '@fovea/layers-schema'
import type {
  VideoAnnotationInput as OracleVideoAnnotationInput,
  AnnotationToLayersContext,
  AnnotationLayersMapping as OracleAnnotationLayersMapping,
  StoredLayersAnnotation,
  StoredAnnotationLayer,
  VideoRow,
  DenotesNode,
  MappedTrack as OracleMappedTrack,
  VideoAnnotationOutput,
} from '../video-annotation-shared.js'

// --------------------------------------------------------------------------
// FOVEA video-annotation view-model (the lens source)
// --------------------------------------------------------------------------

/** The kind of world object an object annotation's `label` references. */
export type VideoAnnotationLinkType = 'entity' | 'event' | 'time' | 'location'

/** The FOVEA-native context a video annotation carries beyond its own fields. */
export interface VideoAnnotationContext {
  /** The video's `Expression` id. */
  expressionId: string
  /** The persona's `LayersOntology` id for a type layer, or null. */
  ontologyId: string | null
  /** The video frame rate, for the frame-number to millisecond mapping. */
  frameRate: number
  /** The video width in pixels. */
  videoWidth?: number
  /** The video height in pixels. */
  videoHeight?: number
}

/** A single keyframe in the view-model, with flat integer-pixel geometry. */
export interface VideoKeyframe {
  /** Time in milliseconds (already resolved from frame number and frame rate). */
  timeMs: number
  /** X coordinate of the box's top-left corner in pixels. */
  x: number
  /** Y coordinate of the box's top-left corner in pixels. */
  y: number
  /** Box width in pixels. */
  width: number
  /** Box height in pixels. */
  height: number
  /** Per-keyframe features (confidence, visibility, interpolation, metadata). */
  features?: { entries: Array<{ key: string; value: string }> }
}

/** The track a tracked annotation belongs to, in FOVEA-native units. */
export interface VideoTrack {
  /** The tracker's object id. */
  trackId: string | number
  /** The tracker name that produced the sequence. */
  trackingSource?: FoveaTrackingSource
  /** The tracked-sequence confidence as a 0-1 float. */
  trackingConfidence?: number
}

/**
 * The FOVEA video-annotation view-model the lens maps from: FOVEA-native scalars
 * plus the keyframes flattened out of the annotation's bounding-box sequence. The
 * `temporalSpan` is not carried here — the lens derives it by folding the keyframe
 * times. The frame-number-to-time resolution, the per-keyframe feature encoding,
 * and the interpolation slug are resolved into this shape by
 * {@link toVideoAnnotationSource}.
 */
export interface VideoAnnotationSource {
  id: string
  videoId: string
  personaId: string | null
  type: string
  label: string
  linkType: VideoAnnotationLinkType | null
  /** Authoring source method. */
  source: string
  /** Confidence as a 0-1 float, or null. */
  confidence: number | null
  /** The video's expression id. */
  expressionId: string
  /** The persona's ontology id for a type layer, or null. */
  ontologyId: string | null
  /** The anchor's interpolation slug (`linear`/`step`/`cubic`). */
  interpolation: string
  /** The AT-URI of the anchor's lead interpolation mode, when present. */
  interpolationUri?: string
  /** The keyframes with flat geometry, in time order. */
  keyframes: VideoKeyframe[]
  /** The track this annotation joins, or null when its sequence carries no track. */
  track: VideoTrack | null
}

/**
 * The Zod schema for the annotation core the lens binds to. It carries the flat
 * per-keyframe geometry and the annotation scalars whose value or structure the
 * lens transforms (`keyframes` -> nested `bbox`, `confidence` -> 0-1000) or from
 * which it derives an aggregate (`temporalSpan`). The interpolation slug and its
 * URI pass through untouched so the composition reads the whole anchor back from
 * the lens output rather than from the source.
 */
export const videoLensSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  confidence: z.number().nullable(),
  interpolation: z.string(),
  interpolationUri: z.string().optional(),
  keyframes: z.array(
    z.object({
      timeMs: z.number().int(),
      x: z.number().int(),
      y: z.number().int(),
      width: z.number().int(),
      height: z.number().int(),
      features: z
        .object({ entries: z.array(z.object({ key: z.string(), value: z.string() })) })
        .optional(),
    }),
  ),
})

// --------------------------------------------------------------------------
// View-model construction from the FOVEA annotation input
// --------------------------------------------------------------------------

/** The FOVEA annotation input the view-model is built from. */
export interface VideoAnnotationInput {
  id: string
  videoId: string
  personaId: string | null
  type: string
  label: string
  linkType: VideoAnnotationLinkType | null
  frames: BoundingBoxSequence
  confidence: number | null
  source: string
}

/**
 * Flattens a layers keyframe's nested geometry into the view-model's flat
 * keyframe, carrying its time and per-keyframe features unchanged.
 *
 * @param kf - the layers keyframe (nested `bbox`)
 * @returns the flat view-model keyframe
 */
function flattenKeyframe(kf: Keyframe): VideoKeyframe {
  const flat: VideoKeyframe = {
    timeMs: kf.timeMs,
    x: kf.bbox.x,
    y: kf.bbox.y,
    width: kf.bbox.width,
    height: kf.bbox.height,
  }
  if (kf.features) flat.features = kf.features
  return flat
}

/**
 * Builds the FOVEA video-annotation view-model from an annotation and its
 * context. The frame-number-to-time mapping and per-keyframe feature encoding —
 * neither expressible as a keyframe-item lens step, since the first needs the
 * parent frame rate and the second joins across the sequence's visibility and
 * interpolation lists — are resolved here by projecting the bounding-box sequence
 * to a spatio-temporal anchor and flattening its keyframes. The interpolation slug
 * and its URI are read off that anchor and carried on the view-model; the
 * `temporalSpan` is left for the lens to derive.
 *
 * @param input - the FOVEA annotation
 * @param ctx - the resolved expression, ontology, and frame-rate context
 * @returns the view-model the lens and composition map from
 */
export function toVideoAnnotationSource(
  input: VideoAnnotationInput,
  ctx: VideoAnnotationContext,
): VideoAnnotationSource {
  const anchor = boundingBoxSequenceToSpatioTemporalAnchor(input.frames, {
    frameRate: ctx.frameRate,
    videoWidth: ctx.videoWidth,
    videoHeight: ctx.videoHeight,
  })

  const source: VideoAnnotationSource = {
    id: input.id,
    videoId: input.videoId,
    personaId: input.personaId,
    type: input.type,
    label: input.label,
    linkType: input.linkType,
    source: input.source,
    confidence: input.confidence,
    expressionId: ctx.expressionId,
    ontologyId: ctx.ontologyId,
    interpolation: anchor.interpolation ?? 'linear',
    keyframes: (anchor.keyframes ?? []).map(flattenKeyframe),
    track: null,
  }
  if (anchor.interpolationUri) source.interpolationUri = anchor.interpolationUri

  const seq = input.frames
  if (seq.trackId !== undefined) {
    const track: VideoTrack = { trackId: seq.trackId }
    if (seq.trackingSource !== undefined) track.trackingSource = seq.trackingSource
    if (seq.trackingConfidence !== undefined) track.trackingConfidence = seq.trackingConfidence
    source.track = track
  }

  return source
}

// --------------------------------------------------------------------------
// The annotation-core lens
// --------------------------------------------------------------------------

/**
 * The lens document for the annotation core, anchored at the annotation root. Its
 * three `compute_field` steps carry the surface's per-record transforms:
 *
 *   - `keyframes` regroups each flat keyframe's `x/y/width/height` into a nested
 *     `bbox`, keeping `timeMs` and merging the optional feature map through, so the
 *     output keyframe is the layers {@link Keyframe} shape;
 *   - `temporalSpan` folds the keyframe times to the min start and max ending,
 *     deriving the anchor's temporal extent rather than carrying it in the source;
 *   - `confidence` scales the 0-1 float to the layers-native 0-1000 integer,
 *     mirroring the half-up rounding of {@link to1000} by `floor(x*1000 + 0.5)`,
 *     and passes a null confidence through as null.
 *
 * The document is native (its complement requirement is empty) and lawful in both
 * directions — get/put and put/get hold over the string, integer, and record
 * leaves it constructs.
 */
export const VIDEO_ANNOTATION_LENS_DOC = {
  id: 'fovea.video.annotation-core.v1',
  source: 'fovea.video.annotation',
  target: 'pub.layers.annotation.annotationLayer',
  steps: [
    {
      compute_field: {
        target: 'keyframes',
        expr:
          'map (\\k -> merge { bbox = { x = k.x, y = k.y, width = k.width, height = k.height }, timeMs = k.timeMs } (if has_field k "features" then { features = k.features } else {})) keyframes',
      },
    },
    {
      compute_field: {
        target: 'temporalSpan',
        expr:
          'if length keyframes == 0 then { start = 0, ending = 0 } else { start = fold (\\a b -> if a < b then a else b) 9000000 (map (\\k -> k.timeMs) keyframes), ending = fold (\\a b -> if a > b then a else b) 0 (map (\\k -> k.timeMs) keyframes) }',
      },
    },
    {
      compute_field: {
        target: 'confidence',
        expr: 'if is_null confidence then Nothing else floor (confidence * 1000.0 + 0.5)',
      },
    },
  ],
} as const

/** The body vertex the annotation-core lens binds to: the annotation record root. */
export const VIDEO_ANNOTATION_LENS_BODY_VERTEX = 'root'

/** The source-schema vertex a source record roots at for `getJson`/`putJson`. */
const ROOT_VERTEX = 'root'

/** A compiled annotation-core lens with its schema-independent chain and signals. */
export interface VideoAnnotationLens {
  /** The schema-independent compiled chain. */
  chain: ProtolensChainHandle
  /** The chain instantiated at the view-model source schema. */
  lens: LensHandle
  /** The complement-requirement kind at the source schema (`empty` is native). */
  requirementKind: string
  /** The field transforms the chain carries, keyed by parent vertex. */
  fieldTransforms: Record<string, unknown[]>
}

/**
 * Compiles the annotation-core lens against the view-model source schema and
 * reports its native-ness signals. The returned {@link VideoAnnotationLens.lens}
 * answers `getJson`/`putJson` and `checkGetPut`/`checkPutGet` for a source record.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export async function buildVideoAnnotationLens(): Promise<VideoAnnotationLens> {
  const p = await getPanproto()
  const source = await loadFoveaSchema(videoLensSourceSchema)
  const chain = p.compileLensDocument(VIDEO_ANNOTATION_LENS_DOC, VIDEO_ANNOTATION_LENS_BODY_VERTEX)
  return {
    chain,
    lens: chain.instantiate(source),
    requirementKind: chain.requirements(source).kind,
    fieldTransforms: chain.fieldTransforms(),
  }
}

let videoLensPromise: Promise<VideoAnnotationLens> | null = null

/** The annotation-core lens, compiled and instantiated once per process. */
export function getVideoAnnotationLens(): Promise<VideoAnnotationLens> {
  videoLensPromise ??= buildVideoAnnotationLens()
  return videoLensPromise
}

/**
 * The annotation core the lens emits: the regrouped keyframes, the derived
 * temporal span, the scaled confidence, and the interpolation the lens carried
 * through. The composition reads the whole anchor back from this shape.
 */
export interface VideoAnnotationCoreView {
  id: string
  label: string
  /** Confidence on the layers-native 0-1000 integer scale, or null. */
  confidence: number | null
  interpolation: string
  interpolationUri?: string
  temporalSpan: TemporalSpan
  keyframes: Keyframe[]
}

/**
 * Projects the view-model's annotation core into the lens source record — the
 * flat-geometry, 0-1-confidence shape {@link videoLensSourceSchema} binds. The
 * lens reads this record and emits {@link VideoAnnotationCoreView}.
 *
 * @param source - the view-model
 * @returns the lens source record
 */
export function toVideoLensRecord(source: VideoAnnotationSource): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id: source.id,
    label: source.label,
    confidence: source.confidence,
    interpolation: source.interpolation,
    keyframes: source.keyframes.map((kf) => {
      const flat: Record<string, unknown> = {
        timeMs: kf.timeMs,
        x: kf.x,
        y: kf.y,
        width: kf.width,
        height: kf.height,
      }
      if (kf.features) flat.features = kf.features
      return flat
    }),
  }
  if (source.interpolationUri !== undefined) record.interpolationUri = source.interpolationUri
  return record
}

/**
 * Projects the view-model's annotation core through the lens, reading the
 * transformed record back with `getJson`. The returned view carries the regrouped
 * `bbox` keyframes, the folded `temporalSpan`, and the scaled `confidence` — the
 * lens, not the caller, did the value/structure/aggregate work.
 *
 * @param lens - the instantiated annotation-core lens
 * @param source - the view-model
 * @returns the transformed annotation core
 */
export function projectAnnotationCore(
  lens: LensHandle,
  source: VideoAnnotationSource,
): VideoAnnotationCoreView {
  const { view } = lens.getJson(toVideoLensRecord(source), ROOT_VERTEX)
  return view as VideoAnnotationCoreView
}

// --------------------------------------------------------------------------
// FOVEA -> layers domain derivations
// --------------------------------------------------------------------------

/**
 * The annotation `type` values that mark a persona-scoped annotation as denoting
 * a world instance rather than assigning an ontology type.
 */
const WORLD_INSTANCE_TYPES: readonly string[] = ['entity', 'event', 'time', 'location']

/** The nodeType an object-annotation link kind (or instance kind) denotes. */
function linkTypeToNodeType(linkType: VideoAnnotationLinkType | string | null): string {
  switch (linkType) {
    case 'event':
      return 'situation'
    case 'time':
      return 'time'
    case 'location':
      return 'location'
    default:
      return 'entity'
  }
}

/** Reassembles the spatio-temporal anchor from the lens-projected core. */
function anchorFromCore(core: VideoAnnotationCoreView): SpatioTemporalAnchor {
  const anchor: SpatioTemporalAnchor = {
    interpolation: core.interpolation as SpatioTemporalAnchor['interpolation'],
    keyframes: core.keyframes,
    temporalSpan: core.temporalSpan,
  }
  if (core.interpolationUri) anchor.interpolationUri = core.interpolationUri
  return anchor
}

// --------------------------------------------------------------------------
// Multi-record composition
// --------------------------------------------------------------------------

/** A layers `pub.layers.defs#uuid` value. */
interface Uuid {
  value: string
}

/** The annotation object nested in an `annotationLayer` record's `annotations[]`. */
export interface LayersAnnotationObject {
  uuid: Uuid
  anchor: { spatioTemporalAnchor: SpatioTemporalAnchor }
  label: string
  confidence?: number
  ontologyTypeRef?: string
  /** The denotation link to a graph node, as a role/argument reference. */
  arguments?: Array<{ role: string; target: { recordRef: string } }>
}

/**
 * A `pub.layers.annotation.annotationLayer` record with the identity and scope the
 * Prisma row carries but the wire record does not (the deterministic layer id, the
 * persona, and the ontology id).
 */
export interface AnnotationLayerRecord {
  $type: 'pub.layers.annotation.annotationLayer'
  expression: string
  kind: 'span'
  subkind: 'ontology-type' | 'world-object'
  sourceMethod: string
  ontologyRef?: string
  annotations: LayersAnnotationObject[]
  createdAt: string
  /** The deterministic layer id (`annotationLayerId`). */
  _id: string
  /** The persona this layer groups, or null for the object layer. */
  _personaId: string | null
  /** The persona's ontology id for a type layer, or null. */
  _ontologyId: string | null
}

/** A `pub.layers.graph.graphNode` record with its deterministic id. */
export interface GraphNodeRecord {
  $type: 'pub.layers.graph.graphNode'
  nodeType: string
  label: string
  createdAt: string
  /** The deterministic node id (the annotation label). */
  _id: string
}

/** A `pub.layers.annotation.clusterSet` record grouping a video's tracks. */
export interface TrackClusterSetRecord {
  $type: 'pub.layers.annotation.clusterSet'
  expression: string
  kind: 'clustering'
  layerRef: string
  clusters: Array<{
    uuid: Uuid
    canonicalLabel?: string
    members: Array<{ localId: Uuid }>
    features?: { entries: Array<{ key: string; value: string }> }
  }>
  createdAt: string
  /** The deterministic cluster-set id (`trackClusterSetId`). */
  _id: string
}

/** The layers records a single FOVEA video annotation composes into. */
export interface VideoLayersRecords {
  /** The grouping layer record nesting the annotation. */
  annotationLayer: AnnotationLayerRecord
  /** The denoted world node, or null when the annotation denotes none. */
  graphNode: GraphNodeRecord | null
  /** The video's track cluster set holding this annotation's track, or null. */
  trackClusterSet: TrackClusterSetRecord | null
  /** The raw track (FOVEA-native id, tracker name, 0-1 confidence), or null. */
  track: VideoTrack | null
}

/** A cluster feature key carrying the tracked-sequence confidence (0-1000 int). */
const TRACK_CONFIDENCE_KEY = 'trackingConfidence'

/** A fixed creation timestamp for the composed records (identity is deterministic). */
const COMPOSED_AT = '1970-01-01T00:00:00.000Z'

/**
 * Composes a FOVEA video-annotation view-model and its lens-projected core into
 * the surface's layers records: an `annotationLayer` grouping nesting the
 * annotation (anchored by the lens-regrouped spatio-temporal anchor and bearing
 * the lens-scaled confidence), a denoted `graphNode` when the annotation links a
 * world object, and the video's track `clusterSet` when the sequence is tracked.
 * The cross-record references are wired by deterministic id — the layer id from
 * {@link annotationLayerId}, the cluster-set id from {@link trackClusterSetId}, the
 * node id from the annotation label, and the annotation's membership by its own id
 * — so a re-composition of the same annotation reuses the same rows. This owns only
 * the multi-record framing and id wiring; the per-record value/structure/aggregate
 * work is the lens's, read in through `core`.
 *
 * @param source - the view-model (the framing scalars: persona, type, video, track)
 * @param core - the lens-projected annotation core (anchor, span, confidence)
 * @returns the composed layers records
 */
export function composeVideoRecords(
  source: VideoAnnotationSource,
  core: VideoAnnotationCoreView,
): VideoLayersRecords {
  const { personaId } = source
  const layerId = annotationLayerId(source.videoId, personaId)
  const isInstance = personaId != null && WORLD_INSTANCE_TYPES.includes(source.type)

  // The denoted world node: an object annotation's intentional link, or a
  // persona-scoped world-instance annotation's type; a persona type-annotation and
  // an unlinked object annotation denote none.
  let graphNode: GraphNodeRecord | null = null
  if (!personaId && source.label && source.linkType) {
    graphNode = {
      $type: 'pub.layers.graph.graphNode',
      nodeType: linkTypeToNodeType(source.linkType),
      label: source.label,
      createdAt: COMPOSED_AT,
      _id: source.label,
    }
  } else if (isInstance && source.label) {
    graphNode = {
      $type: 'pub.layers.graph.graphNode',
      nodeType: linkTypeToNodeType(source.type),
      label: source.label,
      createdAt: COMPOSED_AT,
      _id: source.label,
    }
  }

  const ontologyTypeRef = personaId && !isInstance ? source.label || undefined : undefined

  const annotation: LayersAnnotationObject = {
    uuid: { value: core.id },
    anchor: { spatioTemporalAnchor: anchorFromCore(core) },
    label: core.label,
  }
  if (core.confidence !== null) annotation.confidence = core.confidence
  if (ontologyTypeRef !== undefined) annotation.ontologyTypeRef = ontologyTypeRef
  if (graphNode) {
    annotation.arguments = [{ role: 'denotes', target: { recordRef: graphNode._id } }]
  }

  const annotationLayer: AnnotationLayerRecord = {
    $type: 'pub.layers.annotation.annotationLayer',
    expression: source.expressionId,
    kind: 'span',
    subkind: personaId ? 'ontology-type' : 'world-object',
    sourceMethod: source.source,
    annotations: [annotation],
    createdAt: COMPOSED_AT,
    _id: layerId,
    _personaId: personaId,
    _ontologyId: personaId ? source.ontologyId : null,
  }
  if (personaId && source.ontologyId) annotationLayer.ontologyRef = source.ontologyId

  let trackClusterSet: TrackClusterSetRecord | null = null
  if (source.track) {
    const trackingConfidence1000 =
      source.track.trackingConfidence !== undefined ? to1000(source.track.trackingConfidence) : undefined
    const cluster: TrackClusterSetRecord['clusters'][number] = {
      uuid: { value: String(source.track.trackId) },
      members: [{ localId: { value: source.id } }],
    }
    if (source.track.trackingSource !== undefined) cluster.canonicalLabel = source.track.trackingSource
    if (trackingConfidence1000 !== undefined) {
      cluster.features = { entries: [{ key: TRACK_CONFIDENCE_KEY, value: String(trackingConfidence1000) }] }
    }
    trackClusterSet = {
      $type: 'pub.layers.annotation.clusterSet',
      expression: source.expressionId,
      kind: 'clustering',
      layerRef: layerId,
      clusters: [cluster],
      createdAt: COMPOSED_AT,
      _id: trackClusterSetId(source.videoId),
    }
  }

  return { annotationLayer, graphNode, trackClusterSet, track: source.track }
}

// --------------------------------------------------------------------------
// Record <-> Prisma-row adapter
// --------------------------------------------------------------------------

/** The world-object graph node an object or world-instance annotation denotes. */
export interface MappedDenotesNode {
  id: string
  nodeType: string
  label: string
}

/** The grouping `AnnotationLayer` row a video annotation maps to. */
export interface MappedAnnotationLayer {
  id: string
  expressionId: string
  kind: 'span'
  subkind: 'ontology-type' | 'world-object'
  sourceMethod: string
  ontologyId: string | null
  personaId: string | null
}

/** The `LayersAnnotation` row a video annotation maps to. */
export interface MappedLayersAnnotation {
  id: string
  layerId: string
  anchor: { spatioTemporalAnchor: SpatioTemporalAnchor }
  label: string
  confidence: number | null
  ontologyTypeRefId: string | null
  denotesNode: MappedDenotesNode | null
  startMs: number
  endMs: number
}

/** The track a tracked annotation belongs to, on the layers 0-1000 scale. */
export interface MappedTrack {
  trackId: string | number
  trackingSource?: FoveaTrackingSource
  trackingConfidence?: number
}

/** The layers rows a single FOVEA annotation projects onto. */
export interface AnnotationLayersMapping {
  layer: MappedAnnotationLayer
  annotation: MappedLayersAnnotation
  track: MappedTrack | null
}

/**
 * Distributes the composed layers records to the Prisma-row shape the
 * persistence boundary uses: the `annotationLayer` record becomes the grouping
 * row, its single nested annotation becomes the `LayersAnnotation` row (its
 * denotation resolved from the `graphNode` record, its `startMs`/`endMs` read off
 * the lens-derived temporal span), and the track cluster membership becomes the
 * track descriptor. The wire-record `createdAt` and the atproto reference framing
 * are dropped; the deterministic ids and scope carried alongside the record fill
 * the row's identity columns.
 *
 * @param records - the composed layers records
 * @returns the layer, annotation, and track rows
 */
export function videoRecordsToRows(records: VideoLayersRecords): AnnotationLayersMapping {
  const { annotationLayer, graphNode, track } = records
  const annotationObject = annotationLayer.annotations[0]
  const anchor = annotationObject.anchor.spatioTemporalAnchor

  const layer: MappedAnnotationLayer = {
    id: annotationLayer._id,
    expressionId: annotationLayer.expression,
    kind: 'span',
    subkind: annotationLayer.subkind,
    sourceMethod: annotationLayer.sourceMethod,
    ontologyId: annotationLayer._ontologyId,
    personaId: annotationLayer._personaId,
  }

  const denotesNode: MappedDenotesNode | null = graphNode
    ? { id: graphNode._id, nodeType: graphNode.nodeType, label: graphNode.label }
    : null

  const annotation: MappedLayersAnnotation = {
    id: annotationObject.uuid.value,
    layerId: annotationLayer._id,
    anchor: annotationObject.anchor,
    label: annotationObject.label,
    confidence: annotationObject.confidence ?? null,
    ontologyTypeRefId: annotationObject.ontologyTypeRef ?? null,
    denotesNode,
    startMs: anchor.temporalSpan.start,
    endMs: anchor.temporalSpan.ending,
  }

  let mappedTrack: MappedTrack | null = null
  if (track) {
    mappedTrack = { trackId: track.trackId }
    if (track.trackingSource !== undefined) mappedTrack.trackingSource = track.trackingSource
    if (track.trackingConfidence !== undefined) {
      mappedTrack.trackingConfidence = to1000(track.trackingConfidence)
    }
  }

  return { layer, annotation, track: mappedTrack }
}

/**
 * The end-to-end new path for one FOVEA video annotation: build the view-model,
 * project its core through the lens, compose the layers records, and distribute
 * them to rows. Equivalent, row for row, to the committed hand-rolled forward
 * mapper (the oracle) — the parity test asserts this over a corpus.
 *
 * @param input - the FOVEA annotation
 * @param ctx - the resolved expression, ontology, and frame-rate context
 * @returns the layer, annotation, and track rows
 */
export async function foveaAnnotationToLayersRows(
  input: VideoAnnotationInput,
  ctx: VideoAnnotationContext,
): Promise<AnnotationLayersMapping> {
  const { lens } = await getVideoAnnotationLens()
  const source = toVideoAnnotationSource(input, ctx)
  const core = projectAnnotationCore(lens, source)
  return videoRecordsToRows(composeVideoRecords(source, core))
}

// --------------------------------------------------------------------------
// The backward annotation-core lens (layers -> fovea)
// --------------------------------------------------------------------------

/**
 * The Zod schema for the layers-shaped record the backward lens binds to: the
 * spatio-temporal anchor's nested `bbox` keyframes, the 0-1000 integer confidence,
 * and the scalars carried alongside. It is the reverse orientation of
 * {@link videoLensSourceSchema} — this is the lens *source* the backward direction
 * reads, and the FOVEA flat-geometry shape is its *target*.
 */
export const videoLensBackSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  confidence: z.number().int().nullable(),
  interpolation: z.string(),
  interpolationUri: z.string().optional(),
  temporalSpan: z.object({ start: z.number().int(), ending: z.number().int() }),
  keyframes: z.array(
    z.object({
      bbox: z.object({
        x: z.number().int(),
        y: z.number().int(),
        width: z.number().int(),
        height: z.number().int(),
      }),
      timeMs: z.number().int(),
      features: z
        .object({ entries: z.array(z.object({ key: z.string(), value: z.string() })) })
        .optional(),
    }),
  ),
})

/**
 * The lens document for the backward direction, anchored at the layers record
 * root. Its two `compute_field` steps invert the forward lens's value and
 * structure transforms on `getJson`:
 *
 *   - `keyframes` flattens each keyframe's nested `bbox` back to flat integer
 *     `x/y/width/height`, keeping `timeMs` and merging the optional feature map
 *     through, so the output keyframe is the FOVEA {@link VideoKeyframe} shape;
 *   - `confidence` descales the 0-1000 integer to a 0-1 float, and passes a null
 *     confidence through as null.
 *
 * The `temporalSpan` field is left on the projected view unread — the FOVEA
 * sequence derives its frame counts from the keyframes, so the span is redundant
 * on reconstruction.
 */
export const VIDEO_ANNOTATION_BACK_LENS_DOC = {
  id: 'fovea.video.annotation-core.back.v1',
  source: 'pub.layers.annotation.annotationLayer',
  target: 'fovea.video.annotation',
  steps: [
    {
      compute_field: {
        target: 'keyframes',
        expr:
          'map (\\k -> merge { x = k.bbox.x, y = k.bbox.y, width = k.bbox.width, height = k.bbox.height, timeMs = k.timeMs } (if has_field k "features" then { features = k.features } else {})) keyframes',
      },
    },
    {
      compute_field: {
        target: 'confidence',
        expr: 'if is_null confidence then Nothing else int_to_float confidence / 1000.0',
      },
    },
  ],
} as const

/** The body vertex the backward lens binds to: the layers record root. */
export const VIDEO_ANNOTATION_BACK_LENS_BODY_VERTEX = 'root'

/** A compiled backward annotation-core lens with its chain and native-ness signals. */
export interface VideoAnnotationBackLens {
  /** The schema-independent compiled chain. */
  chain: ProtolensChainHandle
  /** The chain instantiated at the layers-shaped source schema. */
  lens: LensHandle
  /** The complement-requirement kind at the source schema (`empty` is native). */
  requirementKind: string
  /** The field transforms the chain carries, keyed by parent vertex. */
  fieldTransforms: Record<string, unknown[]>
}

/**
 * Compiles the backward annotation-core lens against the layers-shaped source
 * schema and reports its native-ness signals.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export async function buildVideoAnnotationBackLens(): Promise<VideoAnnotationBackLens> {
  const p = await getPanproto()
  const source = await loadFoveaSchema(videoLensBackSourceSchema)
  const chain = p.compileLensDocument(
    VIDEO_ANNOTATION_BACK_LENS_DOC,
    VIDEO_ANNOTATION_BACK_LENS_BODY_VERTEX,
  )
  return {
    chain,
    lens: chain.instantiate(source),
    requirementKind: chain.requirements(source).kind,
    fieldTransforms: chain.fieldTransforms(),
  }
}

let videoBackLensPromise: Promise<VideoAnnotationBackLens> | null = null

/** The backward annotation-core lens, compiled and instantiated once per process. */
export function getVideoAnnotationBackLens(): Promise<VideoAnnotationBackLens> {
  videoBackLensPromise ??= buildVideoAnnotationBackLens()
  return videoBackLensPromise
}

/**
 * The FOVEA annotation core the backward lens emits: the flattened keyframes, the
 * descaled 0-1 confidence, and the scalars carried through. The reconstruction
 * reads its `confidence` and re-nests its `keyframes` into an anchor.
 */
export interface VideoAnnotationBackView {
  id: string
  label: string
  /** Confidence on the FOVEA 0-1 float scale, or null. */
  confidence: number | null
  interpolation: string
  interpolationUri?: string
  temporalSpan: TemporalSpan
  /** The keyframes with flat geometry, in time order. */
  keyframes: VideoKeyframe[]
}

/** Builds the backward lens source record from a stored annotation and its anchor. */
function toBackLensRecord(
  row: StoredLayersAnnotation,
  anchor: SpatioTemporalAnchor | undefined,
): Record<string, unknown> {
  const record: Record<string, unknown> = {
    id: row.id,
    label: row.label ?? '',
    confidence: row.confidence,
    interpolation: anchor?.interpolation ?? 'linear',
    temporalSpan: anchor?.temporalSpan ?? { start: 0, ending: 0 },
    keyframes: anchor?.keyframes ?? [],
  }
  if (anchor?.interpolationUri) record.interpolationUri = anchor.interpolationUri
  return record
}

/**
 * Projects a stored annotation row through the backward lens, reading the
 * transformed view back with `getJson`. The returned view carries the flattened
 * keyframes and the descaled `confidence` — the lens, not the caller, inverts the
 * geometry regroup and the confidence scale.
 *
 * @param lens - the instantiated backward annotation-core lens
 * @param row - the stored annotation
 * @param anchor - the row's spatio-temporal anchor, if any
 * @returns the backward view
 */
export function projectBackView(
  lens: LensHandle,
  row: StoredLayersAnnotation,
  anchor: SpatioTemporalAnchor | undefined,
): VideoAnnotationBackView {
  const { view } = lens.getJson(toBackLensRecord(row, anchor), ROOT_VERTEX)
  return view as VideoAnnotationBackView
}

/** Re-nests a flat view keyframe into the layers {@link Keyframe} shape. */
function nestKeyframe(kf: VideoKeyframe): Keyframe {
  const keyframe: Keyframe = {
    bbox: { x: kf.x, y: kf.y, width: kf.width, height: kf.height },
    timeMs: kf.timeMs,
  }
  if (kf.features) keyframe.features = kf.features
  return keyframe
}

/** Reassembles a spatio-temporal anchor from the backward-lens view keyframes. */
function anchorFromBackView(view: VideoAnnotationBackView): SpatioTemporalAnchor {
  const anchor: SpatioTemporalAnchor = {
    interpolation: view.interpolation as SpatioTemporalAnchor['interpolation'],
    keyframes: view.keyframes.map(nestKeyframe),
    temporalSpan: view.temporalSpan,
  }
  if (view.interpolationUri) anchor.interpolationUri = view.interpolationUri
  return anchor
}

/** The default frame rate when a video row carries none. */
const DEFAULT_FRAME_RATE = 30

/** The empty sequence used when a stored annotation carries no anchor. */
function emptyFrames(): BoundingBoxSequence {
  return {
    boxes: [],
    interpolationSegments: [],
    visibilityRanges: [],
    totalFrames: 0,
    keyframeCount: 0,
    interpolatedFrameCount: 0,
  }
}

/** Maps a graph node's `nodeType` back to the FOVEA object-annotation link kind. */
function nodeTypeToLinkType(nodeType: string | null | undefined): VideoAnnotationLinkType | null {
  switch (nodeType) {
    case 'entity':
      return 'entity'
    case 'situation':
      return 'event'
    case 'time':
      return 'time'
    case 'location':
      return 'location'
    default:
      return null
  }
}

/**
 * Reconstructs the FOVEA annotation from its stored layers rows through the
 * backward lens — the lens-native inverse of {@link foveaAnnotationToLayersRows}.
 * The lens descales the `confidence` and flattens the keyframe geometry on
 * `getJson`; the frame-number mapping and the per-keyframe feature decode (both of
 * which need the frame rate and join across the sequence's visibility and
 * interpolation lists) stay at this egress boundary, which re-nests the lens's flat
 * keyframes into an anchor and rebuilds the bounding-box sequence. The `type` and
 * `linkType` derive from the grouping layer's persona and the denoted node, the
 * `source` reads the layer's source method, and the tracker identity comes from the
 * track. Produces the same FOVEA annotation as the committed hand-rolled backward
 * mapper (the oracle) — the backward-parity test asserts this over a corpus.
 *
 * @param row - the stored layers annotation
 * @param layer - its grouping layer (supplies the persona and source method)
 * @param video - the video row (supplies identity and frame rate)
 * @param node - the denoted graph node, when the annotation links one
 * @param track - the track this annotation belongs to, when tracked
 * @returns the reconstructed FOVEA annotation
 */
export async function layersToAnnotationViaLens(
  row: StoredLayersAnnotation,
  layer: StoredAnnotationLayer,
  video: VideoRow,
  node: DenotesNode | null,
  track: OracleMappedTrack | null = null,
): Promise<VideoAnnotationOutput> {
  const { lens } = await getVideoAnnotationBackLens()
  const frameRate = video.frameRate ?? DEFAULT_FRAME_RATE

  const anchorWrapper = row.anchor as { spatioTemporalAnchor?: SpatioTemporalAnchor } | null
  const spatioTemporalAnchor = anchorWrapper?.spatioTemporalAnchor
  const view = projectBackView(lens, row, spatioTemporalAnchor)

  const frames = spatioTemporalAnchor
    ? spatioTemporalAnchorToBoundingBoxSequence(anchorFromBackView(view), { frameRate })
    : emptyFrames()

  if (track) {
    frames.trackId = track.trackId
    if (track.trackingSource !== undefined) frames.trackingSource = track.trackingSource
    if (track.trackingConfidence !== undefined) {
      frames.trackingConfidence = from1000(track.trackingConfidence)
    }
  }

  // An object layer's annotation is `object`; a persona layer's is a `type`
  // annotation unless it denotes a world node, when its `type` is the node's
  // instance kind (entity/event/time/location).
  let type: string
  let linkType: VideoAnnotationLinkType | null
  if (!layer.personaId) {
    type = 'object'
    linkType = nodeTypeToLinkType(node?.nodeType)
  } else if (node) {
    linkType = nodeTypeToLinkType(node.nodeType)
    type = linkType ?? 'type'
  } else {
    type = 'type'
    linkType = null
  }

  return {
    id: row.id,
    videoId: video.id,
    personaId: layer.personaId,
    type,
    label: row.label ?? '',
    linkType,
    frames,
    confidence: view.confidence,
    source: layer.sourceMethod,
    linkedObjectName: node?.label ?? null,
    createdBy: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

// --------------------------------------------------------------------------
// FOVEA video map: the surface's public forward + backward entry points
// --------------------------------------------------------------------------

/**
 * The FOVEA video forward map, the surface's public entry point onto the lens:
 * builds the view-model, projects the annotation core through the compiled lens,
 * composes the three layers records, and distributes them to the Prisma-row shape
 * the persistence boundary writes. Row for row equal to the reconstruction mapper's
 * forward map over the parity corpus. Async because the lens compiles once per
 * process on first use and the compiled chain is reused thereafter.
 *
 * @param annotation - the FOVEA annotation to project
 * @param ctx - the resolved expression, ontology, and frame-rate context
 * @returns the layer, annotation, and track rows the annotation maps onto
 */
export async function annotationToLayers(
  annotation: OracleVideoAnnotationInput,
  ctx: AnnotationToLayersContext,
): Promise<OracleAnnotationLayersMapping> {
  return foveaAnnotationToLayersRows(annotation, ctx)
}

/**
 * The FOVEA video backward map, the surface's synchronous public entry point for
 * reconstruction: rebuilds the FOVEA annotation from its stored layers rows. The
 * bounding-box sequence rebuilds from the spatio-temporal anchor; `source` reads
 * the grouping layer's `sourceMethod`; `confidence` descales the native 0-1000
 * column to a 0-1 float; `type`/`linkType` derive from the layer persona and the
 * denoted node; and the tracker identity comes from the track (the video's track
 * ClusterSet membership).
 *
 * The lens-native reconstruction is {@link layersToAnnotationViaLens}, which runs
 * the backward inverse lens's `getJson` and produces the same annotation. The read
 * routes call this synchronous map because the compiled lens builds asynchronously.
 *
 * @param row - the stored layers annotation
 * @param layer - its grouping layer (supplies the persona and source method)
 * @param video - the video row (supplies identity and frame rate)
 * @param node - the denoted graph node, when the annotation links one
 * @param track - the track this annotation belongs to, when tracked
 * @returns the reconstructed FOVEA annotation
 */
export function layersToAnnotation(
  row: StoredLayersAnnotation,
  layer: StoredAnnotationLayer,
  video: VideoRow,
  node: DenotesNode | null,
  track: OracleMappedTrack | null = null,
): VideoAnnotationOutput {
  const frameRate = video.frameRate ?? DEFAULT_FRAME_RATE

  const anchorWrapper = row.anchor as { spatioTemporalAnchor?: SpatioTemporalAnchor } | null
  const spatioTemporalAnchor = anchorWrapper?.spatioTemporalAnchor
  const frames = spatioTemporalAnchor
    ? spatioTemporalAnchorToBoundingBoxSequence(spatioTemporalAnchor, { frameRate })
    : emptyFrames()

  if (track) {
    frames.trackId = track.trackId
    if (track.trackingSource !== undefined) frames.trackingSource = track.trackingSource
    if (track.trackingConfidence !== undefined) {
      frames.trackingConfidence = from1000(track.trackingConfidence)
    }
  }

  // An object layer's annotation is `object`; a persona layer's is a `type`
  // annotation unless it denotes a world node, when its `type` is the node's
  // instance kind (entity/event/time/location).
  let type: string
  let linkType: VideoAnnotationLinkType | null
  if (!layer.personaId) {
    type = 'object'
    linkType = nodeTypeToLinkType(node?.nodeType)
  } else if (node) {
    linkType = nodeTypeToLinkType(node.nodeType)
    type = linkType ?? 'type'
  } else {
    type = 'type'
    linkType = null
  }

  return {
    id: row.id,
    videoId: video.id,
    personaId: layer.personaId,
    type,
    label: row.label ?? '',
    linkType,
    frames,
    confidence: row.confidence != null ? (from1000(row.confidence) ?? null) : null,
    source: layer.sourceMethod,
    linkedObjectName: node?.label ?? null,
    createdBy: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
