/**
 * API routes for resource sharing operations.
 *
 * Provides endpoints for sharing resources (annotations, summaries, claims,
 * personas, world states) between users and groups, listing received and sent
 * shares, revoking shares, and forking shared resources.
 *
 * @module
 */

import { randomUUID } from 'node:crypto'
import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { Prisma, PrismaClient } from '@prisma/client'
import {
  annotationExists,
  annotationOwner,
  readAnnotationById,
  writeVideoAnnotation,
} from '../services/layers-bridge/annotation-bridge.js'
import {
  claimExists,
  claimOwner,
  readClaimById,
  readSummaryClaims,
  writeClaim,
  type ClaimSummaryContext,
} from '../services/layers-bridge/claim-bridge.js'
import {
  readWorldAggregate,
  resolvePersonalWorldOwner,
  writeWorldAggregate,
} from '../services/layers-bridge/world-bridge.js'
import {
  readOntologyAggregate,
  writeOntologyAggregate,
} from '../services/layers-bridge/ontology-bridge.js'
import { emptyOntology } from '../services/ontology-layers-mapper.js'
import { personalWorldStateId, type WorldStateAggregate } from '../services/world-layers-mapper.js'
import type { VideoAnnotationInput } from '../services/video-annotation-mapper.js'
import type { StoredClaim } from '../services/claim-layers-mapper.js'
import { trace } from '@opentelemetry/api'
import { requireAuth } from '@middleware/auth.js'
import { sharingOperationCounter } from '../metrics.js'
import {
  buildAbilities,
  invalidateUserAbilities,
  invalidateGroupMembers,
} from '@middleware/abilities.js'
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ErrorResponseSchema,
} from '@lib/errors.js'

const tracer = trace.getTracer('fovea-rbac')

/** Convert a value to Prisma JSON without type assertions. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Deep-copies a JSON value, replacing any string leaf that is a key in `idMap`
 * with its mapped value. The fork re-points every claim-id reference at the new
 * claim ids in one pass: row ids, `parentClaimId`, and the claim references
 * embedded in gloss arrays. Claim ids are UUIDs, so a non-id string cannot
 * collide with a map key. Returns a fresh structure (the input is not mutated).
 */
function remapClaimIds(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === 'string') {
    return idMap.get(value) ?? value
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapClaimIds(item, idMap))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = remapClaimIds(item, idMap)
    }
    return out
  }
  return value
}

/**
 * Deep-forks a persona (and its ontology) into a new persona owned by
 * `ownerUserId`.
 *
 * The forked persona is a fresh Persona row copying the source's name, role,
 * information need, details, and domain, marked non-system-generated and
 * visible; the ontology is copied through the layers store (a fresh
 * LayersOntology plus its TypeDefs). A new persona is what lets summary, claim,
 * and annotation forks land in the forker's own scope instead of pointing back
 * at the sharer's persona, which would collide on a unique constraint or orphan
 * the forked resource under another user.
 *
 * @param db - the transaction-scoped Prisma client running the fork
 * @param sourcePersonaId - UUID of the persona to copy
 * @param ownerUserId - UUID of the user who will own the forked persona
 * @returns the id of the newly created persona
 * @throws {NotFoundError} when the source persona does not exist
 */
async function forkPersona(
  db: PrismaClient,
  sourcePersonaId: string,
  ownerUserId: string,
): Promise<{ id: string }> {
  const source = await db.persona.findUnique({ where: { id: sourcePersonaId } })
  if (!source) {
    throw new NotFoundError('Persona', sourcePersonaId)
  }
  const forked = await db.persona.create({
    data: {
      userId: ownerUserId,
      name: source.name,
      role: source.role,
      informationNeed: source.informationNeed,
      details: source.details,
      domain: source.domain,
      isSystemGenerated: false,
      hidden: false,
    },
    select: { id: true },
  })
  const { aggregate, exists } = await readOntologyAggregate(db, sourcePersonaId)
  await writeOntologyAggregate(
    db,
    forked.id,
    exists ? aggregate : emptyOntology(),
    {
      name: `${source.name} ontology`,
      description: source.informationNeed,
      domain: source.domain,
    },
    { projectId: null, createdByUserId: ownerUserId },
  )
  return forked
}

