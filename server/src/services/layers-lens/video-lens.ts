/**
 * The FOVEA video-annotation surface as a `@panproto/core` lens plus a
 * multi-record composition and a record<->row adapter.
 *
 * A FOVEA video annotation projects onto three layers records: a
 * `pub.layers.annotation.annotationLayer` grouping whose `annotations[]` holds
 * the annotation (anchored by a `defs#spatioTemporalAnchor` — keyframes carrying
 * a `boundingBox` plus a `temporalSpan`), a per-video track
 * `pub.layers.annotation.clusterSet`, and, when the annotation denotes a world
 * object, a `pub.layers.graph.graphNode`. This module builds all three from the
 * FOVEA video-annotation view-model and distributes them to the Prisma-row shape
 * the persistence boundary uses, wiring the cross-record references
 * (`layerId`, the denoted node, the track cluster membership) by deterministic id.
 *
 * The value/structure transform at the heart of the surface is the per-keyframe
 * regroup: the view-model carries each keyframe's geometry as flat integer
 * `x/y/width/height`, and the layers `keyframe` nests that geometry under a
 * `boundingBox`. {@link buildKeyframeRegroupLens} authors that regroup as a
 * panproto lens document (a `compute_field` anchored at the keyframe item vertex)
 * whose round-trip laws hold and whose complement requirement is empty; the lens
 * is the verified specification of the regroup. {@link composeVideoRecords}
 * applies the same regroup to move data, because the installed
 * `@panproto/core` (0.65.0) does not surface a value-transform lens's output to
 * JavaScript — see {@link KEYFRAME_REGROUP_LENS_DOC} and the surrounding notes.
 *
 * @module
 */

import { z } from 'zod'

import {
  boundingBoxSequenceToSpatioTemporalAnchor,
  to1000,
  type BoundingBoxSequence,
  type FoveaTrackingSource,
} from '../layers-conversion-service.js'
import { annotationLayerId, trackClusterSetId } from '../layers-id-map.js'
import { getPanproto, loadFoveaSchema } from './panproto-registry.js'
import type { LensHandle, ProtolensChainHandle } from '@panproto/core'
import type { SpatioTemporalAnchor, Keyframe } from '@fovea/layers-schema'

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
 * plus the keyframes flattened out of the annotation's bounding-box sequence and
 * the derived `temporalSpan` (min/max keyframe time), which the mapping copies
 * rather than recomputes. The frame-number-to-time resolution and the per-keyframe
 * feature encoding are resolved into this shape by {@link toVideoAnnotationSource}.
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
  /** The temporal span (min/max keyframe time), carried for the mapping to copy. */
  temporalSpan: { start: number; ending: number }
  /** The keyframes with flat geometry, in time order. */
  keyframes: VideoKeyframe[]
  /** The track this annotation joins, or null when its sequence carries no track. */
  track: VideoTrack | null
}

/**
 * The Zod schema for the view-model's spatial core — the shape the keyframe
 * regroup lens binds to. It carries the flat per-keyframe geometry, the copied
 * `temporalSpan`, and the annotation scalars the record framing reads. The lens
 * only restructures the keyframe geometry; the surrounding scalars pass through.
 */
