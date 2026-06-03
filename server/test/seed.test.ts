/**
 * Demo fixture-seeder tests. Cover:
 *   - 403 when X-Demo-Seed-Token is missing or wrong
 *   - 403 when target user is not an anonymous demo user (the leaked-
 *     token-wipes-real-user failure mode)
 *   - 404 when no bundle file exists for the tour id
 *   - 400 when the bundle is malformed (validation rejects before any
 *     write)
 *   - 200 on the happy path: a persona row is created, an ontology row
 *     is created, both linked to the anonymous user
 *   - idempotency: a second call leaves the same shape, not duplicates
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'

const VALID_TOKEN = 'this-token-is-exactly-thirty-two-chars-plus-some'

describe('demo fixture seeder', () => {
  const originalEnv = { ...process.env }
  let fixturesDir: string
  let anonUserId: string

  beforeAll(async () => {
    fixturesDir = await mkdtemp(join(tmpdir(), 'fovea-seed-test-'))
  })

  afterAll(async () => {
    await rm(fixturesDir, { recursive: true, force: true })
  })

  beforeEach(async () => {
    delete process.env.FOVEA_DEMO_MODE
    delete process.env.FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH
    delete process.env.FOVEA_DEMO_SEED_TOKEN
    delete process.env.FOVEA_DEMO_FIXTURES_DIR

    process.env.FOVEA_DEMO_MODE = 'true'
    process.env.FOVEA_DEMO_SEED_TOKEN = VALID_TOKEN
    process.env.FOVEA_DEMO_FIXTURES_DIR = fixturesDir

    // Create a fresh anonymous demo user for each test so seed-wipes
    // don't cross-contaminate.
    const user = await prisma.user.create({
      data: {
        username: `demo-anonymous-${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
        email: null,
        passwordHash: null,
        displayName: 'Demo visitor',
        isAdmin: false,
        systemRole: 'user',
      },
    })
    anonUserId = user.id
  })

  afterEach(async () => {
    // Cleanup is best-effort — the test runner reuses the dev DB.
    await prisma.user.deleteMany({ where: { id: anonUserId } }).catch(() => undefined)
    process.env = { ...originalEnv }
  })

  async function writeBundle(filename: string, body: unknown): Promise<void> {
    await writeFile(join(fixturesDir, filename), JSON.stringify(body), 'utf-8')
  }

  it('rejects requests with a missing token', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/demo/seed',
      payload: { tourId: 'no-such', sessionUserId: anonUserId },
    })
    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('rejects requests with a wrong token', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/demo/seed',
      headers: { 'x-demo-seed-token': 'not-the-token-not-the-token-not-the-tok' },
      payload: { tourId: 'no-such', sessionUserId: anonUserId },
    })
    expect(res.statusCode).toBe(403)
    await app.close()
  })

  it('refuses to seed a user that is not an anonymous demo user', async () => {
    // Make a "real" user (not `demo-anonymous-` prefixed) and confirm
    // the seeder won't touch them even with a valid token.
    const real = await prisma.user.create({
      data: {
        username: `real-user-${Date.now()}`,
        email: null,
        passwordHash: null,
        displayName: 'Real user',
        isAdmin: false,
        systemRole: 'user',
      },
    })
    try {
      const app = await buildApp()
      const res = await app.inject({
        method: 'POST',
        url: '/api/demo/seed',
        headers: { 'x-demo-seed-token': VALID_TOKEN },
        payload: { tourId: 'first-annotation', sessionUserId: real.id },
      })
      expect(res.statusCode).toBe(403)
      await app.close()
    } finally {
      await prisma.user.delete({ where: { id: real.id } })
    }
  })

  it('returns 404 when no bundle file exists for the tour', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/demo/seed',
      headers: { 'x-demo-seed-token': VALID_TOKEN },
      payload: { tourId: 'does-not-exist', sessionUserId: anonUserId },
    })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('returns 400 when the bundle is malformed', async () => {
    await writeBundle('tour-malformed.json', { tourId: 'malformed' /* no personas */ })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/demo/seed',
      headers: { 'x-demo-seed-token': VALID_TOKEN },
      payload: { tourId: 'malformed', sessionUserId: anonUserId },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('returns 400 when the bundle tourId does not match the request', async () => {
    await writeBundle('tour-mismatch.json', {
      tourId: 'something-else',
      personas: [{ name: 'A', role: 'r' }],
    })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/demo/seed',
      headers: { 'x-demo-seed-token': VALID_TOKEN },
      payload: { tourId: 'mismatch', sessionUserId: anonUserId },
    })
    expect(res.statusCode).toBe(400)
    await app.close()
  })

  it('seeds the persona and ontology, then idempotently reapplies', async () => {
    await writeBundle('tour-happy.json', {
      tourId: 'happy',
      personas: [
        { name: 'Happy Researcher', role: 'analyst', isDefault: true },
      ],
      ontology: {
        personaIndex: 0,
        entityTypes: [{ name: 'Person', gloss: 'An individual human.' }],
        eventTypes: [],
        roles: [],
        relationTypes: [],
      },
    })

    const app = await buildApp()

    // First seed — wipes nothing, creates the persona + ontology.
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/demo/seed',
      headers: { 'x-demo-seed-token': VALID_TOKEN },
      payload: { tourId: 'happy', sessionUserId: anonUserId },
    })
    expect(res1.statusCode).toBe(200)
    expect(res1.json().seeded).toContain('1 persona(s)')

    const personasAfter1 = await prisma.persona.findMany({ where: { userId: anonUserId } })
    expect(personasAfter1).toHaveLength(1)
    expect(personasAfter1[0].name).toBe('Happy Researcher')
    expect(personasAfter1[0].role).toBe('analyst')

    const ontoAfter1 = await prisma.ontology.findUnique({
      where: { personaId: personasAfter1[0].id },
    })
    expect(ontoAfter1).not.toBeNull()
    const entityTypes1 = (ontoAfter1!.entityTypes as Array<{ name: string }>) ?? []
    expect(entityTypes1).toHaveLength(1)
    expect(entityTypes1[0].name).toBe('Person')

    // Second seed — wipes + recreates. Same shape, different IDs.
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/demo/seed',
      headers: { 'x-demo-seed-token': VALID_TOKEN },
      payload: { tourId: 'happy', sessionUserId: anonUserId },
    })
    expect(res2.statusCode).toBe(200)

    const personasAfter2 = await prisma.persona.findMany({ where: { userId: anonUserId } })
    expect(personasAfter2).toHaveLength(1) // not 2
    expect(personasAfter2[0].id).not.toBe(personasAfter1[0].id) // recreated
    expect(personasAfter2[0].name).toBe('Happy Researcher')

    await app.close()
  })
})
