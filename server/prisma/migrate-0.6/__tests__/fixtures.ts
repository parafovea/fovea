/**
 * Synthetic legacy seeder for the backfill integration test.
 *
 * The dev database carries videos but no annotations/ontologies/world/claims, so
 * the backfill tests seed their own representative row of every legacy source:
 * a User, a Persona, an Ontology (one type per bucket, one carrying a Wikidata
 * id), a WorldState (an entity, an event, and a relation between them), a Video,
 * an Annotation whose frames are a multi-keyframe bounding-box sequence with
 * mixed interpolation, a visibility gap, and a track id, a VideoSummary with a
 * two-segment speaker transcript and a narrative gloss, and two Claims with text
 * spans joined by a ClaimRelation.
 *
 * The seeder returns every id it minted so the test can drive the backfill,
 * assert against the source, and tear the graph down in reverse-foreign-key
 * order (both the legacy rows and the layers rows the backfill produces).
 *
 * @module
 */

import { randomUUID } from 'node:crypto'

import { PrismaClient } from '@prisma/client'

import type { BoundingBoxSequence } from '../../../src/services/layers-conversion-service.js'

/** The ids the seeder minted, for assertions and teardown. */
export interface LegacyFixture {
  userId: string
  personaId: string
  ontologyId: string
  entityTypeId: string
  eventTypeId: string
  roleTypeId: string
  relationTypeId: string
  worldStateId: string
  entityId: string
  eventId: string
  worldRelationId: string
  videoId: string
  annotationId: string
  summaryId: string
  claimAId: string
  claimBId: string
  claimRelationId: string
}

/**
 * The multi-keyframe frames sequence used by the fixture annotation. It combines
 * mixed interpolation (linear then eased), a visibility gap (an occlusion in the
 * middle), a string track id, per-box confidence, and box metadata, so the
 * round-trip verifier exercises every branch of the conversion service.
 */
export const FIXTURE_FRAMES: BoundingBoxSequence = {
  boxes: [
    { x: 10.5, y: 12.25, width: 50.75, height: 60.1, frameNumber: 0, isKeyframe: true, confidence: 0.9 },
    { x: 80, y: 40, width: 55, height: 62, frameNumber: 30, isKeyframe: true, confidence: 0.75 },
    {
      x: 160.333,
      y: 90.667,
      width: 60,
      height: 65,
      frameNumber: 90,
      isKeyframe: true,
      confidence: 0.6,
      metadata: { occlusion: 0.2, pose: { yaw: 12, pitch: -3 } },
    },
  ],
  interpolationSegments: [
    { startFrame: 0, endFrame: 30, type: 'linear' },
    {
      startFrame: 30,
      endFrame: 90,
      type: 'ease-in-out',
      controlPoints: { x: [{ x: 0.42, y: 0 }, { x: 0.58, y: 1 }] },
    },
  ],
  visibilityRanges: [
    { startFrame: 0, endFrame: 30, visible: true },
    { startFrame: 31, endFrame: 59, visible: false },
    { startFrame: 60, endFrame: 90, visible: true },
  ],
  trackId: 'track-fixture-1',
  trackingSource: 'sam2',
  trackingConfidence: 0.88,
  totalFrames: 91,
  keyframeCount: 3,
  interpolatedFrameCount: 88,
}

/** An ISO timestamp helper for the legacy rich-text/type audit fields. */
function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Seeds one representative row of every legacy source and returns the minted ids.
 *
 * @param prisma - the Prisma client
 * @returns the fixture id map
 */