/** The result of forking a summary: the new summary id and the claim id remap. */
interface ForkedSummary {
  id: string
  claimIdMap: Map<string, string>
}

/**
 * Deep-forks a video summary into the forker's own scope.
 *
 * The source summary's persona belongs to the sharer, and VideoSummary carries
 * a unique constraint on (videoId, personaId). Reusing the source's personaId
 * would collide with the source row, so the persona is forked first and the
 * forked summary is created against the NEW personaId, keeping the same videoId.
 * The summary's claims live in the layers store; each is deep-copied under a
 * fresh id via `writeClaim`, and both the copied claim nodes and the
 * denormalized `claimsJson` are re-pointed at the new ids so the fork reads
 * identically to the source.
 *
 * @param db - the transaction-scoped Prisma client running the fork
 * @param sourceSummaryId - UUID of the summary to copy
 * @param ownerUserId - UUID of the user who will own the forked summary
 * @returns the new summary id and the source-to-forked claim id map
 * @throws {NotFoundError} when the source summary does not exist
 */
async function forkSummary(
  db: PrismaClient,
  sourceSummaryId: string,
  ownerUserId: string,
): Promise<ForkedSummary> {
  const source = await db.videoSummary.findUnique({ where: { id: sourceSummaryId } })
  if (!source) {
    throw new NotFoundError('VideoSummary', sourceSummaryId)
  }

  const forkedPersona = await forkPersona(db, source.personaId, ownerUserId)

  // Mint a fresh id for every source claim up front so the copied claim nodes
  // and the denormalized claimsJson re-point at the same new ids.
  const { claims: sourceClaims } = await readSummaryClaims(db, sourceSummaryId)
  const claimIdMap = new Map<string, string>()
  for (const claim of sourceClaims) {
    claimIdMap.set(claim.id, randomUUID())
  }

  const forked = await db.videoSummary.create({
    data: {
      videoId: source.videoId,
      personaId: forkedPersona.id,
      summary: toJson(source.summary ?? []),
      visualAnalysis: source.visualAnalysis,
      audioTranscript: source.audioTranscript,
      keyFrames: source.keyFrames ? toJson(source.keyFrames) : Prisma.JsonNull,
      confidence: source.confidence,
      transcriptJson: source.transcriptJson ? toJson(source.transcriptJson) : Prisma.JsonNull,
      audioLanguage: source.audioLanguage,
      speakerCount: source.speakerCount,
      comment: source.comment,
      // Carry the denormalized claim view (re-pointed at the forked claim ids)
      // and its extraction metadata so the fork reads identically to the source.
      claimsJson:
        source.claimsJson === null
          ? Prisma.JsonNull
          : toJson(remapClaimIds(source.claimsJson, claimIdMap)),
      claimsVersion: source.claimsVersion,
      claimsExtractedAt: source.claimsExtractedAt,
      createdBy: ownerUserId,
    },
    select: { id: true, videoId: true },
  })

  const summaryContext: ClaimSummaryContext = {
    id: forked.id,
    videoId: forked.videoId,
    projectId: null,
    createdBy: ownerUserId,
  }
  const now = new Date().toISOString()
  for (const claim of sourceClaims) {
    const remapped = remapClaimIds(claim, claimIdMap) as StoredClaim
    const forkedClaim: StoredClaim = {
      ...remapped,
      id: claimIdMap.get(claim.id)!,
      summaryId: forked.id,
      parentClaimId: claim.parentClaimId ? claimIdMap.get(claim.parentClaimId) ?? null : null,
      createdBy: ownerUserId,
      projectId: null,
      createdAt: now,
      updatedAt: now,
    }
    await writeClaim(db, summaryContext, forkedClaim)
  }

  return { id: forked.id, claimIdMap }
}

