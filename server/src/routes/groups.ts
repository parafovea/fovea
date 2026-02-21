/**
 * API routes for user group management.
 *
 * Provides endpoints for creating, reading, updating, and deleting groups,
 * as well as managing group membership and roles. Includes both user-facing
 * routes (requiring group membership) and admin routes (requiring system admin).
 *
 * @module
 */

import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'

import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { groupOperationCounter } from '../metrics.js'
import { buildAbilities } from '../middleware/abilities.js'
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
  ErrorResponseSchema,
} from '../lib/errors.js'

// ---------------------------------------------------------------------------
// Nullable helpers (fast-json-stringify compatible)
// ---------------------------------------------------------------------------

const NullableString = Type.Unsafe<string | null>({ type: ['string', 'null'] })

// ---------------------------------------------------------------------------
// Shared TypeBox schemas
// ---------------------------------------------------------------------------

/** Group membership roles accepted by create/update endpoints. */
const MemberRoleEnum = Type.Union([
  Type.Literal('group_owner'),
  Type.Literal('group_admin'),
  Type.Literal('group_member'),
])

/** Schema for a group member entry in API responses. */
const GroupMemberSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  groupId: Type.String({ format: 'uuid' }),
  role: Type.String(),
  joinedAt: Type.String({ format: 'date-time' }),
  user: Type.Optional(Type.Object({
    id: Type.String({ format: 'uuid' }),
    username: Type.String(),
    displayName: Type.String(),
    email: NullableString,
  })),
})

/** Schema for a group in API responses. */
const GroupSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  description: NullableString,
  slug: Type.String(),
  createdBy: Type.String(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
  members: Type.Optional(Type.Array(GroupMemberSchema)),
})

/** Schema for a group in list responses, with aggregated member count. */
const GroupListItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  description: NullableString,
  slug: Type.String(),
  createdBy: Type.String(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
  memberCount: Type.Number(),
  userRole: Type.String(),
})

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------

const GroupIdParams = Type.Object({
  groupId: Type.String({ format: 'uuid' }),
})

const MemberParams = Type.Object({
  groupId: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
})

// ---------------------------------------------------------------------------
// Body schemas
// ---------------------------------------------------------------------------

const CreateGroupBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  slug: Type.String({ minLength: 1, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
})

const UpdateGroupBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  description: Type.Optional(Type.String()),
})

const AddMemberBody = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  role: Type.Union([Type.Literal('group_admin'), Type.Literal('group_member')]),
})

const UpdateMemberRoleBody = Type.Object({
  role: Type.Union([Type.Literal('group_admin'), Type.Literal('group_member')]),
})

const AdminCreateGroupBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  slug: Type.String({ minLength: 1, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
  createdBy: Type.String({ format: 'uuid' }),
})

const AdminAddMemberBody = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  role: MemberRoleEnum,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Queries the user's membership in a group and returns the role string.
 * Throws ForbiddenError if the user is not a member.
 *
 * @param prisma - Prisma client instance
 * @param userId - ID of the authenticated user
 * @param groupId - ID of the group
 * @returns the membership role string
 * @throws {ForbiddenError} when the user is not a member of the group
 */
async function requireGroupMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma client type from fastify decorator
  prisma: any,
  userId: string,
  groupId: string,
): Promise<string> {
  const membership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId, groupId } },
  })
  if (!membership) {
    throw new ForbiddenError('You are not a member of this group')
  }
  return membership.role as string
}

/**
 * Asserts that the caller has at least group_admin privileges.
 *
 * @param role - the caller's role in the group
 * @throws {ForbiddenError} when the role is below group_admin
 */
