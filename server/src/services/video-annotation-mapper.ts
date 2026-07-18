/**
 * Bidirectional map between the legacy `Annotation` shape and the layers rows
 * that store it (an `AnnotationLayer` grouping plus one `LayersAnnotation`).
 *
 * This is the persistence boundary for video annotations: the video timeline UI
 * operates on the in-memory `Annotation` / `BoundingBoxSequence` view-model, and
 * this module projects that shape onto the unified layers store and back. It
 * mirrors `prisma/backfill/backfill-annotations.ts` so an annotation authored
 * through the layers endpoint lands in the same rows a prior backfill produces
 * (same deterministic layer id, same spatio-temporal anchor, same denotation link).
 *
 * The bounding-box sequence's geometry, time, confidence, visibility, and
 * interpolation ride in the anchor and its keyframe features (see
 * `layers-conversion-service`). A video annotation's `type` derives from the layer
 * persona (type vs object) and its `linkType` from the denoted graph node's
 * `nodeType`; its `confidence` is the native 0-1000 integer column. The
 * per-annotation authoring `source` and tracker provenance — a track id, a tracker
 * name, and the tracked-sequence confidence — ride as flat scalar features.
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
 * {@link annotationToLayers}): `ontology-type` for persona-scoped type
 * annotations and `world-object` for object-linked annotations. Reconstruction
 * queries MUST constrain to these so span layers of other kinds (notably claim
 * text spans, whose subkind is `claim`) never surface as video annotations even
 * when they anchor over the same video Expression.
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
 * The legacy `Annotation` shape at the persistence boundary (the wire shape the
 * frontend sends and receives). Type annotations carry a `personaId` and a
 * `type` of `'type'`; object annotations carry a null `personaId` and a
 * `linkType` naming which world list the `label` indexes into.
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
  sourceMethod: string
  ontologyId: string | null
  personaId: string | null
}

/** The world-object `GraphNode` an object annotation denotes. */
export interface MappedDenotesNode {
  id: string
  nodeType: string
  label: string
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
   * The graph node an object annotation with a `linkType` denotes (its `label`),
   * or null for a type annotation or an object annotation carrying no link. The
   * write path get-or-creates the node when it is present, and the read side
   * derives `linkType` from its `nodeType`.
   */
  denotesNode: MappedDenotesNode | null
  features: Record<string, unknown>
  startMs: number
  endMs: number
}

/** The layers rows a single legacy annotation projects onto. */
export interface AnnotationLayersMapping {
  layer: MappedAnnotationLayer
  annotation: MappedLayersAnnotation
}

/** A `LayersAnnotation` row as read back for the inverse map. */
export interface StoredLayersAnnotation {
  id: string
  label: string | null
  anchor: unknown
  features: unknown
  confidence: number | null
  ontologyTypeRefId: string | null
  denotesNodeId: string | null
  createdByUserId: string | null
  createdAt: Date
  updatedAt: Date
}

/** The grouping layer read back for the inverse map (only `personaId` is read). */
export interface StoredAnnotationLayer {
  personaId: string | null
}

/** The video row read back for the inverse map (frame rate and identity). */
export interface VideoRow {
  id: string
  frameRate: number | null
}

/** The denoted graph node read back to resolve `linkType` and display name. */
export interface DenotesNode {
  nodeType: string | null
  label: string | null
}

/**
 * The flat annotation feature keys carrying a video annotation's per-annotation
 * tracker provenance. Each value is a plain scalar and each key is plain (no
 * namespace prefix), kept in one place so the forward and inverse cannot drift.
 */
const FA = {
  /** The authoring source string (per-annotation; the layer's sourceMethod is the coarser layer method). */
  source: 'source',
  /** The tracker's object id (string or number). */
  trackId: 'trackId',
  /** The tracker name that produced the sequence. */
  trackingSource: 'trackingSource',
  /** The tracked-sequence confidence on the 0-1000 integer scale. */
  trackingConfidence: 'trackingConfidence',
} as const

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
 * Projects a legacy annotation onto its grouping `AnnotationLayer` and
 * `LayersAnnotation`, mirroring the backfill. A set `personaId` yields an
 * ontology-type layer whose annotation denotes an ontology type
 * (`ontologyTypeRefId = label`); a null `personaId` yields a world-object layer.
 * An object annotation that carries a `linkType` denotes a graph node
 * (`denotesNode.id = label`, with its `nodeType` from the link kind); one with no
 * link denotes no node. The bounding-box sequence becomes the native
 * spatio-temporal anchor; the authoring `source` and any tracker provenance ride
 * as flat scalar features.
 *
 * @param annotation - the legacy annotation to project
 * @param ctx - the resolved expression, ontology, and frame-rate context
 * @returns the layer and annotation rows the annotation maps onto
 */
