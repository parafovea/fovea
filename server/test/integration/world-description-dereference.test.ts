import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createRegularTestUser } from '../helpers/rbac-test-setup.js'
import { seedOntology, seedWorldState } from '../helpers/seed-layers.js'
import { readWorldAggregate } from '../../src/services/layers-bridge/world-bridge.js'

/**
 * A world object's `.description` (Entity/Event/EntityCollection/EventCollection
 * GlossItem[]) is stand-off. When a type or a world object is deleted, any inline
 * mention of it in a `.description` must be FROZEN to the deleted thing's display
 * name — a `{ type:'text', content:<name> }` item — never dropped and never left as
 * a dangling id. These assert the freeze survives the stand-off round-trip for both
 * the ontology-type DELETE and the world-object DELETE endpoints the UI uses.
 */
describe('World object .description reference dereferencing on delete', () => {
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
  })

  it('freezes a world entity description typeRef to the type name when the type is deleted', async () => {
    const user = await createRegularTestUser(prisma, { username: 'wd1', email: 'wd1@example.com' })
    const persona = await prisma.persona.create({
      data: { userId: user.id, name: 'P', role: 'r', informationNeed: 'n' },
    })
    await seedOntology(prisma, {
      data: {
        personaId: persona.id,
        entityTypes: [{ id: 'et1', name: 'Protagonist', gloss: [] }],
        eventTypes: [],
        roleTypes: [],
        relationTypes: [],
      },
    })
    // An entity whose description mentions the doomed type inline.
    await seedWorldState(prisma, {
      data: {
        userId: user.id,
        entities: [
          {
            id: 'e1',
            name: 'Scene',
            description: [
              { type: 'text', content: 'the ' },
              { type: 'typeRef', content: 'et1', refType: 'entity', refPersonaId: persona.id },
              { type: 'text', content: ' appears' },
            ],
          },
        ],
      },
    })

    // Sanity: the seeded typeRef round-trips through the stand-off store.
    const before = await readWorldAggregate(prisma, { userId: user.id, projectId: null })
    const beforeDesc = (before.aggregate.entities as Array<{ description: Array<{ type: string; content: string }> }>)[0].description
    expect(beforeDesc.some((i) => i.type === 'typeRef' && i.content === 'et1')).toBe(true)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/personas/${persona.id}/ontology/entities/et1`,
      cookies: { session_token: user.sessionToken },
    })
    expect(res.statusCode).toBe(200)

    // The mention is FROZEN to the display name: no dangling typeRef, and the name
    // text is spliced in place (never dropped).
    const after = await readWorldAggregate(prisma, { userId: user.id, projectId: null })
    const desc = (after.aggregate.entities as Array<{ description: Array<{ type: string; content: string }> }>)[0].description
    expect(desc.some((i) => i.type === 'typeRef' && i.content === 'et1')).toBe(false)
    expect(desc.every((i) => i.type === 'text')).toBe(true)
    expect(desc.map((i) => i.content).join('')).toBe('the Protagonist appears')
  })

  it('freezes a world entity description objectRef to the object name when the referenced object is deleted', async () => {
    const user = await createRegularTestUser(prisma, { username: 'wd2', email: 'wd2@example.com' })
    // e2's description mentions e1; deleting e1 must freeze the mention to 'Alice'.
    await seedWorldState(prisma, {
      data: {
        userId: user.id,
        entities: [
          { id: 'e1', name: 'Alice', description: [] },
          {
            id: 'e2',
            name: 'Bob',
            description: [
              { type: 'text', content: 'about ' },
              { type: 'objectRef', content: 'e1', refType: 'entity-object' },
              { type: 'text', content: '.' },
            ],
          },
        ],
      },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/world/entities/e1',
      cookies: { session_token: user.sessionToken },
    })
    expect(res.statusCode).toBe(200)

    const after = await readWorldAggregate(prisma, { userId: user.id, projectId: null })
    const entities = after.aggregate.entities as Array<{ id: string; description: Array<{ type: string; content: string }> }>
    // e1 is gone; e2 survives with its mention frozen to the object's display name.
    expect(entities.map((e) => e.id)).toEqual(['e2'])
    const desc = entities[0].description
    expect(desc.some((i) => i.type === 'objectRef' && i.content === 'e1')).toBe(false)
    expect(desc.every((i) => i.type === 'text')).toBe(true)
    expect(desc.map((i) => i.content).join('')).toBe('about Alice.')
  })
})
