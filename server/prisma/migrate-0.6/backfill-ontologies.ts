/**
 * Copies each legacy `ontologies` row into the native layers ontology (a
 * `LayersOntology` + its `TypeDef` rows + gloss stand-off) through the SAME
 * bridge the application uses — no row construction here.
 *
 * A legacy `Ontology` is persona-scoped and holds four type buckets
 * (entity / event / role / relation) that ARE the `PersonaOntologyAggregate` the
 * ontology lens consumes. The copy reads the row, joins its `Persona` for the
 * scope and the ontology name, then calls
 * `writeOntologyAggregate(prisma, personaId, aggregate, meta, scope)`, which runs
 * `ontologyToLayersViaLens` internally and persists deterministically (idempotent
 * on re-run).
 *
 * @module
 */

import type { PrismaClient, Ontology } from '@prisma/client'

import type { OntologyMeta, OntologyLayersScope } from '../../src/services/ontology-model.js'
import {
  readOntologyAggregate,
  typeDefRowId,
  writeOntologyAggregate,
} from '../../src/services/layers-bridge/ontology-bridge.js'
import { layersOntologyForPersonaId } from '../../src/services/layers-id-map.js'

import { idsOf, selectForCopy, type StepStats } from './helpers.js'


/**
 * Normalizes one legacy ontology type onto the view-model's `gloss` field.
 *
 * Types written by 0.5 seed scripts carry a plain-string `description` and no
 * `gloss`; the view-model reads only `gloss`, so the description becomes a
 * single text gloss item. A type that already has a `gloss` array is returned
 * unchanged. The verifier compares reconstructions against this same
 * normalization, so the copy and its check agree on the source shape.
 *
 * @param type - one element of a legacy type bucket
 * @returns the type with its description carried as gloss
 */
export function legacyTypeOf(type: unknown): unknown {
  if (typeof type !== 'object' || type === null || Array.isArray(type)) return type
  const record = type as Record<string, unknown>
  if (Array.isArray(record.gloss) || typeof record.description !== 'string') return type
  const gloss = record.description.trim() === '' ? [] : [{ type: 'text', content: record.description }]
  return { ...record, gloss }
}

/** Normalizes every type in a legacy bucket with {@link legacyTypeOf}. */
export function legacyTypesOf(bucket: unknown): unknown[] {
  return Array.isArray(bucket) ? bucket.map(legacyTypeOf) : []
}

/** The four ontology buckets and the layers `typeKind` each maps to. */
export const ONTOLOGY_BUCKETS: ReadonlyArray<readonly [bucket: 'entityTypes' | 'eventTypes' | 'roleTypes' | 'relationTypes', typeKind: string]> = [
  ['entityTypes', 'entity-type'],
  ['eventTypes', 'situation-type'],
  ['roleTypes', 'role-type'],
  ['relationTypes', 'relation-type'],
]

/**
 * Stamps TypeDef rows with timestamps. The ontology writer recreates every
 * TypeDef with the time of the write and the type view-model has no
 * timestamps, so the row is the only place a type's dates survive.
 *
 * @param prisma - the Prisma client
 * @param stamps - TypeDef id to the dates it should carry
 */
async function stampTypeDefs(
  prisma: PrismaClient,
  stamps: ReadonlyMap<string, { createdAt?: Date; updatedAt?: Date }>,
): Promise<void> {
  for (const [id, data] of stamps) {
    if (data.createdAt === undefined && data.updatedAt === undefined) continue
    await prisma.typeDef.updateMany({ where: { id }, data })
  }
}

/** The dates a legacy type carries, parsed from its ISO strings. */
function legacyTypeDates(type: unknown): { createdAt?: Date; updatedAt?: Date } {
  const { createdAt, updatedAt } = (type ?? {}) as { createdAt?: unknown; updatedAt?: unknown }
  const dates: { createdAt?: Date; updatedAt?: Date } = {}
  if (typeof createdAt === 'string' && createdAt !== '') dates.createdAt = new Date(createdAt)
  if (typeof updatedAt === 'string' && updatedAt !== '') dates.updatedAt = new Date(updatedAt)
  return dates
}

/**
 * Copies a batch of legacy ontology rows into native layers ontologies.
 *
 * @param prisma - the Prisma client
 * @param rows - the legacy Ontology rows
 * @returns the created/updated tally (one ontology written per row)
 */
export async function backfillOntologies(
  prisma: PrismaClient,
  rows: Ontology[],
  since?: Date,
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  for (const row of rows) {
    const persona = await prisma.persona.findUnique({ where: { id: row.personaId } })
    if (!persona) continue
    const scope: OntologyLayersScope = {
      projectId: persona.projectId,
      createdByUserId: persona.userId,
    }
    const meta: OntologyMeta = { name: persona.name, description: null, domain: null }
    const existed =
      (await prisma.layersOntology.count({ where: { id: layersOntologyForPersonaId(row.personaId) } })) > 0
    // Merge the selected legacy types over the persona's current layers
    // ontology, since the writer replaces the whole type set: types that exist
    // only in the layers store, or that 0.5 did not change since `since`, stay.
    const ontologyId = layersOntologyForPersonaId(row.personaId)
    const current = await readOntologyAggregate(prisma, row.personaId)
    const priorDates = new Map(
      (
        await prisma.typeDef.findMany({
          where: { ontologyId },
          select: { id: true, createdAt: true, updatedAt: true },
        })
      ).map((typeDef) => [typeDef.id, { createdAt: typeDef.createdAt, updatedAt: typeDef.updatedAt }]),
    )
    const merged = { ...current.aggregate }
    const stamps = new Map<string, { createdAt?: Date; updatedAt?: Date }>()
    for (const [bucket, typeKind] of ONTOLOGY_BUCKETS) {
      const currentTypes = (current.aggregate[bucket] ?? []) as Array<{ id: string }>
      const selected = selectForCopy(legacyTypesOf(row[bucket]), idsOf(currentTypes), since)
      const selectedIds = idsOf(selected)
      const kept = currentTypes.filter((type) => !selectedIds.has(type.id))
      merged[bucket] = [...kept, ...selected] as typeof merged[typeof bucket]
      for (const type of kept) {
        const typeDefId = typeDefRowId(ontologyId, typeKind, type.id)
        const prior = priorDates.get(typeDefId)
        if (prior) stamps.set(typeDefId, prior)
      }
      for (const type of selected) {
        stamps.set(typeDefRowId(ontologyId, typeKind, (type as { id: string }).id), legacyTypeDates(type))
      }
    }
    await writeOntologyAggregate(prisma, row.personaId, merged, meta, scope)
    await stampTypeDefs(prisma, stamps)
    existed ? (stats.updated += 1) : (stats.created += 1)
  }
  return stats
}
