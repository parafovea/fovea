/**
 * Bidirectional map between the legacy `Annotation` shape and the layers rows
 * that store it: an `AnnotationLayer` grouping plus one `LayersAnnotation`, with
 * a per-video track `ClusterSet` grouping the tracked sequences.
 *
 * This is the persistence boundary for video annotations: the video timeline UI
 * operates on the in-memory `Annotation` / `BoundingBoxSequence` view-model, and
 * this module projects that shape onto the unified layers store and back. It
 * mirrors `prisma/backfill/backfill-annotations.ts` so an annotation authored
 * through the layers endpoint lands in the same rows a prior backfill produces
 * (same deterministic layer id, same spatio-temporal anchor, same denotation link).
 *
 * Every field lands in a native home:
 *
 *   - The bounding-box sequence's geometry, time, per-box confidence, visibility,
 *     and interpolation ride in the spatio-temporal anchor and its keyframe
 *     features (see `layers-conversion-service`).
 *   - The annotation `confidence` is the native 0-1000 integer column.
 *   - The authoring `source` is the grouping layer's `sourceMethod`.
 *   - A tracked sequence's `trackId` is membership in the video's track
 *     `ClusterSet` (the cluster whose `uuid` is the track id), its `trackingSource`
 *     the cluster's `canonicalLabel`, and its `trackingConfidence` a cluster
 *     feature on the 0-1000 integer scale.
 *   - `type` derives from the layer persona and denotation: an object layer's
 *     annotation is `object`; a persona layer's is a `type` annotation unless it
 *     denotes a world node, when its `type` is the node's instance kind.
 *   - An object annotation denotes a world-object `GraphNode` from its `linkType`;
 *     a persona-scoped world-instance annotation (`type` entity/event/time/
 *     location) denotes a world `GraphNode` of the matching `nodeType`; a persona
 *     type-annotation denotes an ontology type (`ontologyTypeRefId`).
 *
 * @module
 */

import type { SpatioTemporalAnchor } from '@fovea/layers-schema'

import {
  boundingBoxSequenceToSpatioTemporalAnchor,
  spatioTemporalAnchorToBoundingBoxSequence,
  to1000,
  from1000,
  type BoundingBoxSequence,
  type FoveaTrackingSource,
} from './layers-conversion-service.js'
import { annotationLayerId } from './layers-id-map.js'

/** The kind of world object an object annotation's `label` references. */
export type VideoAnnotationLinkType = 'entity' | 'event' | 'time' | 'location'

/**
 * The `AnnotationLayer.subkind` values a video annotation lives under (see
 * {@link annotationToLayers}): `ontology-type` for persona-scoped type and
 * world-instance annotations and `world-object` for object-linked annotations.
 * Reconstruction queries MUST constrain to these so span layers of other kinds
 * (notably claim text spans, whose subkind is `claim`) never surface as video
 * annotations even when they anchor over the same video Expression.
 */
export const VIDEO_ANNOTATION_SUBKINDS = ['ontology-type', 'world-object'] as const

/**
 * The annotation `type` values that mark a persona-scoped annotation as denoting
 * a world instance (an entity, event, time, or location) rather than assigning an
 * ontology type. Such an annotation materializes a world `GraphNode`.
 */
const WORLD_INSTANCE_TYPES: readonly string[] = ['entity', 'event', 'time', 'location']

/**
 * Whether an `AnnotationLayer.subkind` denotes a video annotation. Single-row
 * endpoints use this to reject a request that targets a span layer of another
 * kind (e.g. a claim span) sharing the same video Expression.
 *
 * @param subkind - the stored layer subkind
 * @returns true when the subkind is one a video annotation lives under
 */
export function isVideoAnnotationSubkind(subkind: string | null | undefined): boolean {
  return subkind != null && (VIDEO_ANNOTATION_SUBKINDS as readonly string[]).includes(subkind)
}

