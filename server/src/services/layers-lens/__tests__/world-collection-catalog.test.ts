import { describe, it, expect } from 'vitest'

import type { BuiltSchema } from '@panproto/core'

import type { WorldStateAggregate } from '../../world-model.js'
import { getPanproto, loadFoveaSchema, loadLayersSchema } from '../panproto-registry.js'
import {
  worldCollectionsToCatalog,
  catalogMemberSourceSchema,
  CATALOG_MEMBER_LENS_DOC,
  CATALOG_MEMBER_BODY_VERTEX,
} from '../world-collection-catalog.js'

/**
 * Verifies the FOVEA world-collection catalog surface: the member-id regroup is a
 * native, lawful lens whose `getJson` output carries the transform, and every
 * produced `catalog.collection` / `catalog.membership` record validates against
 * the vendored catalog lexicons (schema-validity, not oracle-parity — the catalog
 * shape deliberately replaces the collection clusterSet).
 */

const scope = { projectId: null, createdByUserId: 'user-1' }
const createdAt = '2024-03-15T12:00:00Z'

const world: WorldStateAggregate = {
  entities: [],
  events: [],
  times: [],
  relations: [],
  entityCollections: [
    {
      id: 'ec-people',
      name: 'People',
      description: [],
      entityIds: ['entity-alice', 'entity-hall'],
      collectionType: 'group',
      typeAssignments: [{ personaId: 'p-1', entityTypeId: 'et-group' }],
      aggregateProperties: { homogeneous: true, ordered: true },
    },
  ],
  eventCollections: [
    { id: 'evc-agenda', name: 'Agenda', description: [], eventIds: ['event-meeting'], collectionType: 'sequence', typeAssignments: [] },
  ],
  timeCollections: [
    { id: 'tc-day', name: 'Day', description: [], times: [{ id: 'time-noon', type: 'instant' }], collectionType: 'group' },
  ],
}

/** Validates a record against a layers schema, returning `{ isValid, errors }`. */
async function validate(schema: BuiltSchema, record: unknown): Promise<{ isValid: boolean; errors: string[] }> {
  const p = await getPanproto()
  const inst = p.parseJson(schema, JSON.stringify(record)) as unknown as {
    validate(): { isValid: boolean; errors: string[] }
  }
  return inst.validate()
}

describe('world-collection catalog surface', () => {
  it('regroups a member id into an objectRef via a native, both-laws lens whose getJson carries it', async () => {
    const p = await getPanproto()
    const src = await loadFoveaSchema(catalogMemberSourceSchema)
    const chain = p.compileLensDocument(CATALOG_MEMBER_LENS_DOC as never, CATALOG_MEMBER_BODY_VERTEX)
    const lens = chain.instantiate(src)

    const record = { id: 'ec-people', members: [{ value: 'entity-alice' }, { value: 'entity-hall' }] }
    const bytes = p.parseJson(src, JSON.stringify(record))._bytes
    expect(lens.checkGetPut(bytes).holds).toBe(true)
    expect(lens.checkPutGet(bytes).holds).toBe(true)
    expect(chain.requirements(src).kind).toBe('empty')

    const { view } = lens.getJson(record, 'root') as { view: { members: Array<{ ref: unknown }> } }
    expect(view.members[0].ref).toEqual({ localId: { value: 'entity-alice' } })
    expect(view.members[1].ref).toEqual({ localId: { value: 'entity-hall' } })
  })

  it('projects world collections onto schema-valid catalog.collection + catalog.membership records', async () => {
    const collectionSchema = await loadLayersSchema('catalog/collection.json', ['catalog/defs.json', 'defs.json'])
    const membershipSchema = await loadLayersSchema('catalog/membership.json', ['catalog/defs.json', 'defs.json'])

    const { collections, memberships } = worldCollectionsToCatalog(world, scope, createdAt)
    expect(collections.map((c) => c.id).sort()).toEqual(['ec-people', 'evc-agenda', 'tc-day'])
    expect(memberships.length).toBe(4) // 2 entities + 1 event + 1 time

    for (const c of collections) {
      const record = { localId: c.localId, name: c.name, kind: c.kind, features: c.features, createdAt: c.createdAt }
      const result = await validate(collectionSchema, record)
      expect(result.isValid, `collection ${c.id}: ${result.errors.join(', ')}`).toBe(true)
    }
    for (const m of memberships) {
      const record = { catalogRef: m.catalogRef, member: m.member, role: m.role, ordinal: m.ordinal, createdAt: m.createdAt }
      const result = await validate(membershipSchema, record)
      expect(result.isValid, `membership ${m.id}: ${result.errors.join(', ')}`).toBe(true)
    }

    // The validity check is meaningful: a collection missing its required `name` fails.
    expect((await validate(collectionSchema, { kind: 'custom', createdAt })).isValid).toBe(false)
  })

  it('wires each member as a memberRef by deterministic id and ordinal', () => {
    const { memberships } = worldCollectionsToCatalog(world, scope, createdAt)
    const people = memberships.filter((m) => m.catalogRef === 'ec-people')
    expect(people.map((m) => m.id)).toEqual(['ec-people::m::0', 'ec-people::m::1'])
    expect(people[0].member).toEqual({ ref: { localId: { value: 'entity-alice' } }, memberType: 'pub.layers.graph.graphNode' })
    expect(people.map((m) => m.ordinal)).toEqual([0, 1])
  })
})
