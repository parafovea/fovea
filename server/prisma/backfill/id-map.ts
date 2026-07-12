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
 * Scope columns (`projectId`, `createdByUserId`) are resolved per source row from
 * the legacy owner fields so the backfilled rows land in the same CASL scope as
 * the data they mirror.
 *
 * @module
 */

import { v5 as uuidv5 } from 'uuid'

/**
 * Fixed namespace for all derived backfill ids. Never change this: the derived
 * ids are the idempotency keys, so a new namespace would orphan every previously
 * backfilled row and re-mint duplicates on the next run.
 */
const BACKFILL_NAMESPACE = 'b6f0a3d2-3c2b-4e5a-9f1c-7d8e5a2b1c00'

/**
 * The scope columns every backfilled layers row carries. Resolved from the
 * legacy owner fields so a mirrored row is visible to exactly the principals who
 * could see its source.
 */
export interface Scope {
  projectId: string | null
  createdByUserId: string | null
}

/**
 * Derives a stable uuid from a source kind and its legacy id parts.
 *
 * @param kind - the target row kind (e.g. `media:video`, `expr:transcript`)
 * @param parts - the legacy id(s) the derived row fans out from
 * @returns a deterministic uuid, identical for identical inputs
 */
export function deriveId(kind: string, ...parts: string[]): string {
  return uuidv5(`${kind}|${parts.join('|')}`, BACKFILL_NAMESPACE)
}

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

/** The Media(kind=video) id for a Video. */
export function mediaVideoId(videoId: string): string {
  return deriveId('media:video', videoId)
}

/** The Expression(kind=video) id for a Video. */
export function expressionVideoId(videoId: string): string {
  return deriveId('expr:video', videoId)
}

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

// --- Derived ids: ontology domain ----------------------------------------

/** The LayersOntology id for a persona's legacy Ontology. */
export function layersOntologyForPersonaId(personaId: string): string {
  return deriveId('ontology:persona', personaId)
}

// --- Derived ids: annotation domain --------------------------------------

/**
 * The AnnotationLayer id that groups a video expression's annotations for one
 * persona. Object annotations (null persona) share a single object layer keyed
 * by the `object` sentinel, so a video's type annotations and object annotations
 * land in distinct homogeneous layers.
 */
export function annotationLayerId(videoId: string, personaId: string | null): string {
  return deriveId('layer:annotation', videoId, personaId ?? 'object')
}

// --- Derived ids: summary/transcript domain ------------------------------

/** The Media(kind=audio) id for a VideoSummary's transcript. */
export function mediaAudioId(summaryId: string): string {
  return deriveId('media:audio', summaryId)
}

/** The Expression(kind=transcript) id for a VideoSummary's transcript. */
export function expressionTranscriptId(summaryId: string): string {
  return deriveId('expr:transcript', summaryId)
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

// --- Derived ids: claim domain -------------------------------------------

/** The span AnnotationLayer id grouping a summary's claim spans. */
export function claimSpanLayerId(summaryId: string): string {
  return deriveId('layer:claim-span', summaryId)
}

/** The span LayersAnnotation id for one text span of a claim. */
export function claimSpanAnnotationId(claimId: string, spanIndex: number): string {
  return deriveId('ann:claim-span', claimId, String(spanIndex))
}
