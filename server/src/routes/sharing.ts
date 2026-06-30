/**
 * API routes for resource sharing operations.
 *
 * Provides endpoints for sharing resources (annotations, summaries, claims,
 * personas, world states) between users and groups, listing received and sent
 * shares, revoking shares, and forking shared resources.
 *
 * @module
 */

import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { Prisma, PrismaClient } from '@prisma/client'

/** Convert a value to Prisma JSON without type assertions. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Deep-forks a persona (and its ontology) into a new persona owned by
 * `ownerUserId`.
 *
 * The forked persona is a fresh row: it copies the source's name, role,
 * information need, details, and ontology arrays, but is marked
 * non-system-generated and visible. The new persona is what lets summary,
 * claim, and annotation forks land in the forker's own scope instead of
 * pointing back at the sharer's persona (which would either collide on a
 * unique constraint or orphan the forked resource under another user).
 *
 * @param tx - the Prisma transaction client running the fork
 * @param sourcePersonaId - UUID of the persona to copy
 * @param ownerUserId - UUID of the user who will own the forked persona
 * @returns the id of the newly created persona
 * @throws {NotFoundError} when the source persona does not exist
 */
async function forkPersona(
  tx: Prisma.TransactionClient,
  sourcePersonaId: string,
  ownerUserId: string
): Promise<{ id: string }> {
  const source = await tx.persona.findUnique({
    where: { id: sourcePersonaId },
    include: { ontology: true },
  })
  if (!source) {
    throw new NotFoundError('Persona', sourcePersonaId)
  }
  return tx.persona.create({
    data: {
      userId: ownerUserId,
      name: source.name,
      role: source.role,
      informationNeed: source.informationNeed,
      details: source.details,
      isSystemGenerated: false,
      hidden: false,
      ontology: source.ontology
        ? {
            create: {
              entityTypes: toJson(source.ontology.entityTypes),
              eventTypes: toJson(source.ontology.eventTypes),
              roleTypes: toJson(source.ontology.roleTypes),
              relationTypes: toJson(source.ontology.relationTypes),
            },
          }
        : {
            create: {
              entityTypes: [],
              eventTypes: [],
              roleTypes: [],
              relationTypes: [],
            },
          },
    },
    select: { id: true },
  })
}

/**
 * Deep-forks a video summary into the forker's own scope.
 *
 * The source summary's persona belongs to the sharer, and VideoSummary carries
 * a unique constraint on (videoId, personaId). Reusing the source's personaId
 * would therefore collide with the source row. This helper forks the persona
 * first (a new persona owned by `ownerUserId`) and then creates the forked
 * summary against the NEW personaId, keeping the same videoId; the new
 * (videoId, personaId) pair is unique, so no collision occurs. The schema
 * requires personaId, so a summary always has a persona to fork.
 *
 * @param tx - the Prisma transaction client running the fork
 * @param sourceSummaryId - UUID of the summary to copy
 * @param ownerUserId - UUID of the user who will own the forked summary
 * @returns the id of the newly created summary
 * @throws {NotFoundError} when the source summary does not exist
 */
async function forkSummary(
  tx: Prisma.TransactionClient,
  sourceSummaryId: string,
  ownerUserId: string
): Promise<{ id: string }> {
  const source = await tx.videoSummary.findUnique({
    where: { id: sourceSummaryId },
  })
  if (!source) {
    throw new NotFoundError('VideoSummary', sourceSummaryId)
  }

  // A summary's persona belongs to the sharer; fork it so the forked summary
  // lands in the forker's scope under a NEW personaId, keeping the same videoId.
  const forkedPersona = await forkPersona(tx, source.personaId, ownerUserId)

  return tx.videoSummary.create({
    data: {
      videoId: source.videoId,
      personaId: forkedPersona.id,
      summary: toJson(source.summary ?? []),
      visualAnalysis: source.visualAnalysis,
      audioTranscript: source.audioTranscript,
      keyFrames: source.keyFrames ? toJson(source.keyFrames) : Prisma.JsonNull,
      confidence: source.confidence,
      transcriptJson: source.transcriptJson
        ? toJson(source.transcriptJson)
        : Prisma.JsonNull,
      audioLanguage: source.audioLanguage,
      speakerCount: source.speakerCount,
      comment: source.comment,
      createdBy: ownerUserId,
    },
    select: { id: true },
  })
}
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
import { mergeById } from '../services/world-state-service.js'

