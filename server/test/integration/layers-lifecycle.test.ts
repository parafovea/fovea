import { beforeEach, afterEach, afterAll, describe, it, expect } from 'vitest'
import { PrismaClient } from '@prisma/client'

import { runBackfill } from '../../prisma/migrate-0.6/runner.js'
import { seedLegacyFixture, cleanupFixture, type LegacyFixture } from '../../prisma/migrate-0.6/__tests__/fixtures.js'
import { annotationLayerId, claimSpanLayerId } from '../../src/services/layers-id-map.js'

/** Native dependent records follow all routes that remove their legacy parent. */
describe('layers parent lifecycle', () => {
  const prisma = new PrismaClient()
  let fixture: LegacyFixture
  beforeEach(async () => {
    const since = new Date()
    fixture = await seedLegacyFixture(prisma)
    await runBackfill(prisma, { since })
  })
  afterEach(async () => { await cleanupFixture(prisma, fixture) })
  afterAll(async () => { await prisma.$disconnect() })

  it.each(['summary', 'persona', 'video', 'user'] as const)('cleans claim nodes, spans and edges when deleting a %s', async (parent) => {
    if (parent === 'summary') await prisma.videoSummary.delete({ where: { id: fixture.summaryId } })
    if (parent === 'persona') await prisma.persona.delete({ where: { id: fixture.personaId } })
    if (parent === 'video') await prisma.video.delete({ where: { id: fixture.videoId } })
    if (parent === 'user') await prisma.user.delete({ where: { id: fixture.userId } })
    expect(await prisma.graphNode.count({ where: { id: { in: [fixture.claimAId, fixture.claimBId] } } })).toBe(0)
    expect(await prisma.graphEdge.count({ where: { id: fixture.claimRelationId } })).toBe(0)
    expect(await prisma.annotationLayer.count({ where: { id: claimSpanLayerId(fixture.summaryId) } })).toBe(0)
    if (parent === 'user') {
      expect(await prisma.graphNode.count({ where: { createdByUserId: fixture.userId } })).toBe(0)
      expect(await prisma.layersAnnotation.count({ where: { createdByUserId: fixture.userId } })).toBe(0)
    }
  })

  it('does not delete unrelated layers or nodes named by summary argument refs', async () => {
    const layerId = annotationLayerId(fixture.videoId, null)
    const annotation = await prisma.layersAnnotation.create({ data: {
      layerId, denotesNodeId: fixture.entityId,
      arguments: [{ role: 'summary', target: { localId: { value: fixture.summaryId } } }],
      createdByUserId: fixture.userId,
    } })
    await prisma.videoSummary.delete({ where: { id: fixture.summaryId } })
    expect(await prisma.annotationLayer.findUnique({ where: { id: layerId } })).not.toBeNull()
    expect(await prisma.layersAnnotation.findUnique({ where: { id: annotation.id } })).not.toBeNull()
    expect(await prisma.graphNode.findUnique({ where: { id: fixture.entityId } })).not.toBeNull()
  })

  it('deletes project-scoped world rows instead of moving them into a personal world', async () => {
    const project = await prisma.project.create({ data: { name: 'Lifecycle', slug: `lifecycle-${fixture.userId}`, ownerUserId: fixture.userId, createdBy: fixture.userId } })
    const scope = { projectId: project.id, createdByUserId: fixture.userId }
    const node = await prisma.graphNode.create({ data: { ...scope, nodeType: 'entity' } })
    const edge = await prisma.graphEdge.create({ data: { ...scope, edgeType: 'relation', source: { localId: { value: node.id } }, target: { localId: { value: node.id } }, sourceLocalId: node.id, targetLocalId: node.id } })
    const collection = await prisma.catalogCollection.create({ data: { ...scope, name: 'Project collection', kind: 'entity' } })
    const membership = await prisma.catalogMembership.create({ data: { ...scope, catalogRef: collection.id, role: 'member', member: { localId: { value: node.id } } } })
    const expression = await prisma.expression.create({ data: { ...scope, layersId: project.id, kind: 'concept', sourceKind: 'world-model' } })
    await prisma.project.delete({ where: { id: project.id } })
    expect(await prisma.graphNode.findUnique({ where: { id: node.id } })).toBeNull()
    expect(await prisma.graphEdge.findUnique({ where: { id: edge.id } })).toBeNull()
    expect(await prisma.catalogCollection.findUnique({ where: { id: collection.id } })).toBeNull()
    expect(await prisma.catalogMembership.findUnique({ where: { id: membership.id } })).toBeNull()
    expect(await prisma.expression.findUnique({ where: { id: expression.id } })).toBeNull()
  })

})
