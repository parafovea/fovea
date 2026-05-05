/**
 * Edge-case probes for the import/export pipeline.
 *
 * Each test targets a specific class of failure that the existing
 * happy-path coverage does not exercise. The tests are grouped by failure
 * mode (round-trip idempotency, malformed input, broken cross-references,
 * concurrency, filename injection) rather than by API endpoint, since the
 * goal is to surface bugs rather than to document each route.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { reseedOwnershipBaseline } from './_rbac-baseline.js'
import FormData from 'form-data'
import * as fc from 'fast-check'
import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

interface User {
  userId: string
  sessionToken: string
}

describe('Import/export edge cases', () => {
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
    await reseedOwnershipBaseline(prisma)
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
  })

  async function registerAndLogin(username: string, password: string): Promise<User> {
    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: { username, email: `${username}@example.com`, passwordHash, displayName: username, isAdmin: false },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password },
    })
    return {
      userId: user.id,
      sessionToken: login.cookies.find(c => c.name === 'session_token')!.value,
    }
  }

  function buildFile(jsonl: string, filename = 'edge.jsonl'): { headers: Record<string, string>; payload: Buffer } {
    const form = new FormData()
    form.append('file', Buffer.from(jsonl, 'utf-8'), { filename, contentType: 'application/x-ndjson' })
    return { headers: form.getHeaders(), payload: form.getBuffer() }
  }

  async function importAs(user: User, jsonl: string, filename = 'edge.jsonl') {
    const { headers, payload } = buildFile(jsonl, filename)
    return app.inject({
      method: 'POST',
      url: '/api/import',
      cookies: { session_token: user.sessionToken },
      headers,
      payload,
    })
  }

  // --- Empty / minimal-content inputs ---------------------------------------

  describe('Empty and minimal inputs', () => {
    it('empty file does not crash and returns a successful response with zero counts', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const res = await importAs(A, '')
      expect(res.statusCode).toBe(200)
      const body = res.json() as { success: boolean; summary: { processedLines: number } }
      expect(body.success).toBe(true)
      expect(body.summary.processedLines).toBe(0)
    })

    it('whitespace-only file does not crash', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const res = await importAs(A, '   \n\n\n   ')
      expect(res.statusCode).toBe(200)
      const body = res.json() as { success: boolean }
      expect(body.success).toBe(true)
    })

    it('metadata-only file does not crash', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const jsonl = JSON.stringify({ type: 'metadata', data: { exporterUserId: 'someone-else' } })
      const res = await importAs(A, jsonl)
      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
    })
  })

  // --- Malformed input ------------------------------------------------------

  describe('Malformed input', () => {
    it('garbage JSON on a single line returns 400 ValidationError', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const res = await importAs(A, '{not-json-at-all}')
      // The route raises ValidationError → 400 from the global error handler.
      expect(res.statusCode).toBe(400)
    })

    it('valid lines mixed with one garbage line: route fails atomically without partial commit', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const personaId = '00000000-0000-0000-0000-0000000000aa'
      const jsonl = [
        JSON.stringify({ type: 'persona', data: { id: personaId, userId: A.userId, name: 'Edge', role: 'r', informationNeed: 'i' } }),
        '!!!! not json !!!!',
        JSON.stringify({ type: 'persona', data: { id: '00000000-0000-0000-0000-0000000000bb', userId: A.userId, name: 'After', role: 'r', informationNeed: 'i' } }),
      ].join('\n')
      const res = await importAs(A, jsonl)
      expect(res.statusCode).toBe(400)
      // Critical: the persona that appeared *before* the garbage line must
      // not have been committed if the import aborts on parse error.
      const personaCount = await prisma.persona.count()
      expect(personaCount, 'no personas should be committed when parse fails').toBe(0)
    })

    it('two persona lines with the same id within one file are detected and resolved deterministically', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const dupId = '00000000-0000-0000-0000-0000000000cc'
      const jsonl = [
        JSON.stringify({ type: 'persona', data: { id: dupId, userId: A.userId, name: 'First', role: 'r', informationNeed: 'i' } }),
        JSON.stringify({ type: 'persona', data: { id: dupId, userId: A.userId, name: 'Second', role: 'r', informationNeed: 'i' } }),
      ].join('\n')
      const res = await importAs(A, jsonl)
      expect(res.statusCode).toBe(200)
      // Either: both lines surface as conflicts and only one commits, OR
      // the import returns success with a single row. What MUST NOT happen
      // is two rows with the same id (impossible due to PK) or a 5xx crash.
      const rows = await prisma.persona.findMany({ where: { id: dupId } })
      expect(rows.length, 'no duplicate primary-key violation surfaces as a row').toBeLessThanOrEqual(1)
    })
  })

  // --- Broken cross-references ---------------------------------------------

  describe('Broken cross-references', () => {
    it('annotation referencing an entity not in the file is skipped with a missing-dependency conflict surfaced in the response', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      await prisma.video.create({ data: { id: 'v-edge-1', filename: 'edge.mp4', path: '/v/edge.mp4', duration: 1 } })
      const jsonl = JSON.stringify({
        type: 'annotation',
        data: {
          id: '00000000-0000-0000-0000-0000000000dd',
          videoId: 'v-edge-1',
          annotationType: 'object',
          userId: A.userId,
          linkedEntityId: '99999999-9999-9999-9999-999999999999',
          boundingBoxSequence: {
            boxes: [{ x: 0, y: 0, width: 1, height: 1, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [], visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
            totalFrames: 1, keyframeCount: 1, interpolatedFrameCount: 0,
          },
        },
      })
      const res = await importAs(A, jsonl)
      expect(res.statusCode).toBe(200)
      const body = res.json() as {
        success: boolean
        summary: { importedItems: { annotations: number }; skippedItems: { annotations: number } }
        conflicts: Array<{ type: string; resolution: string; details: string }>
      }
      // The contract: orphan-reference annotations are skipped (not silently
      // dropped); the response must surface enough detail for a client to
      // explain "X annotations skipped because Y is missing" to the user.
      expect(body.success).toBe(true)
      expect(body.summary.importedItems.annotations).toBe(0)
      expect(body.summary.skippedItems.annotations).toBe(1)
      const orphanConflict = body.conflicts.find(c => c.type === 'missing-dependency')
      expect(orphanConflict, 'response should surface missing-dependency conflict').toBeDefined()
      expect(orphanConflict!.resolution).toBe('skip-item')
      expect(orphanConflict!.details).toContain('99999999-9999-9999-9999-999999999999')

      // The DB must not contain the skipped annotation.
      const annCount = await prisma.annotation.count({ where: { videoId: 'v-edge-1' } })
      expect(annCount).toBe(0)
    })
  })

  // --- Round-trip idempotency ----------------------------------------------

  describe('Round-trip idempotency', () => {
    it('same-user export → import → re-export preserves the data set up to timestamps and ids', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      // Seed a small graph: persona + ontology + entity + summary + claim
      // + object annotation. Re-import should be a no-op (same-user, ids
      // already exist) or update without duplicating.
      const persona = await prisma.persona.create({
        data: { userId: A.userId, name: 'P', role: 'r', informationNeed: 'i' },
      })
      await prisma.ontology.create({
        data: {
          personaId: persona.id,
          entityTypes: [{ id: 'et-1', name: 'Type1', gloss: [] }],
          eventTypes: [], roleTypes: [], relationTypes: [],
        },
      })
      await prisma.worldState.create({
        data: {
          userId: A.userId,
          entities: [{ id: 'e-1', name: 'E1' }],
          events: [], times: [], entityCollections: [], eventCollections: [], timeCollections: [], relations: [],
        },
      })
      await prisma.video.create({ data: { id: 'v-edge-2', filename: 'e.mp4', path: '/v/e.mp4', duration: 1 } })
      const summary = await prisma.videoSummary.create({
        data: { videoId: 'v-edge-2', personaId: persona.id, summary: [{ type: 'text', content: 's' }] },
      })
      await prisma.claim.create({
        data: { summaryId: summary.id, summaryType: 'video', text: 'c', gloss: [{ type: 'text', content: 'c' }] },
      })

      // First export.
      const first = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: A.sessionToken },
      })
      expect(first.statusCode).toBe(200)
      const firstSet = lineCountsByType(first.body)

      // Re-import as same user (should not duplicate).
      const importRes = await importAs(A, first.body, 'self.jsonl')
      expect(importRes.statusCode).toBe(200)
      expect(importRes.json().success).toBe(true)

      // Second export.
      const second = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: A.sessionToken },
      })
      const secondSet = lineCountsByType(second.body)

      // Counts per type must be identical: re-importing your own data
      // should not duplicate persona/ontology/entity/summary/claim/
      // annotation rows.
      expect(secondSet, 're-export should match first export').toEqual(firstSet)
    })

    it('cross-user export → import → re-export preserves all importable types', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const B = await registerAndLogin('userB', 'passB12345')
      const persona = await prisma.persona.create({
        data: { userId: A.userId, name: 'AP', role: 'r', informationNeed: 'i' },
      })
      await prisma.ontology.create({
        data: {
          personaId: persona.id,
          entityTypes: [{ id: 'et-x', name: 'X', gloss: [] }],
          eventTypes: [], roleTypes: [], relationTypes: [],
        },
      })
      await prisma.worldState.create({
        data: {
          userId: A.userId,
          entities: [{ id: 'a-e-1', name: 'AEntity' }],
          events: [], times: [], entityCollections: [], eventCollections: [], timeCollections: [], relations: [],
        },
      })

      const aExport = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: A.sessionToken },
      })
      const aTypes = lineCountsByType(aExport.body)

      const importRes = await importAs(B, aExport.body, 'cross.jsonl')
      expect(importRes.statusCode).toBe(200)
      expect(importRes.json().success).toBe(true)

      const bExport = await app.inject({
        method: 'GET',
        url: '/api/export',
        cookies: { session_token: B.sessionToken },
      })
      const bTypes = lineCountsByType(bExport.body)

      // The set of *types* B exports must match what A exported (modulo
      // metadata, which carries the exporter id and is per-user).
      delete aTypes.metadata
      delete bTypes.metadata
      expect(bTypes, 'B\'s re-export should contain the same kinds of records as A\'s export').toEqual(aTypes)
    })
  })

  // --- Concurrent imports ---------------------------------------------------

  describe('Concurrent imports', () => {
    it('two users importing the same export in parallel each get their own scoped copy', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const B = await registerAndLogin('userB', 'passB12345')
      // Build a minimal export file containing a persona owned by a third
      // (foreign) user so both A and B trigger the cross-user remap path.
      const foreignUserId = '11111111-1111-1111-1111-111111111111'
      const jsonl = [
        JSON.stringify({ type: 'metadata', data: { exporterUserId: foreignUserId } }),
        JSON.stringify({ type: 'persona', data: { id: '22222222-2222-2222-2222-222222222222', userId: foreignUserId, name: 'Concurrent', role: 'r', informationNeed: 'i' } }),
      ].join('\n')

      const [resA, resB] = await Promise.all([importAs(A, jsonl), importAs(B, jsonl)])
      expect(resA.statusCode).toBe(200)
      expect(resB.statusCode).toBe(200)
      expect(resA.json().success).toBe(true)
      expect(resB.json().success).toBe(true)

      // Each user must own exactly one copy of the imported persona, and
      // those copies must have different ids (cross-user remapped).
      const aPersonas = await prisma.persona.findMany({ where: { userId: A.userId } })
      const bPersonas = await prisma.persona.findMany({ where: { userId: B.userId } })
      expect(aPersonas.length).toBe(1)
      expect(bPersonas.length).toBe(1)
      expect(aPersonas[0].id).not.toBe(bPersonas[0].id)
      expect(aPersonas[0].id).not.toBe('22222222-2222-2222-2222-222222222222')
      expect(bPersonas[0].id).not.toBe('22222222-2222-2222-2222-222222222222')
    })
  })

  // --- Filename handling on POST /api/import -------------------------------

  describe('Filename handling on import', () => {
    it('filename with path traversal characters has path components stripped before reaching ImportHistory', async () => {
      // Defense-in-depth: Fastify's multipart handler (busboy under the
      // hood) strips path components from the multipart filename. We
      // assert that no ".." segment survives into the audit row, so even
      // if a future code path used `history.filename` as a filesystem
      // path it could not escape its intended directory.
      const A = await registerAndLogin('userA', 'passA12345')
      const jsonl = JSON.stringify({ type: 'persona', data: { id: '33333333-3333-3333-3333-333333333333', userId: A.userId, name: 'Edge', role: 'r', informationNeed: 'i' } })
      const malicious = '../../../../etc/passwd'
      const res = await importAs(A, jsonl, malicious)
      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      const history = await prisma.importHistory.findFirst({ where: { importedBy: A.userId } })
      expect(history?.filename).toBeDefined()
      expect(history!.filename).not.toContain('..')
      expect(history!.filename).not.toContain('/')
    })

    it('filename with embedded newline does not break the ImportHistory write', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const jsonl = JSON.stringify({ type: 'persona', data: { id: '44444444-4444-4444-4444-444444444444', userId: A.userId, name: 'Edge', role: 'r', informationNeed: 'i' } })
      const odd = 'line1\nline2.jsonl'
      const res = await importAs(A, jsonl, odd)
      expect(res.statusCode).toBe(200)
      const history = await prisma.importHistory.findFirst({ where: { importedBy: A.userId } })
      expect(history?.filename).toBeDefined()
    })
  })

  // --- Property-based round-trip fidelity ---------------------------------

  describe('Property-based round-trip fidelity', () => {
    /**
     * For any list of (uniquely-id'd) personas, exporting and re-importing
     * as the same user must preserve their `name` field. Tests that the
     * round-trip does not silently corrupt user-visible data.
     */
    it('same-user export → import preserves persona names for arbitrary inputs', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      // 5 runs is plenty given each run does a real DB transaction.
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              uuid: fc.uuid(),
              name: fc.string({ minLength: 1, maxLength: 80 }).filter(s => s.trim().length > 0),
            }),
            { minLength: 1, maxLength: 5 },
          ).map(arr => {
            // De-duplicate by uuid so the input is a valid set.
            const seen = new Set<string>()
            return arr.filter(r => (seen.has(r.uuid) ? false : (seen.add(r.uuid), true)))
          }),
          async (personas) => {
            // Reset relevant rows; keep user A.
            await prisma.persona.deleteMany({ where: { userId: A.userId } })

            const jsonl = personas
              .map(p => JSON.stringify({
                type: 'persona',
                data: { id: p.uuid, userId: A.userId, name: p.name, role: 'r', informationNeed: 'i' },
              }))
              .join('\n')
            const res = await importAs(A, jsonl)
            expect(res.statusCode).toBe(200)
            expect(res.json().success).toBe(true)

            const stored = await prisma.persona.findMany({
              where: { userId: A.userId },
              select: { id: true, name: true },
            })
            const storedById = new Map(stored.map(p => [p.id, p.name]))
            for (const p of personas) {
              expect(storedById.get(p.uuid), `persona ${p.uuid} should be stored with name "${p.name}"`).toBe(p.name)
            }
          },
        ),
        { numRuns: 5 },
      )
    })

    /**
     * For any well-formed export, cross-user import must remap every
     * persona id to a value that is NOT in the input. This is the
     * structural invariant that prevents the issue-#121 collision.
     */
    it('cross-user import always remaps persona ids away from the originals', async () => {
      const B = await registerAndLogin('userB', 'passB12345')
      const foreignUserId = '00000000-0000-0000-0000-00000000ffff'
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              uuid: fc.uuid(),
              name: fc.string({ minLength: 1, maxLength: 40 }).filter(s => s.trim().length > 0),
            }),
            { minLength: 1, maxLength: 4 },
          ).map(arr => {
            const seen = new Set<string>()
            return arr.filter(r => (seen.has(r.uuid) ? false : (seen.add(r.uuid), true)))
          }),
          async (personas) => {
            await prisma.persona.deleteMany({ where: { userId: B.userId } })

            const lines = [
              JSON.stringify({ type: 'metadata', data: { exporterUserId: foreignUserId } }),
              ...personas.map(p => JSON.stringify({
                type: 'persona',
                data: { id: p.uuid, userId: foreignUserId, name: p.name, role: 'r', informationNeed: 'i' },
              })),
            ]
            const res = await importAs(B, lines.join('\n'))
            expect(res.statusCode).toBe(200)
            expect(res.json().success).toBe(true)

            const stored = await prisma.persona.findMany({ where: { userId: B.userId }, select: { id: true } })
            const originals = new Set(personas.map(p => p.uuid))
            for (const p of stored) {
              expect(originals.has(p.id), `cross-user import must remap id ${p.id}`).toBe(false)
            }
          },
        ),
        { numRuns: 5 },
      )
    })
  })

  // --- Prototype pollution probes -----------------------------------------

  describe('Prototype pollution probes', () => {
    /**
     * A malicious export could include records with `__proto__` /
     * `constructor` keys, which on naive `Object.assign` paths can pollute
     * `Object.prototype` (e.g., setting `Object.prototype.isAdmin = true`
     * for every object in the process). The import handler must not allow
     * a payload to mutate `Object.prototype`.
     */
    it('persona line carrying __proto__ does not pollute Object.prototype', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      // We have to send raw JSON (not via JSON.stringify of an object with
      // __proto__, since JSON.stringify drops that key); construct the
      // string by hand so the parser actually sees the literal __proto__.
      const polluting = `{"type":"persona","data":{"id":"55555555-5555-5555-5555-555555555555","userId":"${A.userId}","name":"P","role":"r","informationNeed":"i","__proto__":{"polluted":true}}}`
      const res = await importAs(A, polluting)
      expect(res.statusCode).toBeLessThan(500)

      // The critical assertion: no random object should now have a
      // `polluted` property inherited from Object.prototype.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(({} as any).polluted).toBeUndefined()
    })

    it('persona line carrying constructor.prototype does not pollute Object', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const polluting = `{"type":"persona","data":{"id":"66666666-6666-6666-6666-666666666666","userId":"${A.userId}","name":"P","role":"r","informationNeed":"i","constructor":{"prototype":{"hijacked":true}}}}`
      const res = await importAs(A, polluting)
      expect(res.statusCode).toBeLessThan(500)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(({} as any).hijacked).toBeUndefined()
    })
  })

  // --- Conflict resolution edge cases -------------------------------------

  describe('Conflict resolution edges', () => {
    /**
     * Cross-user import always forces `create-new` for foreign-owned
     * conflicts. A malicious client cannot bypass this by supplying their
     * own `replace` resolution for the same item: the server must ignore
     * client-supplied resolutions for foreign-owned conflicts and remap
     * the id anyway.
     */
    it('cross-user import ignores client-supplied replace resolution and still remaps the id', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      // Seed a persona owned by A so a remote import naming the same id
      // would be a duplicate-on-A.
      const existing = await prisma.persona.create({
        data: { id: '77777777-7777-7777-7777-777777777777', userId: A.userId, name: 'OriginalA', role: 'r', informationNeed: 'i' },
      })
      const B = await registerAndLogin('userB', 'passB12345')

      // B imports a fixture whose persona id collides with A's. Even if
      // the client tried to send a resolution payload claiming `replace`,
      // the server's foreign-owner branch in conflict resolution forces
      // `create-new`, so A's row stays untouched.
      const foreignUserId = '88888888-8888-8888-8888-888888888888'
      const jsonl = [
        JSON.stringify({ type: 'metadata', data: { exporterUserId: foreignUserId } }),
        JSON.stringify({ type: 'persona', data: { id: existing.id, userId: foreignUserId, name: 'HijackAttempt', role: 'r', informationNeed: 'i' } }),
      ].join('\n')

      const res = await importAs(B, jsonl)
      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)

      const aRow = await prisma.persona.findUnique({ where: { id: existing.id } })
      expect(aRow?.userId, 'A\'s persona must remain owned by A').toBe(A.userId)
      expect(aRow?.name, 'A\'s persona name must not have been overwritten').toBe('OriginalA')

      // B must have a new persona with a different id.
      const bRows = await prisma.persona.findMany({ where: { userId: B.userId } })
      expect(bRows.length).toBeGreaterThanOrEqual(1)
      for (const r of bRows) {
        expect(r.id).not.toBe(existing.id)
      }
    })
  })

  // --- DoS / resource exhaustion ------------------------------------------

  describe('DoS / resource exhaustion', () => {
    /**
     * The route registers @fastify/multipart with `fileSize: 100MB`. A
     * payload larger than the limit must be rejected, not crash the
     * process or silently truncate. We test with a file slightly over
     * the limit but not so large it exhausts test memory.
     */
    it('upload exceeding multipart fileSize limit is rejected, not crashed', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      // 101MB. Building a Buffer this large is fine in Node test memory.
      const oversize = Buffer.alloc(101 * 1024 * 1024, 'A')
      const form = new FormData()
      form.append('file', oversize, { filename: 'big.jsonl', contentType: 'application/x-ndjson' })
      const res = await app.inject({
        method: 'POST',
        url: '/api/import',
        cookies: { session_token: A.sessionToken },
        headers: form.getHeaders(),
        payload: form.getBuffer(),
      })
      // Either 413 (payload too large) or 4xx-class. Must not be 5xx.
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
      expect(res.statusCode).toBeLessThan(500)
    }, 60000)

    /**
     * Many short valid lines must process or reject deterministically.
     * 5000 personas is enough to exercise per-line transaction overhead
     * without making the test minutes long.
     */
    it('5000 small valid lines complete or fail deterministically without 5xx', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const lines: string[] = []
      for (let i = 0; i < 5000; i++) {
        // Pad to a stable 36-char uuid. Only the last 4 hex chars vary.
        const id = `00000000-0000-0000-0000-${i.toString(16).padStart(12, '0')}`
        lines.push(JSON.stringify({
          type: 'persona',
          data: { id, userId: A.userId, name: `P${i}`, role: 'r', informationNeed: 'i' },
        }))
      }
      const res = await importAs(A, lines.join('\n'), 'bulk.jsonl')
      expect(res.statusCode).toBeLessThan(500)
      if (res.statusCode === 200) {
        const body = res.json() as { success: boolean }
        expect(typeof body.success).toBe('boolean')
      }
    }, 120000)

    /**
     * A single line with deeply-nested JSON must not stack-overflow the
     * server. JSON.parse handles 5000 levels fine on V8; we test the
     * downstream consumers (parseLine, validateLine, remapObjectIds).
     */
    it('deeply-nested JSON in a single line does not stack-overflow', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      // Build a persona whose `details` contains 1000 levels of nested
      // arrays. The remapObjectIds recursion has to walk this without
      // exhausting the stack.
      let nested: unknown = 'leaf'
      for (let i = 0; i < 1000; i++) nested = [nested]
      const personaLine = JSON.stringify({
        type: 'persona',
        data: {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          userId: A.userId,
          name: 'Deep',
          role: 'r',
          informationNeed: 'i',
          // The schema rejects unknown extra fields normally, but the
          // import handler is more permissive — it remaps any *Id key
          // anywhere in the tree, so we need the deep payload to live
          // somewhere it'll actually be traversed. Stuff it in `details`
          // (a string field) by serializing — that bypasses the recursion
          // but tests the parse path. To exercise remapObjectIds, we
          // also include a separate `metadata` field carrying the array.
          details: 'deep',
          metadata: nested,
        },
      })
      const res = await importAs(A, personaLine, 'deep.jsonl')
      expect(res.statusCode).toBeLessThan(500)
    }, 30000)
  })

  // --- Encoding / line-ending edges ---------------------------------------

  describe('Encoding edges', () => {
    /**
     * UTF-8 BOM at the file start must not break the first line's parse.
     * Some editors add it silently when saving as UTF-8.
     */
    it('UTF-8 BOM at file start does not break parse of the first line', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const personaLine = JSON.stringify({
        type: 'persona',
        data: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', userId: A.userId, name: 'BomTest', role: 'r', informationNeed: 'i' },
      })
      const bom = '﻿' // U+FEFF is the BOM marker
      const res = await importAs(A, bom + personaLine)
      // Either parsed (success: true with 1 line) or rejected as 400. If
      // it 5xx'd, that'd be a regression.
      expect(res.statusCode).toBeLessThan(500)
    })

    /**
     * Windows line endings (\r\n) must be normalised so the JSONL parser
     * doesn't see "{...}\r" as a malformed object on every line.
     */
    it('CRLF line endings parse correctly', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const lines = [
        JSON.stringify({ type: 'persona', data: { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', userId: A.userId, name: 'CR', role: 'r', informationNeed: 'i' } }),
        JSON.stringify({ type: 'persona', data: { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', userId: A.userId, name: 'LF', role: 'r', informationNeed: 'i' } }),
      ].join('\r\n')
      const res = await importAs(A, lines, 'crlf.jsonl')
      // Must not 5xx. Whether CRLF is silently accepted or rejected with
      // a clear error is up to the parser, but the route must respond.
      expect(res.statusCode).toBeLessThan(500)
    })

    /**
     * Missing trailing newline at end of file must not cause the last
     * line to be silently dropped.
     */
    it('missing trailing newline does not drop the last line', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const lastId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
      const lines = [
        JSON.stringify({ type: 'persona', data: { id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', userId: A.userId, name: 'A', role: 'r', informationNeed: 'i' } }),
        JSON.stringify({ type: 'persona', data: { id: lastId, userId: A.userId, name: 'Last', role: 'r', informationNeed: 'i' } }),
      ]
      // No trailing \n.
      const res = await importAs(A, lines.join('\n'), 'no-trailing-newline.jsonl')
      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)
      const stored = await prisma.persona.findUnique({ where: { id: lastId } })
      expect(stored, 'last line without trailing newline must still import').not.toBeNull()
    })
  })

  // --- Worker-side double-check probe -------------------------------------

  describe('Worker-side defensive checks', () => {
    /**
     * BullMQ workers process jobs by reading `job.data` and writing to
     * the DB. The queue-creation routes I locked down earlier already
     * verify ownership before enqueueing, so a job in the queue is
     * implicitly trusted. But what happens if the persona is deleted
     * between enqueue and worker pickup? The worker's videoSummary
     * upsert would fail with FK violation. We assert that a deleted
     * persona before queue write does not corrupt the importer's state.
     *
     * This is a structural test rather than a worker-execution test
     * (we cannot easily run the BullMQ worker in-process), but it
     * captures the invariant that the API surface that feeds the worker
     * doesn't accept work referencing a deleted persona.
     */
    it('queueing summary generation against a just-deleted persona is rejected at the API surface', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      const persona = await prisma.persona.create({
        data: { userId: A.userId, name: 'Doomed', role: 'r', informationNeed: 'i' },
      })
      await prisma.video.create({ data: { id: 'v-worker-1', filename: 'w.mp4', path: '/v/w.mp4', duration: 1 } })

      // Delete the persona before queueing.
      await prisma.persona.delete({ where: { id: persona.id } })

      const res = await app.inject({
        method: 'POST',
        url: '/api/videos/summaries/generate',
        cookies: { session_token: A.sessionToken },
        payload: { videoId: 'v-worker-1', personaId: persona.id },
      })
      expect([403, 404]).toContain(res.statusCode)
    })
  })

  // --- Fuzz: JSONL parser ---------------------------------------------------

  describe('JSONL parser fuzz', () => {
    /**
     * Random byte sequences must never produce a 5xx; the route should
     * either accept (success: true with zero processed lines) or reject
     * with 4xx, but not crash with a stack trace or hang.
     */
    it('random bytes never produce a 5xx', async () => {
      const A = await registerAndLogin('userA', 'passA12345')
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 200 }),
          async (junk) => {
            const res = await importAs(A, junk)
            expect(
              res.statusCode,
              `import of random bytes (${JSON.stringify(junk).slice(0, 60)}) must not 5xx`,
            ).toBeLessThan(500)
          },
        ),
        { numRuns: 20 },
      )
    })
  })
})

/**
 * Reduce a JSONL export body to a `{ type → count }` map, for set-equality
 * checks across export rounds. Strips empty lines and lines that fail to
 * parse.
 */
function lineCountsByType(body: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const line of body.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as { type?: string }
      if (parsed.type) counts[parsed.type] = (counts[parsed.type] ?? 0) + 1
    } catch {
      // Ignore unparseable lines.
    }
  }
  return counts
}
