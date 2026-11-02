/**
 * Integration test for the legacy data shapes found in a real 0.5 deployment
 * that the representative fixture does not cover, and for the object-level
 * catch-up after a rollback to 0.5.
 *
 * On top of the standard fixture it seeds a seed-script ontology type (a plain
 * `description` and a `color`, no `gloss`), relation-type `symmetric`/
 * `transitive` flags, a Wikidata-imported location entity whose coordinates
 * carry `globe` and `precision`, an annotation with tracker provenance but no
 * track id, and a seed-owned `demo-fixture` annotation. The copy must verify
 * with the field audit on, preserve each of those, and skip the demo fixture.
 * The catch-up test then edits in 0.6 and in 0.5 after the verified copy and
 * asserts a `since` copy keeps both sides' work.
 *
 * @module
 */

import { randomUUID } from 'node:crypto'

import { beforeAll, afterAll, describe, it, expect } from 'vitest'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

import { runBackfill } from '../runner.js'
import { runVerify } from '../verify.js'
import { readOntologyAggregate, writeOntologyAggregate } from '../../../src/services/layers-bridge/ontology-bridge.js'
import { mergeWorldObjects, readWorldAggregate } from '../../../src/services/layers-bridge/world-bridge.js'
import { readAnnotationById } from '../../../src/services/layers-bridge/annotation-bridge.js'
import { reuseAnnotationId } from '../id-map.js'
import { seedLegacyFixture, cleanupFixture, FIXTURE_FRAMES, type LegacyFixture } from './fixtures.js'

dotenv.config()