/**
 * The legacy `Annotation` shape at the persistence boundary (the wire shape the
 * frontend sends and receives). Type annotations carry a `personaId` and a
 * `type` of `'type'`; a persona-scoped world-instance annotation carries a
 * `personaId` and a `type` of entity/event/time/location; object annotations
 * carry a null `personaId` and a `linkType` naming which world list the `label`
 * indexes into.
 */
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
 * The reconstructed legacy `Annotation` shape returned by the endpoint. Matches
 * the legacy `/api/annotations` response contract, including the server-resolved
 * `linkedObjectName` for object annotations.
 */
export interface VideoAnnotationOutput {
  id: string
  videoId: string
  personaId: string | null
  type: string
  label: string
  linkType: VideoAnnotationLinkType | null
  frames: BoundingBoxSequence
  confidence: number | null
  source: string
  linkedObjectName: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** Resolved context the forward map needs beyond the annotation itself. */
export interface AnnotationToLayersContext {
  /** The video's `Expression` id (from `getOrCreateVideoExpression`). */
  expressionId: string
  /** The persona's `LayersOntology` id for a type layer, or null. */
  ontologyId: string | null
  /** The video frame rate, for the frame-number to millisecond mapping. */
  frameRate: number
  /** The video width in pixels (unused by the anchor; read from the video). */
  videoWidth?: number
  /** The video height in pixels (unused by the anchor; read from the video). */
  videoHeight?: number
}

/** The grouping `AnnotationLayer` a video annotation maps to. */
export interface MappedAnnotationLayer {
  id: string
  expressionId: string
  kind: 'span'
  subkind: 'ontology-type' | 'world-object'
  /** The authoring `source` as the layer's native source method. */
  sourceMethod: string
  ontologyId: string | null
  personaId: string | null
}

/** The world-object `GraphNode` an object or world-instance annotation denotes. */
export interface MappedDenotesNode {
  id: string
  nodeType: string
  label: string
}

/**
 * The track a tracked annotation belongs to: the video's track `ClusterSet`
 * cluster whose `uuid` is the track id. The tracker name rides on the cluster's
 * `canonicalLabel` and the tracked-sequence confidence on a cluster feature.
 */
export interface MappedTrack {
  /** The tracker's object id (the cluster uuid). */
  trackId: string | number
  /** The tracker name that produced the sequence (the cluster canonical label). */
  trackingSource?: FoveaTrackingSource
  /** The tracked-sequence confidence on the layers 0-1000 integer scale. */
  trackingConfidence?: number
}

/** The `LayersAnnotation` a video annotation maps to. */
export interface MappedLayersAnnotation {
  id: string
  layerId: string
  anchor: { spatioTemporalAnchor: SpatioTemporalAnchor }
  label: string
  /** Confidence on the layers-native 0-1000 integer scale, or null. */
  confidence: number | null
  /** Soft reference to the ontology TypeDef for a type annotation, else null. */
  ontologyTypeRefId: string | null
  /**
   * The graph node an object or world-instance annotation denotes (its `label`),
   * or null for a persona type annotation or an object annotation carrying no
   * link. The write path get-or-creates the node when it is present, and the read
   * side derives `type`/`linkType` from its `nodeType`.
   */
  denotesNode: MappedDenotesNode | null
  startMs: number
  endMs: number
}

/** The layers rows a single legacy annotation projects onto. */
export interface AnnotationLayersMapping {
  layer: MappedAnnotationLayer
  annotation: MappedLayersAnnotation
  /** The track this annotation joins, or null when its sequence carries no track id. */
  track: MappedTrack | null
}

/** A `LayersAnnotation` row as read back for the inverse map. */
export interface StoredLayersAnnotation {
  id: string
  label: string | null
  anchor: unknown
  confidence: number | null
  ontologyTypeRefId: string | null
  denotesNodeId: string | null
  createdByUserId: string | null
  createdAt: Date
  updatedAt: Date
}

/** The grouping layer read back for the inverse map (persona + source method). */
export interface StoredAnnotationLayer {
  personaId: string | null
  sourceMethod: string
}

/** The video row read back for the inverse map (frame rate and identity). */
export interface VideoRow {
  id: string
  frameRate: number | null
}

/** The denoted graph node read back to resolve `type`/`linkType` and display name. */
export interface DenotesNode {
  nodeType: string | null
  label: string | null
}

// --------------------------------------------------------------------------
// Track ClusterSet: trackId -> cluster membership
// --------------------------------------------------------------------------

/** A cluster feature key carrying the tracked-sequence confidence (0-1000 int). */
const TRACK_CONFIDENCE_KEY = 'trackingConfidence'

/** A member reference within a track cluster. */
interface TrackMember {
  localId: { value: string }
}

/** One track: a cluster of the annotations that follow a single tracked object. */
interface TrackCluster {
  uuid: { value: string }
  members: TrackMember[]
  canonicalLabel?: string
  features?: { entries: Array<{ key: string; value: string }> }
}

/** Reads a track `ClusterSet.clusters` JSON column into typed clusters. */
function readTrackClusters(value: unknown): TrackCluster[] {
  if (!Array.isArray(value)) return []
  const clusters: TrackCluster[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    const uuidValue = (record.uuid as { value?: unknown } | undefined)?.value
    if (typeof uuidValue !== 'string') continue
    const members: TrackMember[] = []
    if (Array.isArray(record.members)) {
      for (const member of record.members) {
        const localValue = (member as { localId?: { value?: unknown } } | null)?.localId?.value
        if (typeof localValue === 'string') members.push({ localId: { value: localValue } })
      }
    }
    const cluster: TrackCluster = { uuid: { value: uuidValue }, members }
    if (typeof record.canonicalLabel === 'string') cluster.canonicalLabel = record.canonicalLabel
    const features = record.features as { entries?: unknown } | undefined
    if (features && Array.isArray(features.entries)) {
      const entries: Array<{ key: string; value: string }> = []
      for (const entry of features.entries) {
        const key = (entry as { key?: unknown }).key
        const val = (entry as { value?: unknown }).value
        if (typeof key === 'string' && typeof val === 'string') entries.push({ key, value: val })
      }
      if (entries.length > 0) cluster.features = { entries }
    }
    clusters.push(cluster)
  }
  return clusters
}

/**
 * Recomputes a video's track clusters after (re)placing one annotation: the
 * annotation is removed from every cluster, then added to its track's cluster
 * when it carries one. A null `track` leaves it in no cluster. Empty clusters are
 * dropped, so a re-track that empties a cluster removes it.
 *
 * @param existing - the current `ClusterSet.clusters` JSON, if any
 * @param annotationId - the annotation whose membership is being set
 * @param track - the track it joins, or null to detach it
 * @returns the recomputed clusters
 */
export function applyTrackMembership(
  existing: unknown,
  annotationId: string,
  track: MappedTrack | null,
): TrackCluster[] {
  const clusters = readTrackClusters(existing)
    .map((cluster) => ({
      ...cluster,
      members: cluster.members.filter((member) => member.localId.value !== annotationId),
    }))

  if (track !== null) {
    const trackKey = String(track.trackId)
    let target = clusters.find((cluster) => cluster.uuid.value === trackKey)
    if (!target) {
      target = { uuid: { value: trackKey }, members: [] }
      clusters.push(target)
    }
    target.members.push({ localId: { value: annotationId } })
    if (track.trackingSource !== undefined) target.canonicalLabel = track.trackingSource
    if (track.trackingConfidence !== undefined) {
      target.features = { entries: [{ key: TRACK_CONFIDENCE_KEY, value: String(track.trackingConfidence) }] }
    }
  }

  return clusters.filter((cluster) => cluster.members.length > 0)
}

/**
 * Removes one annotation from every cluster of a video's track ClusterSet.
 *
 * @param existing - the current `ClusterSet.clusters` JSON, if any
 * @param annotationId - the annotation to detach
 * @returns the clusters without that annotation, empty clusters dropped
 */
export function removeTrackMembership(existing: unknown, annotationId: string): TrackCluster[] {
  return readTrackClusters(existing)
    .map((cluster) => ({
      ...cluster,
      members: cluster.members.filter((member) => member.localId.value !== annotationId),
    }))
    .filter((cluster) => cluster.members.length > 0)
}

/**
 * Indexes a video's track ClusterSet by annotation id: each annotation maps to
 * the track it belongs to (its cluster's id, tracker name, and confidence), the
 * inverse of the membership the write path records.
 *
 * @param clusters - the `ClusterSet.clusters` JSON, if any
 * @returns a map from annotation id to its track
 */
export function tracksByAnnotation(clusters: unknown): Map<string, MappedTrack> {
  const map = new Map<string, MappedTrack>()
  for (const cluster of readTrackClusters(clusters)) {
    const confEntry = cluster.features?.entries.find((entry) => entry.key === TRACK_CONFIDENCE_KEY)
    const trackingConfidence = confEntry !== undefined ? Number(confEntry.value) : undefined
    for (const member of cluster.members) {
      const track: MappedTrack = { trackId: cluster.uuid.value }
      if (cluster.canonicalLabel !== undefined) {
        track.trackingSource = cluster.canonicalLabel as FoveaTrackingSource
      }
      if (trackingConfidence !== undefined) track.trackingConfidence = trackingConfidence
      map.set(member.localId.value, track)
    }
  }
  return map
}

// --------------------------------------------------------------------------
// Forward + inverse map
// --------------------------------------------------------------------------

/** The default frame rate when a video row carries none. */
const DEFAULT_FRAME_RATE = 30

/** The nodeType an object-annotation link kind maps to (its denoted node's type). */
function linkTypeToNodeType(linkType: VideoAnnotationLinkType | null): string {
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

/** Maps a graph node's `nodeType` back to the legacy object-annotation link kind. */
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

/** The nodeType a persona-scoped world-instance annotation's `type` denotes. */
function instanceTypeToNodeType(type: string): string {
  return linkTypeToNodeType(type as VideoAnnotationLinkType)
}

/** The empty sequence used when an anchor carries no spatio-temporal region. */
function emptySequence(): BoundingBoxSequence {
  return {
    boxes: [],
    interpolationSegments: [],
    visibilityRanges: [],
    totalFrames: 0,
    keyframeCount: 0,
    interpolatedFrameCount: 0,
  }
}

/**
 * Projects a legacy annotation onto its grouping `AnnotationLayer`,
 * `LayersAnnotation`, and (when the sequence is tracked) its track, mirroring the
 * backfill. A set `personaId` yields an ontology-type layer; a null `personaId`
 * yields a world-object layer. A persona type-annotation (`type` `'type'`)
 * denotes an ontology type (`ontologyTypeRefId = label`); a persona-scoped
 * world-instance annotation (`type` entity/event/time/location) denotes a world
 * node of the matching nodeType; an object annotation with a `linkType` denotes a
 * world node of the link kind's nodeType. The authoring `source` becomes the
 * layer `sourceMethod`, and a tracked sequence's identity becomes a track the
 * write path folds into the video's track ClusterSet.
 *
 * @param annotation - the legacy annotation to project
 * @param ctx - the resolved expression, ontology, and frame-rate context
 * @returns the layer, annotation, and track rows the annotation maps onto
 */
export function annotationToLayers(
  annotation: VideoAnnotationInput,
  ctx: AnnotationToLayersContext,
): AnnotationLayersMapping {
  const { personaId } = annotation
  const layerId = annotationLayerId(annotation.videoId, personaId)
  const isInstance = personaId != null && WORLD_INSTANCE_TYPES.includes(annotation.type)

  const layer: MappedAnnotationLayer = {
    id: layerId,
    expressionId: ctx.expressionId,
    kind: 'span',
    subkind: personaId ? 'ontology-type' : 'world-object',
    sourceMethod: annotation.source,
    ontologyId: personaId ? ctx.ontologyId : null,
    personaId,
  }

  const anchor = boundingBoxSequenceToSpatioTemporalAnchor(annotation.frames, {
    frameRate: ctx.frameRate,
    videoWidth: ctx.videoWidth,
    videoHeight: ctx.videoHeight,
  })

  // An object annotation with an intentional link kind denotes a world node; a
  // persona-scoped world-instance annotation denotes a world node of its type's
  // nodeType; a persona type-annotation and an unlinked object annotation denote
  // none, so a free-text label never materializes a stray world node (matching
  // the world save's node semantics).
  let denotesNode: MappedDenotesNode | null = null
  if (!personaId && annotation.label && annotation.linkType) {
    denotesNode = {
      id: annotation.label,
      nodeType: linkTypeToNodeType(annotation.linkType),
      label: annotation.label,
    }
  } else if (isInstance && annotation.label) {
    denotesNode = {
      id: annotation.label,
      nodeType: instanceTypeToNodeType(annotation.type),
      label: annotation.label,
    }
  }

  const annotationRow: MappedLayersAnnotation = {
    id: annotation.id,
    layerId,
    anchor: { spatioTemporalAnchor: anchor },
    label: annotation.label,
    confidence: to1000(annotation.confidence ?? undefined) ?? null,
    ontologyTypeRefId: personaId && !isInstance ? annotation.label || null : null,
    denotesNode,
    startMs: anchor.temporalSpan.start,
    endMs: anchor.temporalSpan.ending,
  }

  const seq = annotation.frames
  const track: MappedTrack | null =
    seq.trackId !== undefined
      ? {
          trackId: seq.trackId,
          ...(seq.trackingSource !== undefined ? { trackingSource: seq.trackingSource } : {}),
          ...(seq.trackingConfidence !== undefined
            ? { trackingConfidence: to1000(seq.trackingConfidence) }
            : {}),
        }
      : null

  return { layer, annotation: annotationRow, track }
}

/**
 * Reconstructs the legacy annotation from its stored layers rows, the inverse of
 * {@link annotationToLayers}. The bounding-box sequence rebuilds from the anchor;
 * `source` reads the layer `sourceMethod`; `confidence` the native 0-1000 column;
 * `type`/`linkType` derive from the layer persona and the denoted node; and the
 * tracker identity from the track (the video's track ClusterSet membership).
 *
 * @param row - the stored layers annotation
 * @param layer - its grouping layer (supplies the persona and source method)
 * @param video - the video row (supplies identity and frame rate)
 * @param node - the denoted graph node, when the annotation links one
 * @param track - the track this annotation belongs to, when tracked
 * @returns the reconstructed legacy annotation
 */
export function layersToAnnotation(
  row: StoredLayersAnnotation,
  layer: StoredAnnotationLayer,
  video: VideoRow,
  node: DenotesNode | null,
  track: MappedTrack | null = null,
): VideoAnnotationOutput {
  const frameRate = video.frameRate ?? DEFAULT_FRAME_RATE

  const anchorWrapper = row.anchor as { spatioTemporalAnchor?: SpatioTemporalAnchor } | null
  const spatioTemporalAnchor = anchorWrapper?.spatioTemporalAnchor
  const frames = spatioTemporalAnchor
    ? spatioTemporalAnchorToBoundingBoxSequence(spatioTemporalAnchor, { frameRate })
    : emptySequence()

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
    confidence: row.confidence != null ? from1000(row.confidence) ?? null : null,
    source: layer.sourceMethod,
    linkedObjectName: node?.label ?? null,
    createdBy: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