const tracer = trace.getTracer('fovea-rbac')

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
  let resource = null

  switch (resourceType) {
    case 'annotation':
      resource = await prisma.annotation.findUnique({ where: { id: resourceId } })
      break
    case 'summary':
      resource = await prisma.videoSummary.findUnique({ where: { id: resourceId } })
      break
    case 'claim':
      resource = await prisma.claim.findUnique({ where: { id: resourceId } })
      break
    case 'persona':
      resource = await prisma.persona.findUnique({ where: { id: resourceId } })
      break
    case 'world_state':
      resource = await prisma.worldState.findUnique({ where: { id: resourceId } })
      break
    default:
      throw new ValidationError(`Unknown resource type: ${resourceType}`)
  }

  if (!resource) {
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
      const annotation = await prisma.annotation.findUnique({ where: { id: resourceId } })
      isOwner = annotation?.createdByUserId === userId
      break
    }
    case 'summary': {
      const summary = await prisma.videoSummary.findUnique({ where: { id: resourceId } })
      isOwner = summary?.createdBy === userId
      break
    }
    case 'claim': {
      const claim = await prisma.claim.findUnique({ where: { id: resourceId } })
      isOwner = claim?.createdBy === userId
      break
    }
    case 'persona': {
      const persona = await prisma.persona.findUnique({ where: { id: resourceId } })
      isOwner = persona?.userId === userId
      break
    }
    case 'world_state': {
      const worldState = await prisma.worldState.findUnique({ where: { id: resourceId } })
      isOwner = worldState?.userId === userId
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

      // Fork the resource within a transaction
      const forkedResource = await fastify.prisma.$transaction(async (tx) => {
        switch (share.resourceType) {
          case 'annotation': {
            const source = await tx.annotation.findUnique({
              where: { id: share.resourceId },
            })
            if (!source) {
              throw new NotFoundError('Annotation', share.resourceId)
            }
            // Type annotations carry a persona (the sharer's); fork it so the
            // forked annotation points at the forker's own persona. Object
            // annotations are persona-agnostic (personaId null); keep them null
            // and just re-own them under the forker.
            const forkedPersonaId = source.personaId
              ? (await forkPersona(tx, source.personaId, userId)).id
              : null
            return tx.annotation.create({
              data: {
                videoId: source.videoId,
                personaId: forkedPersonaId,
                type: source.type,
                label: source.label,
                linkType: source.linkType,
                frames: toJson(source.frames),
                confidence: source.confidence,
                source: source.source,
                createdByUserId: userId,
              },
            })
          }

          case 'summary': {
            // Deep-fork: fork the source summary's persona into the forker's
            // scope, then create the forked summary against the NEW personaId.
            // Reusing the source's (videoId, personaId) would collide on the
            // VideoSummary unique constraint, so the persona must be new.
            const { id: forkedSummaryId } = await forkSummary(
              tx,
              share.resourceId,
              userId
            )
            const forked = await tx.videoSummary.findUnique({
              where: { id: forkedSummaryId },
            })
            if (!forked) {
              throw new NotFoundError('VideoSummary', forkedSummaryId)
            }
            return forked
          }

          case 'claim': {
            const source = await tx.claim.findUnique({
              where: { id: share.resourceId },
            })
            if (!source) {
              throw new NotFoundError('Claim', share.resourceId)
            }

            // Deep-fork: fork the source claim's parent summary into the
            // forker's scope (which forks its persona), then create the forked
            // claim under the NEW summaryId. Reusing the sharer's summaryId
            // would orphan the claim under another user's summary, so it would
            // never appear in the forker's tree.
            const { id: forkedSummaryId } = await forkSummary(
              tx,
              source.summaryId,
              userId
            )

            const forkedClaim = await tx.claim.create({
              data: {
                summaryId: forkedSummaryId,
                summaryType: source.summaryType,
                text: source.text,
                gloss: toJson(source.gloss),
                textSpans: source.textSpans
                  ? toJson(source.textSpans)
                  : Prisma.JsonNull,
                claimerType: source.claimerType,
                claimerGloss: source.claimerGloss
                  ? toJson(source.claimerGloss)
                  : Prisma.JsonNull,
                claimRelation: source.claimRelation
                  ? toJson(source.claimRelation)
                  : Prisma.JsonNull,
                claimEventId: source.claimEventId,
                claimTimeId: source.claimTimeId,
                claimLocationId: source.claimLocationId,
                confidence: source.confidence,
                extractionStrategy: source.extractionStrategy,
                audio: source.audio
                  ? toJson(source.audio)
                  : Prisma.JsonNull,
                video: source.video
                  ? toJson(source.video)
                  : Prisma.JsonNull,
                metadata: source.metadata
                  ? (toJson(source.metadata))
                  : Prisma.JsonNull,
                comment: source.comment,
                createdBy: userId,
              },
            })

            // Rebuild the forked summary's denormalized claimsJson so the
            // forked claim is visible in the forker's tree. This version forks
            // a single root claim (no subclaims), so the tree holds exactly one
            // root with an empty subclaim list, mirroring the shape produced by
            // ClaimService.updateSummaryClaimsJson.
            const treeNode = { ...forkedClaim, subclaims: [] }
            const claimsJson = {
              version: '1.0',
              claims: [treeNode],
              metadata: {
                extractedAt: new Date().toISOString(),
                totalClaims: 1,
                totalSubclaims: 0,
                maxDepth: 0,
              },
            }
            await tx.videoSummary.update({
              where: { id: forkedSummaryId },
              data: {
                claimsJson: toJson(claimsJson),
                claimsExtractedAt: new Date(),
              },
            })

            return forkedClaim
          }

          case 'persona': {
            // Reuse the shared persona-copy helper so the copy logic lives in
            // one place, then load the forked persona with its ontology to
            // return the full resource.
            const { id: forkedPersonaId } = await forkPersona(
              tx,
              share.resourceId,
              userId
            )
            const forked = await tx.persona.findUnique({
              where: { id: forkedPersonaId },
              include: { ontology: true },
            })
            if (!forked) {
              throw new NotFoundError('Persona', forkedPersonaId)
            }
            return forked
          }

          case 'world_state': {
            const source = await tx.worldState.findUnique({
              where: { id: share.resourceId },
            })
            if (!source) {
              throw new NotFoundError('WorldState', share.resourceId)
            }
            // A user has exactly one personal world state (projectId NULL), so a
            // fork cannot mint a second one — it would collide on the personal
            // partial unique index. Merge the shared content into the forker's
            // existing personal row by id (additive); create it only if absent.
            const existing = await tx.worldState.findFirst({
              where: { userId, projectId: null },
            })
            if (existing) {
              return tx.worldState.update({
                where: { id: existing.id },
                data: {
                  entities: mergeById(existing.entities, source.entities as unknown[]),
                  events: mergeById(existing.events, source.events as unknown[]),
                  times: mergeById(existing.times, source.times as unknown[]),
                  entityCollections: mergeById(existing.entityCollections, source.entityCollections as unknown[]),
                  eventCollections: mergeById(existing.eventCollections, source.eventCollections as unknown[]),
                  timeCollections: mergeById(existing.timeCollections, source.timeCollections as unknown[]),
                  relations: mergeById(existing.relations, source.relations as unknown[]),
                },
              })
            }
            return tx.worldState.create({
              data: {
                userId,
                entities: toJson(source.entities),
                events: toJson(source.events),
                times: toJson(source.times),
                entityCollections: toJson(source.entityCollections),
                eventCollections: toJson(source.eventCollections),
                timeCollections: toJson(source.timeCollections),
                relations: toJson(source.relations),
              },
            })
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
