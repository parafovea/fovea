/**
 * Shared test helpers that seed data directly into the unified layers store.
 *
 * The legacy Annotation / WorldState / Ontology / Claim / ClaimRelation tables
 * are gone; these helpers accept the same `{ data: ... }` shapes the legacy
 * `prisma.<model>.create` calls used and materialize them through the layers
 * bridge writers, so tests can seed fixtures without the legacy models.
 *
 * @module
 */

import { randomUUID } from 'node:crypto'

import type { PrismaClient } from '@prisma/client'

import { writeWorldAggregate } from '../../src/services/layers-bridge/world-bridge.js'
import { writeOntologyAggregate } from '../../src/services/layers-bridge/ontology-bridge.js'
import { writeVideoAnnotation } from '../../src/services/layers-bridge/annotation-bridge.js'
import {
  writeClaim,
  writeClaimRelation,
  readClaimById,
} from '../../src/services/layers-bridge/claim-bridge.js'
import type { StoredClaim, StoredRelation } from '../../src/services/claim-layers-mapper.js'
import type { BoundingBoxSequence } from '../../src/services/layers-conversion-service.js'

export { readClaimById }

/** A minimal empty bounding-box sequence for seeding video annotations. */
export const EMPTY_FRAMES: BoundingBoxSequence = {
  boxes: [],
  interpolationSegments: [],
  visibilityRanges: [],
  totalFrames: 0,
  keyframeCount: 0,
  interpolatedFrameCount: 0,
}

/** World-state seed fields, matching the legacy `prisma.worldState.create` data shape. */
export interface SeedWorldStateInput {
  userId: string
  projectId?: string | null
  entities?: unknown[]
  events?: unknown[]
  times?: unknown[]
  entityCollections?: unknown[]
  eventCollections?: unknown[]
  timeCollections?: unknown[]
  relations?: unknown[]
}

/** Seeds a world state into the layers store, matching the legacy create shape. */
export async function seedWorldState(prisma: PrismaClient, args: { data: SeedWorldStateInput }): Promise<void> {
  const d = args.data
  await writeWorldAggregate(
    prisma,
    { userId: d.userId, projectId: d.projectId ?? null },
    {
      entities: d.entities ?? [],
      events: d.events ?? [],
      times: d.times ?? [],
      entityCollections: d.entityCollections ?? [],
      eventCollections: d.eventCollections ?? [],
      timeCollections: d.timeCollections ?? [],
      relations: d.relations ?? [],
    },
  )
}

/** Ontology seed fields, matching the legacy `prisma.ontology.create` data shape. */
export interface SeedOntologyInput {
  personaId: string
  entityTypes?: unknown[]
  eventTypes?: unknown[]
  roleTypes?: unknown[]
  relationTypes?: unknown[]
}

/** Seeds a persona ontology into the layers store, matching the legacy create/update shape. */
export async function seedOntology(prisma: PrismaClient, args: { data: SeedOntologyInput }): Promise<void> {
  const d = args.data
  const persona = await prisma.persona.findUniqueOrThrow({ where: { id: d.personaId } })
  await writeOntologyAggregate(
    prisma,
    d.personaId,
    {
      entityTypes: d.entityTypes ?? [],
      eventTypes: d.eventTypes ?? [],
      roleTypes: d.roleTypes ?? [],
      relationTypes: d.relationTypes ?? [],
    },
    { name: `${persona.name} ontology`, description: persona.informationNeed, domain: persona.domain },
    { projectId: persona.projectId, createdByUserId: persona.userId },
  )
}

/** Annotation seed fields, matching the legacy `prisma.annotation.create` data shape. */
export interface SeedAnnotationInput {
  id?: string
  videoId: string
  personaId?: string | null
  userId?: string | null
  type: string
  label: string
  linkType?: 'entity' | 'event' | 'time' | 'location' | null
  frames?: unknown
  confidence?: number | null
  source?: string
}

/**
 * Seeds a video annotation into the layers store. The owner resolves to the
 * explicit `userId`, else the persona's owner, mirroring how the legacy rows set
 * ownership.
 */
