/**
 * Bidirectional conversion between the WorldState aggregate the `/api/world`
 * contract exchanges and the layers graph (GraphNode + GraphEdge).
 *
 * The forward direction (`worldStateToLayers`) mirrors the backfill in
 * `prisma/backfill/backfill-world.ts`: each world object becomes a GraphNode
 * reusing its own id (entities to entity nodes, events to situation nodes, times
 * to time nodes), and each relation becomes a GraphEdge reusing the relation id
 * with `source`/`target` objectRefs pointing at the incident nodes. It adds two
 * things the backfill omits, both required for a lossless inverse:
 *
 *   1. Collections (entity/event/time) become nodes too, under the collection
 *      node types, so the aggregate's collection buckets survive the round trip.
 *   2. Every produced node and edge carries the complete original object under
 *      `properties.foveaWorld.object`, alongside a `bucket` marker and a
 *      stable `index`. The reverse direction (`layersToWorldState`) reconstructs
 *      each bucket purely from those stashes, so the aggregate that comes back is
 *      identical to the one that went in.
 *
 * The backfill's type-assignment edges are intentionally not emitted here: a
 * world save persists no ontology, so those edges would point at TypeDef ids the
 * world route never writes. Each object's type assignments round-trip inside its
 * node stash instead.
 *
 * @module
 */

import type { GraphNode as PrismaGraphNode, GraphEdge as PrismaGraphEdge } from '@prisma/client'

import type { ObjectRef } from '@fovea/layers-schema'

import { deriveId } from './layers-id-map.js'

/**
 * The WorldState aggregate exchanged by the `/api/world` contract: the six
 * object/collection buckets plus the relation instances. Every element is an
 * opaque JSON object; the mapper preserves each verbatim.
 */
export interface WorldStateAggregate {
  entities: unknown[]
  events: unknown[]
  times: unknown[]
  entityCollections: unknown[]
  eventCollections: unknown[]
  timeCollections: unknown[]
  relations: unknown[]
}

/** An empty aggregate with every bucket present. */
export function emptyWorldState(): WorldStateAggregate {
  return {
    entities: [],
    events: [],
    times: [],
    entityCollections: [],
    eventCollections: [],
    timeCollections: [],
    relations: [],
  }
}

/** The scope columns every produced row carries. */
export interface WorldLayersScope {
  projectId: string | null
  createdByUserId: string | null
}

