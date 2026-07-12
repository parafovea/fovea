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

      const share = await fastify.prisma.resourceShare.create({
        data: {
          resourceType,
          resourceId,
          sharedByUserId: userId,
          sharedWithUserId: sharedWithUserId || null,
          sharedWithGroupId: sharedWithGroupId || null,
          permissionLevel,
        },
      })

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
            const newId = randomUUID()
            const input: VideoAnnotationInput = {
              id: newId,
              videoId: source.videoId,
              personaId: source.personaId,
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
            const source = await tx.videoSummary.findUnique({
              where: { id: share.resourceId },
            })
            if (!source) {
              throw new NotFoundError('VideoSummary', share.resourceId)
            }
            return tx.videoSummary.create({
              data: {
                videoId: source.videoId,
                personaId: source.personaId,
                summary: source.summary as Prisma.InputJsonValue,
                visualAnalysis: source.visualAnalysis,
                audioTranscript: source.audioTranscript,
                keyFrames: source.keyFrames as Prisma.InputJsonValue ?? Prisma.JsonNull,
                confidence: source.confidence,
                transcriptJson: source.transcriptJson as Prisma.InputJsonValue ?? Prisma.JsonNull,
                audioLanguage: source.audioLanguage,
                speakerCount: source.speakerCount,
                comment: source.comment,
                createdBy: userId,
              },
            })
          }

          case 'claim': {
            const source = await readClaimById(db, share.resourceId)
            if (!source) {
              throw new NotFoundError('Claim', share.resourceId)
            }
            const summary = await tx.videoSummary.findUnique({ where: { id: source.summaryId } })
            if (!summary) {
              throw new NotFoundError('VideoSummary', source.summaryId)
            }
            const newId = randomUUID()
            const now = new Date().toISOString()
            const claim: StoredClaim = {
              ...source,
              id: newId,
              parentClaimId: null,
              createdBy: userId,
              projectId: null,
              createdAt: now,
              updatedAt: now,
            }
            const summaryCtx: ClaimSummaryContext = {
              id: summary.id,
              videoId: summary.videoId,
              projectId: null,
              createdBy: userId,
            }
            await writeClaim(db, summaryCtx, claim)
            return claim
          }

          case 'persona': {
            const source = await tx.persona.findUnique({ where: { id: share.resourceId } })
            if (!source) {
              throw new NotFoundError('Persona', share.resourceId)
            }
            const newPersona = await tx.persona.create({
              data: {
                userId,
                name: source.name,
                role: source.role,
                informationNeed: source.informationNeed,
                details: source.details,
                domain: source.domain,
                isSystemGenerated: false,
                hidden: false,
              },
            })
            const { aggregate, exists } = await readOntologyAggregate(db, source.id)
            await writeOntologyAggregate(
              db,
              newPersona.id,
              exists ? aggregate : emptyOntology(),
              {
                name: `${newPersona.name} ontology`,
                description: newPersona.informationNeed,
                domain: newPersona.domain,
              },
              { projectId: null, createdByUserId: userId },
            )
            return newPersona
          }

          case 'world_state': {
            const owner = await resolvePersonalWorldOwner(db, share.resourceId)
            if (!owner) {
              throw new NotFoundError('WorldState', share.resourceId)
            }
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
