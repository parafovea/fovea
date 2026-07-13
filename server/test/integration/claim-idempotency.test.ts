import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createRegularTestUser } from '../helpers/rbac-test-setup.js'
import { readSummaryClaims, readClaimById } from '../../src/services/layers-bridge/claim-bridge.js'

/**
 * A network retry / programmatic resend of a claim-create carrying the same
 * client-supplied id must not mint a duplicate claim row (it returns the
 * existing one). Mirrors the annotation idempotent-create hardening.
 */
describe('Claim creation idempotency', () => {
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
    await prisma.typeDef.deleteMany()
    await prisma.layersOntology.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
    const user = await createRegularTestUser(prisma, { username: 'claimer', email: 'claimer@example.com' })
    session = user.sessionToken
    const persona = await prisma.persona.create({
      data: { userId: user.id, name: 'P', role: 'Analyst', informationNeed: 'n' },
    })
    personaId = persona.id
    videoId = (await prisma.video.create({ data: { filename: 'a.mp4', path: '/v/a.mp4', duration: 60 } })).id
    summaryId = (await prisma.videoSummary.create({
      data: { videoId, personaId, summary: [], createdBy: user.id },
    })).id
  })

  it('re-POST with the same id returns the existing claim and creates no duplicate', async () => {
    const id = '11111111-1111-1111-1111-111111111111'
    const post = () =>
      app.inject({
        method: 'POST',
        url: `/api/summaries/${summaryId}/claims`,
        cookies: { session_token: session },
        payload: { id, summaryType: 'video', text: 'The car is red.', audio: ['speech'] },
      })

    expect((await post()).statusCode).toBe(201)
    expect((await post()).statusCode).toBe(201)

    const { claims } = await readSummaryClaims(prisma, summaryId)
    expect(claims).toHaveLength(1)
    expect(claims[0].id).toBe(id)
  })

  it('the video-persona claim route is likewise idempotent on id', async () => {
    const id = '22222222-2222-2222-2222-222222222222'
    const post = () =>
      app.inject({
        method: 'POST',
        url: `/api/videos/${videoId}/personas/${personaId}/claims`,
        cookies: { session_token: session },
        payload: { id, text: 'A claim.' },
      })

    expect((await post()).statusCode).toBe(201)
    expect((await post()).statusCode).toBe(201)

    // The claim node's id is the primary key, so a duplicate could not persist;
    // assert the single row exists and the auto-created summary holds exactly one.
    const claim = await readClaimById(prisma, id)
    expect(claim).not.toBeNull()
    const summary = await prisma.videoSummary.findUnique({
      where: { videoId_personaId: { videoId, personaId } },
    })
    const { claims } = await readSummaryClaims(prisma, summary!.id)
    expect(claims).toHaveLength(1)
  })
})