export async function seedAnnotation(prisma: PrismaClient, args: { data: SeedAnnotationInput }): Promise<void> {
  const d = args.data
  let userId: string | null = d.userId ?? null
  if (!userId && d.personaId) {
    const persona = await prisma.persona.findUnique({ where: { id: d.personaId } })
    userId = persona?.userId ?? null
  }
  // Merge over the empty sequence so a partial/`{}` frames value still carries
  // the `boxes` array the layers mapper requires.
  const partialFrames = d.frames && typeof d.frames === 'object' ? (d.frames as Record<string, unknown>) : {}
  const frames = { ...EMPTY_FRAMES, ...partialFrames } as unknown as BoundingBoxSequence
  await writeVideoAnnotation(
    prisma,
    {
      id: d.id ?? randomUUID(),
      videoId: d.videoId,
      personaId: d.personaId ?? null,
      type: d.type,
      label: d.label,
      linkType: d.linkType ?? null,
      frames,
      confidence: d.confidence ?? null,
      source: d.source ?? 'manual',
    },
    { userId, projectId: null },
  )
}

/** Seeds several video annotations, matching the legacy createMany shape. */
export async function seedAnnotations(prisma: PrismaClient, args: { data: SeedAnnotationInput[] }): Promise<void> {
  for (const data of args.data) await seedAnnotation(prisma, { data })
}

/** Claim seed fields, matching the legacy `prisma.claim.create` data shape. */
export type SeedClaimInput = Partial<StoredClaim> & { summaryId: string; summaryType: string; text: string }

/** Seeds a claim into the layers store, returning the stored claim (carries its id). */
export async function seedClaim(prisma: PrismaClient, args: { data: SeedClaimInput }): Promise<StoredClaim> {
  const d = args.data
  const summary = await prisma.videoSummary.findUniqueOrThrow({ where: { id: d.summaryId } })
  const now = new Date().toISOString()
  const claim: StoredClaim = {
    id: d.id ?? randomUUID(),
    summaryId: d.summaryId,
    summaryType: d.summaryType,
    text: d.text,
    gloss: d.gloss ?? [],
    parentClaimId: d.parentClaimId ?? null,
    textSpans: d.textSpans ?? null,
    timeSpans: d.timeSpans ?? null,
    claimerType: d.claimerType ?? null,
    claimerGloss: d.claimerGloss ?? null,
    claimRelation: d.claimRelation ?? null,
    claimEventId: d.claimEventId ?? null,
    claimTimeId: d.claimTimeId ?? null,
    claimLocationId: d.claimLocationId ?? null,
    confidence: d.confidence ?? null,
    modelUsed: d.modelUsed ?? null,
    extractionStrategy: d.extractionStrategy ?? null,
    audio: d.audio ?? null,
    video: d.video ?? null,
    metadata: d.metadata ?? null,
    comment: d.comment ?? null,
    createdBy: d.createdBy ?? summary.createdBy ?? null,
    projectId: d.projectId ?? summary.projectId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await writeClaim(
    prisma,
    { id: summary.id, videoId: summary.videoId, projectId: summary.projectId, createdBy: summary.createdBy },
    claim,
  )
  return claim
}

/** Seeds several claims into the layers store, matching the legacy createMany shape. */
export async function seedClaims(prisma: PrismaClient, args: { data: SeedClaimInput[] }): Promise<void> {
  for (const data of args.data) await seedClaim(prisma, { data })
}

/** Relation seed fields, matching the legacy `prisma.claimRelation.create` data shape. */
export type SeedRelationInput = Partial<StoredRelation> & {
  sourceClaimId: string
  targetClaimId: string
  relationTypeId: string
}

/** Seeds a claim relation into the layers store, returning the stored relation. */
export async function seedRelation(prisma: PrismaClient, args: { data: SeedRelationInput }): Promise<StoredRelation> {
  const d = args.data
  const source = await readClaimById(prisma, d.sourceClaimId)
  const now = new Date().toISOString()
  const relation: StoredRelation = {
    id: d.id ?? randomUUID(),
    sourceClaimId: d.sourceClaimId,
    targetClaimId: d.targetClaimId,
    relationTypeId: d.relationTypeId,
    sourceSpans: d.sourceSpans ?? null,
    targetSpans: d.targetSpans ?? null,
    confidence: d.confidence ?? null,
    notes: d.notes ?? null,
    createdBy: d.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await writeClaimRelation(prisma, relation, source?.summaryId ?? '', source?.projectId ?? null)
  return relation
}
