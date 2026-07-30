/**
 * The FOVEA world-collection surface as native `pub.layers.catalog` records.
 *
 * A world collection (an entity, event, or time collection) projects onto one
 * `pub.layers.catalog.collection` plus one `pub.layers.catalog.membership` per
 * member. This homes world collections on the first-class catalog vocabulary;
 * `clusterSet` is retained for coreference and video tracks. A collection's type
 * assignments and description gloss remain world `LayersAnnotation`s (the world
 * surface owns them); the catalog records carry only the collection identity, its
 * grouping-shape features, and the member links.
 *
 * The member-id -> `memberRef` regroup is a native, lawful `@panproto/core` lens
 * ({@link CATALOG_MEMBER_LENS_DOC}); {@link worldCollectionsToCatalog} owns the
 * multi-record framing (one collection plus its per-member memberships) and the
 * cross-record wiring by deterministic id, and a thin record<->row adapter maps
 * each record onto the `catalog_collections` / `catalog_memberships` tables.
 *
 * @module
 */

import { z } from 'zod'

import type {
  WorldStateAggregate,
  WorldLayersScope,
  MappedCatalogCollection,
  MappedCatalogMembership,
} from '../world-model.js'

// --------------------------------------------------------------------------
// The member regroup lens (source view-model + lens document)
// --------------------------------------------------------------------------

/**
 * The Zod schema for a collection's membership core — an array of flat member id
 * carriers the member regroup nests into per-item `objectRef` records under a
 * `memberRef`. The regroup anchors at the member item vertex; native and lawful in
 * both directions over the string leaf.
 */
export const catalogMemberSourceSchema = z.object({
  id: z.string(),
  members: z.array(z.object({ value: z.string() })),
})

/**
 * The member regroup: each flat member id carrier is nested into an `objectRef`
 * under `ref` at the member item vertex — the structural core of a catalog
 * `memberRef`. Native and lawful in both directions over the string leaf.
 */
export const CATALOG_MEMBER_LENS_DOC = {
  id: 'fovea.catalog.member.v1',
  source: 'fovea.catalog.member',
  target: 'pub.layers.catalog.membership',
  steps: [{ compute_field: { target: 'ref', expr: '{ localId = { value = value } }' } }],
} as const

/** The body vertex the member regroup binds to: each member array item. */
export const CATALOG_MEMBER_BODY_VERTEX = 'root.members:items'

// --------------------------------------------------------------------------
// Record + row shapes
// --------------------------------------------------------------------------

/** A single featureMap entry. */
interface FeatureEntry {
  key: string
  value: string
}

/** The catalog projection of a WorldState aggregate's collections. */
export interface WorldCatalogProjection {
  collections: MappedCatalogCollection[]
  memberships: MappedCatalogMembership[]
}

// --------------------------------------------------------------------------
// Small readers
// --------------------------------------------------------------------------

/** Reads a JSON value expected to hold an array, tolerating null/non-array. */
function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/** Reads a string field, returning null when absent or non-string. */
function stringField(object: Record<string, unknown>, key: string): string | null {
  const value = object[key]
  return typeof value === 'string' ? value : null
}

/** The catalog collection `kind` slug world groupings carry (an open-enum value). */
const WORLD_COLLECTION_KIND = 'custom'

/** The membership `role` world members carry. */
const MEMBER_ROLE = 'member'

/** The `memberType` a world member (a graph node) is referenced as. */
const MEMBER_TYPE_NODE = 'pub.layers.graph.graphNode'

/** Flat feature keys recording a collection's grouping shape. */
const KEY_BUCKET = 'bucket'
const KEY_MEMBER_FIELD = 'memberField'
const KEY_COLLECTION_TYPE = 'collectionType'

/** The deterministic membership id for a collection member at an ordinal. */
export function catalogMembershipId(collectionId: string, ordinal: number): string {
  return `${collectionId}::m::${ordinal}`
}

// --------------------------------------------------------------------------
// Composition (WorldState collections -> catalog records)
// --------------------------------------------------------------------------

const BUCKETS: Array<{ bucket: keyof WorldStateAggregate; candidates: string[] }> = [
  { bucket: 'entityCollections', candidates: ['entityIds', 'members'] },
  { bucket: 'eventCollections', candidates: ['eventIds', 'members'] },
  { bucket: 'timeCollections', candidates: ['times', 'members'] },
]

/**
 * Projects a WorldState aggregate's collections onto native catalog records: one
 * `catalog.collection` per collection (its identity, grouping-shape features, and
 * the open leftover of unconsumed fields) plus one `catalog.membership` per member
 * (its `memberRef` and ordinal), each wired to the collection by the collection id.
 *
 * @param world - the WorldState aggregate whose collections to project
 * @param scope - the scope columns every produced row carries
 * @param createdAt - the ISO timestamp the records carry (a write-time value)
 * @returns the catalog collections and memberships to persist
 */
export function worldCollectionsToCatalog(
  world: WorldStateAggregate,
  scope: WorldLayersScope,
  createdAt: string,
): WorldCatalogProjection {
  const collections: MappedCatalogCollection[] = []
  const memberships: MappedCatalogMembership[] = []

  for (const { bucket, candidates } of BUCKETS) {
    for (const collection of asArray(world[bucket])) {
      const id = stringField(collection, 'id')
      if (id === null) continue
      const name = stringField(collection, 'name') ?? id
      const memberField = candidates.find((f) => Array.isArray(collection[f])) ?? candidates[0]

      const memberIds =
        memberField === 'times'
          ? asArray(collection.times)
              .map((time) => stringField(time, 'id'))
              .filter((mid): mid is string => mid !== null)
          : (Array.isArray(collection[memberField]) ? (collection[memberField] as unknown[]) : []).filter(
              (mid): mid is string => typeof mid === 'string',
            )

      const entries: FeatureEntry[] = [
        { key: KEY_BUCKET, value: bucket },
        { key: KEY_MEMBER_FIELD, value: memberField },
      ]
      const collectionType = stringField(collection, 'collectionType')
      if (collectionType !== null) entries.push({ key: KEY_COLLECTION_TYPE, value: collectionType })
      const homed = new Set(['id', 'name', memberField, 'typeAssignments', 'description', 'collectionType'])
      for (const [key, value] of Object.entries(collection)) {
        if (!homed.has(key) && value !== undefined) entries.push({ key, value: JSON.stringify(value) })
      }

      collections.push({
        id,
        localId: id,
        name,
        kind: WORLD_COLLECTION_KIND,
        features: { entries },
        createdAt,
        projectId: scope.projectId,
        createdByUserId: scope.createdByUserId,
      })

      memberIds.forEach((memberId, ordinal) => {
        memberships.push({
          id: catalogMembershipId(id, ordinal),
          catalogRef: id,
          member: { ref: { localId: { value: memberId } }, memberType: MEMBER_TYPE_NODE },
          role: MEMBER_ROLE,
          ordinal,
          createdAt,
          projectId: scope.projectId,
          createdByUserId: scope.createdByUserId,
        })
      })
    }
  }

  return { collections, memberships }
}
