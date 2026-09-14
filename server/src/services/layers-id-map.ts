/**
 * Deterministic id derivation for the layers store.
 *
 * The video-annotation runtime and the layers backfill must agree on the ids of
 * the derived rows a Fovea Video projects to (its Media, its Expression, its
 * grouping AnnotationLayers) so that annotating a video through the layers
 * endpoint reuses the exact rows a prior backfill produced rather than minting
 * duplicates. Idempotency rests on those ids being a pure function of the legacy
 * input: a fixed uuidv5 namespace plus a key encoding the target kind and the
 * legacy id(s) it fans out from.
 *
 * This module owns that namespace and the derivations the runtime needs; the
 * backfill re-exports these and adds its own backfill-only derivations.
 *
 * @module
 */

import { v5 as uuidv5 } from 'uuid'

/**
 * Fixed namespace for every derived layers id. Never change this: the derived
 * ids are the idempotency keys, so a new namespace would orphan every previously
 * derived row and re-mint duplicates on the next run.
 */
export const LAYERS_ID_NAMESPACE = 'b6f0a3d2-3c2b-4e5a-9f1c-7d8e5a2b1c00'

/**
 * The scope columns every derived layers row carries. Resolved from the legacy
 * owner fields so a mirrored row is visible to exactly the principals who could
 * see its source.
 */
export interface Scope {
  projectId: string | null
  createdByUserId: string | null
}

/**
 * Derives a stable uuid from a target kind and its legacy id parts.
 *
 * @param kind - the target row kind (e.g. `media:video`, `expr:video`)
 * @param parts - the legacy id(s) the derived row fans out from
 * @returns a deterministic uuid, identical for identical inputs
 */
export function deriveId(kind: string, ...parts: string[]): string {
  return uuidv5(`${kind}|${parts.join('|')}`, LAYERS_ID_NAMESPACE)
}

/** The Media(kind=video) id for a Video. */
export function mediaVideoId(videoId: string): string {
  return deriveId('media:video', videoId)
}

/** The Expression(kind=video) id for a Video. */
export function expressionVideoId(videoId: string): string {
  return deriveId('expr:video', videoId)
}

/**
 * The AnnotationLayer id that groups a video expression's annotations for one
 * persona. Object annotations (null persona) share a single object layer keyed
 * by the `object` sentinel, so a video's type annotations and object annotations
 * land in distinct homogeneous layers.
 */
export function annotationLayerId(videoId: string, personaId: string | null): string {
  return deriveId('layer:annotation', videoId, personaId ?? 'object')
}

/** The LayersOntology id for a persona's legacy Ontology. */
export function layersOntologyForPersonaId(personaId: string): string {
  return deriveId('ontology:persona', personaId)
}

/** The Expression(kind=transcript) id for a VideoSummary's transcript. */
export function expressionTranscriptId(summaryId: string): string {
  return deriveId('expr:transcript', summaryId)
}

/** The span AnnotationLayer id grouping a summary's claim text spans. */
export function claimSpanLayerId(summaryId: string): string {
  return deriveId('layer:claim-span', summaryId)
}

/** The span LayersAnnotation id for one text span of a claim. */
export function claimSpanAnnotationId(claimId: string, spanIndex: number): string {
  return deriveId('ann:claim-span', claimId, String(spanIndex))
}

/**
 * The claim-relation edge id for a directed (source, target, relationType)
 * triple. Deriving the id from the triple lets two concurrent identical
 * requests resolve to the same primary-key row, so a retry or double-submit
 * collapses to one edge rather than minting a duplicate.
 */
export function claimRelationEdgeId(
  sourceClaimId: string,
  targetClaimId: string,
  relationTypeId: string,
): string {
  return deriveId('edge:claim-relation', sourceClaimId, targetClaimId, relationTypeId)
}
