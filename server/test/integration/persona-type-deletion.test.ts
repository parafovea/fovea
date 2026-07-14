import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { seedBaselinePermissions, createRegularTestUser } from '../helpers/rbac-test-setup.js'
import { seedOntology, seedAnnotation, seedWorldState } from '../helpers/seed-layers.js'
import { readOntologyAggregate } from '../../src/services/layers-bridge/ontology-bridge.js'
import { readWorldAggregate } from '../../src/services/layers-bridge/world-bridge.js'
import { countPersonaAnnotations } from '../../src/services/layers-bridge/annotation-bridge.js'
import { layersOntologyForPersonaId } from '../../src/services/layers-id-map.js'
import { PersonaService } from '../../src/services/persona-service.js'
import { PersonaRepository } from '../../src/repositories/PersonaRepository.js'
import { defineAbilitiesFor } from '../../src/lib/abilities.js'

/**
 * Ontology type deletion runs the annotation delete, the ontology gloss
 * cleanup, and the personal world-state cleanup together, each ontology write
 * routed through the monotonic version guard on the layers ontology. This
 * asserts the whole cleanup lands (type gone, annotations deleted, world
 * assignments stripped) and that the ontology guard advanced, on the DELETE
 * endpoint the frontend uses for graceful type removal.
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
  })

  it('deletes an entity type, its annotations, and its world assignments', async () => {
    const user = await createRegularTestUser(prisma, { username: 'td', email: 'td@example.com' })

    const video = await prisma.video.create({ data: { filename: 'td.mp4', path: '/td.mp4', duration: 60 } })
    const persona = await prisma.persona.create({
      data: { userId: user.id, name: 'P', role: 'r', informationNeed: 'n' },
    })

    // The persona's ontology, seeded into the layers store.
    await seedOntology(prisma, {
      data: {
        personaId: persona.id,
        entityTypes: [
          { id: 'et1', name: 'Person', gloss: [] },
          { id: 'et2', name: 'Place', gloss: [] },
        ],
        eventTypes: [],
        roleTypes: [],
        relationTypes: [],
      },
    })

    // An annotation labelled with the doomed type.
    await seedAnnotation(prisma, {
      data: {
        videoId: video.id,
        personaId: persona.id,
        userId: user.id,
        type: 'entity',
        label: 'et1',
      },
    })

    // A personal world entity assigned the doomed type for this persona.
    await seedWorldState(prisma, {
      data: {
        userId: user.id,
        entities: [
          { id: 'e1', name: 'Alice', typeAssignments: [{ personaId: persona.id, entityTypeId: 'et1' }] },
        ],
      },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/personas/${persona.id}/ontology/entities/et1`,
      cookies: { session_token: user.sessionToken },
    })
    expect(res.statusCode).toBe(200)

    // The type is gone and stays gone; the sibling type is untouched.
    const { aggregate } = await readOntologyAggregate(prisma, persona.id)
    const entityTypeIds = (aggregate.entityTypes as Array<{ id: string }>).map((t) => t.id)
    expect(entityTypeIds).toContain('et2')
    expect(entityTypeIds).not.toContain('et1')

    // The matching annotation was deleted.
    const remaining = await countPersonaAnnotations(prisma, persona.id, { type: 'entity', label: 'et1' })
    expect(remaining).toBe(0)

    // The world assignment for the type was stripped.
    const { aggregate: world } = await readWorldAggregate(prisma, { userId: user.id, projectId: null })
    const entities = world.entities as Array<{ typeAssignments: Array<{ entityTypeId: string }> }>
    expect(entities[0].typeAssignments.some((a) => a.entityTypeId === 'et1')).toBe(false)

    // The guarded ontology write advanced the layers ontology's lock version.
    const ontologyRow = await prisma.layersOntology.findUnique({
      where: { id: layersOntologyForPersonaId(persona.id) },
    })
    expect(ontologyRow!.lockVersion).toBeGreaterThanOrEqual(1)
  })

  it('rolls back the annotation delete and ontology rewrite when a later cleanup write fails', async () => {
    const user = await createRegularTestUser(prisma, { username: 'tdrb', email: 'tdrb@example.com' })

    const video = await prisma.video.create({ data: { filename: 'tdrb.mp4', path: '/tdrb.mp4', duration: 60 } })
    const persona = await prisma.persona.create({
      data: { userId: user.id, name: 'P', role: 'r', informationNeed: 'n' },
    })
    await seedOntology(prisma, {
      data: {
        personaId: persona.id,
        entityTypes: [
          { id: 'et1', name: 'Person', gloss: [] },
          { id: 'et2', name: 'Place', gloss: [] },
        ],
        eventTypes: [],
        roleTypes: [],
        relationTypes: [],
      },
    })
    await seedAnnotation(prisma, {
      data: { videoId: video.id, personaId: persona.id, userId: user.id, type: 'entity', label: 'et1' },
    })
    await seedWorldState(prisma, {
      data: {
        userId: user.id,
        entities: [
          { id: 'e1', name: 'Alice', typeAssignments: [{ personaId: persona.id, entityTypeId: 'et1' }] },
        ],
      },
    })

    // Drive the type deletion through a service whose final cleanup write (the
    // world-state strip) is forced to fail mid-transaction. Because the annotation
    // delete, the version-guarded ontology rewrite, and the world-state strip run
    // in one transaction, the failure must roll ALL of them back.
    const repository = new PersonaRepository(prisma)
    vi.spyOn(repository, 'updateWorldState').mockRejectedValueOnce(new Error('injected mid-transaction failure'))
    const ability = defineAbilitiesFor(
      user.id,
      { systemRole: 'system_admin', groupRoles: [], projectRoles: [] },
      [],
    )
    const service = new PersonaService(repository, ability, user.id, 'system_admin')

    await expect(service.deleteEntityType(persona.id, 'et1')).rejects.toThrow(
      'injected mid-transaction failure',
    )

    // Nothing changed: the type is still present, the annotation still exists, the
    // world assignment is intact, and the ontology lock version never advanced.
    const { aggregate } = await readOntologyAggregate(prisma, persona.id)
    const entityTypeIds = (aggregate.entityTypes as Array<{ id: string }>).map((t) => t.id)
    expect(entityTypeIds).toContain('et1')
    expect(entityTypeIds).toContain('et2')

    expect(await countPersonaAnnotations(prisma, persona.id, { type: 'entity', label: 'et1' })).toBe(1)

    const { aggregate: world } = await readWorldAggregate(prisma, { userId: user.id, projectId: null })
    const entities = world.entities as Array<{ typeAssignments: Array<{ entityTypeId: string }> }>
    expect(entities[0].typeAssignments.some((a) => a.entityTypeId === 'et1')).toBe(true)

    const ontologyRow = await prisma.layersOntology.findUnique({
      where: { id: layersOntologyForPersonaId(persona.id) },
    })
    expect(ontologyRow!.lockVersion).toBe(0)
  })
})
