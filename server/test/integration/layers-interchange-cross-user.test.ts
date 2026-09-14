import { randomUUID } from 'node:crypto'

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

import { buildApp } from '../../src/app.js'
import { hashPassword } from '../../src/lib/password.js'
import {
  InterchangeRepository,
  type NormalizedRecordDTO,
  type LayersScope,
} from '../../src/repositories/InterchangeRepository.js'

/**
 * Interchange persistence isolation and round-trip fidelity, exercised against
 * the real InterchangeRepository (the layer the import path delegates all
 * writes to) and a real Postgres. These pin the audit fixes that make an import
 * incapable of touching another owner's rows while keeping the export -> import
 * round-trip lossless for the importer's own content:
 *
 *  - A record whose local_id resolves to a row owned by a different scope is
 *    skipped, never overwritten (no cross-tenant hijack by id collision).
 *  - A child record (layer/annotation) whose parent belongs to a different
 *    scope is skipped, never grafted onto that parent.
 *  - readCorpusRecords -> persistNormalizedRecords round-trips corpus members
 *    (the expression's corpusId survives) and writes the annotation's feature
 *    bundle — not the whole record envelope — into the features column.
 */
describe('Layers interchange cross-user isolation and round-trip', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let repository: InterchangeRepository

  let userAId: string
  let userBId: string

  const scopeA = (): LayersScope => ({ projectId: null, createdByUserId: userAId })
  const scopeB = (): LayersScope => ({ projectId: null, createdByUserId: userBId })

  const CORPUS_NSID = 'pub.layers.corpus#Corpus'
  const EXPRESSION_NSID = 'pub.layers.expression#Expression'
  const LAYER_NSID = 'pub.layers.annotation#AnnotationLayer'
  const ANNOTATION_NSID = 'pub.layers.annotation#Annotation'

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
    repository = new InterchangeRepository(prisma)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.importHistory.deleteMany()
    await prisma.textAnnotationRelation.deleteMany()
    await prisma.layersAnnotation.deleteMany()
    await prisma.annotationLayer.deleteMany()
    await prisma.tokenization.deleteMany()
    await prisma.segmentation.deleteMany()
    await prisma.corpusMembership.deleteMany()
    await prisma.corpus.deleteMany()
    await prisma.clusterSet.deleteMany()
    await prisma.alignment.deleteMany()
    await prisma.expression.deleteMany()
    await prisma.media.deleteMany()
    await prisma.user.deleteMany()

    const hashA = await hashPassword('passwordA')
    const hashB = await hashPassword('passwordB')
    const userA = await prisma.user.create({
      data: { username: `ix-a-${randomUUID().slice(0, 8)}`, email: `a-${randomUUID()}@example.com`, passwordHash: hashA, displayName: 'A', isAdmin: false },
    })
    const userB = await prisma.user.create({
      data: { username: `ix-b-${randomUUID().slice(0, 8)}`, email: `b-${randomUUID()}@example.com`, passwordHash: hashB, displayName: 'B', isAdmin: false },
    })
    userAId = userA.id
    userBId = userB.id
  })

  /**
   * Seeds a corpus owned by user A with one member expression, one span layer,
   * and one annotation carrying a distinct feature bundle.
   */
  async function seedCorpusA(): Promise<{
    corpusId: string
    expressionId: string
    layerId: string
    annotationId: string
  }> {
    const corpus = await prisma.corpus.create({
      data: { id: randomUUID(), name: 'Corpus A', createdByUserId: userAId },
    })
    const expression = await prisma.expression.create({
      data: {
        id: randomUUID(),
        layersId: randomUUID(),
        kind: 'document',
        sourceKind: 'document',
        text: 'member document',
        corpusId: corpus.id,
        createdByUserId: userAId,
      },
    })
    const layer = await prisma.annotationLayer.create({
      data: { id: randomUUID(), expressionId: expression.id, kind: 'span', subkind: 'claim', createdByUserId: userAId },
    })
    const annotation = await prisma.layersAnnotation.create({
      data: {
        id: randomUUID(),
        layerId: layer.id,
        anchor: { textAnchor: { tokenIndices: [0, 1] } },
        label: 'a-label',
        features: { salience: 0.5, kind: 'claim' },
        createdByUserId: userAId,
      },
    })
    return { corpusId: corpus.id, expressionId: expression.id, layerId: layer.id, annotationId: annotation.id }
  }

  it('exports a corpus as normalized records with object value_json', async () => {
    const seeded = await seedCorpusA()
    const records = await repository.readCorpusRecords({ id: seeded.corpusId, name: 'Corpus A' }, {})

    const byNsid = new Map(records.map((r) => [r.nsid, r]))
    expect(byNsid.has(CORPUS_NSID)).toBe(true)
    expect(byNsid.has(EXPRESSION_NSID)).toBe(true)
    expect(byNsid.has(LAYER_NSID)).toBe(true)
    expect(byNsid.has(ANNOTATION_NSID)).toBe(true)

    // value_json is a decoded object (the server serializes it to a JSON string
    // only at the model-service wire boundary), and the expression record still
    // carries its corpus membership.
    const exprRecord = records.find((r) => r.nsid === EXPRESSION_NSID)!
    expect(typeof exprRecord.value_json).toBe('object')
    expect((exprRecord.value_json as { corpusId?: string }).corpusId).toBe(seeded.corpusId)
  })

  it('round-trips a corpus for its own owner without duplicating rows or losing membership', async () => {
    const seeded = await seedCorpusA()
    const records = await repository.readCorpusRecords({ id: seeded.corpusId, name: 'Corpus A' }, {})

    const result = await repository.persistNormalizedRecords(records, scopeA())
    expect(result.persisted).toBe(4)
    expect(result.skipped).toBe(0)

    // No duplicate rows: the upsert keyed by local_id updates in place.
    expect(await prisma.corpus.count()).toBe(1)
    expect(await prisma.expression.count()).toBe(1)
    expect(await prisma.annotationLayer.count()).toBe(1)
    expect(await prisma.layersAnnotation.count()).toBe(1)

    // The membership FK survives the round-trip.
    const expr = await prisma.expression.findUnique({ where: { id: seeded.expressionId } })
    expect(expr?.corpusId).toBe(seeded.corpusId)
  })

  it('skips a record whose id resolves to a row owned by another scope', async () => {
    const seeded = await seedCorpusA()

    // User B tries to overwrite user A's corpus by colliding on its id.
    const hijack: NormalizedRecordDTO[] = [
      { local_id: seeded.corpusId, nsid: CORPUS_NSID, value_json: { name: 'HIJACKED', description: 'owned by B now' } },
    ]
    const result = await repository.persistNormalizedRecords(hijack, scopeB())
    expect(result.persisted).toBe(0)
    expect(result.skipped).toBe(1)

    // A's corpus is untouched: name and owner unchanged.
    const corpus = await prisma.corpus.findUnique({ where: { id: seeded.corpusId } })
    expect(corpus?.name).toBe('Corpus A')
    expect(corpus?.createdByUserId).toBe(userAId)
  })

  it('skips a child record whose parent belongs to another scope', async () => {
    const seeded = await seedCorpusA()

    // User B tries to graft a new annotation layer onto user A's expression.
    const newLayerId = randomUUID()
    const graft: NormalizedRecordDTO[] = [
      { local_id: newLayerId, nsid: LAYER_NSID, value_json: { expressionId: seeded.expressionId, kind: 'span', subkind: 'graft' } },
    ]
    const result = await repository.persistNormalizedRecords(graft, scopeB())
    expect(result.persisted).toBe(0)
    expect(result.skipped).toBe(1)

    // No layer was grafted onto A's expression.
    expect(await prisma.annotationLayer.findUnique({ where: { id: newLayerId } })).toBeNull()
    const layersOnA = await prisma.annotationLayer.count({ where: { expressionId: seeded.expressionId } })
    expect(layersOnA).toBe(1) // only the originally seeded layer
  })

  it('writes the annotation feature bundle into features, not the whole record', async () => {
    // A self-contained batch owned by user B: expression, layer, annotation.
    const exprId = randomUUID()
    const layerId = randomUUID()
    const annId = randomUUID()
    const featureBundle = { sentiment: 'negative', salience: 0.9 }
    const records: NormalizedRecordDTO[] = [
      { local_id: exprId, nsid: EXPRESSION_NSID, value_json: { layersId: exprId, kind: 'document', sourceKind: 'document', text: 't' } },
      { local_id: layerId, nsid: LAYER_NSID, value_json: { expressionId: exprId, kind: 'span', subkind: 'claim' } },
      {
        local_id: annId,
        nsid: ANNOTATION_NSID,
        value_json: { id: annId, layerId, anchor: { textAnchor: { tokenIndices: [2] } }, label: 'lbl', features: featureBundle },
      },
    ]

    const result = await repository.persistNormalizedRecords(records, scopeB())
    expect(result.persisted).toBe(3)

    const row = await prisma.layersAnnotation.findUnique({ where: { id: annId } })
    expect(row?.features).toEqual(featureBundle)
    // The envelope keys must not have leaked into the features column.
    expect(Object.keys(row?.features as object)).not.toContain('anchor')
    expect(Object.keys(row?.features as object)).not.toContain('label')
    expect(row?.label).toBe('lbl')
  })
})
