import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createRegularTestUser } from '../helpers/rbac-test-setup.js'

/**
 * The corpus and membership lexicon fields (annotation-design/licensing/… facets
 * plus the open feature map) share one Prisma `metadata` JSON column. A partial
 * PUT/re-POST must merge the restated facets/features over the stored blob so no
 * unrestated sibling is silently wiped.
 */
describe('Layers corpora partial-update merge', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let sessionToken: string
  let userId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })
  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.corpusMembership.deleteMany()
    await prisma.corpus.deleteMany()
    await prisma.expression.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
    const user = await createRegularTestUser(prisma, { username: 'corp', email: 'corp@example.com' })
    userId = user.id
    sessionToken = user.sessionToken
  })

  it('a partial corpus update overwrites only the restated facet/feature and keeps siblings', async () => {
    const id = randomUUID()
    const create = await app.inject({
      method: 'POST',
      url: '/api/layers/corpora',
      cookies: { session_token: sessionToken },
      payload: {
        id,
        name: 'C',
        annotationDesign: { scheme: 'A' },
        licensing: { license: 'CC-BY' },
        features: { team: 'x', phase: 1 },
      },
    })
    expect(create.statusCode).toBe(201)

    // PUT restates only annotationDesign and one feature key.
    const put = await app.inject({
      method: 'PUT',
      url: `/api/layers/corpora/${id}`,
      cookies: { session_token: sessionToken },
      payload: { annotationDesign: { scheme: 'B' }, features: { phase: 2 } },
    })
    expect(put.statusCode).toBe(200)
    const body = put.json() as {
      annotationDesign: unknown
      licensing: unknown
      features: Record<string, unknown>
    }
    // The restated facet/feature are overwritten.
    expect(body.annotationDesign).toEqual({ scheme: 'B' })
    expect(body.features.phase).toBe(2)
    // The unrestated sibling facet and feature survive the partial update.
    expect(body.licensing).toEqual({ license: 'CC-BY' })
    expect(body.features.team).toBe('x')
  })

  it('a partial membership update keeps unrestated provenance and features', async () => {
    const corpusId = randomUUID()
    await app.inject({
      method: 'POST',
      url: '/api/layers/corpora',
      cookies: { session_token: sessionToken },
      payload: { id: corpusId, name: 'C' },
    })
    const expressionId = randomUUID()
    await prisma.expression.create({
      data: { id: expressionId, layersId: expressionId, kind: 'document', sourceKind: 'test', text: 't', createdByUserId: userId },
    })

    const add = await app.inject({
      method: 'POST',
      url: `/api/layers/corpora/${corpusId}/memberships`,
      cookies: { session_token: sessionToken },
      payload: { expressionId, metadata: { tool: 'seed', agent: 'a1' }, features: { note: 'first' } },
    })
    expect(add.statusCode).toBe(201)

    // Re-POST (idempotent update) restates only a feature key.
    const upd = await app.inject({
      method: 'POST',
      url: `/api/layers/corpora/${corpusId}/memberships`,
      cookies: { session_token: sessionToken },
      payload: { expressionId, features: { note: 'second' } },
    })
    expect(upd.statusCode).toBe(200)
    const body = upd.json() as { metadata: Record<string, unknown>; features: Record<string, unknown> }
    expect(body.features.note).toBe('second')
    // The unrestated provenance keys survive.
    expect(body.metadata.tool).toBe('seed')
    expect(body.metadata.agent).toBe('a1')
  })
})
