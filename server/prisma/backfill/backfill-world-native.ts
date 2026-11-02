/**
 * One-shot backfill from the legacy world sidecar to the native layers
 * representation.
 *
 * Before the native re-model, every world object was stashed verbatim under
 * `GraphNode.properties.foveaWorld.object` (relations under
 * `GraphEdge.properties.foveaWorld.object`), and the columns beside it held only
 * a partial projection. This script reconstructs each scope's aggregate from
 * those stashes and reprojects it through the current mapper so the native rows
 * become authoritative:
 *
 *   - entities/locations/events/times become GraphNodes (label + knowledgeRefs +
 *     flat feature scalars), their type assignments instance-of GraphEdges, their
 *     interpretations/coordinates/calendar values world-denoting LayersAnnotations;
 *   - entity/event/time collections become ClusterSets (membership = cluster
 *     members), no longer GraphNodes;
 *   - relations become GraphEdges tagged with the `fovea.edgeRole` feature.
 *
 * The legacy `foveaWorld` marker rows (the old object nodes, the old collection
 * nodes, and the old relation edges) are deleted, so the store carries no stash.
 *
 * Idempotent: a re-run finds no `foveaWorld` stash to migrate. Reversible in
 * spirit — it rewrites rows the write path already recomputes on the next save.
 *
 * Run (against a configured DATABASE_URL) with tsx, e.g.
 * `tsx prisma/backfill/backfill-world-native.ts`. This script is not wired into
 * `prisma migrate`; run it once after deploying the re-model, and after the
 * ontology backfill.
 *
 * @module
 */

import { PrismaClient } from '@prisma/client'

import {
  worldStateToLayers,
  emptyWorldState,
  type WorldStateAggregate,
} from '../../src/services/world-layers-mapper.js'
import { createWorldProjection } from '../../src/services/layers-bridge/world-store.js'

/** The marker key a legacy world-owned row carried in its `properties`. */
const WORLD_MARKER = 'foveaWorld'

/** The bucket buckets a legacy stash placed its object into. */
const BUCKET_KEYS: (keyof WorldStateAggregate)[] = [
  'entities',
  'events',
  'times',
  'entityCollections',
  'eventCollections',
  'timeCollections',
  'relations',
]

/** The legacy stash a world row carried under `properties.foveaWorld`. */
interface WorldStash {
  bucket: keyof WorldStateAggregate
  index: number
  object: unknown
}

/** Extracts the legacy world stash from a row's `properties`, or null. */
function readStash(properties: unknown): WorldStash | null {
  if (properties === null || typeof properties !== 'object') return null
  const marker = (properties as Record<string, unknown>)[WORLD_MARKER]
  if (marker === null || typeof marker !== 'object') return null
  const record = marker as Record<string, unknown>
  const bucket = record.bucket
  if (typeof bucket !== 'string' || !BUCKET_KEYS.includes(bucket as keyof WorldStateAggregate)) return null
  if (typeof record.index !== 'number') return null
  return { bucket: bucket as keyof WorldStateAggregate, index: record.index, object: record.object }
}

/** A row's scope key, so each aggregate reconstructs from one scope's stashes. */
function scopeKey(row: { createdByUserId: string | null; projectId: string | null }): string {
  return `${row.createdByUserId ?? ''}::${row.projectId ?? ''}`
}

/**
 * Backfills every scope whose world rows still carry the legacy stash.
 *
 * @param prisma - the Prisma client
 * @returns the number of legacy world rows migrated
 */
export async function backfillWorldNative(prisma: PrismaClient): Promise<number> {
  const nodes = await prisma.graphNode.findMany({})
  const edges = await prisma.graphEdge.findMany({})

  const markedNodes = nodes.filter((n) => readStash(n.properties) !== null)
  const markedEdges = edges.filter((e) => readStash(e.properties) !== null)
  if (markedNodes.length === 0 && markedEdges.length === 0) return 0

  const scopes = new Set<string>()
  const scopeOf = new Map<string, { createdByUserId: string | null; projectId: string | null }>()
  const register = (row: { createdByUserId: string | null; projectId: string | null }): string => {
    const key = scopeKey(row)
    scopes.add(key)
    if (!scopeOf.has(key)) scopeOf.set(key, { createdByUserId: row.createdByUserId, projectId: row.projectId })
    return key
  }
  for (const node of markedNodes) register(node)
  for (const edge of markedEdges) register(edge)

  let migrated = 0
  for (const key of scopes) {
    const scope = scopeOf.get(key)!
    const scopeNodes = markedNodes.filter((n) => scopeKey(n) === key)
    const scopeEdges = markedEdges.filter((e) => scopeKey(e) === key)

    // Reconstruct the legacy aggregate from the stashes, preserving array order.
    const staged: Record<string, Array<{ index: number; object: unknown }>> = {}
    for (const bucket of BUCKET_KEYS) staged[bucket] = []
    for (const row of [...scopeNodes, ...scopeEdges]) {
      const stash = readStash(row.properties)
      if (!stash) continue
      staged[stash.bucket].push({ index: stash.index, object: stash.object })
    }
    const aggregate = emptyWorldState()
    for (const bucket of BUCKET_KEYS) {
      aggregate[bucket] = staged[bucket].sort((a, b) => a.index - b.index).map((entry) => entry.object)
    }

    const projection = worldStateToLayers(aggregate, scope)

    // Delete the legacy marker rows first: the reprojected entity/event/time nodes
    // reuse their ids, so the old rows must go before the native ones are created.
    await prisma.graphEdge.deleteMany({ where: { id: { in: scopeEdges.map((e) => e.id) } } })
    await prisma.graphNode.deleteMany({ where: { id: { in: scopeNodes.map((n) => n.id) } } })

    await createWorldProjection(prisma, projection)
    migrated += scopeNodes.length + scopeEdges.length
  }

  return migrated
}

/** Runs the backfill against the configured DATABASE_URL. */
async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    const migrated = await backfillWorldNative(prisma)
    process.stdout.write(`Backfilled ${migrated} legacy world rows to the native representation.\n`)
  } finally {
    await prisma.$disconnect()
  }
}

// Run when executed directly; skip when imported by tests (which set VITEST /
// NODE_ENV=test), mirroring prisma/seed.ts and the ontology backfill.
const isTestEnvironment = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
if (!isTestEnvironment) {
  main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`)
    process.exitCode = 1
  })
}
