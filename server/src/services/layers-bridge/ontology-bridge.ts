/**
 * Persona-ontology bridge over the unified layers store.
 *
 * Reconstructs a persona's ontology (the four type buckets the `/api/ontology`
 * contract exchanges) from the layers store (LayersOntology + TypeDef + the
 * stand-off gloss rows), and materializes an aggregate back into it. Reads read
 * the layers store only; writes upsert the LayersOntology, prune its TypeDefs and
 * gloss rows, and recreate them from the aggregate. Mirrors the structure of
 * `WorldStateService.readPersonaOntologyBundle` / `writePersonaOntology`, which
 * reuse the shared stand-off helpers exported here so both write paths emit and
 * read the identical native representation.
 *
 * @module
 */

import { PrismaClient } from '@prisma/client'

import type { GlossItem } from '@models/types.js'

import {
  glossStandoffFor,
  glossFromStandoff,
  emptyOntology,
  type GlossRefRow,
  type OntologyMeta,
  type OntologyLayersScope,
  type PersonaOntologyAggregate,
  type TypeDefRow,
} from '../ontology-model.js'
import { layersToOntologyViaLens, ontologyToLayersViaLens } from '../layers-lens/ontology-lens.js'
import { deriveId, glossExpressionId, glossLayerId, layersOntologyForPersonaId } from '../layers-id-map.js'
import { toJson, type PrismaLike } from './util.js'

/** A reconstructed persona ontology plus its id, timestamps, and existence. */
export interface OntologyRead {
  id: string
  aggregate: PersonaOntologyAggregate
  exists: boolean
  createdAt: string
  updatedAt: string
}

/**
 * The derived TypeDef row id for a (ontology, kind, original type id) triple.
 *
 * TypeDef row ids are globally unique, but the same ontology type id may recur
 * across users (two users importing the same export) or across kinds within one
 * ontology (an entity type and a role type both keyed '1'). Deriving a
 * per-(ontology, kind) row id keeps those rows from colliding; the original type
 * id survives in `features.typeId`, so the reconstructed ontology still reports
 * it. A type's parent is the same kind, so the parent row id derives from that
 * kind.
 *
 * @param ontologyId - the owning ontology id
 * @param typeKind - the layers type kind
 * @param originalId - the legacy type id
 * @returns the derived TypeDef row id
 */
export function typeDefRowId(ontologyId: string, typeKind: string, originalId: string): string {
  return deriveId('typedef', ontologyId, typeKind, originalId)
}

/**
 * Prunes and recreates the stand-off gloss rows for one written TypeDef. The
 * derived gloss expression (cascading to its span layer and annotations) is
 * deleted first, then recreated only when the gloss carries reference segments,
 * so the write is idempotent and a gloss that lost its references leaves no
 * orphan rows behind.
 *
 * @param client - the Prisma client (or transaction client) to write through
 * @param rowId - the derived TypeDef row id the gloss ids fan out from
 * @param glossItems - the type's gloss segments
 * @param ontologyId - the owning ontology, bound onto the span layer
 * @param personaId - the persona whose ontology owns the layer
 * @param scope - the scope columns every produced row carries
 */
export async function writeGlossStandoff(
  client: PrismaLike,
  rowId: string,
  glossItems: GlossItem[],
  ontologyId: string,
  personaId: string,
  scope: OntologyLayersScope,
): Promise<void> {
  await client.expression.deleteMany({ where: { id: glossExpressionId(rowId) } })

  const standoff = glossStandoffFor(rowId, glossItems, ontologyId, personaId, scope)
  if (!standoff) return

  await client.expression.create({
    data: {
      id: standoff.expression.id,
      layersId: standoff.expression.layersId,
      kind: standoff.expression.kind,
      text: standoff.expression.text,
      sourceKind: standoff.expression.sourceKind,
      projectId: standoff.expression.projectId,
      createdByUserId: standoff.expression.createdByUserId,
    },
  })
  await client.annotationLayer.create({
    data: {
      id: standoff.layer.id,
      expressionId: standoff.layer.expressionId,
      kind: standoff.layer.kind,
      subkind: standoff.layer.subkind,
      ontologyId: standoff.layer.ontologyId,
      personaId: standoff.layer.personaId,
      projectId: standoff.layer.projectId,
      createdByUserId: standoff.layer.createdByUserId,
    },
  })
  for (const annotation of standoff.annotations) {
    // Omit the anchor field entirely when the annotation carries none, so the
    // column stores SQL NULL (matching world-store.ts) rather than a JSON `{}`
    // or JSON `null` that a `WHERE anchor IS NULL` predicate would miss.
    const anchor = toJson(annotation.anchor)
    await client.layersAnnotation.create({
      data: {
        id: annotation.id,
        layerId: annotation.layerId,
        ...(anchor !== undefined ? { anchor } : {}),
        label: annotation.label,
        text: annotation.text,
        ontologyTypeRefId: annotation.ontologyTypeRefId,
        arguments: toJson(annotation.arguments),
        features: toJson(annotation.features),
        projectId: annotation.projectId,
        createdByUserId: annotation.createdByUserId,
      },
    })
  }
}

