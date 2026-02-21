/**
 * API routes for project management.
 *
 * Provides endpoints for creating, listing, updating, and deleting projects,
 * managing project memberships, and accessing project-scoped personas and
 * world state.
 */

import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '@middleware/auth.js'
import { buildAbilities } from '@middleware/abilities.js'
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
  ErrorResponseSchema,
} from '@lib/errors.js'

// ---------------------------------------------------------------------------
// Nullable type helpers for fast-json-stringify compatibility.
// ---------------------------------------------------------------------------

const NullableString = Type.Unsafe<string | null>({ type: ['string', 'null'] })

// ---------------------------------------------------------------------------
// Shared param schemas
// ---------------------------------------------------------------------------

const ProjectIdParams = Type.Object({
  projectId: Type.String({ format: 'uuid' }),
})

const ProjectMemberParams = Type.Object({
  projectId: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
})

// ---------------------------------------------------------------------------
// Shared response schemas
// ---------------------------------------------------------------------------

const ProjectSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  description: NullableString,
  slug: Type.String(),
  ownerUserId: NullableString,
  ownerGroupId: NullableString,
  settings: Type.Any(),
  isArchived: Type.Boolean(),
  createdBy: Type.String(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

const ProjectWithMetaSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  description: NullableString,
  slug: Type.String(),
  ownerUserId: NullableString,
  ownerGroupId: NullableString,
  settings: Type.Any(),
  isArchived: Type.Boolean(),
  createdBy: Type.String(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
  _count: Type.Object({
    members: Type.Number(),
  }),
  myRole: NullableString,
})

const MembershipSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  projectId: Type.String({ format: 'uuid' }),
  role: Type.String(),
  joinedAt: Type.String({ format: 'date-time' }),
  user: Type.Object({
    id: Type.String({ format: 'uuid' }),
    username: Type.String(),
    displayName: Type.String(),
    email: NullableString,
  }),
})

const PersonaSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  role: Type.String(),
  informationNeed: Type.String(),
  details: NullableString,
  isSystemGenerated: Type.Boolean(),
  hidden: Type.Boolean(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

const WorldStateResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.String({ format: 'uuid' }),
  projectId: NullableString,
  entities: Type.Array(Type.Any()),
  events: Type.Array(Type.Any()),
  times: Type.Array(Type.Any()),
  entityCollections: Type.Array(Type.Any()),
  eventCollections: Type.Array(Type.Any()),
  timeCollections: Type.Array(Type.Any()),
  relations: Type.Array(Type.Any()),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

// ---------------------------------------------------------------------------
// Allowed membership roles (excluding project_owner, which is assigned only
// during project creation).
// ---------------------------------------------------------------------------

const ASSIGNABLE_ROLES = ['project_manager', 'annotator', 'reviewer', 'viewer'] as const
type AssignableRole = typeof ASSIGNABLE_ROLES[number]

/**
 * Returns true if the value is a valid assignable project role.
 *
 * @param value - string to check
 * @returns whether the value is a valid assignable role
 */
function isAssignableRole(value: string): value is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value)
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const projectsRoute: FastifyPluginAsync = async (fastify) => {
  // =========================================================================
  // POST /api/projects - Create a project
  // =========================================================================

  fastify.post<{
    Body: Static<typeof CreateProjectBody>
  }>(
    '/api/projects',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Create a new project',
        tags: ['projects'],
        body: CreateProjectBody,
        response: {
          201: ProjectSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id
      const { name, description, slug, ownerGroupId } = request.body

      // Validate slug uniqueness
      const existing = await fastify.prisma.project.findUnique({
        where: { slug },
      })
      if (existing) {
        throw new ConflictError(`Project slug "${slug}" is already taken`)
      }

      // If group-owned, verify the user is group_admin or group_owner
      if (ownerGroupId) {
        const membership = await fastify.prisma.groupMembership.findUnique({
          where: { userId_groupId: { userId, groupId: ownerGroupId } },
        })
        if (!membership || !['group_admin', 'group_owner'].includes(membership.role)) {
          throw new ForbiddenError('You must be a group admin or owner to create a project for this group')
        }
      }

      // Create project and initial membership in a transaction
      const project = await fastify.prisma.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            name,
            description: description ?? null,
            slug,
            ownerUserId: ownerGroupId ? null : userId,
            ownerGroupId: ownerGroupId ?? null,
            createdBy: userId,
          },
        })

        await tx.projectMembership.create({
          data: {
            userId,
            projectId: created.id,
            role: 'project_owner',
          },
        })

        return created
      })

      return reply.status(201).send(project)
    },
  )

  // =========================================================================
  // GET /api/projects - List accessible projects
  // =========================================================================

  fastify.get<{
    Querystring: { scope?: 'personal' | 'group' | 'all' }
  }>(
    '/api/projects',
    {
      onRequest: [requireAuth],
      schema: {
        description: 'List projects accessible to the current user',
        tags: ['projects'],
        querystring: Type.Object({
          scope: Type.Optional(Type.Union([
            Type.Literal('personal'),
            Type.Literal('group'),
            Type.Literal('all'),
          ])),
        }),
        response: {
          200: Type.Array(ProjectWithMetaSchema),
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id
      const scope = request.query.scope ?? 'all'

      // Build the OR conditions based on scope
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma where clause union requires any
      const conditions: any[] = []

      if (scope === 'personal' || scope === 'all') {
        conditions.push({ ownerUserId: userId })
      }

      if (scope === 'group' || scope === 'all') {
        // Find groups the user belongs to
        const groupMemberships = await fastify.prisma.groupMembership.findMany({
          where: { userId },
          select: { groupId: true },
        })
        const groupIds = groupMemberships.map((gm) => gm.groupId)
        if (groupIds.length > 0) {
          conditions.push({ ownerGroupId: { in: groupIds } })
        }
      }

      if (scope === 'all') {
        // Projects where user has direct membership
        conditions.push({
          members: { some: { userId } },
        })
      }

      if (conditions.length === 0) {
        return reply.send([])
      }

      const projects = await fastify.prisma.project.findMany({
        where: { OR: conditions },
        include: {
          _count: { select: { members: true } },
          members: {
            where: { userId },
            select: { role: true },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      // Deduplicate (a project can match multiple conditions)
      const seen = new Set<string>()
      const unique = projects.filter((p) => {
        if (seen.has(p.id)) return false
        seen.add(p.id)
        return true
      })

      const result = unique.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        slug: p.slug,
        ownerUserId: p.ownerUserId,
        ownerGroupId: p.ownerGroupId,
        settings: p.settings,
        isArchived: p.isArchived,
        createdBy: p.createdBy,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        _count: p._count,
        myRole: p.members[0]?.role ?? null,
      }))

      return reply.send(result)
    },
  )

  // =========================================================================
  // GET /api/projects/:projectId - Get project details
  // =========================================================================

  fastify.get<{ Params: Static<typeof ProjectIdParams> }>(
    '/api/projects/:projectId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get project details including members and video assignment count',
        tags: ['projects'],
        params: ProjectIdParams,
        response: {
          200: Type.Object({
            id: Type.String({ format: 'uuid' }),
            name: Type.String(),
            description: NullableString,
            slug: Type.String(),
            ownerUserId: NullableString,
            ownerGroupId: NullableString,
            settings: Type.Any(),
            isArchived: Type.Boolean(),
            createdBy: Type.String(),
            createdAt: Type.String({ format: 'date-time' }),
            updatedAt: Type.String({ format: 'date-time' }),
            members: Type.Array(MembershipSchema),
            videoAssignmentCount: Type.Number(),
          }),
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id
      const { projectId } = request.params

      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, username: true, displayName: true, email: true },
              },
            },
          },
          _count: { select: { videoAssignments: true } },
        },
      })

      if (!project) {
        throw new NotFoundError('Project', projectId)
      }

      // Must be a member or system_admin
      const isMember = project.members.some((m) => m.userId === userId)
      const isAdmin = request.user!.isAdmin
      if (!isMember && !isAdmin) {
        throw new ForbiddenError('You must be a project member to view this project')
      }

      return reply.send({
        id: project.id,
        name: project.name,
        description: project.description,
        slug: project.slug,
        ownerUserId: project.ownerUserId,
        ownerGroupId: project.ownerGroupId,
        settings: project.settings,
        isArchived: project.isArchived,
        createdBy: project.createdBy,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        members: project.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          projectId: m.projectId,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
          user: m.user,
        })),
        videoAssignmentCount: project._count.videoAssignments,
      })
    },
  )

  // =========================================================================
  // PUT /api/projects/:projectId - Update project
  // =========================================================================

  fastify.put<{
    Params: Static<typeof ProjectIdParams>
    Body: Static<typeof UpdateProjectBody>
  }>(
    '/api/projects/:projectId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Update project details',
        tags: ['projects'],
        params: ProjectIdParams,
        body: UpdateProjectBody,
        response: {
          200: ProjectSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id
      const { projectId } = request.params
      const { name, description, settings, isArchived } = request.body

      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { where: { userId }, take: 1 } },
      })

      if (!project) {
        throw new NotFoundError('Project', projectId)
      }

      const myRole = project.members[0]?.role
      if (!myRole || !['project_owner', 'project_manager'].includes(myRole)) {
        throw new ForbiddenError('Only project owners and managers can update the project')
      }

      const updated = await fastify.prisma.project.update({
        where: { id: projectId },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
          ...(settings !== undefined && { settings: settings as any }),
          ...(isArchived !== undefined && { isArchived }),
        },
      })

      return reply.send(updated)
    },
  )

  // =========================================================================
  // DELETE /api/projects/:projectId - Delete project
  // =========================================================================

  fastify.delete<{ Params: Static<typeof ProjectIdParams> }>(
    '/api/projects/:projectId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Delete a project and cascade-delete memberships and assignments',
        tags: ['projects'],
        params: ProjectIdParams,
        response: {
          200: Type.Object({ message: Type.String() }),
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id
      const { projectId } = request.params

      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { where: { userId }, take: 1 } },
      })

      if (!project) {
        throw new NotFoundError('Project', projectId)
      }

      const isOwnerRole = project.members[0]?.role === 'project_owner'
      const isAdmin = request.user!.isAdmin
      if (!isOwnerRole && !isAdmin) {
        throw new ForbiddenError('Only the project owner or a system admin can delete a project')
      }

      // Cascade deletes are handled by Prisma's onDelete: Cascade on memberships
      // and assignments. Delete the project directly.
      await fastify.prisma.project.delete({ where: { id: projectId } })

      return reply.send({ message: 'Project deleted successfully' })
    },
  )

  // =========================================================================
  // POST /api/projects/:projectId/members - Add member
  // =========================================================================

  fastify.post<{
    Params: Static<typeof ProjectIdParams>
    Body: Static<typeof AddMemberBody>
  }>(
    '/api/projects/:projectId/members',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Add a member to the project',
        tags: ['projects'],
        params: ProjectIdParams,
        body: AddMemberBody,
        response: {
          201: MembershipSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const callerUserId = request.user!.id
      const { projectId } = request.params
      const { userId: targetUserId, role } = request.body

      if (!isAssignableRole(role)) {
        throw new ValidationError(
          `Invalid role "${role}". Must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
        )
      }

      // Verify caller has permission
      const callerMembership = await fastify.prisma.projectMembership.findUnique({
        where: { userId_projectId: { userId: callerUserId, projectId } },
      })
      if (!callerMembership || !['project_owner', 'project_manager'].includes(callerMembership.role)) {
        throw new ForbiddenError('Only project owners and managers can add members')
      }

      // Verify target user exists
      const targetUser = await fastify.prisma.user.findUnique({
        where: { id: targetUserId },
      })
      if (!targetUser) {
        throw new NotFoundError('User', targetUserId)
      }

      // Check for existing membership
      const existingMembership = await fastify.prisma.projectMembership.findUnique({
        where: { userId_projectId: { userId: targetUserId, projectId } },
      })
      if (existingMembership) {
        throw new ConflictError('User is already a member of this project')
      }

      const membership = await fastify.prisma.projectMembership.create({
        data: {
          userId: targetUserId,
          projectId,
          role,
        },
        include: {
          user: {
            select: { id: true, username: true, displayName: true, email: true },
          },
        },
      })

      return reply.status(201).send({
        id: membership.id,
        userId: membership.userId,
        projectId: membership.projectId,
        role: membership.role,
        joinedAt: membership.joinedAt.toISOString(),
        user: membership.user,
      })
    },
  )

  // =========================================================================
  // GET /api/projects/:projectId/members - List members
  // =========================================================================

  fastify.get<{ Params: Static<typeof ProjectIdParams> }>(
    '/api/projects/:projectId/members',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'List all members of a project',
        tags: ['projects'],
        params: ProjectIdParams,
        response: {
          200: Type.Array(MembershipSchema),
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id
      const { projectId } = request.params

      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
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

      if (!project) {
        throw new NotFoundError('Project', projectId)
      }

      const isMember = project.members.some((m) => m.userId === userId)
      const isAdmin = request.user!.isAdmin
      if (!isMember && !isAdmin) {
        throw new ForbiddenError('You must be a project member to list members')
      }

      const result = project.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        projectId: m.projectId,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        user: m.user,
      }))

      return reply.send(result)
    },
  )

  // =========================================================================
  // PUT /api/projects/:projectId/members/:userId - Change member role
  // =========================================================================

  fastify.put<{
    Params: Static<typeof ProjectMemberParams>
    Body: Static<typeof ChangeRoleBody>
  }>(
    '/api/projects/:projectId/members/:userId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Change a project member role',
        tags: ['projects'],
        params: ProjectMemberParams,
        body: ChangeRoleBody,
        response: {
          200: MembershipSchema,
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const callerUserId = request.user!.id
      const { projectId, userId: targetUserId } = request.params
      const { role } = request.body

      if (!isAssignableRole(role)) {
        throw new ValidationError(
          `Invalid role "${role}". Must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
        )
      }

      // Cannot change own role
      if (callerUserId === targetUserId) {
        throw new ValidationError('You cannot change your own role')
      }

      // Verify caller has permission
      const callerMembership = await fastify.prisma.projectMembership.findUnique({
        where: { userId_projectId: { userId: callerUserId, projectId } },
      })
      if (!callerMembership || !['project_owner', 'project_manager'].includes(callerMembership.role)) {
        throw new ForbiddenError('Only project owners and managers can change member roles')
      }

      // Verify target membership exists
      const targetMembership = await fastify.prisma.projectMembership.findUnique({
        where: { userId_projectId: { userId: targetUserId, projectId } },
      })
      if (!targetMembership) {
        throw new NotFoundError('ProjectMembership', targetUserId)
      }

      const updated = await fastify.prisma.projectMembership.update({
        where: { userId_projectId: { userId: targetUserId, projectId } },
        data: { role },
        include: {
          user: {
            select: { id: true, username: true, displayName: true, email: true },
          },
        },
      })

      return reply.send({
        id: updated.id,
        userId: updated.userId,
        projectId: updated.projectId,
        role: updated.role,
        joinedAt: updated.joinedAt.toISOString(),
        user: updated.user,
      })
    },
  )

  // =========================================================================
  // DELETE /api/projects/:projectId/members/:userId - Remove member
  // =========================================================================

  fastify.delete<{ Params: Static<typeof ProjectMemberParams> }>(
    '/api/projects/:projectId/members/:userId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Remove a member from the project (or leave if removing self)',
        tags: ['projects'],
        params: ProjectMemberParams,
        response: {
          200: Type.Object({ message: Type.String() }),
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const callerUserId = request.user!.id
      const { projectId, userId: targetUserId } = request.params

      const targetMembership = await fastify.prisma.projectMembership.findUnique({
        where: { userId_projectId: { userId: targetUserId, projectId } },
      })

      if (!targetMembership) {
        throw new NotFoundError('ProjectMembership', targetUserId)
      }

      // If removing someone else, caller must be owner or manager
      if (callerUserId !== targetUserId) {
        const callerMembership = await fastify.prisma.projectMembership.findUnique({
          where: { userId_projectId: { userId: callerUserId, projectId } },
        })
        if (!callerMembership || !['project_owner', 'project_manager'].includes(callerMembership.role)) {
          throw new ForbiddenError('Only project owners and managers can remove members')
        }
      }

      // Cannot remove the last project_owner
      if (targetMembership.role === 'project_owner') {
        const ownerCount = await fastify.prisma.projectMembership.count({
          where: { projectId, role: 'project_owner' },
        })
        if (ownerCount <= 1) {
          throw new ValidationError('Cannot remove the last project owner')
        }
      }

      await fastify.prisma.projectMembership.delete({
        where: { userId_projectId: { userId: targetUserId, projectId } },
      })

      return reply.send({ message: 'Member removed successfully' })
    },
  )

  // =========================================================================
  // GET /api/projects/:projectId/personas - List project personas
  // =========================================================================

  fastify.get<{ Params: Static<typeof ProjectIdParams> }>(
    '/api/projects/:projectId/personas',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'List personas scoped to a project',
        tags: ['projects', 'personas'],
        params: ProjectIdParams,
        response: {
          200: Type.Array(PersonaSchema),
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id
      const { projectId } = request.params

      // Verify project exists and user is a member
      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { where: { userId }, take: 1 } },
      })

      if (!project) {
        throw new NotFoundError('Project', projectId)
      }

      const isMember = project.members.length > 0
      const isAdmin = request.user!.isAdmin
      if (!isMember && !isAdmin) {
        throw new ForbiddenError('You must be a project member to view personas')
      }

      const personas = await fastify.prisma.persona.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      })

      return reply.send(personas)
    },
  )

  // =========================================================================
  // GET /api/projects/:projectId/world - Get project world state
  // =========================================================================

  fastify.get<{ Params: Static<typeof ProjectIdParams> }>(
    '/api/projects/:projectId/world',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Get the world state for the current user in this project',
        tags: ['projects', 'world'],
        params: ProjectIdParams,
        response: {
          200: WorldStateResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id
      const { projectId } = request.params

      // Verify project exists and user is a member
      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { where: { userId }, take: 1 } },
      })

      if (!project) {
        throw new NotFoundError('Project', projectId)
      }

      const isMember = project.members.length > 0
      const isAdmin = request.user!.isAdmin
      if (!isMember && !isAdmin) {
        throw new ForbiddenError('You must be a project member to access world state')
      }

      // Find or create world state for (userId, projectId)
      let worldState = await fastify.prisma.worldState.findUnique({
        where: { userId_projectId: { userId, projectId } },
      })

      if (!worldState) {
        worldState = await fastify.prisma.worldState.create({
          data: {
            userId,
            projectId,
            entities: [],
            events: [],
            times: [],
            entityCollections: [],
            eventCollections: [],
            timeCollections: [],
            relations: [],
          },
        })
      }

      return reply.send({
        id: worldState.id,
        userId: worldState.userId,
        projectId: worldState.projectId,
        entities: worldState.entities || [],
        events: worldState.events || [],
        times: worldState.times || [],
        entityCollections: worldState.entityCollections || [],
        eventCollections: worldState.eventCollections || [],
        timeCollections: worldState.timeCollections || [],
        relations: worldState.relations || [],
        createdAt: worldState.createdAt.toISOString(),
        updatedAt: worldState.updatedAt.toISOString(),
      })
    },
  )

  // =========================================================================
  // PUT /api/projects/:projectId/world - Update project world state
  // =========================================================================

  fastify.put<{
    Params: Static<typeof ProjectIdParams>
    Body: Static<typeof UpdateWorldBody>
  }>(
    '/api/projects/:projectId/world',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Update the world state for the current user in this project',
        tags: ['projects', 'world'],
        params: ProjectIdParams,
        body: UpdateWorldBody,
        response: {
          200: WorldStateResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = request.user!.id
      const { projectId } = request.params
      const updateData = request.body

      // Verify project exists and user is a member
      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
        include: { members: { where: { userId }, take: 1 } },
      })

      if (!project) {
        throw new NotFoundError('Project', projectId)
      }

      const isMember = project.members.length > 0
      const isAdmin = request.user!.isAdmin
      if (!isMember && !isAdmin) {
        throw new ForbiddenError('You must be a project member to update world state')
      }

      // Find or create, then update
      const existing = await fastify.prisma.worldState.findUnique({
        where: { userId_projectId: { userId, projectId } },
      })

      let worldState
      if (existing) {
        worldState = await fastify.prisma.worldState.update({
          where: { userId_projectId: { userId, projectId } },
          data: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            entities: updateData.entities !== undefined ? (updateData.entities as any) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            events: updateData.events !== undefined ? (updateData.events as any) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            times: updateData.times !== undefined ? (updateData.times as any) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            entityCollections: updateData.entityCollections !== undefined ? (updateData.entityCollections as any) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            eventCollections: updateData.eventCollections !== undefined ? (updateData.eventCollections as any) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            timeCollections: updateData.timeCollections !== undefined ? (updateData.timeCollections as any) : undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            relations: updateData.relations !== undefined ? (updateData.relations as any) : undefined,
          },
        })
      } else {
        worldState = await fastify.prisma.worldState.create({
          data: {
            userId,
            projectId,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            entities: (updateData.entities || []) as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            events: (updateData.events || []) as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            times: (updateData.times || []) as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            entityCollections: (updateData.entityCollections || []) as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            eventCollections: (updateData.eventCollections || []) as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            timeCollections: (updateData.timeCollections || []) as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON type requires any
            relations: (updateData.relations || []) as any,
          },
        })
      }

      return reply.send({
        id: worldState.id,
        userId: worldState.userId,
        projectId: worldState.projectId,
        entities: worldState.entities || [],
        events: worldState.events || [],
        times: worldState.times || [],
        entityCollections: worldState.entityCollections || [],
        eventCollections: worldState.eventCollections || [],
        timeCollections: worldState.timeCollections || [],
        relations: worldState.relations || [],
        createdAt: worldState.createdAt.toISOString(),
        updatedAt: worldState.updatedAt.toISOString(),
      })
    },
  )
}

// ---------------------------------------------------------------------------
// Body schemas (defined after the plugin function to keep route definitions
// close to their handler, per the codebase convention).
// ---------------------------------------------------------------------------

const CreateProjectBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  slug: Type.String({ minLength: 1, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' }),
  ownerGroupId: Type.Optional(Type.String({ format: 'uuid' })),
})

const UpdateProjectBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  description: Type.Optional(Type.String()),
  settings: Type.Optional(Type.Any()),
  isArchived: Type.Optional(Type.Boolean()),
})

const AddMemberBody = Type.Object({
  userId: Type.String({ format: 'uuid' }),
  role: Type.String(),
})

const ChangeRoleBody = Type.Object({
  role: Type.String(),
})

const UpdateWorldBody = Type.Object({
  entities: Type.Optional(Type.Array(Type.Any())),
  events: Type.Optional(Type.Array(Type.Any())),
  times: Type.Optional(Type.Array(Type.Any())),
  entityCollections: Type.Optional(Type.Array(Type.Any())),
  eventCollections: Type.Optional(Type.Array(Type.Any())),
  timeCollections: Type.Optional(Type.Array(Type.Any())),
  relations: Type.Optional(Type.Array(Type.Any())),
})

export default projectsRoute
