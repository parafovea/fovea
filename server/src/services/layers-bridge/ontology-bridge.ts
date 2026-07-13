/**
 * Persona-ontology bridge over the unified layers store.
 *
 * Reconstructs a persona's ontology (the four type buckets the `/api/ontology`
 * contract exchanges) from the layers store (LayersOntology + TypeDef), and
 * materializes an aggregate back into it. Reads read the layers store only;
 * writes upsert the LayersOntology, prune its TypeDefs, and recreate them from
 * the aggregate. Mirrors the structure of
 * `WorldStateService.readPersonaOntologyBundle` / `writePersonaOntology`.
 *
 * @module
 */

import { PrismaClient } from '@prisma/client'

import {
  ontologyToLayers,
  layersToOntology,
  emptyOntology,
  type OntologyMeta,
  type OntologyLayersScope,
  type PersonaOntologyAggregate,
} from '../ontology-layers-mapper.js'
import { deriveId, layersOntologyForPersonaId } from '../layers-id-map.js'
import { toJson } from './util.js'

/** A reconstructed persona ontology plus its id, timestamps, and existence. */
export interface OntologyRead {
  id: string
  aggregate: PersonaOntologyAggregate
  exists: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Reads a persona's ontology from the layers store.
 *
 * @param prisma - the Prisma client (or transaction client)
 * @param personaId - the persona whose ontology to read
 * @returns the reconstructed ontology, its id/timestamps, and whether it existed
 */
export async function readOntologyAggregate(
  prisma: PrismaClient,
  personaId: string,
): Promise<OntologyRead> {
  const ontologyId = layersOntologyForPersonaId(personaId)
  const row = await prisma.layersOntology.findUnique({ where: { id: ontologyId } })
  if (row) {
    const typeDefs = await prisma.typeDef.findMany({ where: { ontologyId } })
    return {
      id: row.id,
      aggregate: layersToOntology(typeDefs),
      exists: true,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  return {
    id: ontologyId,
    aggregate: emptyOntology(),
    exists: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Writes a persona's ontology to the layers store: upserts the LayersOntology,
 * prunes its existing TypeDefs, and recreates them from the aggregate. Types are
 * inserted parent-free first, then parent refs that resolve to a sibling are
 * set, so a self-relation FK never references a not-yet-inserted row.
 *
 * @param prisma - the Prisma client (or transaction client)
 * @param personaId - the owning persona id
 * @param aggregate - the four type buckets to persist
 * @param meta - the persona-derived ontology metadata
 * @param scope - the scope columns every produced row carries
 */
export async function writeOntologyAggregate(
  prisma: PrismaClient,
  personaId: string,
  aggregate: PersonaOntologyAggregate,
  meta: OntologyMeta,
  scope: OntologyLayersScope,
): Promise<void> {
  const { ontology, typeDefs } = ontologyToLayers(aggregate, personaId, meta, scope)

  const existing = await prisma.layersOntology.findUnique({ where: { id: ontology.id } })
  if (existing) {
    await prisma.layersOntology.update({
      where: { id: ontology.id },
      data: { name: ontology.name, description: ontology.description, domain: ontology.domain },
    })
  } else {
    await prisma.layersOntology.create({
      data: {
        id: ontology.id,
        name: ontology.name,
        description: ontology.description,
        domain: ontology.domain,
        personaId: ontology.personaId,
        projectId: ontology.projectId,
        createdByUserId: ontology.createdByUserId,
      },
    })
  }

  const oldTypeDefs = await prisma.typeDef.findMany({ where: { ontologyId: ontology.id } })
  for (const typeDef of oldTypeDefs) await prisma.typeDef.delete({ where: { id: typeDef.id } })

  // TypeDef row ids are globally unique, but the same ontology type id may recur
  // across users (e.g. two users importing the same export, where nested type
  // ids are not remapped) or across kinds within one ontology (an entity type
  // and a role type both keyed '1'). Derive a per-(ontology, kind) row id so
  // those rows do not collide; the original type id is preserved in the stashed
  // object, so the reconstructed ontology (from the stash) still reports it. A
  // type's parent is the same kind, so the parent row id derives from that kind.
  const rowId = (typeKind: string, originalId: string): string =>
    deriveId('typedef', ontology.id, typeKind, originalId)

  const createdIds = new Set<string>()
  for (const typeDef of typeDefs) {
    const id = rowId(typeDef.typeKind, typeDef.id)
    await prisma.typeDef.create({
      data: {
        id,
        ontologyId: typeDef.ontologyId,
        name: typeDef.name,
        typeKind: typeDef.typeKind,
        gloss: typeDef.gloss,
        parentTypeId: null,
        allowedRoles: toJson(typeDef.allowedRoles),
        knowledgeRefs: toJson(typeDef.knowledgeRefs),
        features: toJson(typeDef.features),
        projectId: typeDef.projectId,
        createdByUserId: typeDef.createdByUserId,
      },
    })
    createdIds.add(id)
  }
  for (const typeDef of typeDefs) {
    if (!typeDef.parentTypeId) continue
    const parentRowId = rowId(typeDef.typeKind, typeDef.parentTypeId)
    if (createdIds.has(parentRowId)) {
      await prisma.typeDef.update({
        where: { id: rowId(typeDef.typeKind, typeDef.id) },
        data: { parentTypeId: parentRowId },
      })
    }
  }
}

/**
 * Lists every persona id that has an ontology in the layers store, for import
 * conflict detection.
 *
 * @param prisma - the Prisma client
 * @returns the set of persona ids with an ontology
 */
export async function readAllOntologyPersonaIds(prisma: PrismaClient): Promise<Set<string>> {
  const ids = new Set<string>()
  const layersOntologies = await prisma.layersOntology.findMany({
    where: { personaId: { not: null } },
    select: { personaId: true },
  })
  for (const row of layersOntologies) {
    if (row.personaId) ids.add(row.personaId)
  }
  return ids
}
