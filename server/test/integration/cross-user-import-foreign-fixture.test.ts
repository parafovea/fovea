/**
 * Cross-user import using a real foreign-annotator export.
 *
 * The fixture is a real Fovea export captured under a foreign annotator
 * (user id `eac1c15c-b85d-4e79-b7e5-171ca8d40866`). It carries four
 * personas, thirty-three world entities, forty-eight video summaries,
 * sixty claims, and fifty annotations spread across twenty-six videos.
 * It predates the `metadata.exporterUserId` provenance line, so the
 * cross-user detection falls back to the `persona.userId` heuristic and
 * regenerates every imported id. Annotation lines use the legacy
 * frontend shape (`annotationType`, `linkedEntityId`) rather than the
 * backend-shape (`type`, `label`, `linkType`).
 *
 * The test imports the full file into a freshly registered user and
 * walks the same API sequence the All Annotations panel and the Claims
 * panel walk in the browser:
 *
 *   GET /api/world
 *   GET /api/layers/videos/:videoId/annotations
 *   GET /api/videos/:videoId/summaries
 *   GET /api/summaries/:summaryId/claims
 *
 * For video `0a09067725832030` (four object annotations, two summaries,
 * each summary carrying claims) the test asserts:
 *
 *   1. Every object annotation row has a `label` that resolves to a
 *      named entity in the importer's `/api/world` response, so the
 *      All Annotations tab never renders a raw UUID where it should
 *      have rendered an entity name.
 *   2. No returned `claim.text` contains any of the five known fixture
 *      entity UUIDs that the exporter embedded as inline mentions, so
 *      the Claims tab never renders a stale exporter-side hex string
 *      inside the prose.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import FormData from 'form-data'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = resolve(__dirname, '../fixtures/cross-user-import-foreign-annotator.jsonl')

// Pick a video that has both annotations and a summary with claims.
// 0a09067725832030 has 4 annotations and 2 summaries; each summary has
// claims.
const VIDEO_ID = '0a09067725832030'

interface User {
  id: string
  username: string
  token: string
}

async function registerUser(app: FastifyInstance, username: string): Promise<User> {
  await app.prisma.user.create({
    data: {
      username,
      email: `${username}@example.com`,
      passwordHash: await hashPassword('password123'),
      displayName: username,
      isAdmin: false,
    },
  })
  const loginResp = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password: 'password123' },
  })
  expect(loginResp.statusCode).toBe(200)
  const cookie = loginResp.cookies.find(c => c.name === 'session_token')!
  const me = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    cookies: { session_token: cookie.value },
  })
  return {
    id: me.json().user.id,
    username,
    token: cookie.value,
  }
}

async function ensureAllVideos(app: FastifyInstance, fixturePath: string): Promise<void> {
  const lines = readFileSync(fixturePath, 'utf-8').trim().split('\n').map(l => JSON.parse(l))
  const videoIds = new Set<string>()
  for (const line of lines) {
    if (line.type === 'annotation' || line.type === 'summary') {
      videoIds.add(line.data.videoId)
    }
  }
  for (const id of videoIds) {
    const exists = await app.prisma.video.findUnique({ where: { id } })
    if (!exists) {
      await app.prisma.video.create({
        data: { id, filename: `${id}.mp4`, path: `/data/${id}.mp4` },
      })
    }
  }
}

async function importFixture(app: FastifyInstance, user: User, fixturePath: string): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const form = new FormData()
  form.append('file', readFileSync(fixturePath), {
    filename: 'cross-user-import-foreign-annotator.jsonl',
    contentType: 'application/x-jsonlines',
  })
  const response = await app.inject({
    method: 'POST',
    url: '/api/import',
    headers: form.getHeaders(),
    payload: form.getBuffer(),
    cookies: { session_token: user.token },
  })
  return { statusCode: response.statusCode, body: response.json() }
}

describe('cross-user import of a foreign-annotator fixture', () => {
  let app: FastifyInstance
  let prisma: PrismaClient

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Layers store (reverse-FK order): the fixture import materializes into
    // these tables, so clear them before the videos / personas / users they
    // reference are deleted.
    await prisma.textAnnotationRelation.deleteMany()
    await prisma.layersAnnotation.deleteMany()
    await prisma.annotationLayer.deleteMany()
    await prisma.tokenization.deleteMany()
    await prisma.segmentation.deleteMany()
    await prisma.corpusMembership.deleteMany()
    await prisma.corpus.deleteMany()
    await prisma.clusterSet.deleteMany()
    await prisma.alignment.deleteMany()
    await prisma.graphEdge.deleteMany()
    await prisma.graphNode.deleteMany()
    await prisma.typeDef.deleteMany()
    await prisma.layersOntology.deleteMany()
    await prisma.expression.deleteMany()
    await prisma.media.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.user.deleteMany()
    await ensureAllVideos(app, FIXTURE_PATH)
  })

  it('does NOT duplicate object annotations on the All Annotations endpoint', async () => {
    const importer = await registerUser(app, 'foreign-importer')
    const importResult = await importFixture(app, importer, FIXTURE_PATH)
    expect(importResult.statusCode).toBe(200)
    expect(importResult.body.success).toBe(true)

    // Walk the All Annotations tab path
    const annotationsResp = await app.inject({
      method: 'GET',
      url: `/api/layers/videos/${VIDEO_ID}/annotations`,
      cookies: { session_token: importer.token },
    })
    expect(annotationsResp.statusCode).toBe(200)
    const annotations = annotationsResp.json() as Array<{ id: string; label: string; linkType: string | null; type: string }>

    // Diagnostics
    console.log(`[cross-user-foreign] /api/layers/videos/${VIDEO_ID}/annotations returned ${annotations.length} rows`)
    for (const a of annotations) {
      console.log(`  - id=${a.id.slice(0, 8)} type=${a.type} linkType=${a.linkType} label=${a.label.slice(0, 8)}`)
    }

    // Fixture has 4 annotations on this video; result must have 4
    expect(annotations.length).toBe(4)

    // No duplicate ids
    const ids = annotations.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)

    // Every label must resolve to an entity in the importer's world
    const worldResp = await app.inject({
      method: 'GET',
      url: '/api/world',
      cookies: { session_token: importer.token },
    })
    expect(worldResp.statusCode).toBe(200)
    const world = worldResp.json() as { entities: Array<{ id: string; name: string }> }
    console.log(`[cross-user-foreign] /api/world returned ${world.entities.length} entities`)
    const entityIds = new Set(world.entities.map(e => e.id))
    const orphans = annotations.filter(a => !entityIds.has(a.label))
    if (orphans.length > 0) {
      console.log(`[cross-user-foreign] ORPHAN annotations (label not in world.entities):`)
      for (const o of orphans) {
        console.log(`  - id=${o.id.slice(0, 8)} label=${o.label.slice(0, 8)}`)
      }
    }
    expect(orphans).toEqual([])
  })

  it('returns claims through the Claims tab path', async () => {
    const importer = await registerUser(app, 'foreign-claims-importer')
    const importResult = await importFixture(app, importer, FIXTURE_PATH)
    expect(importResult.statusCode).toBe(200)
    expect(importResult.body.success).toBe(true)

    // Fetch summaries for the video
    const summariesResp = await app.inject({
      method: 'GET',
      url: `/api/videos/${VIDEO_ID}/summaries`,
      cookies: { session_token: importer.token },
    })
    expect(summariesResp.statusCode).toBe(200)
    const summaries = summariesResp.json() as Array<{ id: string }>
    expect(summaries.length).toBeGreaterThan(0)

    let totalClaims = 0
    const collectedClaims: Array<{ id: string; text: string }> = []
    for (const summary of summaries) {
      const claimsResp = await app.inject({
        method: 'GET',
        url: `/api/summaries/${summary.id}/claims`,
        cookies: { session_token: importer.token },
      })
      expect(claimsResp.statusCode).toBe(200)
      const claims = claimsResp.json() as Array<{ id: string; text: string }>
      totalClaims += claims.length
      collectedClaims.push(...claims)
    }
    expect(totalClaims).toBeGreaterThan(0)

    // The fixture's claim texts embed entity UUIDs as inline mentions
    // (e.g. "9ec21e61-... attempts to break gate"). After a cross-user
    // import, none of those original UUIDs should survive in the rendered
    // text — the inline UUIDs must be remapped to the regenerated entity
    // ids in the importer's world. Fixture UUIDs that should NOT appear:
    const ORIGINAL_ENTITY_UUIDS_IN_TEXTS = [
      '9ec21e61-3e3b-47e3-b8af-a7342b48d939',
      'ea5f996b-cffa-4e30-99ed-50384a47ff1d',
      '9cc9f799-8c32-4510-a131-484b3b628bf2',
      '209d9732-c7a1-4b70-92cb-fe510aad1191',
      '10d3a5e0-c2db-40d4-9e39-0334379f2b3b',
    ]
    for (const claim of collectedClaims) {
      for (const stale of ORIGINAL_ENTITY_UUIDS_IN_TEXTS) {
        expect(claim.text).not.toContain(stale)
      }
    }
  })
})
