import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createRegularTestUser } from '../helpers/rbac-test-setup.js'

/**
 * World-state writes must merge by id, not replace: a PUT carrying a stale view
 * (e.g. a rapid second edit or a Wikidata import that never saw a concurrent
 * add) must not drop previously-added objects. Removal is therefore explicit —
 * the new per-object DELETE routes — since omission no longer removes.
 *
 * Against the unfixed (whole-array replace) code the merge assertions fail:
 * the second PUT would drop the first entity.
 */
describe('World-state merge-by-id and explicit deletes', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let session: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })
  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.loginAttempt.deleteMany()
    await prisma.worldState.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
    const user = await createRegularTestUser(prisma, { username: 'worlduser', email: 'world@example.com' })
    session = user.sessionToken
  })

  const putWorld = (body: object) =>
    app.inject({ method: 'PUT', url: '/api/world', cookies: { session_token: session }, payload: body })

  const getWorld = () =>
    app.inject({ method: 'GET', url: '/api/world', cookies: { session_token: session } })

  it('merges entities by id across sequential partial PUTs (no last-writer-wins)', async () => {
    expect((await putWorld({ entities: [{ id: 'e1', name: 'First' }] })).statusCode).toBe(200)
    // A second PUT that only carries e2 (a stale client that never saw e1) must
    // not drop e1 — the server merges by id.
    expect((await putWorld({ entities: [{ id: 'e2', name: 'Second' }] })).statusCode).toBe(200)

    const entities = (await getWorld()).json().entities as Array<{ id: string }>
    expect(entities.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
  })

  it('updates an existing entity in place on merge (same id overwrites)', async () => {
    await putWorld({ entities: [{ id: 'e1', name: 'Original' }] })
    await putWorld({ entities: [{ id: 'e1', name: 'Renamed' }] })
    const entities = (await getWorld()).json().entities as Array<{ id: string; name: string }>
    expect(entities).toHaveLength(1)
    expect(entities[0].name).toBe('Renamed')
  })

  it('removes a relation via DELETE (and a merge PUT does not resurrect it)', async () => {
    await putWorld({ relations: [{ id: 'r1', type: 'related' }, { id: 'r2', type: 'related' }] })

    // A PUT omitting r1 must NOT remove it (merge keeps it)...
    await putWorld({ relations: [{ id: 'r2', type: 'related' }] })
    let relations = (await getWorld()).json().relations as Array<{ id: string }>
    expect(relations.map((r) => r.id).sort()).toEqual(['r1', 'r2'])

    // ...explicit DELETE removes it.
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/world/relations/r1',
      cookies: { session_token: session },
    })
    expect(del.statusCode).toBe(200)
    relations = (await getWorld()).json().relations as Array<{ id: string }>
    expect(relations.map((r) => r.id)).toEqual(['r2'])
  })

  it('removes an entity collection via DELETE', async () => {
    await putWorld({ entityCollections: [{ id: 'c1', name: 'Coll' }] })
    const del = await app.inject({
      method: 'DELETE',
      url: '/api/world/entity-collections/c1',
      cookies: { session_token: session },
    })
    expect(del.statusCode).toBe(200)
    const collections = (await getWorld()).json().entityCollections as Array<{ id: string }>
    expect(collections).toHaveLength(0)
  })
})
