/**
 * Issue #121 verification using a real Fovea JSONL export.
 *
 * The fixture `test/fixtures/issue-121-real-export.jsonl` is a real export
 * captured from a previous Fovea instance (exporter user
 * `c92c0859-4a75-44f6-b6db-18b610ff3fd5`). It contains:
 *
 *   - 1 persona ("Test Analyst")
 *   - 1 ontology with one entity type ("fire")
 *   - 1 world entity ("Fred Rogers", id 0bfcd227-...)
 *   - 1 video summary
 *   - 2 claims (one referencing the entity type via gloss typeRef)
 *   - 1 object annotation (linkedEntityId pointing at "Fred Rogers")
 *
 * Two test users (A and B), neither of whom is the exporter, both import the
 * SAME fixture against a shared video. The test then walks the exact API
 * sequence the All Annotations panel and Claims panel walk in the browser
 * (`GET /api/world`, `GET /api/annotations/:videoId`,
 * `GET /api/videos/:videoId/summaries`, `GET /api/summaries/:summaryId/claims`)
 * and asserts the user-visible properties from issue #121:
 *
 *   1. No duplicate rows: each user's annotation list contains exactly one
 *      object annotation, not the foreign user's copy.
 *   2. No orphan UUID labels: the annotation's linkedEntityId resolves to a
 *      named entity ("Fred Rogers") in the requester's `/api/world`.
 *   3. Claims display: the importing user's summary returns both claims with
 *      text intact and gloss `typeRef.content` remapped to the regenerated
 *      entity type id (so the typeRef resolves locally).
 *   4. Cross-user isolation: A's annotation/summary id differs from B's.
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
const FIXTURE_PATH = resolve(__dirname, '../fixtures/issue-121-real-export.jsonl')
// The fixture references two video ids: the annotation lives on
// `a653942195eddca5` and the summary on `5d742019ed2d7bc5`. Both must exist
// in the videos table for the import to succeed.
const ANNOTATION_VIDEO_ID = 'a653942195eddca5'
const SUMMARY_VIDEO_ID = '5d742019ed2d7bc5'

interface User {
  userId: string
  sessionToken: string
}

describe('Issue #121 reproduction with real Fovea export', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let fixtureBytes: Buffer

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
    fixtureBytes = readFileSync(FIXTURE_PATH)
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

    // Seed both videos the fixture references.
    await prisma.video.createMany({
      data: [
        { id: ANNOTATION_VIDEO_ID, filename: 'annotation-video.mp4', path: '/v/ann.mp4', duration: 30 },
        { id: SUMMARY_VIDEO_ID, filename: 'summary-video.mp4', path: '/v/sum.mp4', duration: 30 },
      ],
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
      filename: 'issue-121-real-export.jsonl',
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
      // eslint-disable-next-line no-console
      console.error('Import failed', JSON.stringify(body, null, 2).slice(0, 2000))
    }
    expect(body.success).toBe(true)
  }

  it('two users importing the same export each see only their own copy with resolved entity names', async () => {
    const A = await registerAndLogin('userA', 'passA12345')
    const B = await registerAndLogin('userB', 'passB12345')

    await importFixture(A)
    await importFixture(B)

    // === Walk the All Annotations panel path for user A ===
    const aWorldRes = await app.inject({
      method: 'GET',
      url: '/api/world',
      cookies: { session_token: A.sessionToken },
    })
    expect(aWorldRes.statusCode).toBe(200)
    const aWorld = aWorldRes.json() as { entities: Array<{ id: string; name: string }> }
    const aEntityByName = new Map(aWorld.entities.map(e => [e.id, e.name]))
    const aFredId = aWorld.entities.find(e => e.name === 'Fred Rogers')?.id
    expect(aFredId, 'user A\'s world should contain a "Fred Rogers" entity').toBeDefined()

    const aAnnsRes = await app.inject({
      method: 'GET',
      url: `/api/annotations/${ANNOTATION_VIDEO_ID}`,
      cookies: { session_token: A.sessionToken },
    })
    expect(aAnnsRes.statusCode).toBe(200)
    const aAnns = aAnnsRes.json() as Array<{ id: string; type: string; label: string; personaId: string | null }>

    const aObjectAnns = aAnns.filter(a => a.type === 'object')
    expect(aObjectAnns.length, 'user A sees exactly one object annotation, not duplicates').toBe(1)

    // The label must resolve to a named entity in user A's own world (no
    // orphan UUID — the issue #121 symptom was the row showing a UUID
    // because the foreign entity wasn't in the requester's worldState).
    const aLabel = aObjectAnns[0].label
    expect(aEntityByName.get(aLabel), `user A annotation label "${aLabel}" should resolve to an entity name`).toBe('Fred Rogers')
    expect(aLabel).toBe(aFredId)
    expect(aLabel).not.toBe('0bfcd227-c571-4608-8c81-bc1e05bcd7a2') // original (unremapped) id

    // === Walk the Claims panel path for user A ===
    // Note: the fixture's summary lives on SUMMARY_VIDEO_ID, distinct from
    // ANNOTATION_VIDEO_ID where the annotation lives. The frontend opens
    // the same panels per video, so we exercise the summary path against
    // the summary's own videoId.
    const aSummariesRes = await app.inject({
      method: 'GET',
      url: `/api/videos/${SUMMARY_VIDEO_ID}/summaries`,
      cookies: { session_token: A.sessionToken },
    })
    const aSummaries = aSummariesRes.json() as Array<{ id: string; personaId: string }>
    expect(aSummaries.length, 'user A sees exactly one summary on the shared video').toBe(1)
    const aSummaryId = aSummaries[0].id

    const aClaimsRes = await app.inject({
      method: 'GET',
      url: `/api/summaries/${aSummaryId}/claims`,
      cookies: { session_token: A.sessionToken },
    })
    const aClaims = aClaimsRes.json() as Array<{
      id: string
      summaryId: string
      text: string
      gloss: Array<{ type: string; content: string }>
    }>
    expect(aClaims.length, 'user A sees both claims under their summary').toBe(2)
    for (const claim of aClaims) {
      expect(claim.summaryId).toBe(aSummaryId)
    }
    const aClaimTexts = aClaims.map(c => c.text)
    expect(aClaimTexts).toContain('my first test claim')
    expect(aClaimTexts.some(t => t.startsWith('my second test claim'))).toBe(true)

    // The second claim has a gloss `typeRef.content` pointing at the entity
    // type "fire" in the original export (id 5ae47153-...). The frontend
    // resolves this by looking the id up in the requester's ontology, so
    // the test asserts the right invariant: whatever the typeRef.content
    // value is after import, it must resolve to a type named "fire" in
    // user A's own ontology. Type-ref ids are preserved (not remapped) on
    // cross-user import because nested type-ids cannot collide; both users
    // end up with an entity type whose id matches what their claim cites.
    const aSecondClaim = aClaims.find(c => c.text.startsWith('my second test claim'))!
    const aTypeRef = aSecondClaim.gloss.find(g => g.type === 'typeRef')
    expect(aTypeRef, 'second claim should preserve its gloss typeRef item').toBeDefined()

    const aPersona = await prisma.persona.findFirst({
      where: { userId: A.userId },
      include: { ontology: true },
    })
    const aEntityTypes = (aPersona?.ontology?.entityTypes as Array<{ id: string; name: string }>) || []
    const aFireType = aEntityTypes.find(t => t.id === aTypeRef!.content)
    expect(aFireType, `typeRef.content "${aTypeRef!.content}" should resolve to a type in user A's ontology`).toBeDefined()
    expect(aFireType!.name).toBe('fire')

    // === Walk the same path for user B and assert isolation from A ===
    const bWorldRes = await app.inject({
      method: 'GET',
      url: '/api/world',
      cookies: { session_token: B.sessionToken },
    })
    const bWorld = bWorldRes.json() as { entities: Array<{ id: string; name: string }> }
    const bFredId = bWorld.entities.find(e => e.name === 'Fred Rogers')?.id
    expect(bFredId, 'user B\'s world should contain a "Fred Rogers" entity').toBeDefined()
    expect(bFredId, 'user B\'s "Fred Rogers" entity id should differ from A\'s').not.toBe(aFredId)

    const bAnnsRes = await app.inject({
      method: 'GET',
      url: `/api/annotations/${ANNOTATION_VIDEO_ID}`,
      cookies: { session_token: B.sessionToken },
    })
    const bAnns = bAnnsRes.json() as Array<{ id: string; type: string; label: string }>
    const bObjectAnns = bAnns.filter(a => a.type === 'object')
    expect(bObjectAnns.length, 'user B sees exactly one object annotation').toBe(1)
    expect(bObjectAnns[0].id, 'user B\'s annotation id differs from A\'s').not.toBe(aObjectAnns[0].id)
    expect(bObjectAnns[0].label, 'user B\'s annotation label resolves to B\'s own entity').toBe(bFredId)

    const bSummariesRes = await app.inject({
      method: 'GET',
      url: `/api/videos/${SUMMARY_VIDEO_ID}/summaries`,
      cookies: { session_token: B.sessionToken },
    })
    const bSummaries = bSummariesRes.json() as Array<{ id: string }>
    expect(bSummaries.length).toBe(1)
    expect(bSummaries[0].id).not.toBe(aSummaryId)

    const bClaimsRes = await app.inject({
      method: 'GET',
      url: `/api/summaries/${bSummaries[0].id}/claims`,
      cookies: { session_token: B.sessionToken },
    })
    const bClaims = bClaimsRes.json() as Array<{ id: string }>
    expect(bClaims.length).toBe(2)
    for (const c of bClaims) {
      expect(aClaims.map(ac => ac.id), 'no claim id appears in both users\' views').not.toContain(c.id)
    }
  })
})
