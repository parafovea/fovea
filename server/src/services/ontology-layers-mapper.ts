/**
 * Bidirectional conversion between a persona's ontology (the four type-array
 * buckets the `/api/ontology` contract exchanges) and the layers store
 * (LayersOntology + TypeDef).
 *
 * The forward direction (`ontologyToLayers`) mirrors the backfill in
 * `prisma/backfill/backfill-ontologies.ts`: the persona's ontology becomes one
 * LayersOntology bound to the persona (its id derived from the persona id so the
 * mapping is 1:1 and idempotent), and each declared type becomes one TypeDef
 * reusing the legacy type id. The four buckets map onto layers type kinds:
 * entityTypes to entity-type, eventTypes to situation-type, roleTypes to
 * role-type, relationTypes to relation-type.
 *
 * Where the backfill flattens each type to its layers-native columns (gloss text,
 * allowedRoles, knowledgeRefs) and drops the rest, this mapper additionally
 * stashes the complete original type under `features.foveaOntology.object`. The
 * reverse direction (`layersToOntology`) reconstructs each type verbatim from
 * that stash, so glosses (GlossItem[]), roles, parent references, and wikidata
 * survive the round trip exactly.
 *
 * @module
 */

import type { TypeDef as PrismaTypeDef } from '@prisma/client'

import { layersOntologyForPersonaId } from './layers-id-map.js'

/**
 * A persona's ontology in the aggregate shape: the four type-array buckets,
 * named for the ontology types they hold. Every element is an opaque JSON
 * object; the mapper preserves each verbatim.
 */
export interface PersonaOntologyAggregate {
  entityTypes: unknown[]
  eventTypes: unknown[]
  roleTypes: unknown[]
  relationTypes: unknown[]
}

/** An empty ontology aggregate with every bucket present. */
export function emptyOntology(): PersonaOntologyAggregate {
  return { entityTypes: [], eventTypes: [], roleTypes: [], relationTypes: [] }
}

/** The scope columns every produced row carries. */
export interface OntologyLayersScope {
  projectId: string | null
  createdByUserId: string | null
}

/** The persona-derived metadata a produced LayersOntology carries. */
export interface OntologyMeta {
  name: string
  description: string | null
  domain: string | null
}

/** A LayersOntology create payload the ontology save persists. */
export interface MappedOntology {
  id: string
  name: string
  description: string | null
  domain: string | null
  personaId: string
  projectId: string | null
  createdByUserId: string | null
}

