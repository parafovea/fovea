/**
 * Backfills a legacy WorldState into the layers graph.
 *
 * Each world object becomes a GraphNode reusing its own id: entities map to
 * entity nodes, events to situation nodes, times to time nodes, and locations
 * (when a WorldState carries them) to location nodes. Relation instances become
 * GraphEdges reusing the relation id, and each entity type assignment becomes a
 * type-assignment GraphEdge from the object node to its assigned TypeDef.
 *
 * @module
 */

import { PrismaClient, type WorldState } from '@prisma/client'

import { deriveId, reuseWorldObjectNodeId } from './id-map.js'
import {
  toJson,
  requiredJson,
  type LegacyWorldObject,
  type LegacyWorldRelation,
  type StepStats,
} from './helpers.js'

/** The layers node type each WorldState object bucket projects to. */
const NODE_TYPE_BY_BUCKET: Record<string, string> = {
  entities: 'entity',
  events: 'situation',
  times: 'time',
  locations: 'location',
}

/** Reads a JSON column expected to hold an array, tolerating null/non-array. */
function readArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

/** Builds an ObjectRef value-object pointing at a same-record object by id. */
function localRef(id: string): unknown {
  return { localId: { value: id } }
}

/** Builds a Wikidata knowledge reference for a world object, or null. */
function wikidataKnowledgeRefs(object: LegacyWorldObject): unknown {
  if (!object.wikidataId) return null
  return [{ identifier: object.wikidataId, source: 'wikidata' }]
}

/**
 * Backfills one WorldState into its graph nodes and edges.
 *
 * @param prisma - the Prisma client
 * @param worldState - the legacy WorldState row
 * @returns the created/updated tally
 */
export async function backfillWorldState(
  prisma: PrismaClient,
  worldState: WorldState,
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  const scope = { projectId: worldState.projectId, createdByUserId: worldState.userId }

  // Nodes: one per world object, reusing the object's id.
  const worldRecord = worldState as unknown as Record<string, unknown>
  for (const [bucket, nodeType] of Object.entries(NODE_TYPE_BY_BUCKET)) {
    const objects = readArray<LegacyWorldObject>(worldRecord[bucket])
    for (const object of objects) {
      const nodeId = reuseWorldObjectNodeId(object.id)
      const nodeData = {
        nodeType,
        label: object.name ?? null,
        properties: toJson({ metadata: object.metadata }),
        knowledgeRefs: toJson(wikidataKnowledgeRefs(object)),
        ...scope,
      }
      const nodeExisted = (await prisma.graphNode.count({ where: { id: nodeId } })) > 0
      await prisma.graphNode.upsert({
        where: { id: nodeId },
        create: { id: nodeId, ...nodeData },
        update: nodeData,
      })
      nodeExisted ? (stats.updated += 1) : (stats.created += 1)

      // Type-assignment edges: object node -> assigned TypeDef.
      for (const assignment of object.typeAssignments ?? []) {
        const edgeId = deriveId(
          'edge:type-assignment',
          object.id,
          assignment.personaId,
          assignment.entityTypeId,
        )
        const edgeData = {
          source: requiredJson(localRef(object.id)),
          target: requiredJson(localRef(assignment.entityTypeId)),
          sourceLocalId: object.id,
          targetLocalId: assignment.entityTypeId,
          edgeType: 'type-assignment',
          confidence: assignment.confidence != null ? Math.round(assignment.confidence * 1000) : null,
          properties: toJson({ personaId: assignment.personaId }),
          ...scope,
        }
        const edgeExisted = (await prisma.graphEdge.count({ where: { id: edgeId } })) > 0
        await prisma.graphEdge.upsert({
          where: { id: edgeId },
          create: { id: edgeId, ...edgeData },
          update: edgeData,
        })
        edgeExisted ? (stats.updated += 1) : (stats.created += 1)
      }
    }
  }

  // Relation edges: one per world relation, reusing the relation id.
  const relations = readArray<LegacyWorldRelation>(worldRecord.relations)
  for (const relation of relations) {
    const edgeData = {
      source: requiredJson(localRef(relation.sourceId)),
      target: requiredJson(localRef(relation.targetId)),
      sourceLocalId: relation.sourceId,
      targetLocalId: relation.targetId,
      edgeType: relation.relationTypeId,
      label: relation.relationTypeId,
      properties: toJson({
        sourceType: relation.sourceType,
        targetType: relation.targetType,
        metadata: relation.metadata,
      }),
      ...scope,
    }
    const existed = (await prisma.graphEdge.count({ where: { id: relation.id } })) > 0
    await prisma.graphEdge.upsert({
      where: { id: relation.id },
      create: { id: relation.id, ...edgeData },
      update: edgeData,
    })
    existed ? (stats.updated += 1) : (stats.created += 1)
  }

  return stats
}

/**
 * Backfills a batch of world states, aggregating their tallies.
 *
 * @param prisma - the Prisma client
 * @param worldStates - the legacy WorldState rows
 * @returns the aggregate created/updated tally
 */
export async function backfillWorldStates(
  prisma: PrismaClient,
  worldStates: WorldState[],
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  for (const worldState of worldStates) {
    const step = await backfillWorldState(prisma, worldState)
    stats.created += step.created
    stats.updated += step.updated
  }
  return stats
}
