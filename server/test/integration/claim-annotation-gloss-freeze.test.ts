import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

import { buildApp } from '../../src/app.js'
import { seedBaselinePermissions, createRegularTestUser } from '../helpers/rbac-test-setup.js'
import { WorldStateService } from '../../src/services/world-state-service.js'
import { LayersOntologyRepository } from '../../src/repositories/LayersOntologyRepository.js'
import type { GlossItem } from '../../src/models/types.js'

/**
 * The ontology-gloss carrier must freeze an inline mention of a deleted CLAIM or
 * ANNOTATION to that thing's display name — the same graceful-delete policy the
 * type and world-object carriers already honor. This drives the one seam the
 * claim / annotation delete paths call, dereferenceOntologyGlosses, for both new
 * reference kinds and proves the mention is frozen to text through the aggregate
 * rewrite (regenerated stand-off, not a deleted/stranded row), while the other
 * reference kinds in the same gloss are left untouched.
 */
describe('Ontology gloss freeze on claim / annotation deletion', () => {
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
    await prisma.layersAnnotation.deleteMany()
    await prisma.annotationLayer.deleteMany()
    await prisma.expression.deleteMany()
    await prisma.typeDef.deleteMany()
    await prisma.layersOntology.deleteMany()
    await prisma.graphEdge.deleteMany()
    await prisma.graphNode.deleteMany()
    await prisma.session.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.rolePermission.deleteMany()
    await prisma.user.deleteMany()
    await seedBaselinePermissions(prisma)
  })

  it('freezes claimRef and annotationRef gloss mentions to their display names, leaving objectRef untouched', async () => {
    const user = await createRegularTestUser(prisma, { username: 'gf', email: 'gf@example.com' })
    const persona = await prisma.persona.create({
      data: { userId: user.id, name: 'Analyst', role: 'analyst', informationNeed: 'understand events' },
    })

    // Null ability is safe: writePersonaOntology / dereferenceOntologyGlosses never consult it.
    const world = new WorldStateService(new LayersOntologyRepository(prisma), prisma, null, user.id)

    // One entity type whose gloss mentions a claim, an annotation, and a world
    // object inline — each a stand-off reference segment.
    const gloss: GlossItem[] = [
      { type: 'text', content: 'See ' },
      { type: 'claimRef', content: 'the earlier claim', refClaimId: 'claim-1' },
      { type: 'text', content: ', box ' },
      { type: 'annotationRef', content: 'ann-1' },
      { type: 'text', content: ', and ' },
      { type: 'objectRef', content: 'entity-9', refType: 'entity-object' },
      { type: 'text', content: '.' },
    ]
    await world.writePersonaOntology(persona, {
      entityTypes: [{ id: 'et1', name: 'Person', gloss }],
      eventTypes: [],
      roleTypes: [],
      relationTypes: [],
    })

    const readGloss = async (): Promise<GlossItem[]> => {
      const bundle = await world.readPersonaOntologyBundle(persona)
      const et = (bundle!.aggregate.entityTypes as Array<{ id: string; gloss: GlossItem[] }>).find((t) => t.id === 'et1')!
      return et.gloss
    }

    // The seed round-trips through the stand-off: all three ref kinds survive.
    const seeded = await readGloss()
    expect(seeded.some((g) => g.type === 'claimRef' && g.refClaimId === 'claim-1')).toBe(true)
    expect(seeded.some((g) => g.type === 'annotationRef' && g.content === 'ann-1')).toBe(true)
    expect(seeded.some((g) => g.type === 'objectRef' && g.content === 'entity-9')).toBe(true)

    // Delete the claim: its gloss mention freezes to the claim's display name.
    const claimHits = await world.dereferenceOntologyGlosses(user.id, {
      kind: 'claimRef',
      id: 'claim-1',
      name: 'THE FROZEN CLAIM',
    })
    expect(claimHits).toBe(1)

    const afterClaim = await readGloss()
    expect(afterClaim.some((g) => g.type === 'claimRef')).toBe(false)
    expect(afterClaim.some((g) => g.type === 'text' && g.content.includes('THE FROZEN CLAIM'))).toBe(true)
    // Kind-scoped: the annotationRef and objectRef stay put.
    expect(afterClaim.some((g) => g.type === 'annotationRef' && g.content === 'ann-1')).toBe(true)
    expect(afterClaim.some((g) => g.type === 'objectRef' && g.content === 'entity-9')).toBe(true)

    // Delete the annotation: its gloss mention freezes to the annotation label.
    const annHits = await world.dereferenceOntologyGlosses(user.id, {
      kind: 'annotationRef',
      id: 'ann-1',
      name: 'Bounding Box 7',
    })
    expect(annHits).toBe(1)

    const afterAnn = await readGloss()
    expect(afterAnn.some((g) => g.type === 'annotationRef')).toBe(false)
    expect(afterAnn.some((g) => g.type === 'text' && g.content.includes('Bounding Box 7'))).toBe(true)
    expect(afterAnn.some((g) => g.type === 'objectRef' && g.content === 'entity-9')).toBe(true)

    // Idempotent: a second freeze of the same claim finds nothing left to freeze.
    expect(await world.dereferenceOntologyGlosses(user.id, { kind: 'claimRef', id: 'claim-1', name: 'x' })).toBe(0)
  })
})