/** A TypeDef create payload the ontology save persists. */
export interface MappedTypeDef {
  id: string
  ontologyId: string
  name: string
  typeKind: string
  gloss: string | null
  parentTypeId: string | null
  allowedRoles: unknown
  knowledgeRefs: unknown
  features: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** The ontology and type definitions a persona ontology projects to. */
export interface OntologyLayersProjection {
  ontology: MappedOntology
  typeDefs: MappedTypeDef[]
}

/** The four type buckets, with their layers type kind. */
const TYPE_BUCKETS = [
  ['entityTypes', 'entity-type'],
  ['eventTypes', 'situation-type'],
  ['roleTypes', 'role-type'],
  ['relationTypes', 'relation-type'],
] as const

/** The marker key stamped into `features` for every ontology-derived TypeDef. */
export const ONTOLOGY_MARKER = 'foveaOntology'

/** One inline rich-text/reference segment (a GlossItem's shape). */
interface GlossSegment {
  content?: unknown
}

/**
 * Flattens a gloss (rich-text/reference segments) to plain text by concatenating
 * each segment's content. Returns null for an empty or absent gloss.
 */
function glossToText(gloss: unknown): string | null {
  if (!Array.isArray(gloss) || gloss.length === 0) return null
  const text = gloss
    .map((segment) => {
      const content = (segment as GlossSegment).content
      return typeof content === 'string' ? content : ''
    })
    .join('')
  return text.length > 0 ? text : null
}

/** Builds a Wikidata knowledge reference for a type, or null when absent. */
function wikidataKnowledgeRefs(type: Record<string, unknown>): unknown {
  const wikidataId = type.wikidataId
  if (typeof wikidataId !== 'string' || wikidataId.length === 0) return null
  return [{ identifier: wikidataId, source: 'wikidata', uri: type.wikidataUrl ?? null }]
}

/** Reads a string field, returning null when absent or non-string. */
function stringField(object: Record<string, unknown>, key: string): string | null {
  const value = object[key]
  return typeof value === 'string' ? value : null
}

/**
 * The layers-native `allowedRoles` projection for a type: the event-type role
 * slots, or the role-type's allowed filler kinds, or null.
 */
function allowedRolesFor(bucket: string, type: Record<string, unknown>): unknown {
  if (bucket === 'eventTypes' && Array.isArray(type.roles)) return type.roles
  if (bucket === 'roleTypes' && Array.isArray(type.allowedFillerTypes)) return type.allowedFillerTypes
  return null
}

/** Reads a JSON column expected to hold an array, tolerating null/non-array. */
function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/**
 * Projects a persona ontology onto a LayersOntology and its TypeDefs.
 *
 * @param aggregate - the four type-array buckets
 * @param personaId - the persona the ontology belongs to
 * @param meta - the persona-derived ontology metadata
 * @param scope - the scope columns every produced row carries
 * @returns the ontology and type definitions to persist
 */
export function ontologyToLayers(
  aggregate: PersonaOntologyAggregate,
  personaId: string,
  meta: OntologyMeta,
  scope: OntologyLayersScope,
): OntologyLayersProjection {
  const ontologyId = layersOntologyForPersonaId(personaId)

  const typeDefs: MappedTypeDef[] = []
  for (const [bucket, typeKind] of TYPE_BUCKETS) {
    const types = asArray(aggregate[bucket])
    types.forEach((type, index) => {
      const id = stringField(type, 'id')
      if (id === null) return
      typeDefs.push({
        id,
        ontologyId,
        name: stringField(type, 'name') ?? '',
        typeKind,
        gloss: glossToText(type.gloss),
        parentTypeId: stringField(type, 'parentEventId'),
        allowedRoles: allowedRolesFor(bucket, type),
        knowledgeRefs: wikidataKnowledgeRefs(type),
        features: { [ONTOLOGY_MARKER]: { bucket, index, object: type } },
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      })
    })
  }

  return {
    ontology: {
      id: ontologyId,
      name: meta.name,
      description: meta.description,
      domain: meta.domain,
      personaId,
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    },
    typeDefs,
  }
}

/** The stash an ontology-derived TypeDef carries under `features.foveaOntology`. */
interface OntologyStash {
  bucket: keyof PersonaOntologyAggregate
  index: number
  object: unknown
}

/** Extracts the ontology stash from a TypeDef's `features`, or null when absent. */
function readOntologyStash(features: unknown): OntologyStash | null {
  if (features === null || typeof features !== 'object') return null
  const marker = (features as Record<string, unknown>)[ONTOLOGY_MARKER]
  if (marker === null || typeof marker !== 'object') return null
  const record = marker as Record<string, unknown>
  const bucket = record.bucket
  if (
    (bucket !== 'entityTypes' &&
      bucket !== 'eventTypes' &&
      bucket !== 'roleTypes' &&
      bucket !== 'relationTypes') ||
    typeof record.index !== 'number'
  ) {
    return null
  }
  return { bucket, index: record.index, object: record.object }
}

/**
 * Reconstructs a persona ontology's four type buckets from its TypeDefs.
 *
 * Each TypeDef is placed into its bucket at its stashed index so array order is
 * preserved, and the reconstructed type is the verbatim stash. TypeDefs without
 * an ontology stash are ignored.
 *
 * @param typeDefs - the type definitions belonging to the ontology
 * @returns the reconstructed four type buckets
 */
export function layersToOntology(typeDefs: Pick<PrismaTypeDef, 'features'>[]): PersonaOntologyAggregate {
  const indexed: Record<keyof PersonaOntologyAggregate, Array<{ index: number; object: unknown }>> = {
    entityTypes: [],
    eventTypes: [],
    roleTypes: [],
    relationTypes: [],
  }

  for (const typeDef of typeDefs) {
    const stash = readOntologyStash(typeDef.features)
    if (!stash) continue
    indexed[stash.bucket].push({ index: stash.index, object: stash.object })
  }

  const aggregate = emptyOntology()
  for (const bucket of Object.keys(indexed) as (keyof PersonaOntologyAggregate)[]) {
    aggregate[bucket] = indexed[bucket]
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.object)
  }
  return aggregate
}