export function annotationToLayers(
  annotation: VideoAnnotationInput,
  ctx: AnnotationToLayersContext,
): AnnotationLayersMapping {
  const { personaId } = annotation
  const layerId = annotationLayerId(annotation.videoId, personaId)

  const layer: MappedAnnotationLayer = {
    id: layerId,
    expressionId: ctx.expressionId,
    kind: 'span',
    subkind: personaId ? 'ontology-type' : 'world-object',
    sourceMethod: annotation.source === 'manual' ? 'manual-native' : 'automatic',
    ontologyId: personaId ? ctx.ontologyId : null,
    personaId,
  }

  const anchor = boundingBoxSequenceToSpatioTemporalAnchor(annotation.frames, {
    frameRate: ctx.frameRate,
    videoWidth: ctx.videoWidth,
    videoHeight: ctx.videoHeight,
  })

  const features: Record<string, unknown> = { [FA.source]: annotation.source }
  const seq = annotation.frames
  if (seq.trackId !== undefined) features[FA.trackId] = seq.trackId
  if (seq.trackingSource !== undefined) features[FA.trackingSource] = seq.trackingSource
  if (seq.trackingConfidence !== undefined) {
    features[FA.trackingConfidence] = to1000(seq.trackingConfidence)
  }

  // Only an object annotation with an intentional link kind denotes a graph node;
  // an unlinked object annotation (no linkType) mints none, so a free-text label
  // never materializes a stray world node (matching the world save's node semantics).
  const denotesNode: MappedDenotesNode | null =
    personaId || !annotation.label || !annotation.linkType
      ? null
      : { id: annotation.label, nodeType: linkTypeToNodeType(annotation.linkType), label: annotation.label }

  const annotationRow: MappedLayersAnnotation = {
    id: annotation.id,
    layerId,
    anchor: { spatioTemporalAnchor: anchor },
    label: annotation.label,
    confidence: to1000(annotation.confidence ?? undefined) ?? null,
    ontologyTypeRefId: personaId ? annotation.label || null : null,
    denotesNode,
    features,
    startMs: anchor.temporalSpan.start,
    endMs: anchor.temporalSpan.ending,
  }

  return { layer, annotation: annotationRow }
}

/**
 * Reconstructs the legacy annotation from its stored layers rows, the inverse of
 * {@link annotationToLayers}. The bounding-box sequence rebuilds from the anchor
 * alone; `type` derives from the layer persona (type vs object), `linkType` from
 * the denoted node's `nodeType`, `confidence` from the native 0-1000 column, and
 * `source` plus the tracker fields from the flat scalar features.
 *
 * @param row - the stored layers annotation
 * @param layer - its grouping layer (supplies the persona, hence type vs object)
 * @param video - the video row (supplies identity and frame rate)
 * @param node - the denoted graph node, when the annotation links one
 * @returns the reconstructed legacy annotation
 */
export function layersToAnnotation(
  row: StoredLayersAnnotation,
  layer: StoredAnnotationLayer,
  video: VideoRow,
  node: DenotesNode | null,
): VideoAnnotationOutput {
  const bag = (row.features ?? {}) as Record<string, unknown>
  const frameRate = video.frameRate ?? DEFAULT_FRAME_RATE

  const anchorWrapper = row.anchor as { spatioTemporalAnchor?: SpatioTemporalAnchor } | null
  const spatioTemporalAnchor = anchorWrapper?.spatioTemporalAnchor
  const frames = spatioTemporalAnchor
    ? spatioTemporalAnchorToBoundingBoxSequence(spatioTemporalAnchor, { frameRate })
    : emptySequence()

  const rawTrackId = bag[FA.trackId]
  if (typeof rawTrackId === 'string' || typeof rawTrackId === 'number') frames.trackId = rawTrackId
  const rawTrackingSource = bag[FA.trackingSource]
  if (typeof rawTrackingSource === 'string') {
    frames.trackingSource = rawTrackingSource as FoveaTrackingSource
  }
  const rawTrackingConfidence = bag[FA.trackingConfidence]
  if (typeof rawTrackingConfidence === 'number') {
    frames.trackingConfidence = from1000(rawTrackingConfidence)
  }

  const type = layer.personaId ? 'type' : 'object'
  const linkType = layer.personaId ? null : nodeTypeToLinkType(node?.nodeType)

  const source = typeof bag[FA.source] === 'string' ? (bag[FA.source] as string) : 'manual'

  return {
    id: row.id,
    videoId: video.id,
    personaId: layer.personaId,
    type,
    label: row.label ?? '',
    linkType,
    frames,
    confidence: row.confidence != null ? from1000(row.confidence) ?? null : null,
    source,
    linkedObjectName: layer.personaId ? null : (node?.label ?? null),
    createdBy: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
