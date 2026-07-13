/**
 * Bidirectional map between the legacy `Annotation` shape and the layers rows
 * that store it (an `AnnotationLayer` grouping plus one `LayersAnnotation`).
 *
 * This is the persistence boundary for video annotations: the video timeline UI
 * keeps operating on the in-memory `Annotation` / `BoundingBoxSequence`
 * view-model, and this module projects that shape onto the unified layers store
 * and back. It mirrors `prisma/backfill/backfill-annotations.ts` so an
 * annotation authored through the layers endpoint lands in the exact rows a
 * prior backfill would have produced (same deterministic layer id, same
 * spatio-temporal anchor, same denotation link).
 *
 * The bounding-box sequence round-trips bit-exactly through the tested
 * conversion service (exact source values stashed under `fovea.*` keys). The
 * legacy scalar fields that the layers columns do not carry losslessly on their
 * own (`type`, `linkType`, `source`, and the exact 0-1 `confidence`) are stashed
 * under a single `fovea.annotation` entry in the annotation features bag so the
 * inverse reconstructs the legacy row exactly.
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
  /** The video width in pixels, recorded on the anchor when known. */
  videoWidth?: number
  /** The video height in pixels, recorded on the anchor when known. */
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
   * The graph node id an object annotation denotes (its `label`), or null for a
   * type annotation. The route nulls this when no such node exists, since the
   * column is a real foreign key; the `label` column and features preserve the
   * link regardless.
   */
  denotesNodeCandidateId: string | null
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

/** The `fovea.annotation` features key holding the legacy scalar fields. */
const FOVEA_ANNOTATION_KEY = 'fovea.annotation'

/** The default frame rate when a video row carries none. */
const DEFAULT_FRAME_RATE = 30

/**
 * The legacy scalar fields stashed in the annotation features bag so the inverse
 * reconstructs the legacy row exactly. `confidence` is the exact 0-1 float (the
 * `LayersAnnotation.confidence` column only holds the rounded 0-1000 integer).
 */
interface FoveaAnnotationMeta {
  type: string
  linkType: VideoAnnotationLinkType | null
  source: string
  confidence: number | null
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
 * (`ontologyTypeRefId = label`); a null `personaId` yields a world-object layer
 * whose annotation denotes a graph node (`denotesNodeCandidateId = label`). The
 * bounding-box sequence becomes a spatio-temporal anchor plus a features bag,
 * into which the legacy scalar fields are stashed for a lossless inverse.
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
    sourceMethod: annotation.source === 'manual' ? 'manual-native' : 'model-projected',
    ontologyId: personaId ? ctx.ontologyId : null,
    personaId,
  }

  const { anchor, features: sequenceFeatures } = boundingBoxSequenceToSpatioTemporalAnchor(
    annotation.frames,
    { frameRate: ctx.frameRate, videoWidth: ctx.videoWidth, videoHeight: ctx.videoHeight },
  )

  const meta: FoveaAnnotationMeta = {
    type: annotation.type,
    linkType: personaId ? null : annotation.linkType,
    source: annotation.source,
    confidence: annotation.confidence,
  }
  const features: Record<string, unknown> = {
    ...sequenceFeatures,
    [FOVEA_ANNOTATION_KEY]: meta,
  }

  const annotationRow: MappedLayersAnnotation = {
    id: annotation.id,
    layerId,
    anchor: { spatioTemporalAnchor: anchor },
    label: annotation.label,
    confidence: to1000(annotation.confidence ?? undefined) ?? null,
    ontologyTypeRefId: personaId ? annotation.label || null : null,
    denotesNodeCandidateId: personaId ? null : annotation.label || null,
    features,
    startMs: anchor.temporalSpan.start,
    endMs: anchor.temporalSpan.ending,
  }

  return { layer, annotation: annotationRow }
}

/**
 * Reconstructs the legacy annotation from its stored layers rows, the exact
 * inverse of {@link annotationToLayers}. The bounding-box sequence rebuilds
 * bit-exactly from the anchor and features bag; `type`, `linkType`, `source`,
 * and the exact `confidence` are read from the stashed `fovea.annotation` entry,
 * with derivations from the layer persona and denoted node as fallbacks for a
 * row authored by the backfill (which stores no such entry).
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
  const meta = (bag[FOVEA_ANNOTATION_KEY] ?? {}) as Partial<FoveaAnnotationMeta>
  const frameRate = video.frameRate ?? DEFAULT_FRAME_RATE

  const anchorWrapper = row.anchor as { spatioTemporalAnchor?: SpatioTemporalAnchor } | null
  const spatioTemporalAnchor = anchorWrapper?.spatioTemporalAnchor
  const frames = spatioTemporalAnchor
    ? spatioTemporalAnchorToBoundingBoxSequence(spatioTemporalAnchor, bag, { frameRate })
    : emptySequence()

  const type = meta.type ?? (layer.personaId ? 'type' : 'object')
  const linkType = layer.personaId
    ? null
    : (meta.linkType ?? nodeTypeToLinkType(node?.nodeType) ?? null)

  const confidence =
    typeof meta.confidence === 'number'
      ? meta.confidence
      : row.confidence != null
        ? from1000(row.confidence) ?? null
        : null

  return {
    id: row.id,
    videoId: video.id,
    personaId: layer.personaId,
    type,
    label: row.label ?? '',
    linkType,
    frames,
    confidence,
    source: meta.source ?? 'manual',
    linkedObjectName: layer.personaId ? null : (node?.label ?? null),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
