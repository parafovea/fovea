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

import type {
  PersonaOntologyAggregate,
  OntologyMeta,
  OntologyLayersScope,
} from '../../src/services/ontology-model.js'
import { writeOntologyAggregate } from '../../src/services/layers-bridge/ontology-bridge.js'
import { layersOntologyForPersonaId } from '../../src/services/layers-id-map.js'

import type { StepStats } from './helpers.js'

/** Assembles the aggregate the ontology lens consumes from a legacy row. */
function aggregateOf(row: Ontology): PersonaOntologyAggregate {
  return {
    entityTypes: legacyTypesOf(row.entityTypes),
    eventTypes: legacyTypesOf(row.eventTypes),
    roleTypes: legacyTypesOf(row.roleTypes),
    relationTypes: legacyTypesOf(row.relationTypes),
  }
}

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
    await writeOntologyAggregate(prisma, row.personaId, aggregateOf(row), meta, scope)
    existed ? (stats.updated += 1) : (stats.created += 1)
  }
  return stats
}