export async function seedLegacyFixture(prisma: PrismaClient): Promise<LegacyFixture> {
  const timestamp = nowIso()

  const user = await prisma.user.create({
    data: {
      username: `backfill-fixture-${randomUUID()}`,
      email: `backfill-${randomUUID()}@example.com`,
      displayName: 'Backfill Fixture User',
      isAdmin: false,
    },
  })

  const persona = await prisma.persona.create({
    data: {
      userId: user.id,
      name: 'Fixture Analyst',
      role: 'Analyst',
      informationNeed: 'Track the main entity across the clip',
      domain: 'news',
      kind: 'human',
    },
  })

  const entityTypeId = randomUUID()
  const eventTypeId = randomUUID()
  const roleTypeId = randomUUID()
  const relationTypeId = randomUUID()

  const ontology = await prisma.ontology.create({
    data: {
      personaId: persona.id,
      entityTypes: [
        {
          id: entityTypeId,
          name: 'Person',
          gloss: [{ type: 'text', content: 'A human individual' }],
          wikidataId: 'Q5',
          wikidataUrl: 'https://www.wikidata.org/wiki/Q5',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      eventTypes: [
        {
          id: eventTypeId,
          name: 'Speaking',
          gloss: [{ type: 'text', content: 'A speaking event' }],
          roles: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      roleTypes: [
        {
          id: roleTypeId,
          name: 'Agent',
          gloss: [{ type: 'text', content: 'The doer of an event' }],
          allowedFillerTypes: ['entity'],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      relationTypes: [
        {
          id: relationTypeId,
          name: 'participates-in',
          gloss: [{ type: 'text', content: 'Entity participates in an event' }],
          sourceTypes: ['entity'],
          targetTypes: ['event'],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    },
  })

  const entityId = randomUUID()
  const eventId = randomUUID()
  const worldRelationId = randomUUID()

  const worldState = await prisma.worldState.create({
    data: {
      userId: user.id,
      entities: [
        {
          id: entityId,
          name: 'Jane Speaker',
          description: [{ type: 'text', content: 'The main speaker' }],
          wikidataId: 'Q42',
          typeAssignments: [{ personaId: persona.id, entityTypeId, confidence: 0.95 }],
          metadata: { alternateNames: ['Jane'] },
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      events: [
        {
          id: eventId,
          name: 'Opening remarks',
          description: [{ type: 'text', content: 'The opening of the talk' }],
          personaInterpretations: [],
          metadata: {},
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      times: [],
      relations: [
        {
          id: worldRelationId,
          relationTypeId,
          sourceType: 'entity',
          sourceId: entityId,
          targetType: 'event',
          targetId: eventId,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
    },
  })

  const video = await prisma.video.create({
    data: {
      filename: `backfill-fixture-${randomUUID()}.mp4`,
      path: '/data/backfill-fixture.mp4',
      duration: 5,
      frameRate: 30,
      resolution: '1920x1080',
      platformVideoId: 'tweet-1234567890',
      sourcePlatform: 'twitter',
      metadata: { description: 'A person speaking at a podium. #news' },
    },
  })

  // Object annotation (null persona) linking to the world entity by id, so the
  // backfill sets denotesNodeId to the entity's graph node.
  const annotation = await prisma.annotation.create({
    data: {
      videoId: video.id,
      personaId: null,
      userId: user.id,
      type: 'bounding-box',
      label: entityId,
      linkType: 'entity',
      frames: FIXTURE_FRAMES as unknown as object,
      confidence: 0.87,
      source: 'manual',
    },
  })

  const summary = await prisma.videoSummary.create({
    data: {
      videoId: video.id,
      personaId: persona.id,
      createdBy: user.id,
      summary: [
        { type: 'text', content: 'A person delivers opening remarks at a podium.' },
      ],
      audioLanguage: 'en',
      speakerCount: 2,
      transcriptJson: {
        language: 'en',
        speakers: ['SPEAKER_00', 'SPEAKER_01'],
        segments: [
          { start: 0.0, end: 2.5, text: 'Hello and welcome.', speaker: 'SPEAKER_00', confidence: 0.98 },
          { start: 2.5, end: 5.0, text: 'Thank you for having me.', speaker: 'SPEAKER_01', confidence: 0.93 },
        ],
      },
    },
  })

  const claimA = await prisma.claim.create({
    data: {
      summaryId: summary.id,
      summaryType: 'video',
      text: 'A person delivers opening remarks.',
      gloss: [{ type: 'text', content: 'A person delivers opening remarks.' }],
      textSpans: [
        { sentenceIndex: 0, charStart: 0, charEnd: 8 },
        { sentenceIndex: 0, charStart: 18, charEnd: 33 },
      ],
      createdBy: user.id,
    },
  })

  const claimB = await prisma.claim.create({
    data: {
      summaryId: summary.id,
      summaryType: 'video',
      text: 'The remarks open a talk.',
      gloss: [{ type: 'text', content: 'The remarks open a talk.' }],
      createdBy: user.id,
    },
  })

  const claimRelation = await prisma.claimRelation.create({
    data: {
      sourceClaimId: claimA.id,
      targetClaimId: claimB.id,
      relationTypeId: 'supports',
      confidence: 0.8,
      createdBy: user.id,
    },
  })

  return {
    userId: user.id,
    personaId: persona.id,
    ontologyId: ontology.id,
    entityTypeId,
    eventTypeId,
    roleTypeId,
    relationTypeId,
    worldStateId: worldState.id,
    entityId,
    eventId,
    worldRelationId,
    videoId: video.id,
    annotationId: annotation.id,
    summaryId: summary.id,
    claimAId: claimA.id,
    claimBId: claimB.id,
    claimRelationId: claimRelation.id,
  }
}

/**
 * Tears down every row the fixture and the backfill produced, in reverse
 * foreign-key order, scoped to the fixture so the shared dev database's existing
 * videos are untouched. Layers rows are removed first (children before parents),
 * then the legacy rows.
 *
 * @param prisma - the Prisma client
 * @param fixture - the ids the seeder minted
 */
export async function cleanupFixture(prisma: PrismaClient, fixture: LegacyFixture): Promise<void> {
  const { userId, videoId, personaId, summaryId } = fixture

  // Layers rows. Deleting the fixture's expressions cascades to their
  // segmentations, tokenizations, annotation layers, layers annotations, and
  // relations; cluster sets (SetNull on expression) are removed explicitly first.
  await prisma.clusterSet.deleteMany({ where: { createdByUserId: userId } })
  await prisma.expression.deleteMany({ where: { videoId } })
  await prisma.media.deleteMany({ where: { videoId } })
  await prisma.graphEdge.deleteMany({ where: { createdByUserId: userId } })
  await prisma.graphNode.deleteMany({ where: { createdByUserId: userId } })
  await prisma.typeDef.deleteMany({ where: { createdByUserId: userId } })
  await prisma.layersOntology.deleteMany({ where: { createdByUserId: userId } })

  // Legacy rows.
  await prisma.claimRelation.deleteMany({ where: { sourceClaim: { summaryId } } })
  await prisma.claim.deleteMany({ where: { summaryId } })
  await prisma.annotation.deleteMany({ where: { videoId } })
  await prisma.videoSummary.deleteMany({ where: { videoId } })
  await prisma.video.deleteMany({ where: { id: videoId } })
  await prisma.ontology.deleteMany({ where: { personaId } })
  await prisma.worldState.deleteMany({ where: { userId } })
  await prisma.persona.deleteMany({ where: { userId } })
  await prisma.user.deleteMany({ where: { id: userId } })
}
