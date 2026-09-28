// Proves (1) REFERENT: deleting claim B freezes B's inline claimRef mention in
// claim A's prose to B's display name; (2) REFERRER: dereferenceClaimProse freezes
// a typeRef mention to the type's name; clearClaimStructuredRefs nulls claimerType.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createRegularTestUser } from '../helpers/rbac-test-setup.js'
import {
  readClaimById,
  dereferenceClaimProse,
  clearClaimStructuredRefs,
} from '../../src/services/layers-bridge/claim-bridge.js'
import type { GlossItem } from '@models/types.js'

describe('Claim reference cleanup (both directions)', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let session: string
  let summaryId: string
  let videoId: string
  let personaId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })
  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.loginAttempt.deleteMany()
    await prisma.graphEdge.deleteMany()
    await prisma.layersAnnotation.deleteMany()
    await prisma.annotationLayer.deleteMany()
    await prisma.expression.deleteMany()
    await prisma.media.deleteMany()
    await prisma.graphNode.deleteMany()
    await prisma.catalogMembership.deleteMany()
    await prisma.catalogCollection.deleteMany()
    await prisma.typeDef.deleteMany()
    await prisma.layersOntology.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
    const user = await createRegularTestUser(prisma, { username: 'refclean', email: 'refclean@example.com' })
    session = user.sessionToken
    personaId = (await prisma.persona.create({
      data: { userId: user.id, name: 'P', role: 'Analyst', informationNeed: 'n' },
    })).id
    videoId = (await prisma.video.create({ data: { filename: 'a.mp4', path: '/v/a.mp4', duration: 60 } })).id
    summaryId = (await prisma.videoSummary.create({
      data: { videoId, personaId, summary: [], createdBy: user.id },
    })).id
  })

  const post = (payload: unknown) =>
    app.inject({
      method: 'POST',
      url: `/api/summaries/${summaryId}/claims`,
      cookies: { session_token: session },
      payload,
    })

  it('deleting a claim freezes its claimRef mention in another claim’s prose to its display name', async () => {
    const bId = '33333333-3333-3333-3333-333333333333'
    const aId = '44444444-4444-4444-4444-444444444444'

    // Claim B: the referent. Its text is the display name we expect frozen in.
    expect((await post({ id: bId, summaryType: 'video', text: 'The car is red.' })).statusCode).toBe(201)

    // Claim A references B inline in its gloss prose via a claimRef segment.
    const aGloss: GlossItem[] = [
      { type: 'text', content: 'As stated in ' },
      { type: 'claimRef', content: bId, refClaimId: bId },
    ]
    expect((await post({ id: aId, summaryType: 'video', text: 'Follow-up.', gloss: aGloss })).statusCode).toBe(201)

    // Delete B through the real route (drives deleteClaim's referent sweep). The
    // route answers 200 `{ success: true }` (there is no 204 on this endpoint).
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/summaries/${summaryId}/claims/${bId}`,
      cookies: { session_token: session },
    })
    expect(del.statusCode).toBe(200)

    // A survives; its claimRef to B is frozen to B's text, no dangling id remains.
    const a = await readClaimById(prisma, aId)
    expect(a).not.toBeNull()
    const gloss = a!.gloss as GlossItem[]
    expect(gloss.some((g) => g.type === 'claimRef')).toBe(false)
    expect(gloss.some((g) => g.type === 'text' && g.content.includes('The car is red.'))).toBe(true)
    // B itself is gone.
    expect(await readClaimById(prisma, bId)).toBeNull()
  })

  it('dereferenceClaimProse freezes a typeRef mention and clearClaimStructuredRefs nulls the claimer type', async () => {
    const typeId = '55555555-5555-5555-5555-555555555555'
    const cId = '66666666-6666-6666-6666-666666666666'

    // A claim that BOTH references a type in prose AND carries it structurally as claimer.
    const gloss: GlossItem[] = [
      { type: 'text', content: 'per ' },
      { type: 'typeRef', content: typeId, refType: 'entity', refPersonaId: personaId },
    ]
    expect(
      (await post({ id: cId, summaryType: 'video', text: 'Typed claim.', gloss, claimerType: typeId })).statusCode,
    ).toBe(201)

    // REFERRER prose: freeze the typeRef to the type's display name.
    const frozen = await dereferenceClaimProse(prisma, {
      kind: 'typeRef',
      id: typeId,
      name: 'Person',
      refType: 'entity',
      refPersonaId: personaId,
    })
    expect(frozen).toBe(1)

    // REFERRER structured: null the claimer type, keep the claim.
    const cleared = await clearClaimStructuredRefs(prisma, { kind: 'typeRef', id: typeId, name: 'Person' })
    expect(cleared).toBe(1)

    const c = await readClaimById(prisma, cId)
    expect(c).not.toBeNull()
    expect((c!.gloss as GlossItem[]).some((g) => g.type === 'typeRef')).toBe(false)
    expect((c!.gloss as GlossItem[]).some((g) => g.type === 'text' && g.content.includes('Person'))).toBe(true)
    expect(c!.claimerType ?? null).toBeNull()
  })
})