/**
 * Nullable type helpers for fast-json-stringify compatibility.
 *
 * TypeBox's Type.Union([Type.String(), Type.Null()]) generates anyOf in JSON Schema,
 * but fast-json-stringify requires type: ['string', 'null'] format to properly
 * serialize null values (otherwise null is coerced to empty string).
 */
const NullableString = Type.Unsafe<string | null>({ type: ['string', 'null'] })
const NullableDatetime = Type.Unsafe<string | null>({
  type: ['string', 'null'],
  format: 'date-time',
})

/**
 * Merges the world objects of an incoming aggregate into a base aggregate,
 * appending only objects whose id is not already present in the base bucket.
 * Used to fork a world into a user who already has a personal world without
 * clobbering their existing objects.
 */
function mergeWorldAggregates(
  base: WorldStateAggregate,
  incoming: WorldStateAggregate,
): WorldStateAggregate {
  const buckets: (keyof WorldStateAggregate)[] = [
    'entities',
    'events',
    'times',
    'entityCollections',
    'eventCollections',
    'timeCollections',
    'relations',
  ]
  const merged = { ...base } as WorldStateAggregate
  for (const bucket of buckets) {
    const baseItems = (base[bucket] as Array<Record<string, unknown>>) ?? []
    const seen = new Set(
      baseItems
        .map((item) => (item && typeof item === 'object' ? item.id : undefined))
        .filter((id): id is string => typeof id === 'string'),
    )
    const result = [...baseItems]
    for (const item of incoming[bucket] as Array<Record<string, unknown>>) {
      const id = item && typeof item === 'object' ? item.id : undefined
      if (typeof id === 'string' && seen.has(id)) continue
      result.push(item)
    }
    merged[bucket] = result
  }
  return merged
}

/** Valid resource types that can be shared. */
const ResourceTypeEnum = Type.Union([
  Type.Literal('annotation'),
  Type.Literal('summary'),
  Type.Literal('claim'),
  Type.Literal('persona'),
  Type.Literal('world_state'),
])

/** Valid permission levels for shared resources. */
const PermissionLevelEnum = Type.Union([
  Type.Literal('read_only'),
  Type.Literal('forkable'),
])

/** Response schema for a single ResourceShare record. */
const ResourceShareSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  resourceType: Type.String(),
  resourceId: Type.String(),
  sharedByUserId: Type.String(),
  sharedWithUserId: NullableString,
  sharedWithGroupId: NullableString,
  permissionLevel: Type.String(),
  expiresAt: NullableDatetime,
  createdAt: Type.String({ format: 'date-time' }),
})

/** Schema for shares returned in listing endpoints, with related user/group info. */
const ReceivedShareSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  resourceType: Type.String(),
  resourceId: Type.String(),
  sharedByUserId: Type.String(),
  sharedByUser: Type.Object({
    id: Type.String(),
    username: Type.String(),
    displayName: Type.String(),
  }),
  sharedWithUserId: NullableString,
  sharedWithGroupId: NullableString,
  permissionLevel: Type.String(),
  expiresAt: NullableDatetime,
  createdAt: Type.String({ format: 'date-time' }),
})

const SentShareSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  resourceType: Type.String(),
  resourceId: Type.String(),
  sharedByUserId: Type.String(),
  sharedWithUserId: NullableString,
  sharedWithUser: Type.Optional(Type.Object({
    id: Type.String(),
    username: Type.String(),
    displayName: Type.String(),
  })),
  sharedWithGroupId: NullableString,
  sharedWithGroup: Type.Optional(Type.Object({
    id: Type.String(),
    name: Type.String(),
    slug: Type.String(),
  })),
  permissionLevel: Type.String(),
  expiresAt: NullableDatetime,
  createdAt: Type.String({ format: 'date-time' }),
})

/** Request body schema for creating a share. */
const CreateShareSchema = Type.Object({
  resourceType: ResourceTypeEnum,
  resourceId: Type.String(),
  sharedWithUserId: Type.Optional(Type.String({ format: 'uuid' })),
  sharedWithGroupId: Type.Optional(Type.String({ format: 'uuid' })),
  permissionLevel: Type.Optional(PermissionLevelEnum),
})

