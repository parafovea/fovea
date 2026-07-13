import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { seedBaselinePermissions } from '../helpers/rbac-test-setup.js'
import { seedOntology } from '../helpers/seed-layers.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the batch lookup endpoints that collapse the
 * VideoBrowser's initial-load fan-out into single requests:
 *
 *   POST /api/personas/ontologies      { personaIds }       -> ontology[]
 *   POST /api/videos/summaries/lookup  { videoIds, personaId } -> summary[]
 *
 * Both return sparse results (missing / unreadable rows are omitted) and carry
 * the indexing id (personaId / videoId) on every row.
 */
describe('Batch lookup endpoints', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let userAId: string
  let userBId: string
  let sessionA: string
  let personaA1: string
  let personaA2: string
  let personaB1: string
  let videoIds: string[]

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  async function makeUser(username: string): Promise<string> {
    const passwordHash = await hashPassword('testpass123')
    const user = await prisma.user.create({
      data: {
        username,
        email: `${username}@example.com`,
        passwordHash,
        displayName: username,
        isAdmin: false,
      },
    })
    return user.id
  }

  async function login(username: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password: 'testpass123' },
    })
    return res.cookies.find((c) => c.name === 'session_token')!.value
  }

  async function makePersonaWithOntology(name: string, userId: string): Promise<string> {
    const persona = await prisma.persona.create({
      data: {
        name,
        role: 'Analyst',
        informationNeed: 'Analyzing',
        userId,
      },
    })
    await seedOntology(prisma, {
      data: {
        personaId: persona.id,
        entityTypes: [{ id: 'et-1', name: `${name} entity` }],
        roleTypes: [],
        eventTypes: [],
        relationTypes: [],
      },
    })
    return persona.id
  }

  beforeEach(async () => {
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    // Layers store (reverse-FK order): persona ontologies seed the layers
    // ontology tables, so clear them before the personas they reference.
    await prisma.layersAnnotation.deleteMany()
    await prisma.annotationLayer.deleteMany()
    await prisma.graphEdge.deleteMany()
    await prisma.graphNode.deleteMany()
    await prisma.typeDef.deleteMany()
    await prisma.layersOntology.deleteMany()
    await prisma.expression.deleteMany()
    await prisma.media.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.video.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()
    await prisma.rolePermission.deleteMany()
    await seedBaselinePermissions(prisma)

    userAId = await makeUser('usera')
    userBId = await makeUser('userb')
    sessionA = await login('usera')

    personaA1 = await makePersonaWithOntology('A1', userAId)
    personaA2 = await makePersonaWithOntology('A2', userAId)
    personaB1 = await makePersonaWithOntology('B1', userBId)

    videoIds = []
    for (let i = 0; i < 3; i++) {
      const video = await prisma.video.create({
        data: {
          id: `vid-${i}`,
          filename: `vid-${i}.mp4`,
          path: `/data/vid-${i}.mp4`,
          duration: 60,
          frameRate: 30,
        },
      })
      videoIds.push(video.id)
    }

    // Summaries exist for (vid-0, A1) and (vid-1, A1); vid-2 has none.
    for (const videoId of [videoIds[0], videoIds[1]]) {
      await prisma.videoSummary.create({
        data: {
          videoId,
          personaId: personaA1,
          summary: [{ type: 'text', content: `summary for ${videoId}` }],
          createdBy: userAId,
        },
      })
    }
  })

  describe('POST /api/personas/ontologies', () => {
    it('returns ontologies for the caller-owned personas in one request, keyed by personaId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/personas/ontologies',
        cookies: { session_token: sessionA },
        payload: { personaIds: [personaA1, personaA2] },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json() as Array<{ personaId: string; entities: unknown[] }>
      expect(body).toHaveLength(2)
      const ids = body.map((o) => o.personaId).sort()
      expect(ids).toEqual([personaA1, personaA2].sort())
      // Each row carries the ontology payload.
      expect(Array.isArray(body[0].entities)).toBe(true)
    })

    it('omits ids that do not exist and personas without an ontology (sparse)', async () => {
      // A persona that has no ontology row must not appear in the result, and
      // an unknown id is silently dropped — the same omission semantics the
      // single GET /api/personas/:id/ontology would produce (404).
      const personaNoOntology = await prisma.persona.create({
        data: { name: 'NoOnt', role: 'Analyst', informationNeed: 'x', userId: userAId },
      })

      const res = await app.inject({
        method: 'POST',
        url: '/api/personas/ontologies',
        cookies: { session_token: sessionA },
        payload: {
          personaIds: [
            personaA1,
            personaNoOntology.id,
            '00000000-0000-0000-0000-000000000000',
          ],
        },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json() as Array<{ personaId: string }>
      expect(body).toHaveLength(1)
      expect(body[0].personaId).toBe(personaA1)
    })

    it('returns an empty array for an empty personaIds list', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/personas/ontologies',
        cookies: { session_token: sessionA },
        payload: { personaIds: [] },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })
  })

  describe('POST /api/videos/summaries/lookup', () => {
    it('returns only the videos that have a summary for the persona (sparse), keyed by videoId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/videos/summaries/lookup',
        cookies: { session_token: sessionA },
        payload: { videoIds, personaId: personaA1 },
      })

      expect(res.statusCode).toBe(200)
      const body = res.json() as Array<{ videoId: string }>
      expect(body).toHaveLength(2)
      const ids = body.map((s) => s.videoId).sort()
      expect(ids).toEqual([videoIds[0], videoIds[1]].sort())
      // vid-2 had no summary and is absent.
      expect(ids).not.toContain(videoIds[2])
    })

    it('requires authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/videos/summaries/lookup',
        payload: { videoIds, personaId: personaA1 },
      })
      expect(res.statusCode).toBe(401)
    })

    it('returns an empty array for an empty videoIds list', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/videos/summaries/lookup',
        cookies: { session_token: sessionA },
        payload: { videoIds: [], personaId: personaA1 },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('does not return another user\'s summaries', async () => {
      // userB has no summaries; looking them up under B's persona yields none
      // even though the videos exist.
      const sessionB = await login('userb')
      const res = await app.inject({
        method: 'POST',
        url: '/api/videos/summaries/lookup',
        cookies: { session_token: sessionB },
        payload: { videoIds, personaId: personaB1 },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })
  })
})
