/**
 * Ownership helpers for resources that belong to a user via different paths.
 *
 * Each route that mutates a record (PUT/DELETE) must call the matching helper
 * after looking up the record so that user A cannot modify or delete a
 * resource owned by user B. Returning a fresh row is intentional: a route
 * needs the row anyway, and consolidating the lookup with the ownership
 * check avoids the (lookup) + (forgot to check) class of bug that has caused
 * recurring multi-user leaks.
 *
 * Throwing `NotFoundError` instead of `ForbiddenError` is the deliberate
 * choice: returning 404 does not confirm the existence of records the
 * requester is not allowed to see.
 *
 * @module lib/ownership
 */
import type { PrismaClient } from '@prisma/client'
import { NotFoundError } from './errors.js'

/**
 * Returns the user's persona ids for the given user, used by routes that
 * scope a list endpoint by `personaId IN (...)`.
 */
export async function getUserPersonaIds(prisma: PrismaClient, userId: string): Promise<string[]> {
  const personas = await prisma.persona.findMany({
    where: { userId },
    select: { id: true },
  })
  return personas.map(p => p.id)
}

/**
 * Asserts that `personaId` belongs to `userId`. Throws NotFoundError otherwise.
 */
export async function assertPersonaOwned(
  prisma: PrismaClient,
  personaId: string,
  userId: string,
  resourceLabel: string = 'Persona'
): Promise<void> {
  const persona = await prisma.persona.findUnique({
    where: { id: personaId },
    select: { userId: true },
  })
  if (!persona || persona.userId !== userId) {
    throw new NotFoundError(resourceLabel, personaId)
  }
}

/**
 * Asserts that the annotation belongs to `userId`. An annotation is owned by
 * the user when its `personaId` belongs to one of the user's personas, OR
 * (for object annotations) its `userId` matches.
 */
export async function assertAnnotationOwned(
  prisma: PrismaClient,
  annotationId: string,
  userId: string
): Promise<void> {
  const annotation = await prisma.annotation.findUnique({
    where: { id: annotationId },
    select: { id: true, personaId: true, userId: true, persona: { select: { userId: true } } },
  })
  if (!annotation) {
    throw new NotFoundError('Annotation', annotationId)
  }
  const ownedByPersona = annotation.persona?.userId === userId
  const ownedByUserField = annotation.personaId === null && annotation.userId === userId
  if (!ownedByPersona && !ownedByUserField) {
    throw new NotFoundError('Annotation', annotationId)
  }
}

/**
 * Asserts that the summary belongs to `userId` (its persona is owned by the
 * user).
 */
export async function assertSummaryOwned(
  prisma: PrismaClient,
  summaryId: string,
  userId: string
): Promise<void> {
  const summary = await prisma.videoSummary.findUnique({
    where: { id: summaryId },
    select: { persona: { select: { userId: true } } },
  })
  if (!summary || summary.persona?.userId !== userId) {
    throw new NotFoundError('Summary', summaryId)
  }
}

/**
 * Asserts that the (videoId, personaId) summary key belongs to `userId`.
 */
export async function assertSummaryByKeyOwned(
  prisma: PrismaClient,
  videoId: string,
  personaId: string,
  userId: string
): Promise<void> {
  const summary = await prisma.videoSummary.findUnique({
    where: { videoId_personaId: { videoId, personaId } },
    select: { persona: { select: { userId: true } } },
  })
  if (!summary || summary.persona?.userId !== userId) {
    throw new NotFoundError('Summary', `${videoId}-${personaId}`)
  }
}

/**
 * Asserts that the claim relation's source claim is owned by `userId`.
 */
export async function assertClaimRelationOwned(
  prisma: PrismaClient,
  relationId: string,
  userId: string
): Promise<void> {
  const relation = await prisma.claimRelation.findUnique({
    where: { id: relationId },
    select: {
      sourceClaim: {
        select: { videoSummary: { select: { persona: { select: { userId: true } } } } },
      },
    },
  })
  if (!relation || relation.sourceClaim.videoSummary.persona?.userId !== userId) {
    throw new NotFoundError('Relation', relationId)
  }
}

/**
 * Asserts that the claim's parent summary belongs to `userId`.
 */
export async function assertClaimOwned(
  prisma: PrismaClient,
  claimId: string,
  userId: string
): Promise<void> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    select: { videoSummary: { select: { persona: { select: { userId: true } } } } },
  })
  if (!claim || claim.videoSummary.persona?.userId !== userId) {
    throw new NotFoundError('Claim', claimId)
  }
}
