/**
 * The video-annotation view-model types and the track-membership helpers that
 * fold a video's tracked sequences into its per-video track `ClusterSet`.
 *
 * The view-model types describe the `Annotation` wire shape at the persistence
 * boundary ({@link VideoAnnotationInput} the frontend sends,
 * {@link VideoAnnotationOutput} the endpoint returns) and the layers rows a single
 * annotation projects onto (the grouping {@link MappedAnnotationLayer}, the
 * {@link MappedLayersAnnotation}, the denoted {@link MappedDenotesNode}, and the
 * {@link MappedTrack}), together with the stored-row shapes the read path reads
 * back ({@link StoredLayersAnnotation}, {@link StoredAnnotationLayer},
 * {@link VideoRow}, {@link DenotesNode}). The forward and backward maps between the
 * `Annotation` shape and these rows live in the video-annotation lens
 * (`layers-lens/video-lens`); this module holds the shapes both directions share.
 *
 * The track helpers ({@link applyTrackMembership}, {@link removeTrackMembership},
 * {@link tracksByAnnotation}) index and rewrite the per-video track `ClusterSet`
 * whose clusters are the tracked object sequences: each annotation's `trackId` is
 * membership in the cluster whose `uuid` is the track id, its tracker name the
 * cluster's `canonicalLabel`, and its tracking confidence a cluster feature on the
 * layers 0-1000 integer scale.
 *
 * @module
 */

import type { SpatioTemporalAnchor } from '@fovea/layers-schema'

import type { BoundingBoxSequence, FoveaTrackingSource } from './layers-conversion-service.js'

/** The kind of world object an object annotation's `label` references. */
export type VideoAnnotationLinkType = 'entity' | 'event' | 'time' | 'location'

/**
 * The `AnnotationLayer.subkind` values a video annotation lives under:
 * `ontology-type` for persona-scoped type and world-instance annotations and
 * `world-object` for object-linked annotations. Reconstruction queries MUST
 * constrain to these so span layers of other kinds (notably claim text spans,
 * whose subkind is `claim`) never surface as video annotations even when they
 * anchor over the same video Expression.
 */
export const VIDEO_ANNOTATION_SUBKINDS = ['ontology-type', 'world-object'] as const

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
 * The `Annotation` shape at the persistence boundary (the wire shape the
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
 * The reconstructed `Annotation` shape returned by the endpoint. Matches the
 * `/api/annotations` response contract, including the server-resolved
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

/** The layers rows a single annotation projects onto. */
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
