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

    // A video bounding box labelled with the doomed type.
    await seedAnnotation(prisma, {
      data: {
        id: 'vid-ann-1',
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

    // The video bounding box that denoted the type is PRESERVED, not deleted:
    // its type reference is cleared so the user can reassign a type later. The
    // label no longer carries the deleted type id.
    const box = await prisma.layersAnnotation.findUnique({ where: { id: 'vid-ann-1' } })
    expect(box).not.toBeNull()
    expect(box!.ontologyTypeRefId).toBeNull()
    expect(box!.label).toBeNull()
    expect(await countPersonaAnnotations(prisma, persona.id, { label: 'et1' })).toBe(0)

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

  it('deletes a document span that denotes the type via ontologyTypeRefId', async () => {
    const user = await createRegularTestUser(prisma, { username: 'tddoc', email: 'tddoc@example.com' })
    const persona = await prisma.persona.create({
      data: { userId: user.id, name: 'P', role: 'r', informationNeed: 'n' },
    })
    await seedOntology(prisma, {
      data: {
        personaId: persona.id,
        entityTypes: [{ id: 'et1', name: 'Person', gloss: [] }],
        eventTypes: [],
        roleTypes: [],
        relationTypes: [],
      },
    })

    // A document expression with a persona span layer holding a span that
    // denotes the type via ontologyTypeRefId. Unlike a video region (which
    // carries the type id in `label`), a native document span keeps the display
    // name in `label` and the type id in `ontologyTypeRefId`, so the cleanup must
    // match that column too.
    const expression = await prisma.expression.create({
      data: { layersId: 'doc-1', kind: 'text', sourceKind: 'document', languages: [] },
    })
    // The persona span layer holds the type sibling; a persona-free base layer
    // holds the span's identity placeholder over the same token range.
    const personaLayer = await prisma.annotationLayer.create({
      data: { expressionId: expression.id, kind: 'span', personaId: persona.id, languages: [] },
    })
    const baseLayer = await prisma.annotationLayer.create({
      data: { expressionId: expression.id, kind: 'span', personaId: null, languages: [] },
    })
    await prisma.layersAnnotation.create({
      data: { id: 'base-1', layerId: baseLayer.id },
    })
    await prisma.layersAnnotation.create({
      data: { layerId: personaLayer.id, label: 'Person', ontologyTypeRefId: 'et1' },
    })
    expect(await prisma.layersAnnotation.count({ where: { ontologyTypeRefId: 'et1' } })).toBe(1)

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/personas/${persona.id}/ontology/entities/et1`,
      cookies: { session_token: user.sessionToken },
    })
    expect(res.statusCode).toBe(200)

    // The type sibling is deleted, but the base placeholder survives so the span
    // persists (unlabeled) over the same tokens for reassignment.
    expect(await prisma.layersAnnotation.count({ where: { ontologyTypeRefId: 'et1' } })).toBe(0)
    expect(await prisma.layersAnnotation.findUnique({ where: { id: 'base-1' } })).not.toBeNull()
  })

  it('leaves gloss-standoff rows that reference the type untouched by annotation cleanup', async () => {
    const user = await createRegularTestUser(prisma, { username: 'tdgl', email: 'tdgl@example.com' })
    const persona = await prisma.persona.create({
      data: { userId: user.id, name: 'P', role: 'r', informationNeed: 'n' },
    })
    await seedOntology(prisma, {
      data: {
        personaId: persona.id,
        entityTypes: [{ id: 'et1', name: 'Person', gloss: [] }],
        eventTypes: [],
        roleTypes: [],
        relationTypes: [],
      },
    })

    // A gloss standoff row referencing the type via ontologyTypeRefId, in a
    // `gloss`-subkind layer. Annotation cleanup must NOT touch it — gloss
    // rewriting is owned by the ontology aggregate, and deleting the standoff row
    // here would strand the gloss segment rather than freeze it to text.
    const expression = await prisma.expression.create({
      data: { layersId: 'gloss-doc', kind: 'text', sourceKind: 'document', languages: [] },
    })
    const glossLayer = await prisma.annotationLayer.create({
      data: { expressionId: expression.id, kind: 'span', subkind: 'gloss', personaId: persona.id, languages: [] },
    })
    await prisma.layersAnnotation.create({
      data: { id: 'gloss-ref-1', layerId: glossLayer.id, ontologyTypeRefId: 'et1' },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/personas/${persona.id}/ontology/entities/et1`,
      cookies: { session_token: user.sessionToken },
    })
    expect(res.statusCode).toBe(200)

    // The gloss standoff row survives the annotation cleanup.
    expect(await prisma.layersAnnotation.findUnique({ where: { id: 'gloss-ref-1' } })).not.toBeNull()
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

    // The annotation delete rolled back with the rest, so it is still present
    // (matched by its label, the type id — persona annotations reconstruct with
    // the structural type 'type', not the semantic 'entity').
    expect(await countPersonaAnnotations(prisma, persona.id, { label: 'et1' })).toBe(1)

    const { aggregate: world } = await readWorldAggregate(prisma, { userId: user.id, projectId: null })
    const entities = world.entities as Array<{ typeAssignments: Array<{ entityTypeId: string }> }>
    expect(entities[0].typeAssignments.some((a) => a.entityTypeId === 'et1')).toBe(true)

    const ontologyRow = await prisma.layersOntology.findUnique({
      where: { id: layersOntologyForPersonaId(persona.id) },
    })
    expect(ontologyRow!.lockVersion).toBe(0)
  })

  it('freezes a VideoSummary typeRef to the type name on entity-type deletion', async () => {
    const user = await createRegularTestUser(prisma, { username: 'tdsum', email: 'tdsum@example.com' })

    const video = await prisma.video.create({ data: { filename: 'tdsum.mp4', path: '/tdsum.mp4', duration: 60 } })
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

    // A summary whose GlossItem[] mentions the doomed type (et1) inline, plus a
    // surviving-type reference (et2) that must stay a live typeRef, plus plain text.
    const summaryRow = await prisma.videoSummary.create({
      data: {
        videoId: video.id,
        personaId: persona.id,
        createdBy: user.id,
        summary: [
          { type: 'text', content: 'The ' },
          { type: 'typeRef', content: 'et1', refType: 'entity', refPersonaId: persona.id },
          { type: 'text', content: ' stands near a ' },
          { type: 'typeRef', content: 'et2', refType: 'entity', refPersonaId: persona.id },
          { type: 'text', content: '.' },
        ],
      },
    })

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/personas/${persona.id}/ontology/entities/et1`,
      cookies: { session_token: user.sessionToken },
    })
    expect(res.statusCode).toBe(200)

    // The et1 mention is FROZEN to its display name ('Person') as a { type:'text' }
    // item — never dropped, never a dangling id — while the surviving et2 typeRef and
    // the interleaved plain text are left exactly as they were.
    const after = await prisma.videoSummary.findUnique({ where: { id: summaryRow.id } })
    expect(after!.summary).toEqual([
      { type: 'text', content: 'The ' },
      { type: 'text', content: 'Person' },
      { type: 'text', content: ' stands near a ' },
      { type: 'typeRef', content: 'et2', refType: 'entity', refPersonaId: persona.id },
      { type: 'text', content: '.' },
    ])
  })
})