/**
 * Reads the reconstructed gloss for each TypeDef row, keyed by row id. Batches
 * the gloss-expression and gloss-annotation lookups over every row so the
 * reconstruction costs two queries regardless of the ontology's size. A row
 * whose gloss carries no reference segments has no stand-off expression and is
 * absent from the map (the reconstruction falls back to its `gloss` text).
 *
 * @param client - the Prisma client (or transaction client) to read through
 * @param typeDefs - the TypeDef rows whose glosses to reconstruct
 * @returns a map of TypeDef row id to reconstructed gloss segments
 */
export async function readGlossMap(
  client: PrismaLike,
  typeDefs: Pick<TypeDefRow, 'id'>[],
): Promise<Map<string, GlossItem[]>> {
  const map = new Map<string, GlossItem[]>()
  if (typeDefs.length === 0) return map

  const expressionIdToRow = new Map<string, string>()
  const layerIdToRow = new Map<string, string>()
  for (const row of typeDefs) {
    expressionIdToRow.set(glossExpressionId(row.id), row.id)
    layerIdToRow.set(glossLayerId(row.id), row.id)
  }

  const expressions = await client.expression.findMany({
    where: { id: { in: [...expressionIdToRow.keys()] } },
    select: { id: true, text: true },
  })
  const annotations = await client.layersAnnotation.findMany({
    where: { layerId: { in: [...layerIdToRow.keys()] } },
    select: { layerId: true, anchor: true, label: true, text: true, ontologyTypeRefId: true, arguments: true, features: true },
  })

  const refsByRow = new Map<string, GlossRefRow[]>()
  for (const annotation of annotations) {
    const rowId = layerIdToRow.get(annotation.layerId)
    if (!rowId) continue
    const list = refsByRow.get(rowId) ?? []
    list.push({
      anchor: annotation.anchor,
      label: annotation.label,
      text: annotation.text,
      ontologyTypeRefId: annotation.ontologyTypeRefId,
      arguments: annotation.arguments,
      features: annotation.features,
    })
    refsByRow.set(rowId, list)
  }

  for (const expression of expressions) {
    const rowId = expressionIdToRow.get(expression.id)
    if (!rowId || expression.text === null) continue
    map.set(rowId, glossFromStandoff(expression.text, refsByRow.get(rowId) ?? []))
  }
  return map
}

/**
 * Reads a persona's ontology from the layers store.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param personaId - the persona whose ontology to read
 * @returns the reconstructed ontology, its id/timestamps, and whether it existed
 */
export async function readOntologyAggregate(
  prisma: PrismaLike,
  personaId: string,
): Promise<OntologyRead> {
  const ontologyId = layersOntologyForPersonaId(personaId)
  const row = await prisma.layersOntology.findUnique({ where: { id: ontologyId } })
  if (row) {
    const typeDefs = await prisma.typeDef.findMany({ where: { ontologyId } })
    const glossMap = await readGlossMap(prisma, typeDefs)
    return {
      id: row.id,
      aggregate: layersToOntologyViaLens(typeDefs, glossMap),
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
 * prunes its existing TypeDefs, and recreates them from the aggregate along with
 * the stand-off gloss rows. Types are inserted parent-free first, then parent
 * refs that resolve to a sibling are set, so a self-relation FK never references
 * a not-yet-inserted row.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param personaId - the owning persona id
 * @param aggregate - the four type buckets to persist
 * @param meta - the persona-derived ontology metadata
 * @param scope - the scope columns every produced row carries
 */
export async function writeOntologyAggregate(
  prisma: PrismaLike,
  personaId: string,
  aggregate: PersonaOntologyAggregate,
  meta: OntologyMeta,
  scope: OntologyLayersScope,
): Promise<void> {
  const { ontology, typeDefs } = await ontologyToLayersViaLens(aggregate, personaId, meta, scope)

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

  const rowId = (typeKind: string, originalId: string): string => typeDefRowId(ontology.id, typeKind, originalId)

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
        allowedValues: toJson(typeDef.allowedValues),
        knowledgeRefs: toJson(typeDef.knowledgeRefs),
        features: toJson(typeDef.features),
        projectId: typeDef.projectId,
        createdByUserId: typeDef.createdByUserId,
      },
    })
    createdIds.add(id)
    // The TypeDef row id in this path is the derived id, so the gloss stand-off
    // rows key off it.
    await writeGlossStandoff(prisma, id, typeDef.glossItems, ontology.id, personaId, scope)
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