describe('layers backfill over real-deployment shapes', () => {
  let prisma: PrismaClient
  let fixture: LegacyFixture
  let since: Date
  const seedTypeId = `seed-type-${randomUUID()}`
  const locationId = randomUUID()
  const untrackedAnnotationId = randomUUID()
  const demoFixtureAnnotationId = randomUUID()

  beforeAll(async () => {
    prisma = new PrismaClient()
    since = new Date()
    fixture = await seedLegacyFixture(prisma)
    const stamp = new Date().toISOString()

    const ontology = await prisma.ontology.findUniqueOrThrow({ where: { id: fixture.ontologyId } })
    const relationTypes = (ontology.relationTypes as Array<Record<string, unknown>>).map((type) => ({
      ...type,
      symmetric: false,
      transitive: true,
    }))
    await prisma.ontology.update({
      where: { id: fixture.ontologyId },
      data: {
        entityTypes: [
          ...(ontology.entityTypes as object[]),
          { id: seedTypeId, name: 'Vehicle', description: 'A vehicle in the video', color: '#2196F3' },
        ],
        relationTypes,
      },
    })

    const world = await prisma.worldState.findUniqueOrThrow({ where: { id: fixture.worldStateId } })
    await prisma.worldState.update({
      where: { id: fixture.worldStateId },
      data: {
        entities: [
          ...(world.entities as object[]),
          {
            id: locationId,
            name: 'Port of Long Beach',
            wikidataId: 'Q2244441',
            wikidataUrl: 'https://www.wikidata.org/wiki/Q2244441',
            importedFrom: 'wikidata',
            importedAt: stamp,
            locationType: 'point',
            coordinateSystem: 'GPS',
            coordinates: {
              globe: 'http://www.wikidata.org/entity/Q2',
              altitude: null,
              latitude: 33.754185,
              longitude: -118.216458,
              precision: 0.00000277777777778,
            },
            createdAt: stamp,
            updatedAt: stamp,
          },
        ],
      },
    })

    // Tracker provenance without a track id, as the samurai tracker recorded it.
    const untrackedFrames: Record<string, unknown> = { ...FIXTURE_FRAMES }
    delete untrackedFrames.trackId
    await prisma.annotation.createMany({
      data: [
        {
          id: untrackedAnnotationId,
          videoId: fixture.videoId,
          personaId: fixture.personaId,
          userId: fixture.userId,
          createdByUserId: fixture.userId,
          type: 'type',
          label: fixture.entityTypeId,
          frames: { ...untrackedFrames, trackingSource: 'samurai', trackingConfidence: 0.92 } as object,
          source: 'manual',
        },
        {
          id: demoFixtureAnnotationId,
          videoId: fixture.videoId,
          personaId: fixture.personaId,
          userId: fixture.userId,
          createdByUserId: fixture.userId,
          type: 'type',
          label: fixture.entityTypeId,
          frames: FIXTURE_FRAMES as object,
          source: 'demo-fixture:real-shapes',
        },
      ],
    })
  })

  afterAll(async () => {
    if (fixture) await cleanupFixture(prisma, fixture)
    await prisma.$disconnect()
  })

  it('copies every real-deployment shape and verifies with the field audit', async () => {
    await runBackfill(prisma, { since })
    const report = await runVerify(prisma, { since })
    expect(report.mismatches).toEqual([])

    const ontology = (await readOntologyAggregate(prisma, fixture.personaId)).aggregate
    const seedType = (ontology.entityTypes as Array<Record<string, unknown>>).find((t) => t.id === seedTypeId)
    expect(seedType?.gloss).toEqual([{ type: 'text', content: 'A vehicle in the video' }])
    const relationType = (ontology.relationTypes as Array<Record<string, unknown>>)[0]
    expect(relationType.transitive).toBe(true)

    const world = (await readWorldAggregate(prisma, { userId: fixture.userId, projectId: null })).aggregate
    const location = (world.entities as Array<Record<string, unknown>>).find((e) => e.id === locationId)
    expect(location?.coordinates).toMatchObject({
      globe: 'http://www.wikidata.org/entity/Q2',
      precision: 0.00000277777777778,
      latitude: 33.754185,
      longitude: -118.216458,
    })

    const untracked = await readAnnotationById(prisma, reuseAnnotationId(untrackedAnnotationId))
    expect(untracked?.frames.trackingSource).toBe('samurai')
    expect(untracked?.frames.trackingConfidence).toBeCloseTo(0.92, 3)
    const legacy = await prisma.annotation.findUniqueOrThrow({ where: { id: untrackedAnnotationId } })
    expect(untracked?.createdAt).toBe(legacy.createdAt.toISOString())

    expect(await prisma.layersAnnotation.count({ where: { id: reuseAnnotationId(demoFixtureAnnotationId) } })).toBe(0)
  })

  it('catches up 0.5 edits made after the copy without reverting 0.6 edits', async () => {
    const verifiedAt = new Date()
    const scope = { userId: fixture.userId, projectId: null }

    // Work done in 0.6 after the copy.
    const currentWorld = (await readWorldAggregate(prisma, scope)).aggregate
    const event = (currentWorld.events as Array<Record<string, unknown>>).find((e) => e.id === fixture.eventId)!
    await mergeWorldObjects(prisma, scope, {
      entities: [],
      events: [{ ...event, name: 'Edited in 0.6', updatedAt: new Date().toISOString() }],
      times: [],
      entityCollections: [],
      eventCollections: [],
      timeCollections: [],
      relations: [],
    } as never)
    const persona = await prisma.persona.findUniqueOrThrow({ where: { id: fixture.personaId } })
    const currentOntology = (await readOntologyAggregate(prisma, fixture.personaId)).aggregate
    await writeOntologyAggregate(
      prisma,
      fixture.personaId,
      {
        ...currentOntology,
        entityTypes: [
          ...currentOntology.entityTypes,
          { id: 'added-in-0.6', name: 'Added in 0.6', gloss: [{ type: 'text', content: 'after the upgrade' }] },
        ],
      } as never,
      { name: persona.name, description: null, domain: null },
      { projectId: persona.projectId, createdByUserId: persona.userId },
    )

    // Work done in 0.5 after a rollback: a different world object and a type.
    const later = new Date(verifiedAt.getTime() + 1000).toISOString()
    const world = await prisma.worldState.findUniqueOrThrow({ where: { id: fixture.worldStateId } })
    await prisma.worldState.update({
      where: { id: fixture.worldStateId },
      data: {
        entities: (world.entities as Array<Record<string, unknown>>).map((e) =>
          e.id === fixture.entityId ? { ...e, name: 'Edited in 0.5', updatedAt: later } : e,
        ) as object[],
      },
    })
    const ontology = await prisma.ontology.findUniqueOrThrow({ where: { id: fixture.ontologyId } })
    await prisma.ontology.update({
      where: { id: fixture.ontologyId },
      data: {
        entityTypes: (ontology.entityTypes as Array<Record<string, unknown>>).map((t) =>
          t.id === fixture.entityTypeId ? { ...t, name: 'Renamed in 0.5', updatedAt: later } : t,
        ) as object[],
      },
    })

    await runBackfill(prisma, { since: verifiedAt })
    const report = await runVerify(prisma, { since: verifiedAt })
    expect(report.mismatches).toEqual([])

    const worldAfter = (await readWorldAggregate(prisma, scope)).aggregate
    const names = new Map(
      [...(worldAfter.entities as Array<Record<string, unknown>>), ...(worldAfter.events as Array<Record<string, unknown>>)].map(
        (o) => [o.id, o.name],
      ),
    )
    expect(names.get(fixture.eventId)).toBe('Edited in 0.6')
    expect(names.get(fixture.entityId)).toBe('Edited in 0.5')

    const ontologyAfter = (await readOntologyAggregate(prisma, fixture.personaId)).aggregate
    const typeNames = new Map((ontologyAfter.entityTypes as Array<Record<string, unknown>>).map((t) => [t.id, t.name]))
    expect(typeNames.get('added-in-0.6')).toBe('Added in 0.6')
    expect(typeNames.get(fixture.entityTypeId)).toBe('Renamed in 0.5')
  })
})