/** A GraphNode create payload the world save persists. */
export interface MappedWorldNode {
  id: string
  nodeType: string
  label: string | null
  properties: unknown
  knowledgeRefs: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** A GraphEdge create payload the world save persists. */
export interface MappedWorldEdge {
  id: string
  source: ObjectRef
  target: ObjectRef
  sourceLocalId: string | null
  targetLocalId: string | null
  edgeType: string
  label: string | null
  properties: unknown
  projectId: string | null
  createdByUserId: string | null
}

/** The nodes and edges a WorldState aggregate projects to. */
export interface WorldLayersProjection {
  nodes: MappedWorldNode[]
  edges: MappedWorldEdge[]
}

/** The five object buckets that project to nodes, with their layers node type. */
const NODE_BUCKETS = [
  ['entities', 'entity'],
  ['events', 'situation'],
  ['times', 'time'],
  ['entityCollections', 'entity-collection'],
  ['eventCollections', 'event-collection'],
  ['timeCollections', 'time-collection'],
] as const

type NodeBucket = (typeof NODE_BUCKETS)[number][0]

/** The marker key stamped into `properties` for every world-owned row. */
export const WORLD_MARKER = 'foveaWorld'

/** Reads a JSON column expected to hold an array, tolerating null/non-array. */
function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/** Builds an ObjectRef pointing at a same-record object by id. */
function localRef(id: string): ObjectRef {
  return { localId: { value: id } }
}

/** Builds a Wikidata knowledge reference for a world object, or null. */
function wikidataKnowledgeRefs(object: Record<string, unknown>): unknown {
  const wikidataId = object.wikidataId
  if (typeof wikidataId !== 'string' || wikidataId.length === 0) return null
  return [{ identifier: wikidataId, source: 'wikidata' }]
}

/** Reads a string field, returning null when absent or non-string. */
function stringField(object: Record<string, unknown>, key: string): string | null {
  const value = object[key]
  return typeof value === 'string' ? value : null
}

/**
 * Projects a WorldState aggregate onto graph nodes and edges.
 *
 * @param world - the WorldState aggregate to project
 * @param scope - the scope columns every produced row carries
 * @returns the nodes and edges to persist
 */
export function worldStateToLayers(
  world: WorldStateAggregate,
  scope: WorldLayersScope,
): WorldLayersProjection {
  const nodes: MappedWorldNode[] = []
  const edges: MappedWorldEdge[] = []

  for (const [bucket, nodeType] of NODE_BUCKETS) {
    const objects = asArray(world[bucket])
    objects.forEach((object, index) => {
      const id = stringField(object, 'id')
      if (id === null) return
      nodes.push({
        id,
        nodeType,
        label: stringField(object, 'name') ?? stringField(object, 'label'),
        properties: { [WORLD_MARKER]: { bucket, index, object } },
        knowledgeRefs: wikidataKnowledgeRefs(object),
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      })
    })
  }

  const relations = asArray(world.relations)
  relations.forEach((relation, index) => {
    const id = stringField(relation, 'id')
    if (id === null) return
    const sourceId = stringField(relation, 'sourceId') ?? ''
    const targetId = stringField(relation, 'targetId') ?? ''
    const edgeType =
      stringField(relation, 'relationTypeId') ?? stringField(relation, 'relationType') ?? 'related'
    edges.push({
      id,
      source: localRef(sourceId),
      target: localRef(targetId),
      sourceLocalId: sourceId || null,
      targetLocalId: targetId || null,
      edgeType,
      label: edgeType,
      properties: {
        [WORLD_MARKER]: { bucket: 'relations', index, object: relation },
        sourceType: stringField(relation, 'sourceType'),
        targetType: stringField(relation, 'targetType'),
        metadata: relation.metadata ?? null,
      },
      projectId: scope.projectId,
      createdByUserId: scope.createdByUserId,
    })
  })

  return { nodes, edges }
}

/** The stash a world-owned row carries under `properties.foveaWorld`. */
interface WorldStash {
  bucket: string
  index: number
  object: unknown
}

/** Extracts the world stash from a row's `properties`, or null when absent. */
export function readWorldStash(properties: unknown): WorldStash | null {
  if (properties === null || typeof properties !== 'object') return null
  const marker = (properties as Record<string, unknown>)[WORLD_MARKER]
  if (marker === null || typeof marker !== 'object') return null
  const record = marker as Record<string, unknown>
  if (typeof record.bucket !== 'string' || typeof record.index !== 'number') return null
  return { bucket: record.bucket, index: record.index, object: record.object }
}

/** True when a graph node/edge row belongs to a world save. */
export function isWorldRow(row: { properties: unknown }): boolean {
  return readWorldStash(row.properties) !== null
}

/**
 * Reconstructs the WorldState aggregate from its graph nodes and edges.
 *
 * Only rows carrying the world marker contribute; each is placed into its
 * bucket at its stashed index so array order is preserved. Rows without the
 * marker (claims, ontology-derived nodes, and so on) are ignored.
 *
 * @param nodes - the graph nodes in the world scope
 * @param edges - the graph edges in the world scope
 * @returns the reconstructed WorldState aggregate
 */
export function layersToWorldState(
  nodes: Pick<PrismaGraphNode, 'properties'>[],
  edges: Pick<PrismaGraphEdge, 'properties'>[],
): WorldStateAggregate {
  const aggregate = emptyWorldState()
  const indexed: Record<string, Array<{ index: number; object: unknown }>> = {
    entities: [],
    events: [],
    times: [],
    entityCollections: [],
    eventCollections: [],
    timeCollections: [],
    relations: [],
  }

  const collect = (rows: { properties: unknown }[]): void => {
    for (const row of rows) {
      const stash = readWorldStash(row.properties)
      if (!stash) continue
      const bucket = indexed[stash.bucket]
      if (!bucket) continue
      bucket.push({ index: stash.index, object: stash.object })
    }
  }

  collect(nodes)
  collect(edges)

  for (const bucket of Object.keys(indexed) as (keyof WorldStateAggregate)[]) {
    aggregate[bucket] = indexed[bucket]
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.object)
  }

  return aggregate
}

/**
 * The synthetic WorldState id the `/api/world` response reports for a user.
 *
 * The layers store keys world objects by scope rather than by a single
 * WorldState row, so the aggregate has no natural id. A deterministic uuid keeps
 * the response's `id` stable across reads without persisting a placeholder row.
 *
 * @param userId - the owning user's id
 * @returns a deterministic uuid for the user's personal world state
 */
export function personalWorldStateId(userId: string): string {
  return deriveId('worldstate:user', userId)
}

/**
 * The synthetic WorldState id the project world-state contract reports for a
 * (user, project) pair. As with {@link personalWorldStateId}, the layers store
 * keys world objects by scope rather than by a single row, so a deterministic
 * uuid keeps the response's `id` stable across reads.
 *
 * @param userId - the owning user's id
 * @param projectId - the project the world is scoped to
 * @returns a deterministic uuid for the project-scoped world state
 */
export function projectWorldStateId(userId: string, projectId: string): string {
  return deriveId('worldstate:project', userId, projectId)
}

/** The node buckets exposed for callers that enumerate world node types. */
export function worldNodeType(bucket: NodeBucket): string {
  const found = NODE_BUCKETS.find(([name]) => name === bucket)
  if (!found) throw new Error(`Unknown world node bucket: ${bucket}`)
  return found[1]
}