function requireAtLeastAdmin(role: string): void {
  if (role !== 'group_owner' && role !== 'group_admin') {
    throw new ForbiddenError('Requires group_admin or group_owner role')
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const groupsRoute: FastifyPluginAsync = async (fastify) => {
  // =========================================================================
  // User-facing group routes
  // =========================================================================

  /**
   * Create a new group.
   *
   * The authenticated user automatically becomes the group_owner via a
   * GroupMembership record created in the same transaction.
   *
   * @route POST /api/groups
   */
  fastify.post<{
    Body: Static<typeof CreateGroupBody>
  }>(
    '/api/groups',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Create a new group',
        tags: ['groups'],
        body: CreateGroupBody,
        response: {
          201: GroupSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { name, description, slug } = request.body
      const userId = request.user!.id

      // Validate slug uniqueness
      const existing = await fastify.prisma.userGroup.findUnique({
        where: { slug },
      })
      if (existing) {
        throw new ConflictError(
          `A group with slug "${slug}" already exists. Choose a different slug.`,
        )
      }

      // Create group and owner membership in a transaction
      const group = await fastify.prisma.$transaction(async (tx) => {
        const created = await tx.userGroup.create({
          data: {
            name,
            description: description ?? null,
            slug,
            createdBy: userId,
          },
        })

        await tx.groupMembership.create({
          data: {
            userId,
            groupId: created.id,
            role: 'group_owner',
          },
        })

        return tx.userGroup.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, username: true, displayName: true, email: true },
                },
              },
            },
          },
        })
      })

      groupOperationCounter.add(1, { operation: 'create', status: 'success' })
      return reply.status(201).send(group)
    },
  )

  /**
   * List all groups the authenticated user belongs to.
   *
   * Returns each group with its aggregate member count and the user's role.
   *
   * @route GET /api/groups
   */
  fastify.get(
    '/api/groups',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'List groups the current user belongs to',
        tags: ['groups'],
        response: {
          200: Type.Array(GroupListItemSchema),
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id

      const memberships = await fastify.prisma.groupMembership.findMany({
        where: { userId },
        include: {
          group: {
            include: {
              _count: { select: { members: true } },
            },
          },
        },
      })

      const groups = memberships.map((m) => ({
        id: m.group.id,
        name: m.group.name,
        description: m.group.description,
        slug: m.group.slug,
        createdBy: m.group.createdBy,
        createdAt: m.group.createdAt,
        updatedAt: m.group.updatedAt,
        memberCount: m.group._count.members,
        userRole: m.role,
      }))

      return reply.send(groups)
    },
  )

  /**
   * Get details for a single group.
   *
   * The caller must be a member of the group.
   *
   * @route GET /api/groups/:groupId
   */
  fastify.get<{
    Params: Static<typeof GroupIdParams>
  }>(
    '/api/groups/:groupId',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'Get group details with member list',
        tags: ['groups'],
        params: GroupIdParams,
        response: {
          200: GroupSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { groupId } = request.params
      const userId = request.user!.id

      await requireGroupMembership(fastify.prisma, userId, groupId)

      const group = await fastify.prisma.userGroup.findUnique({
        where: { id: groupId },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, username: true, displayName: true, email: true },
              },
            },
          },
        },
      })

      if (!group) {
        throw new NotFoundError('UserGroup', groupId)
      }

      return reply.send(group)
    },
  )

  /**
   * Update a group's name or description.
   *
   * Requires group_admin or group_owner role.
   *
   * @route PUT /api/groups/:groupId
   */
  fastify.put<{
    Params: Static<typeof GroupIdParams>
    Body: Static<typeof UpdateGroupBody>
  }>(
    '/api/groups/:groupId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Update group name or description',
        tags: ['groups'],
        params: GroupIdParams,
        body: UpdateGroupBody,
        response: {
          200: GroupSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { groupId } = request.params
      const userId = request.user!.id

      const role = await requireGroupMembership(fastify.prisma, userId, groupId)
      requireAtLeastAdmin(role)

      const group = await fastify.prisma.userGroup.update({
        where: { id: groupId },
        data: {
          ...(request.body.name !== undefined && { name: request.body.name }),
          ...(request.body.description !== undefined && {
            description: request.body.description,
          }),
        },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, username: true, displayName: true, email: true },
              },
            },
          },
        },
      })

      groupOperationCounter.add(1, { operation: 'update', status: 'success' })
      return reply.send(group)
    },
  )

  /**
   * Delete a group.
   *
   * Requires group_owner or system_admin role. Cascade-deletes all memberships.
   *
   * @route DELETE /api/groups/:groupId
   */
  fastify.delete<{
    Params: Static<typeof GroupIdParams>
  }>(
    '/api/groups/:groupId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Delete a group and its memberships',
        tags: ['groups'],
        params: GroupIdParams,
        response: {
          200: Type.Object({ success: Type.Boolean() }),
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { groupId } = request.params
      const userId = request.user!.id
      const isSystemAdmin = request.user!.isAdmin

      if (!isSystemAdmin) {
        const role = await requireGroupMembership(fastify.prisma, userId, groupId)
        if (role !== 'group_owner') {
          throw new ForbiddenError('Only the group owner or a system admin can delete a group')
        }
      }

      const group = await fastify.prisma.userGroup.findUnique({
        where: { id: groupId },
      })
      if (!group) {
        throw new NotFoundError('UserGroup', groupId)
      }

      // Memberships cascade-delete via onDelete: Cascade in the schema
      await fastify.prisma.userGroup.delete({ where: { id: groupId } })

      groupOperationCounter.add(1, { operation: 'delete', status: 'success' })
      return reply.send({ success: true })
    },
  )

  // =========================================================================
  // Membership routes
  // =========================================================================

  /**
   * Add a member to a group.
   *
   * Requires group_admin or group_owner role.
   *
   * @route POST /api/groups/:groupId/members
   */
  fastify.post<{
    Params: Static<typeof GroupIdParams>
    Body: Static<typeof AddMemberBody>
  }>(
    '/api/groups/:groupId/members',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Add a member to a group',
        tags: ['groups'],
        params: GroupIdParams,
        body: AddMemberBody,
        response: {
          201: GroupMemberSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { groupId } = request.params
      const { userId: targetUserId, role: targetRole } = request.body
      const callerId = request.user!.id

      const callerRole = await requireGroupMembership(fastify.prisma, callerId, groupId)
      requireAtLeastAdmin(callerRole)

      // Verify the group exists
      const group = await fastify.prisma.userGroup.findUnique({
        where: { id: groupId },
      })
      if (!group) {
        throw new NotFoundError('UserGroup', groupId)
      }

      // Verify the target user exists
      const targetUser = await fastify.prisma.user.findUnique({
        where: { id: targetUserId },
      })
      if (!targetUser) {
        throw new NotFoundError('User', targetUserId)
      }

      // Check for existing membership
      const existing = await fastify.prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: targetUserId, groupId } },
      })
      if (existing) {
        throw new ConflictError('User is already a member of this group')
      }

      const membership = await fastify.prisma.groupMembership.create({
        data: {
          userId: targetUserId,
          groupId,
          role: targetRole,
        },
        include: {
          user: {
            select: { id: true, username: true, displayName: true, email: true },
          },
        },
      })

      groupOperationCounter.add(1, { operation: 'add_member', status: 'success' })
      return reply.status(201).send(membership)
    },
  )

  /**
   * List all members of a group.
   *
   * Requires group membership.
   *
   * @route GET /api/groups/:groupId/members
   */
  fastify.get<{
    Params: Static<typeof GroupIdParams>
  }>(
    '/api/groups/:groupId/members',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'List all members of a group',
        tags: ['groups'],
        params: GroupIdParams,
        response: {
          200: Type.Array(GroupMemberSchema),
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { groupId } = request.params
      const userId = request.user!.id

      await requireGroupMembership(fastify.prisma, userId, groupId)

      const members = await fastify.prisma.groupMembership.findMany({
        where: { groupId },
        include: {
          user: {
            select: { id: true, username: true, displayName: true, email: true },
          },
        },
      })

      return reply.send(members)
    },
  )

  /**
   * Change a member's role within a group.
   *
   * Requires group_admin or group_owner role. Cannot demote a group_owner.
   *
   * @route PUT /api/groups/:groupId/members/:userId
   */
  fastify.put<{
    Params: Static<typeof MemberParams>
    Body: Static<typeof UpdateMemberRoleBody>
  }>(
    '/api/groups/:groupId/members/:userId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Change a group member role',
        tags: ['groups'],
        params: MemberParams,
        body: UpdateMemberRoleBody,
        response: {
          200: GroupMemberSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { groupId, userId: targetUserId } = request.params
      const { role: newRole } = request.body
      const callerId = request.user!.id

      const callerRole = await requireGroupMembership(fastify.prisma, callerId, groupId)
      requireAtLeastAdmin(callerRole)

      const targetMembership = await fastify.prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: targetUserId, groupId } },
      })
      if (!targetMembership) {
        throw new NotFoundError('GroupMembership', targetUserId)
      }

      // Prevent demoting a group_owner
      if (targetMembership.role === 'group_owner') {
        throw new ForbiddenError('Cannot change the role of a group owner')
      }

      const updated = await fastify.prisma.groupMembership.update({
        where: { id: targetMembership.id },
        data: { role: newRole },
        include: {
          user: {
            select: { id: true, username: true, displayName: true, email: true },
          },
        },
      })

      groupOperationCounter.add(1, { operation: 'update', status: 'success' })
      return reply.send(updated)
    },
  )

  /**
   * Remove a member from a group.
   *
   * Requires group_admin or group_owner role, unless the user is removing
   * themselves. Cannot remove the last group_owner.
   *
   * @route DELETE /api/groups/:groupId/members/:userId
   */
  fastify.delete<{
    Params: Static<typeof MemberParams>
  }>(
    '/api/groups/:groupId/members/:userId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Remove a member from a group',
        tags: ['groups'],
        params: MemberParams,
        response: {
          200: Type.Object({ success: Type.Boolean() }),
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { groupId, userId: targetUserId } = request.params
      const callerId = request.user!.id
      const isSelfRemoval = callerId === targetUserId

      if (!isSelfRemoval) {
        const callerRole = await requireGroupMembership(fastify.prisma, callerId, groupId)
        requireAtLeastAdmin(callerRole)
      }

      const targetMembership = await fastify.prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: targetUserId, groupId } },
      })
      if (!targetMembership) {
        throw new NotFoundError('GroupMembership', targetUserId)
      }

      // Prevent removing the last group_owner
      if (targetMembership.role === 'group_owner') {
        const ownerCount = await fastify.prisma.groupMembership.count({
          where: { groupId, role: 'group_owner' },
        })
        if (ownerCount <= 1) {
          throw new ValidationError(
            'Cannot remove the last group owner. Transfer ownership first.',
          )
        }
      }

      await fastify.prisma.groupMembership.delete({
        where: { id: targetMembership.id },
      })

      groupOperationCounter.add(1, { operation: 'remove_member', status: 'success' })
      return reply.send({ success: true })
    },
  )

  // =========================================================================
  // Admin routes
  // =========================================================================

  /**
   * List all groups (admin only).
   *
   * @route GET /api/admin/groups
   */
  fastify.get(
    '/api/admin/groups',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'List all groups (admin)',
        tags: ['admin', 'groups'],
        response: {
          200: Type.Array(Type.Object({
            id: Type.String({ format: 'uuid' }),
            name: Type.String(),
            description: NullableString,
            slug: Type.String(),
            createdBy: Type.String(),
            createdAt: Type.String({ format: 'date-time' }),
            updatedAt: Type.String({ format: 'date-time' }),
            _count: Type.Object({
              members: Type.Number(),
            }),
          })),
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const groups = await fastify.prisma.userGroup.findMany({
        include: {
          _count: { select: { members: true } },
        },
        orderBy: { createdAt: 'desc' },
      })

      return reply.send(groups)
    },
  )

  /**
   * Create a group on behalf of any user (admin only).
   *
   * The specified createdBy user becomes the group_owner.
   *
   * @route POST /api/admin/groups
   */
  fastify.post<{
    Body: Static<typeof AdminCreateGroupBody>
  }>(
    '/api/admin/groups',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Create a group for any user (admin)',
        tags: ['admin', 'groups'],
        body: AdminCreateGroupBody,
        response: {
          201: GroupSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { name, description, slug, createdBy } = request.body

      // Validate slug uniqueness
      const existing = await fastify.prisma.userGroup.findUnique({
        where: { slug },
      })
      if (existing) {
        throw new ConflictError(
          `A group with slug "${slug}" already exists. Choose a different slug.`,
        )
      }

      // Validate the target user exists
      const user = await fastify.prisma.user.findUnique({
        where: { id: createdBy },
      })
      if (!user) {
        throw new NotFoundError('User', createdBy)
      }

      const group = await fastify.prisma.$transaction(async (tx) => {
        const created = await tx.userGroup.create({
          data: {
            name,
            description: description ?? null,
            slug,
            createdBy,
          },
        })

        await tx.groupMembership.create({
          data: {
            userId: createdBy,
            groupId: created.id,
            role: 'group_owner',
          },
        })

        return tx.userGroup.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, username: true, displayName: true, email: true },
                },
              },
            },
          },
        })
      })

      groupOperationCounter.add(1, { operation: 'create', status: 'success' })
      return reply.status(201).send(group)
    },
  )

  /**
   * Update any group (admin only).
   *
   * @route PUT /api/admin/groups/:groupId
   */
  fastify.put<{
    Params: Static<typeof GroupIdParams>
    Body: Static<typeof UpdateGroupBody>
  }>(
    '/api/admin/groups/:groupId',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Update any group (admin)',
        tags: ['admin', 'groups'],
        params: GroupIdParams,
        body: UpdateGroupBody,
        response: {
          200: GroupSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { groupId } = request.params

      const existing = await fastify.prisma.userGroup.findUnique({
        where: { id: groupId },
      })
      if (!existing) {
        throw new NotFoundError('UserGroup', groupId)
      }

      const group = await fastify.prisma.userGroup.update({
        where: { id: groupId },
        data: {
          ...(request.body.name !== undefined && { name: request.body.name }),
          ...(request.body.description !== undefined && {
            description: request.body.description,
          }),
        },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, username: true, displayName: true, email: true },
              },
            },
          },
        },
      })

      groupOperationCounter.add(1, { operation: 'update', status: 'success' })
      return reply.send(group)
    },
  )

  /**
   * Delete any group (admin only).
   *
   * @route DELETE /api/admin/groups/:groupId
   */
  fastify.delete<{
    Params: Static<typeof GroupIdParams>
  }>(
    '/api/admin/groups/:groupId',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Delete any group (admin)',
        tags: ['admin', 'groups'],
        params: GroupIdParams,
        response: {
          200: Type.Object({ success: Type.Boolean() }),
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { groupId } = request.params

      const existing = await fastify.prisma.userGroup.findUnique({
        where: { id: groupId },
      })
      if (!existing) {
        throw new NotFoundError('UserGroup', groupId)
      }

      await fastify.prisma.userGroup.delete({ where: { id: groupId } })

      groupOperationCounter.add(1, { operation: 'delete', status: 'success' })
      return reply.send({ success: true })
    },
  )

  /**
   * Add any user to any group (admin only).
   *
   * Allows assigning any membership role, including group_owner.
   *
   * @route POST /api/admin/groups/:groupId/members
   */
  fastify.post<{
    Params: Static<typeof GroupIdParams>
    Body: Static<typeof AdminAddMemberBody>
  }>(
    '/api/admin/groups/:groupId/members',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Add any user to any group (admin)',
        tags: ['admin', 'groups'],
        params: GroupIdParams,
        body: AdminAddMemberBody,
        response: {
          201: GroupMemberSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { groupId } = request.params
      const { userId: targetUserId, role: targetRole } = request.body

      const group = await fastify.prisma.userGroup.findUnique({
        where: { id: groupId },
      })
      if (!group) {
        throw new NotFoundError('UserGroup', groupId)
      }

      const targetUser = await fastify.prisma.user.findUnique({
        where: { id: targetUserId },
      })
      if (!targetUser) {
        throw new NotFoundError('User', targetUserId)
      }

      const existing = await fastify.prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: targetUserId, groupId } },
      })
      if (existing) {
        throw new ConflictError('User is already a member of this group')
      }

      const membership = await fastify.prisma.groupMembership.create({
        data: {
          userId: targetUserId,
          groupId,
          role: targetRole,
        },
        include: {
          user: {
            select: { id: true, username: true, displayName: true, email: true },
          },
        },
      })

      groupOperationCounter.add(1, { operation: 'add_member', status: 'success' })
      return reply.status(201).send(membership)
    },
  )
}

export default groupsRoute
