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

/**
 * The primary LayersAnnotation id that bears a claim: one per claim, denoting the
 * claim GraphNode and carrying the claim's text, confidence, gloss, claimer, and
 * discontiguous text-span anchor. Keyed by the claim id so a rewrite of the same
 * claim reuses the row rather than minting a duplicate. Mirrors
 * {@link claimSpanLayerId}.
 */
export function claimAnnotationId(claimId: string): string {
  return deriveId('ann:claim', claimId)
}

/**
 * The temporal-span LayersAnnotation id for one video-time grounding of a claim,
 * keyed by the claim id and the span's index. Each grounds the same claim node in
 * video time as a child of the claim's primary annotation.
 */
export function claimTimeSpanAnnotationId(claimId: string, spanIndex: number): string {
  return deriveId('ann:claim-time', claimId, String(spanIndex))
}

/**
 * The text-span child LayersAnnotation id for one of a claim's discontiguous text
 * spans, keyed by the claim id and the span's index. Each carries the span's
 * character extent on a `textSpan` anchor as a child of the claim's primary
 * annotation, so the full (possibly discontiguous) span list round-trips natively.
 */
export function claimTextSpanAnnotationId(claimId: string, spanIndex: number): string {
  return deriveId('ann:claim-text-span', claimId, String(spanIndex))
}

/**
 * The span-endpoint LayersAnnotation id for one source/target span of a claim
 * relation, keyed by the relation id, the side (`source`/`target`), and the span
 * index. Each carries a `textSpan` anchor and points at the relation via an
 * `argumentRef`, so a relation's endpoint spans round-trip as native annotations
 * rather than a flattened edge featureMap.
 */
export function relationSpanAnnotationId(relationId: string, side: string, spanIndex: number): string {
  return deriveId('ann:relation-span', relationId, side, String(spanIndex))
}

/**
 * The cross-object GraphEdge id linking a claim to a world object (its situation,
 * time, or location), keyed by the claim id and the reference field. Mirrors
 * {@link claimRelationEdgeId} so a re-save collapses onto one edge.
 */
export function claimRefEdgeId(claimId: string, field: string): string {
  return deriveId('edge:claim-ref', claimId, field)
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

/**
 * The Expression id carrying a type's flattened gloss text, keyed by the TypeDef
 * row id. The gloss's reference structure is stand-off over this expression, so
 * deriving the id from the row id keeps the projection idempotent with no schema
 * field: a rewrite of the same type reuses this expression rather than minting a
 * duplicate. Mirrors {@link claimSpanLayerId}.
 */
export function glossExpressionId(typeDefRowId: string): string {
  return deriveId('expr:ontology-gloss', typeDefRowId)
}

/** The span AnnotationLayer id grouping a type's gloss reference annotations. */
export function glossLayerId(typeDefRowId: string): string {
  return deriveId('layer:ontology-gloss', typeDefRowId)
}

/**
 * The span LayersAnnotation id for one reference segment of a type's gloss,
 * keyed by the TypeDef row id and the segment's index among the gloss segments.
 */
export function glossRefAnnotationId(typeDefRowId: string, segIndex: number): string {
  return deriveId('ann:ontology-gloss', typeDefRowId, String(segIndex))
}

/**
 * The ontology-relation edge id for a directed (source, target, relationType)
 * triple, mirroring {@link claimRelationEdgeId}: deriving the id from the triple
 * lets a retry or double-submit collapse to one edge rather than minting a
 * duplicate.
 */
export function ontologyRelationEdgeId(
  sourceId: string,
  targetId: string,
  relationTypeId: string,
): string {
  return deriveId('edge:ontology-relation', sourceId, targetId, relationTypeId)
}

// --- world + temporal derivations -------------------------------------------

/**
 * The per-scope world scaffold Expression id. World-denoting annotations (a
 * Time's temporal value, a Location's spatial value, an Event's interpretation)
 * must hang off an AnnotationLayer, which must hang off an Expression; a single
 * scaffold Expression per (user, project) scope hosts them all. Deriving the id
 * from the scope keeps the scaffold a singleton the write path reuses.
 */
export function worldScaffoldExpressionId(createdByUserId: string | null, projectId: string | null): string {
  return deriveId('expr:world', createdByUserId ?? '', projectId ?? '')
}

/** The per-scope world scaffold AnnotationLayer id that groups world annotations. */
export function worldScaffoldLayerId(createdByUserId: string | null, projectId: string | null): string {
  return deriveId('layer:world', createdByUserId ?? '', projectId ?? '')
}

/**
 * The presence LayersAnnotation id denoting a world node (entity / location /
 * situation / time), keyed by the node id. Every world node carries exactly one
 * presence annotation in the scope's world scaffold layer: it is the native
 * marker that distinguishes a world-authored node from a video-object-annotation
 * denotation stub (which has no scaffold annotation), and for a Time it carries
 * the calendar value, for a Location the spatial value, and for an Entity/Event
 * the display description text.
 */
export function worldNodeAnnotationId(nodeId: string): string {
  return deriveId('ann:world-node', nodeId)
}

/**
 * The interpretation LayersAnnotation id denoting an Event node, keyed by the
 * (event, persona, eventType, index) tuple. The index disambiguates two
 * interpretations that share a persona and event type but differ in their
 * participants or justification, so distinct interpretations never collapse onto
 * one deterministic id; a re-save preserving list order stays idempotent.
 */
export function worldInterpretationAnnotationId(
  eventId: string,
  personaId: string,
  eventTypeId: string,
  index: number,
): string {
  return deriveId('ann:world-interp', eventId, personaId, eventTypeId, String(index))
}

/**
 * The type-assignment LayersAnnotation id, keyed by the (subject, type, persona,
 * index) tuple. The subject is the entity/event node or the collection the type
 * is assigned to; the index disambiguates two assignments sharing a persona and
 * type but differing in confidence or justification, so distinct assignments
 * never collide onto one id.
 */
export function worldTypeAssignmentAnnotationId(
  subjectId: string,
  typeId: string,
  personaId: string,
  index: number,
): string {
  return deriveId('ann:world-type', subjectId, typeId, personaId, String(index))
}

/**
 * The collection-description LayersAnnotation id, keyed by the collection id.
 * Hosts a collection's stand-off gloss text (its `description`), which — unlike an
 * entity or event — has no GraphNode to hang a presence annotation off.
 */
export function worldCollectionDescriptionAnnotationId(collectionId: string): string {
  return deriveId('ann:world-collection-desc', collectionId)
}

/**
 * The gloss-reference child LayersAnnotation id for one reference segment of a
 * world object's description, keyed by the owning object id and the segment's
 * index. The child's textSpan anchor points into the parent description text, so
 * a rich description round-trips stand-off rather than as a shredded blob.
 */
export function worldGlossRefAnnotationId(objectId: string, segIndex: number): string {
  return deriveId('ann:world-gloss-ref', objectId, String(segIndex))
}
