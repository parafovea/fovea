import { randomUUID } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { Prisma, PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createRegularTestUser } from '../helpers/rbac-test-setup.js'

/**
 * The anchor column is nullable. When the generic annotation create omits the
 * anchor, the column must store SQL NULL (Prisma.DbNull), not JSON `null`
 * (Prisma.JsonNull) — otherwise a `WHERE anchor IS NULL` predicate would miss the
 * row. This mirrors the world-store path, which omits the anchor entirely.
 */
describe('Generic layers annotation create — anchorless anchor is SQL NULL', () => {
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
    await prisma.layersAnnotation.deleteMany()
    await prisma.annotationLayer.deleteMany()
    await prisma.expression.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
    const user = await createRegularTestUser(prisma, { username: 'ann', email: 'ann@example.com' })
    userId = user.id
    sessionToken = user.sessionToken
  })

  it('stores SQL NULL (not JSON null) when the anchor is omitted', async () => {
    const expressionId = randomUUID()
    await prisma.expression.create({
      data: { id: expressionId, layersId: expressionId, kind: 'document', sourceKind: 'test', text: 't', createdByUserId: userId },
    })
    const layerId = randomUUID()
    await prisma.annotationLayer.create({
      data: { id: layerId, expressionId, kind: 'span', createdByUserId: userId },
    })

    const annotationId = randomUUID()
    const res = await app.inject({
      method: 'POST',
      url: '/api/layers/annotations',
      cookies: { session_token: sessionToken },
      payload: { id: annotationId, layerId, label: 'x' },
    })
    expect(res.statusCode).toBe(201)

    // The row is found by a SQL-NULL predicate (DbNull), not the JSON-null one.
    const asSqlNull = await prisma.layersAnnotation.findFirst({
      where: { id: annotationId, anchor: { equals: Prisma.DbNull } },
    })
    expect(asSqlNull).not.toBeNull()
    const asJsonNull = await prisma.layersAnnotation.findFirst({
      where: { id: annotationId, anchor: { equals: Prisma.JsonNull } },
    })
    expect(asJsonNull).toBeNull()
  })
})