/**
 * Validates that the specified resource exists in the database.
 *
 * @param prisma - the Prisma client instance from Fastify
 * @param resourceType - the type of resource to look up
 * @param resourceId - the UUID of the resource
 * @returns true if the resource exists
 * @throws {ValidationError} when the resource type is unknown
 * @throws {NotFoundError} when the resource does not exist
 */
async function verifyResourceExists(
  prisma: PrismaClient,
  resourceType: string,
  resourceId: string,
): Promise<boolean> {
  let exists = false

  switch (resourceType) {
    case 'annotation':
      exists = await annotationExists(prisma, resourceId)
      break
    case 'summary':
      exists = (await prisma.videoSummary.findUnique({ where: { id: resourceId } })) !== null
      break
    case 'claim':
      exists = await claimExists(prisma, resourceId)
      break
    case 'persona':
      exists = (await prisma.persona.findUnique({ where: { id: resourceId } })) !== null
      break
    case 'world_state':
      exists = (await resolvePersonalWorldOwner(prisma, resourceId)) !== null
      break
    default:
      throw new ValidationError(`Unknown resource type: ${resourceType}`)
  }

  if (!exists) {
    throw new NotFoundError(resourceType, resourceId)
  }

  return true
}

/**
 * Permission lattice for ResourceShare.
 *
 * Fovea's schema defines two levels: `read_only` and `forkable`. Higher values
 * in this map mean strictly greater privilege. Use {@link permissionRank} to
 * compare levels when capping re-share escalation.
 */
const PERMISSION_RANK: Record<string, number> = {
  read_only: 1,
  forkable: 2,
}

/** Returns the numeric rank of a permission level, or 0 if unknown. */
function permissionRank(level: string): number {
  return PERMISSION_RANK[level] ?? 0
}

/**
 * Result of a share-permission check: whether the caller is the resource
 * owner and, if not, the permission level granted to them via an existing
 * ResourceShare. Callers use this to cap re-share privilege escalation.
 */
interface SharePermissionResult {
  isOwner: boolean
  receivedPermission: string | null
}

/**
 * Checks whether the user owns the resource or has share permission on it.
 *
 * @param prisma - the Prisma client instance from Fastify
 * @param resourceType - the type of resource to check
 * @param resourceId - the UUID of the resource
 * @param userId - the UUID of the user to authorize
 * @returns ownership flag and the received permission level (if re-sharing)
 * @throws {ForbiddenError} when the user lacks permission to share the resource
 */
async function verifySharePermission(
  prisma: PrismaClient,
  resourceType: string,
  resourceId: string,
  userId: string,
): Promise<SharePermissionResult> {
  let isOwner = false

  switch (resourceType) {
    case 'annotation': {
      isOwner = (await annotationOwner(prisma, resourceId)) === userId
      break
    }
    case 'summary': {
      const summary = await prisma.videoSummary.findUnique({ where: { id: resourceId } })
      isOwner = summary?.createdBy === userId
      break
    }
    case 'claim': {
      isOwner = (await claimOwner(prisma, resourceId)) === userId
      break
    }
    case 'persona': {
      const persona = await prisma.persona.findUnique({ where: { id: resourceId } })
      isOwner = persona?.userId === userId
      break
    }
    case 'world_state': {
      isOwner = (await resolvePersonalWorldOwner(prisma, resourceId)) === userId
      break
    }
  }

  if (isOwner) {
    return { isOwner: true, receivedPermission: null }
  }

  // Non-owner: locate the user's best direct or group-mediated share. A
  // forkable share is required to re-share; its permissionLevel caps the
  // level at which the caller may re-share downstream.
  const memberships = await prisma.groupMembership.findMany({
    where: { userId },
    select: { groupId: true },
  })
  const groupIds = memberships.map(m => m.groupId)

  const recipientConditions: Array<Record<string, unknown>> = [
    { sharedWithUserId: userId },
  ]
  if (groupIds.length > 0) {
    recipientConditions.push({ sharedWithGroupId: { in: groupIds } })
  }

  const candidateShares = await prisma.resourceShare.findMany({
    where: {
      resourceType,
      resourceId,
      permissionLevel: 'forkable',
      OR: recipientConditions,
      AND: [
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } },
          ],
        },
      ],
    },
  })

  if (candidateShares.length === 0) {
    throw new ForbiddenError('You do not have permission to share this resource')
  }

  // Pick the strongest permission the caller holds on this resource.
  const bestPermission = candidateShares.reduce<string>((best, share) => {
    return permissionRank(share.permissionLevel) > permissionRank(best)
      ? share.permissionLevel
      : best
  }, candidateShares[0].permissionLevel)

  return { isOwner: false, receivedPermission: bestPermission }
}

