/**
 * Backfills a legacy per-persona Ontology into the layers store.
 *
 * An Ontology maps to one LayersOntology (bound to the persona) and one TypeDef
 * per declared type. The four legacy type buckets map onto layers type kinds:
 * entityTypes to entity-type, eventTypes to situation-type, roleTypes to
 * role-type, and relationTypes to relation-type. Each TypeDef reuses the legacy
 * type's id so the mapping is 1:1 and idempotent, and a Wikidata id on the type
 * becomes a knowledge reference.
 *
 * @module
 */

import { PrismaClient, type Ontology } from '@prisma/client'

import { layersOntologyForPersonaId, reuseTypeId } from './id-map.js'
import { toJson, glossToText, type LegacyOntologyType, type StepStats } from './helpers.js'

/** The layers type kind each legacy bucket projects to. */
const TYPE_KIND_BY_BUCKET = {
  entityTypes: 'entity-type',
  eventTypes: 'situation-type',
  roleTypes: 'role-type',
  relationTypes: 'relation-type',
} as const

/** Builds a Wikidata knowledge reference for a type, or null when absent. */
function wikidataKnowledgeRefs(type: LegacyOntologyType): unknown {
  if (!type.wikidataId) return null
  return [
    {
      identifier: type.wikidataId,
      source: 'wikidata',
      uri: type.wikidataUrl,
    },
  ]
}

/**
 * Reads a JSON column expected to hold an array of ontology types, tolerating a
 * null/non-array column by returning an empty list.
 */
function readTypes(value: unknown): LegacyOntologyType[] {
  return Array.isArray(value) ? (value as LegacyOntologyType[]) : []
}

/**
 * Backfills one Ontology into a LayersOntology plus its TypeDefs.
 *
 * @param prisma - the Prisma client
 * @param ontology - the legacy Ontology row
 * @returns the created/updated tally
 */
export async function backfillOntology(prisma: PrismaClient, ontology: Ontology): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }

  const persona = await prisma.persona.findUnique({ where: { id: ontology.personaId } })
  if (!persona) return stats

  const scope = { projectId: persona.projectId, createdByUserId: persona.userId }
  const ontologyId = layersOntologyForPersonaId(persona.id)

  const ontologyData = {
    name: `${persona.name} ontology`,
    description: persona.informationNeed,
    domain: persona.domain,
    personaId: persona.id,
    ...scope,
  }
  const ontologyExisted = (await prisma.layersOntology.count({ where: { id: ontologyId } })) > 0
  await prisma.layersOntology.upsert({
    where: { id: ontologyId },
    create: { id: ontologyId, ...ontologyData },
    update: ontologyData,
  })
  ontologyExisted ? (stats.updated += 1) : (stats.created += 1)

  for (const [bucket, typeKind] of Object.entries(TYPE_KIND_BY_BUCKET)) {
    const types = readTypes(ontology[bucket as keyof typeof TYPE_KIND_BY_BUCKET])
    for (const type of types) {
      const typeId = reuseTypeId(type.id)
      const typeData = {
        ontologyId,
        name: type.name,
        typeKind,
        gloss: glossToText(type.gloss),
        knowledgeRefs: toJson(wikidataKnowledgeRefs(type)),
        ...scope,
      }
      const existed = (await prisma.typeDef.count({ where: { id: typeId } })) > 0
      await prisma.typeDef.upsert({
        where: { id: typeId },
        create: { id: typeId, ...typeData },
        update: typeData,
      })
      existed ? (stats.updated += 1) : (stats.created += 1)
    }
  }

  return stats
}

/**
 * Backfills a batch of ontologies, aggregating their tallies.
 *
 * @param prisma - the Prisma client
 * @param ontologies - the legacy Ontology rows
 * @returns the aggregate created/updated tally
 */
export async function backfillOntologies(
  prisma: PrismaClient,
  ontologies: Ontology[],
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  for (const ontology of ontologies) {
    const step = await backfillOntology(prisma, ontology)
    stats.created += step.created
    stats.updated += step.updated
  }
  return stats
}
