/**
 * Deterministic id derivation and scope resolution for the layers backfill.
 *
 * The backfill is idempotent: re-running it must upsert the same rows rather
 * than mint duplicates. Idempotency rests on every produced row having a stable
 * primary key. There are two id strategies:
 *
 *   1. Reuse the legacy uuid where the mapping is 1:1. An Annotation becomes one
 *      LayersAnnotation with the same id; a world object becomes one GraphNode
 *      with the same id; an ontology type becomes one TypeDef with the same id;
 *      a Claim becomes one GraphNode with the same id. These are exported as the
 *      identity `reuse*` helpers so call sites read intentionally.
 *   2. Derive a stable uuid (uuidv5 over a fixed namespace) everywhere the
 *      mapping fans out or has no single legacy row to borrow an id from (media,
 *      expressions, tokenizations, per-persona ontologies, grouping layers,
 *      cluster sets, and so on). The derivation key encodes the source kind and
 *      the legacy id(s) it fans out from, so the same legacy input always yields
 *      the same derived id.
 *
 * The namespace and the derivations the video-annotation runtime also needs
 * (`deriveId`, `Scope`, `mediaVideoId`, `expressionVideoId`, `annotationLayerId`,
 * `layersOntologyForPersonaId`) live in `src/services/layers-id-map.ts` so the
 * backfill and the layers endpoint derive identical ids; this module re-exports
 * them and adds the backfill-only derivations.
 *
 * Scope columns (`projectId`, `createdByUserId`) are resolved per source row from
 * the legacy owner fields so the backfilled rows land in the same CASL scope as
 * the data they mirror.
 *
 * @module
 */

import { deriveId } from '../../src/services/layers-id-map.js'

export {
  deriveId,
  type Scope,
  mediaVideoId,
  expressionVideoId,
  annotationLayerId,
  layersOntologyForPersonaId,
  expressionTranscriptId,
  claimSpanLayerId,
  claimSpanAnnotationId,
} from '../../src/services/layers-id-map.js'

// --- 1:1 reuse of legacy uuids -------------------------------------------

/** The LayersAnnotation id for a legacy Annotation is the Annotation's own id. */
export function reuseAnnotationId(annotationId: string): string {
  return annotationId
}

/** The GraphNode id for a world object is the world object's own id. */
export function reuseWorldObjectNodeId(worldObjectId: string): string {
  return worldObjectId
}

/** The TypeDef id for an ontology type is the type's own id. */
export function reuseTypeId(typeId: string): string {
  return typeId
}

/** The GraphNode id for a Claim is the Claim's own id. */
export function reuseClaimNodeId(claimId: string): string {
  return claimId
}

/** The GraphEdge id for a ClaimRelation is the ClaimRelation's own id. */
export function reuseClaimRelationEdgeId(claimRelationId: string): string {
  return claimRelationId
}

// --- Derived ids: video domain -------------------------------------------

/** The Expression(kind=social-media, sourceKind=video-metadata-text) id for a Video. */
export function expressionVideoMetadataTextId(videoId: string): string {
  return deriveId('expr:video-metadata-text', videoId)
}

/** The Segmentation id for a Video's metadata text. */
export function segmentationVideoMetadataTextId(videoId: string): string {
  return deriveId('seg:video-metadata-text', videoId)
}

/** The Tokenization id for a Video's metadata text. */
export function tokenizationVideoMetadataTextId(videoId: string): string {
  return deriveId('tok:video-metadata-text', videoId)
}

// --- Derived ids: summary/transcript domain ------------------------------

/** The Media(kind=audio) id for a VideoSummary's transcript. */
export function mediaAudioId(summaryId: string): string {
  return deriveId('media:audio', summaryId)
}

/** The Segmentation id for a VideoSummary's transcript. */
export function segmentationTranscriptId(summaryId: string): string {
  return deriveId('seg:transcript', summaryId)
}

/** The Tokenization id for a VideoSummary's transcript. */
export function tokenizationTranscriptId(summaryId: string): string {
  return deriveId('tok:transcript', summaryId)
}

/** The speaker-tier AnnotationLayer id for a VideoSummary's transcript. */
export function speakerLayerId(summaryId: string): string {
  return deriveId('layer:speaker', summaryId)
}

/** The speaker LayersAnnotation id for one transcript segment. */
export function speakerAnnotationId(summaryId: string, segmentIndex: number): string {
  return deriveId('ann:speaker', summaryId, String(segmentIndex))
}

/** The ClusterSet id grouping a transcript's segments by speaker. */
export function speakerClusterSetId(summaryId: string): string {
  return deriveId('clusterset:speaker', summaryId)
}

/** The document-tag AnnotationLayer id carrying a summary's gloss. */
export function summaryGlossLayerId(summaryId: string): string {
  return deriveId('layer:summary-gloss', summaryId)
}

/** The document-tag LayersAnnotation id carrying a summary's gloss. */
export function summaryGlossAnnotationId(summaryId: string): string {
  return deriveId('ann:summary-gloss', summaryId)
}

