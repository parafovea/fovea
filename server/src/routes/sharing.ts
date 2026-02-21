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
import { Prisma } from '@prisma/client'
import { requireAuth } from '@middleware/auth.js'
import { buildAbilities } from '@middleware/abilities.js'
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ErrorResponseSchema,
} from '@lib/errors.js'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fastify prisma decorator type
  prisma: any,
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
 * Checks whether the user owns the resource or has share permission on it.
 *
 * @param prisma - the Prisma client instance from Fastify
 * @param resourceType - the type of resource to check
 * @param resourceId - the UUID of the resource
 * @param userId - the UUID of the user to authorize
 * @returns true if the user has permission
 * @throws {ForbiddenError} when the user lacks permission to share the resource
 */
async function verifySharePermission(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Fastify prisma decorator type
  prisma: any,
  resourceType: string,
  resourceId: string,
  userId: string,
): Promise<boolean> {
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

  if (!isOwner) {
    // Check if user has a forkable share that grants share-forward ability
    const existingShare = await prisma.resourceShare.findFirst({
      where: {
        resourceType,
        resourceId,
        sharedWithUserId: userId,
        permissionLevel: 'forkable',
      },
    })

    if (!existingShare) {
      throw new ForbiddenError('You do not have permission to share this resource')
    }
  }

  return true
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

      // Verify the user has permission to share
      await verifySharePermission(fastify.prisma, resourceType, resourceId, userId)

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
            resource: Type.Any(),
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

      // Load the share
      const share = await fastify.prisma.resourceShare.findUnique({
        where: { id: shareId },
      })

      if (!share) {
        throw new NotFoundError('ResourceShare', shareId)
      }

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
            return tx.annotation.create({
              data: {
                videoId: source.videoId,
                personaId: source.personaId,
                type: source.type,
                label: source.label,
                frames: source.frames as Prisma.InputJsonValue,
                confidence: source.confidence,
                source: source.source,
                createdByUserId: userId,
              },
            })
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
                summary: (source.summary ?? []) as Prisma.InputJsonValue,
                visualAnalysis: source.visualAnalysis,
                audioTranscript: source.audioTranscript,
                keyFrames: source.keyFrames
                  ? (source.keyFrames as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
                confidence: source.confidence,
                transcriptJson: source.transcriptJson
                  ? (source.transcriptJson as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
                audioLanguage: source.audioLanguage,
                speakerCount: source.speakerCount,
                comment: source.comment,
                createdBy: userId,
              },
            })
          }

          case 'claim': {
            const source = await tx.claim.findUnique({
              where: { id: share.resourceId },
            })
            if (!source) {
              throw new NotFoundError('Claim', share.resourceId)
            }
            return tx.claim.create({
              data: {
                summaryId: source.summaryId,
                summaryType: source.summaryType,
                text: source.text,
                gloss: source.gloss as Prisma.InputJsonValue,
                textSpans: source.textSpans
                  ? (source.textSpans as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
                claimerType: source.claimerType,
                claimerGloss: source.claimerGloss
                  ? (source.claimerGloss as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
                claimRelation: source.claimRelation
                  ? (source.claimRelation as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
                claimEventId: source.claimEventId,
                claimTimeId: source.claimTimeId,
                claimLocationId: source.claimLocationId,
                confidence: source.confidence,
                extractionStrategy: source.extractionStrategy,
                audio: source.audio
                  ? (source.audio as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
                video: source.video
                  ? (source.video as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
                metadata: source.metadata
                  ? (source.metadata as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
                comment: source.comment,
                createdBy: userId,
              },
            })
          }

          case 'persona': {
            const source = await tx.persona.findUnique({
              where: { id: share.resourceId },
              include: { ontology: true },
            })
            if (!source) {
              throw new NotFoundError('Persona', share.resourceId)
            }
            return tx.persona.create({
              data: {
                userId,
                name: source.name,
                role: source.role,
                informationNeed: source.informationNeed,
                details: source.details,
                isSystemGenerated: false,
                hidden: false,
                ontology: source.ontology
                  ? {
                      create: {
                        entityTypes: source.ontology.entityTypes as Prisma.InputJsonValue,
                        eventTypes: source.ontology.eventTypes as Prisma.InputJsonValue,
                        roleTypes: source.ontology.roleTypes as Prisma.InputJsonValue,
                        relationTypes: source.ontology.relationTypes as Prisma.InputJsonValue,
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
              include: { ontology: true },
            })
          }

          case 'world_state': {
            const source = await tx.worldState.findUnique({
              where: { id: share.resourceId },
            })
            if (!source) {
              throw new NotFoundError('WorldState', share.resourceId)
            }
            return tx.worldState.create({
              data: {
                userId,
                entities: source.entities as Prisma.InputJsonValue,
                events: source.events as Prisma.InputJsonValue,
                times: source.times as Prisma.InputJsonValue,
                entityCollections: source.entityCollections as Prisma.InputJsonValue,
                eventCollections: source.eventCollections as Prisma.InputJsonValue,
                timeCollections: source.timeCollections as Prisma.InputJsonValue,
                relations: source.relations as Prisma.InputJsonValue,
              },
            })
          }

          default:
            throw new ValidationError(`Cannot fork resource type: ${share.resourceType}`)
        }
      })

      return reply.status(201).send({
        resourceType: share.resourceType,
        resourceId: forkedResource.id,
        resource: forkedResource,
      })
    },
  )
}

export default sharingRoute