/**
 * Fastify plugin for resource sharing routes.
 *
 * Routes:
 * - POST /api/sharing - Share a resource with a user or group
 * - GET /api/sharing/received - List resources shared with the current user
 * - GET /api/sharing/sent - List resources shared by the current user
 * - DELETE /api/sharing/:shareId - Revoke a share
 * - POST /api/sharing/:shareId/fork - Fork a shared resource
 */
const sharingRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * Share a resource with a user or group.
   *
   * Exactly one of sharedWithUserId or sharedWithGroupId must be provided.
   * The caller must own the resource or have share permission on it.
   *
   * @route POST /api/sharing
   * @param request.body - Share configuration
   * @returns Created ResourceShare record
   */
  fastify.post<{ Body: Static<typeof CreateShareSchema> }>(
    '/api/sharing',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Share a resource with a user or group',
        tags: ['sharing'],
        body: CreateShareSchema,
        response: {
          201: ResourceShareSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const {
        resourceType,
        resourceId,
        sharedWithUserId,
        sharedWithGroupId,
        permissionLevel = 'read_only',
      } = request.body
      const userId = request.user!.id

      // Validate exactly one target is specified
      if (sharedWithUserId && sharedWithGroupId) {
        throw new ValidationError(
          'Specify exactly one of sharedWithUserId or sharedWithGroupId, not both'
        )
      }
      if (!sharedWithUserId && !sharedWithGroupId) {
        throw new ValidationError(
          'Specify exactly one of sharedWithUserId or sharedWithGroupId'
        )
      }

      // Verify the resource exists
      await verifyResourceExists(fastify.prisma, resourceType, resourceId)

      // Verify the user has permission to share. Non-owners may only re-share
      // at a permission level no higher than the one they received, preventing
      // privilege escalation through the fork-and-re-share chain.
      const { isOwner, receivedPermission } = await verifySharePermission(
        fastify.prisma,
        resourceType,
        resourceId,
        userId,
      )
      if (!isOwner && receivedPermission !== null) {
        if (permissionRank(permissionLevel) > permissionRank(receivedPermission)) {
          throw new ForbiddenError('Cannot re-share above granted permission')
        }
      }

      // Verify the target user or group exists
      if (sharedWithUserId) {
        const targetUser = await fastify.prisma.user.findUnique({
          where: { id: sharedWithUserId },
        })
        if (!targetUser) {
          throw new NotFoundError('User', sharedWithUserId)
        }
      }

      if (sharedWithGroupId) {
        const targetGroup = await fastify.prisma.userGroup.findUnique({
          where: { id: sharedWithGroupId },
        })
        if (!targetGroup) {
          throw new NotFoundError('UserGroup', sharedWithGroupId)
        }
      }

      // Sharing the same resource to the same target is idempotent: re-issuing a
      // grant must not accumulate duplicate ResourceShare rows (which would make
      // /received and /sent list the resource twice, leave it shared after one is
      // revoked, and double-fire ability invalidation). Reuse an existing grant,
      // updating only its permission level; a partial unique index backstops the
      // concurrent-create race below.
      const shareIdentity = {
        resourceType,
        resourceId,
        sharedByUserId: userId,
        sharedWithUserId: sharedWithUserId || null,
        sharedWithGroupId: sharedWithGroupId || null,
      }
      const existingShare = await fastify.prisma.resourceShare.findFirst({ where: shareIdentity })
      let share
      if (existingShare) {
        share = existingShare.permissionLevel === permissionLevel
          ? existingShare
          : await fastify.prisma.resourceShare.update({
              where: { id: existingShare.id },
              data: { permissionLevel },
            })
      } else {
        try {
          share = await fastify.prisma.resourceShare.create({
            data: { ...shareIdentity, permissionLevel },
          })
        } catch (error) {
          // Lost a concurrent create race against the partial unique index — the
          // other writer's row is the canonical grant; re-read and return it.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const winner = await fastify.prisma.resourceShare.findFirst({ where: shareIdentity })
            if (!winner) throw error
            share = winner
          } else {
            throw error
          }
        }
      }

      // Invalidate ability caches for the new grantee so access takes effect
      // immediately. Caches are keyed per user, so we expand group targets.
      if (sharedWithUserId) {
        invalidateUserAbilities(sharedWithUserId)
      }
      if (sharedWithGroupId) {
        await invalidateGroupMembers(sharedWithGroupId)
      }

      sharingOperationCounter.add(1, {
        operation: 'share',
        resourceType,
        targetType: sharedWithGroupId ? 'group' : 'user',
      })
      return reply.status(201).send(share)
    },
  )

  /**
   * List resources shared with the current user.
   *
   * Includes shares targeted at the user directly and shares targeted at
   * any group the user belongs to. Excludes expired shares.
   *
   * @route GET /api/sharing/received
   * @returns Array of received shares with sharedByUser info
   */
  fastify.get(
    '/api/sharing/received',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'List resources shared with the current user',
        tags: ['sharing'],
        response: {
          200: Type.Array(ReceivedShareSchema),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id

      // Find all groups the user belongs to
      const memberships = await fastify.prisma.groupMembership.findMany({
        where: { userId },
        select: { groupId: true },
      })
      const groupIds = memberships.map(m => m.groupId)

      // Build recipient conditions: shared with user directly or via any group
      const recipientConditions: Array<Record<string, unknown>> = [
        { sharedWithUserId: userId },
      ]
      if (groupIds.length > 0) {
        recipientConditions.push({ sharedWithGroupId: { in: groupIds } })
      }

      const shares = await fastify.prisma.resourceShare.findMany({
        where: {
          AND: [
            { OR: recipientConditions },
            // Exclude expired shares
            {
              OR: [
                { expiresAt: null },
                { expiresAt: { gt: new Date() } },
              ],
            },
          ],
        },
        include: {
          sharedByUser: {
            select: { id: true, username: true, displayName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return reply.send(shares)
    },
  )

  /**
   * List resources shared by the current user.
   *
   * @route GET /api/sharing/sent
   * @returns Array of sent shares with recipient info
   */
  fastify.get(
    '/api/sharing/sent',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'List resources shared by the current user',
        tags: ['sharing'],
        response: {
          200: Type.Array(SentShareSchema),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id

      const shares = await fastify.prisma.resourceShare.findMany({
        where: { sharedByUserId: userId },
        include: {
          sharedWithUser: {
            select: { id: true, username: true, displayName: true },
          },
          sharedWithGroup: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return reply.send(shares)
    },
  )

  /**
   * Revoke a share.
   *
   * The caller must be the original sharer or a system_admin.
   *
   * @route DELETE /api/sharing/:shareId
   * @param shareId - UUID of the share to revoke
   * @returns Success message
   */
  fastify.delete<{ Params: { shareId: string } }>(
    '/api/sharing/:shareId',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'Revoke a resource share',
        tags: ['sharing'],
        params: Type.Object({
          shareId: Type.String({ format: 'uuid' }),
        }),
        response: {
          200: Type.Object({ message: Type.String() }),
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { shareId } = request.params
      const userId = request.user!.id
      const systemRole = request.user!.systemRole

      const share = await fastify.prisma.resourceShare.findUnique({
        where: { id: shareId },
      })

      if (!share) {
        throw new NotFoundError('ResourceShare', shareId)
      }

      // Must be the original sharer or a system_admin
      if (share.sharedByUserId !== userId && systemRole !== 'system_admin') {
        throw new ForbiddenError('Only the original sharer or a system admin can revoke this share')
      }

      await fastify.prisma.resourceShare.delete({
        where: { id: shareId },
      })

      // Invalidate ability caches for the previous grantee so the revocation
      // takes effect immediately rather than after the TTL expires.
      if (share.sharedWithUserId) {
        invalidateUserAbilities(share.sharedWithUserId)
      }
      if (share.sharedWithGroupId) {
        await invalidateGroupMembers(share.sharedWithGroupId)
      }

      sharingOperationCounter.add(1, {
        operation: 'revoke',
        resourceType: share.resourceType,
        targetType: share.sharedWithGroupId ? 'group' : 'user',
      })
      return reply.send({ message: 'Share revoked successfully' })
    },
  )

  /**
   * Fork a shared resource into the current user's workspace.
   *
   * The caller must be a recipient of the share (directly or via group),
   * and the share must have permissionLevel = "forkable". Creates a deep
   * copy of the resource owned by the current user.
   *
   * @route POST /api/sharing/:shareId/fork
   * @param shareId - UUID of the share to fork from
   * @returns The newly created resource
   */
  fastify.post<{ Params: { shareId: string } }>(
    '/api/sharing/:shareId/fork',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Fork a shared resource into your workspace',
        tags: ['sharing'],
        params: Type.Object({
          shareId: Type.String({ format: 'uuid' }),
        }),
        response: {
          201: Type.Object({
            resourceType: Type.String(),
            resourceId: Type.String(),
            resource: Type.Unknown(),
          }),
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { shareId } = request.params
      const userId = request.user!.id
      const span = tracer.startSpan('sharing.fork')

      try {
      // Load the share
      const share = await fastify.prisma.resourceShare.findUnique({
        where: { id: shareId },
      })

      if (!share) {
        throw new NotFoundError('ResourceShare', shareId)
      }

      span.setAttribute('sharing.resource_type', share.resourceType)
      span.setAttribute('sharing.share_id', shareId)

      // Verify the share is forkable
      if (share.permissionLevel !== 'forkable') {
        throw new ForbiddenError('This share does not allow forking')
      }

      // Check expiration
      if (share.expiresAt && share.expiresAt < new Date()) {
        throw new ForbiddenError('This share has expired')
      }

      // Verify the user is a recipient (directly or via group)
      let isRecipient = share.sharedWithUserId === userId

      if (!isRecipient && share.sharedWithGroupId) {
        const membership = await fastify.prisma.groupMembership.findUnique({
          where: {
            userId_groupId: {
              userId,
              groupId: share.sharedWithGroupId,
            },
          },
        })
        isRecipient = !!membership
      }

      if (!isRecipient) {
        throw new ForbiddenError('You are not a recipient of this share')
      }

      // Fork the resource within a transaction. Annotations, claims, and world
      // objects are forked in the layers store via the bridge; summaries and
      // personas remain their own models (a forked persona's ontology is written
      // to the layers store).
      const forkedResource = await fastify.prisma.$transaction(async (tx) => {
        const db = tx as unknown as PrismaClient
        switch (share.resourceType) {
          case 'annotation': {
            const source = await readAnnotationById(db, share.resourceId)
            if (!source) {
              throw new NotFoundError('Annotation', share.resourceId)
            }
            // Type annotations carry a persona (the sharer's); fork it so the
            // forked annotation points at the forker's own persona. Object
            // annotations are persona-agnostic (personaId null); keep them null
            // and just re-own them under the forker.
            const forkedPersonaId = source.personaId
              ? (await forkPersona(db, source.personaId, userId)).id
              : null
            const newId = randomUUID()
            const input: VideoAnnotationInput = {
              id: newId,
              videoId: source.videoId,
              personaId: forkedPersonaId,
              type: source.type,
              label: source.label,
              linkType: source.linkType,
              frames: source.frames,
              confidence: source.confidence,
              source: source.source,
            }
            await writeVideoAnnotation(db, input, { userId, projectId: null })
            const created = await readAnnotationById(db, newId)
            return created ?? { id: newId }
          }

          case 'summary': {
            // Deep-fork: forkSummary forks the source summary's persona into the
            // forker's scope, creates the forked summary against the NEW
            // personaId (reusing the source's (videoId, personaId) would collide
            // on the VideoSummary unique constraint), and deep-copies the claim
            // tree in the layers store.
            const { id: forkedSummaryId } = await forkSummary(db, share.resourceId, userId)
            const forked = await tx.videoSummary.findUnique({
              where: { id: forkedSummaryId },
            })
            if (!forked) {
              throw new NotFoundError('VideoSummary', forkedSummaryId)
            }
            return forked
          }

          case 'claim': {
            const source = await readClaimById(db, share.resourceId)
            if (!source) {
              throw new NotFoundError('Claim', share.resourceId)
            }
            // Deep-fork the parent summary into the forker's scope (which forks
            // the persona, the summary, and the whole claim tree in the layers
            // store), then return the forked copy of the shared claim under its
            // fresh id. Reusing the sharer's summaryId would orphan the claim
            // under another user's summary, so it would never appear in the
            // forker's tree.
            const { claimIdMap } = await forkSummary(db, source.summaryId, userId)
            const forkedClaimId = claimIdMap.get(source.id)
            if (!forkedClaimId) {
              throw new NotFoundError('Claim', source.id)
            }
            const forkedClaim = await readClaimById(db, forkedClaimId)
            if (!forkedClaim) {
              throw new NotFoundError('Claim', forkedClaimId)
            }
            return forkedClaim
          }

          case 'persona': {
            // forkPersona copies the persona row and its ontology (layers store);
            // load the forked persona and attach its reconstructed ontology
            // aggregate to return the full resource.
            const { id: forkedPersonaId } = await forkPersona(db, share.resourceId, userId)
            const forked = await tx.persona.findUnique({ where: { id: forkedPersonaId } })
            if (!forked) {
              throw new NotFoundError('Persona', forkedPersonaId)
            }
            const { aggregate } = await readOntologyAggregate(db, forkedPersonaId)
            return { ...forked, ontology: aggregate }
          }

          case 'world_state': {
            const owner = await resolvePersonalWorldOwner(db, share.resourceId)
            if (!owner) {
              throw new NotFoundError('WorldState', share.resourceId)
            }
            // A user has exactly one personal world state (projectId NULL), so a
            // fork cannot mint a second one. Merge the shared world's objects
            // into the forker's existing personal aggregate by id (additive),
            // then write it back through the layers store.
            const { aggregate: sourceWorld } = await readWorldAggregate(db, {
              userId: owner,
              projectId: null,
            })
            const { aggregate: existing } = await readWorldAggregate(db, {
              userId,
              projectId: null,
            })
            const merged = mergeWorldAggregates(existing, sourceWorld)
            await writeWorldAggregate(db, { userId, projectId: null }, merged)
            return { id: personalWorldStateId(userId), userId, ...merged }
          }

          default:
            throw new ValidationError(`Cannot fork resource type: ${share.resourceType}`)
        }
      })

      // The forker now owns a new resource; invalidate their ability cache
      // so the newly-created resource is immediately visible to them.
      invalidateUserAbilities(userId)

      span.setAttribute('sharing.fork_success', true)
      sharingOperationCounter.add(1, {
        operation: 'fork',
        resourceType: share.resourceType,
        targetType: share.sharedWithGroupId ? 'group' : 'user',
      })
      return reply.status(201).send({
        resourceType: share.resourceType,
        resourceId: forkedResource.id,
        resource: forkedResource,
      })
      } finally {
        span.end()
      }
    },
  )
}

export default sharingRoute
