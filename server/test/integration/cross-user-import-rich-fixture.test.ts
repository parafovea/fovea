/**
 * Cross-user import of a rich real-world export.
 *
 * The fixture (`cross-user-import-rich-export.jsonl`) is one of the seven
 * annotator exports uploaded to issue #121
 * (https://github.com/user-attachments/files/27133084/only-annotator-exports.zip),
 * captured at HLTCOE from a single exporter user
 * (`05b32c0e-2dda-4855-b513-1b2a759bac93`). It is structurally far richer
 * than the single-persona `cross-user-import-real-export.jsonl` fixture:
 *
 *   - 20 personas
 *   - 20 ontologies (one per persona)
 *   - 79 entities
 *   - 136 summaries (across ~96 distinct videos)
 *   - 621 claims
 *   - 9 object annotations
 *
 * Issue #100 (reopened) reports that after a cross-user import the "Edit
 * Video Summary" dialog displays `Persona <uuid> not found` and the
 * devtools network panel shows 404s on `/api/personas/:id` and on
 * `/api/summaries/:id/claims`. That surface implies a summary row whose
 * `personaId` still references the exporter-side uuid (i.e. the cross-user
 * remap left it pinned to the foreign id) or a claim whose summaryId
 * still points at the foreign summary. The single-persona fixture is too
 * thin to exercise this — every persona reference there ends up in the
 * same idMap entry. With 20 personas and 136 summaries the substitution
 * has to handle many concurrent remappings without crosstalk, and a
 * regression that leaves any single summary.personaId / claim.summaryId /
 * annotation.personaId pinned to its original exporter-side value will
 * surface here.
 *
 * The test imports the fixture into a fresh user and asserts:
 *
 *   1. Every imported summary's `personaId` dereferences via
 *      `GET /api/personas/:id` to a 200 (the exact endpoint in the
 *      screenshot — a 404 here is the user-visible bug).
 *   2. The dereferenced persona is owned by the importer (cross-checked
 *      against `GET /api/personas`).
 *   3. Every imported summary's `personaId` is NOT one of the original
 *      exporter-side persona ids carried by the fixture (i.e. the remap
 *      actually rewrote it).
 *   4. Every imported claim's `summaryId` resolves to a summary owned by
 *      the importer (the second 404 surface in the screenshot — claims
 *      pointing at the foreign summary id).
 *   5. Every imported annotation's `personaId`, when non-null, dereferences.
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
const FIXTURE_PATH = resolve(__dirname, '../fixtures/cross-user-import-rich-export.jsonl')

interface User {
  userId: string
  sessionToken: string
}

interface FixtureLine {
  type: string
  data: { id?: string; videoId?: string; personaId?: string | null; summaryId?: string }
}

describe('cross-user import of a rich real-world export (regression for #100)', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let fixtureBytes: Buffer
  let fixtureLines: FixtureLine[]
  let originalPersonaIds: Set<string>
  let originalVideoIds: Set<string>

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
    fixtureBytes = readFileSync(FIXTURE_PATH)
    fixtureLines = fixtureBytes
      .toString('utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l) as FixtureLine)
    originalPersonaIds = new Set(
      fixtureLines.filter(l => l.type === 'persona' && l.data.id).map(l => l.data.id as string),
    )
    originalVideoIds = new Set(
      fixtureLines
        .filter(l => (l.type === 'summary' || l.type === 'annotation') && l.data.videoId)
        .map(l => l.data.videoId as string),
    )
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.loginAttempt.deleteMany()
    await prisma.importHistory.deleteMany()
    await prisma.claimRelation.deleteMany()
    await prisma.claim.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.worldState.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.apiKey.deleteMany()
    await prisma.user.deleteMany()

    // Seed every video id the fixture references; the import otherwise
    // rejects summaries / annotations on missing-dependency.
    await prisma.video.createMany({
      data: Array.from(originalVideoIds).map(id => ({
        id,
        filename: `${id}.mp4`,
        path: `/v/${id}.mp4`,
        duration: 30,
      })),
    })
  })

  async function registerAndLogin(username: string, password: string): Promise<User> {
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        username,
        email: `${username}@example.com`,
        passwordHash,
        displayName: username,
        isAdmin: false,
      },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password },
    })
    const token = login.cookies.find(c => c.name === 'session_token')!.value
    return { userId: user.id, sessionToken: token }
  }

  async function importFixture(user: User): Promise<void> {
    const form = new FormData()
    form.append('file', fixtureBytes, {
      filename: 'cross-user-import-rich-export.jsonl',
      contentType: 'application/x-ndjson',
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/import',
      cookies: { session_token: user.sessionToken },
      headers: form.getHeaders(),
      payload: form.getBuffer(),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { success: boolean; errors?: unknown[]; warnings?: unknown[] }
    if (!body.success) {
      console.error('Import failed', JSON.stringify(body, null, 2).slice(0, 4000))
    }
    expect(body.success).toBe(true)
  }

  it('every imported summary, claim, and annotation resolves its references on the importer side', async () => {
    const A = await registerAndLogin('userA', 'passA12345')
    await importFixture(A)

    // === Walk every persona the importer now owns. ===
    const personasRes = await app.inject({
      method: 'GET',
      url: '/api/personas',
      cookies: { session_token: A.sessionToken },
    })
    expect(personasRes.statusCode).toBe(200)
    const personas = personasRes.json() as Array<{ id: string }>
    const personaIds = new Set(personas.map(p => p.id))
    expect(personas.length, 'importer should own every persona the fixture carries').toBe(originalPersonaIds.size)
    // None of the importer's persona ids should equal the exporter's.
    for (const pid of personaIds) {
      expect(originalPersonaIds.has(pid), `persona id ${pid} must have been regenerated, not preserved`).toBe(false)
    }

    // === Walk every summary and assert summary.personaId dereferences. ===
    const summaryVideoIds = new Set(
      fixtureLines.filter(l => l.type === 'summary' && l.data.videoId).map(l => l.data.videoId as string),
    )
    let summaryCount = 0
    const importerSummaryIds = new Set<string>()
    for (const videoId of summaryVideoIds) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/videos/${videoId}/summaries`,
        cookies: { session_token: A.sessionToken },
      })
      expect(res.statusCode, `GET /api/videos/${videoId}/summaries should 200`).toBe(200)
      const summaries = res.json() as Array<{ id: string; personaId: string }>
      for (const s of summaries) {
        summaryCount++
        importerSummaryIds.add(s.id)
        // The exact failing surface from the #100 screenshot:
        const pRes = await app.inject({
          method: 'GET',
          url: `/api/personas/${s.personaId}`,
          cookies: { session_token: A.sessionToken },
        })
        expect(
          pRes.statusCode,
          `summary ${s.id} on video ${videoId} references personaId ${s.personaId}; ` +
            `GET /api/personas/${s.personaId} must 200 — a 404 here is the user-visible ` +
            `"Persona <uuid> not found" banner in the Edit Video Summary dialog`,
        ).toBe(200)
        expect(
          personaIds.has(s.personaId),
          `summary.personaId ${s.personaId} must point at one of the importer's own personas`,
        ).toBe(true)
        expect(
          originalPersonaIds.has(s.personaId),
          `summary.personaId ${s.personaId} must have been remapped off the foreign exporter-side id`,
        ).toBe(false)
      }
    }
    expect(summaryCount, 'importer should see every summary the fixture carries').toBe(
      fixtureLines.filter(l => l.type === 'summary').length,
    )

    // === Walk every claim and assert claim.summaryId resolves. ===
    let claimCount = 0
    for (const summaryId of importerSummaryIds) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/summaries/${summaryId}/claims`,
        cookies: { session_token: A.sessionToken },
      })
      expect(
        res.statusCode,
        `GET /api/summaries/${summaryId}/claims must 200 — a 404 here is the second failure ` +
          `mode in the #100 screenshot (claims pointing at the foreign summary id)`,
      ).toBe(200)
      const claims = res.json() as Array<{ id: string; summaryId: string }>
      for (const c of claims) {
        claimCount++
        expect(c.summaryId).toBe(summaryId)
      }
    }
    expect(claimCount, 'importer should see every claim the fixture carries').toBe(
      fixtureLines.filter(l => l.type === 'claim').length,
    )

    // === Walk every annotation and dereference its personaId (when present). ===
    const annotationVideoIds = new Set(
      fixtureLines.filter(l => l.type === 'annotation' && l.data.videoId).map(l => l.data.videoId as string),
    )
    let annotationCount = 0
    for (const videoId of annotationVideoIds) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/annotations/${videoId}`,
        cookies: { session_token: A.sessionToken },
      })
      expect(res.statusCode).toBe(200)
      const anns = res.json() as Array<{ id: string; personaId: string | null }>
      for (const ann of anns) {
        annotationCount++
        if (ann.personaId) {
          const pRes = await app.inject({
            method: 'GET',
            url: `/api/personas/${ann.personaId}`,
            cookies: { session_token: A.sessionToken },
          })
          expect(
            pRes.statusCode,
            `annotation ${ann.id} on video ${videoId} references personaId ${ann.personaId}; ` +
              `GET /api/personas/${ann.personaId} must 200`,
          ).toBe(200)
        }
      }
    }
    expect(annotationCount, 'importer should see every annotation the fixture carries').toBe(
      fixtureLines.filter(l => l.type === 'annotation').length,
    )
  })
})
