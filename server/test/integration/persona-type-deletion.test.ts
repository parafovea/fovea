import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createRegularTestUser } from '../helpers/rbac-test-setup.js'

/**
 * Ontology type deletion runs the annotation delete, the ontology gloss
 * cleanup, and the personal world-state cleanup in one transaction, each write
 * routed through the monotonic version guard. This asserts the whole cleanup
 * lands (type gone, annotations deleted, world assignments stripped) and that
 * the guard advanced, on the DELETE endpoint the frontend uses for graceful
 * type removal.
 */
describe('Persona ontology type deletion', () => {
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
    await prisma.claim.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.worldState.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.video.deleteMany()
    await prisma.session.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
  })

  it('deletes an entity type, its annotations, and its world assignments atomically', async () => {
    const user = await createRegularTestUser(prisma, { username: 'td', email: 'td@example.com' })

    const video = await prisma.video.create({ data: { filename: 'td.mp4', path: '/td.mp4' } })
    const persona = await prisma.persona.create({
      data: {
        userId: user.id,
        name: 'P',
        role: 'r',
        informationNeed: 'n',
        ontology: {
          create: {
            entityTypes: [
              { id: 'et1', name: 'Person', gloss: [] },
              { id: 'et2', name: 'Place', gloss: [] },
            ],
            eventTypes: [],
            roleTypes: [],
            relationTypes: [],
          },
        },
      },
    })

    // An annotation labelled with the doomed type.
    await prisma.annotation.create({
      data: {
        videoId: video.id,
        personaId: persona.id,
        type: 'entity',
        label: 'et1',
        frames: {},
        createdByUserId: user.id,
      },
    })

    // A personal world entity assigned the doomed type for this persona.
    await prisma.worldState.create({
      data: {
        userId: user.id,
        entities: [
          { id: 'e1', name: 'Alice', typeAssignments: [{ personaId: persona.id, entityTypeId: 'et1' }] },
        ],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: [],
      },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/personas/${persona.id}/ontology/entities/et1`,
      cookies: { session_token: user.sessionToken },
    })
    expect(res.statusCode).toBe(200)

    // The type is gone and stays gone; the sibling type is untouched.
    const ontology = await prisma.ontology.findUnique({ where: { personaId: persona.id } })
    const entityTypeIds = (ontology!.entityTypes as Array<{ id: string }>).map((t) => t.id)
    expect(entityTypeIds).toContain('et2')
    expect(entityTypeIds).not.toContain('et1')

    // The matching annotation was deleted in the same transaction.
    const remaining = await prisma.annotation.count({
      where: { personaId: persona.id, type: 'entity', label: 'et1' },
    })
    expect(remaining).toBe(0)

    // The world assignment for the type was stripped.
    const worldState = await prisma.worldState.findFirst({ where: { userId: user.id, projectId: null } })
    const entities = worldState!.entities as Array<{ typeAssignments: Array<{ entityTypeId: string }> }>
    expect(entities[0].typeAssignments.some((a) => a.entityTypeId === 'et1')).toBe(false)

    // Each guarded write advanced its row's version.
    expect(ontology!.version).toBeGreaterThanOrEqual(1)
    expect(worldState!.version).toBeGreaterThanOrEqual(1)
  })
})