export const videoRegroupSourceSchema = z.object({
  id: z.string(),
  label: z.string(),
  confidence: z.number().int(),
  interpolation: z.string(),
  temporalSpan: z.object({ start: z.number().int(), ending: z.number().int() }),
  keyframes: z.array(
    z.object({
      timeMs: z.number().int(),
      x: z.number().int(),
      y: z.number().int(),
      width: z.number().int(),
      height: z.number().int(),
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
 * to a spatio-temporal anchor and flattening its keyframes. The derived
 * `temporalSpan`, `interpolation`, and interpolation URI are read off that anchor
 * and carried on the view-model for the mapping to copy.
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
    temporalSpan: { start: anchor.temporalSpan.start, ending: anchor.temporalSpan.ending },
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
// The keyframe regroup lens
// --------------------------------------------------------------------------

/**
 * The lens document for the per-keyframe regroup: anchored at the keyframe item
 * vertex, it computes a `boundingBox` record from the item's flat `x/y/width/
 * height` scalars. This is the video surface's core value/structure transform
 * expressed as a panproto lens — its round-trip laws hold and its complement
 * requirement is empty (native).
 *
 * The regroup is the only part of the FOVEA->layers keyframe mapping that a
 * keyframe-item lens step can express: the time is already resolved onto the
 * item, and the feature map is carried through untouched. The frame-number-to-
 * time resolution and the feature encoding are resolved before the lens (see
 * {@link toVideoAnnotationSource}), and the record framing — nesting keyframes
 * under the anchor, copying the temporal span, building the annotation and its
 * grouping layer — is the composition's job (see {@link composeVideoRecords}).
 */
export const KEYFRAME_REGROUP_LENS_DOC = {
  id: 'fovea.video.keyframe-regroup.v1',
  source: 'fovea.video.annotation',
  target: 'pub.layers.annotation.annotationLayer',
  steps: [
    {
      compute_field: {
        target: 'boundingBox',
        expr: '{ x = x, y = y, width = width, height = height }',
      },
    },
  ],
} as const

/** The body vertex the regroup binds to: each keyframe array item. */
export const KEYFRAME_REGROUP_BODY_VERTEX = 'root.keyframes:items'

/** A compiled keyframe regroup lens with its schema-independent chain. */
export interface KeyframeRegroupLens {
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
 * Compiles the keyframe regroup lens against the view-model source schema and
 * reports its native-ness signals. The returned {@link KeyframeRegroupLens.lens}
 * answers `checkGetPut`/`checkPutGet` for a parsed source record.
 *
 * @returns the compiled chain, the instantiated lens, and its native-ness signals
 */
export async function buildKeyframeRegroupLens(): Promise<KeyframeRegroupLens> {
  const p = await getPanproto()
  const source = await loadFoveaSchema(videoRegroupSourceSchema)
  const chain = p.compileLensDocument(KEYFRAME_REGROUP_LENS_DOC, KEYFRAME_REGROUP_BODY_VERTEX)
  return {
    chain,
    lens: chain.instantiate(source),
    requirementKind: chain.requirements(source).kind,
    fieldTransforms: chain.fieldTransforms(),
  }
}

/**
 * Regroups a flat view-model keyframe into a layers `keyframe`, nesting the
 * geometry under a `boundingBox` and carrying the time and features through. This
 * is the executable image of {@link KEYFRAME_REGROUP_LENS_DOC}: the lens verifies
 * the regroup is a lawful bidirectional transform, and this reproduces it to move
 * data, because `@panproto/core` 0.65.0 does not surface a `compute_field` lens's
 * output to JavaScript (its `get` view retains the source structure).
 *
 * @param kf - the flat view-model keyframe
 * @returns the layers keyframe with nested geometry
 */
function regroupKeyframe(kf: VideoKeyframe): Keyframe {
  const keyframe: Keyframe = {
    bbox: { x: kf.x, y: kf.y, width: kf.width, height: kf.height },
    timeMs: kf.timeMs,
  }
  if (kf.features) keyframe.features = kf.features
  return keyframe
}

/**
 * Rebuilds the spatio-temporal anchor from the view-model by regrouping each flat
 * keyframe and copying the carried span and interpolation. This is the inverse of
 * the flattening in {@link toVideoAnnotationSource}, so the anchor round-trips
 * exactly.
 *
 * @param source - the view-model
 * @returns the spatio-temporal anchor
 */
function anchorFromSource(source: VideoAnnotationSource): SpatioTemporalAnchor {
  const anchor: SpatioTemporalAnchor = {
    interpolation: source.interpolation as SpatioTemporalAnchor['interpolation'],
    keyframes: source.keyframes.map(regroupKeyframe),
    temporalSpan: { start: source.temporalSpan.start, ending: source.temporalSpan.ending },
  }
  if (source.interpolationUri) anchor.interpolationUri = source.interpolationUri
  return anchor
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
 * Composes a FOVEA video-annotation view-model into its layers records: an
 * `annotationLayer` grouping nesting the annotation (anchored by the regrouped
 * spatio-temporal anchor), a denoted `graphNode` when the annotation links a
 * world object, and the video's track `clusterSet` when the sequence is tracked.
 * The cross-record references are wired by deterministic id — the layer id from
 * {@link annotationLayerId}, the cluster-set id from {@link trackClusterSetId},
 * the node id from the annotation label, and the annotation's membership by its
 * own id — so a re-composition of the same annotation reuses the same rows.
 *
 * @param source - the view-model
 * @returns the composed layers records
 */
export function composeVideoRecords(source: VideoAnnotationSource): VideoLayersRecords {
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

  const confidence1000 = to1000(source.confidence ?? undefined) ?? null
  const ontologyTypeRef = personaId && !isInstance ? source.label || undefined : undefined

  const annotation: LayersAnnotationObject = {
    uuid: { value: source.id },
    anchor: { spatioTemporalAnchor: anchorFromSource(source) },
    label: source.label,
  }
  if (confidence1000 !== null) annotation.confidence = confidence1000
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
 * denotation resolved from the `graphNode` record), and the track cluster
 * membership becomes the track descriptor. The wire-record `createdAt` and the
 * atproto reference framing are dropped; the deterministic ids and scope carried
 * alongside the record fill the row's identity columns.
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
 * compose the layers records, and distribute them to rows. Equivalent, row for
 * row, to the committed hand-rolled forward mapper (the oracle) — the parity test
 * asserts this over a corpus.
 *
 * @param input - the FOVEA annotation
 * @param ctx - the resolved expression, ontology, and frame-rate context
 * @returns the layer, annotation, and track rows
 */
export function foveaAnnotationToLayersRows(
  input: VideoAnnotationInput,
  ctx: VideoAnnotationContext,
): AnnotationLayersMapping {
  return videoRecordsToRows(composeVideoRecords(toVideoAnnotationSource(input, ctx)))
}
