/**
 * API routes for project management.
 *
 * Routes perform HTTP concerns only: schema validation, request parsing, and
 * dispatch to a per-request ProjectService that owns business rules and CASL
 * authorization. The ProjectRepository owns all Prisma access.
 *
 * Endpoints for creating, listing, updating, and deleting projects, managing
 * project memberships, listing assignable users, and accessing project-scoped
 * personas and world state.
 */

import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { requireAuth } from '@middleware/auth.js'
import { buildAbilities } from '@middleware/abilities.js'
import { projectOperationCounter } from '../metrics.js'
import { ErrorResponseSchema } from '@lib/errors.js'
import { ProjectRepository } from '../repositories/ProjectRepository.js'
import { ProjectService } from '../services/project-service.js'

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
  settings: Type.Unknown(),
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
  settings: Type.Unknown(),
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

const AssignableUserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  username: Type.String(),
  displayName: Type.String(),
  email: NullableString,
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
  entities: Type.Array(Type.Unknown()),
  events: Type.Array(Type.Unknown()),
  times: Type.Array(Type.Unknown()),
  entityCollections: Type.Array(Type.Unknown()),
  eventCollections: Type.Array(Type.Unknown()),
  timeCollections: Type.Array(Type.Unknown()),
  relations: Type.Array(Type.Unknown()),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

// ---------------------------------------------------------------------------
// Body schemas
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
  settings: Type.Optional(Type.Unknown()),
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
  entities: Type.Optional(Type.Array(Type.Unknown())),
  events: Type.Optional(Type.Array(Type.Unknown())),
  times: Type.Optional(Type.Array(Type.Unknown())),
  entityCollections: Type.Optional(Type.Array(Type.Unknown())),
  eventCollections: Type.Optional(Type.Array(Type.Unknown())),
  timeCollections: Type.Optional(Type.Array(Type.Unknown())),
  relations: Type.Optional(Type.Array(Type.Unknown())),
})

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const projectsRoute: FastifyPluginAsync = async (fastify) => {
  // Request-independent: one repository for the plugin's lifetime.
  const repository = new ProjectRepository(fastify.prisma)

  /**
   * Builds a per-request service from the request-scoped CASL ability and the
   * authenticated user's id and system role.
   */
  const serviceFor = (request: FastifyRequest): ProjectService =>
    new ProjectService(
      repository,
      request.ability ?? null,
      request.user?.id,
      request.user?.systemRole ?? undefined
    )

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
      const service = serviceFor(request)
      const project = await service.create(request.body)
      projectOperationCounter.add(1, { operation: 'create', status: 'success' })
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
      const service = serviceFor(request)
      const projects = await service.list(userId, scope)
      return reply.send(projects)
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
            settings: Type.Unknown(),
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
      const service = serviceFor(request)
      const project = await service.getById(request.params.projectId)
      return reply.send(project)
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
      const service = serviceFor(request)
      const updated = await service.update(request.params.projectId, request.body)
      projectOperationCounter.add(1, { operation: 'update', status: 'success' })
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
      const service = serviceFor(request)
      await service.delete(request.params.projectId)
      projectOperationCounter.add(1, { operation: 'delete', status: 'success' })
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
      const { projectId } = request.params
      const { userId: targetUserId, role } = request.body
      const service = serviceFor(request)
      const membership = await service.addMember(projectId, targetUserId, role)
      projectOperationCounter.add(1, { operation: 'add_member', status: 'success' })
      return reply.status(201).send(membership)
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
      const service = serviceFor(request)
      const members = await service.listMembers(request.params.projectId)
      return reply.send(members)
    },
  )

  // =========================================================================
  // GET /api/projects/:projectId/assignable-users - List addable users
  // =========================================================================

  fastify.get<{ Params: Static<typeof ProjectIdParams> }>(
    '/api/projects/:projectId/assignable-users',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'List users who can be added as members (not already members)',
        tags: ['projects'],
        params: ProjectIdParams,
        response: {
          200: Type.Array(AssignableUserSchema),
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const service = serviceFor(request)
      const users = await service.listAssignableUsers(request.params.projectId)
      return reply.send(users)
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
      const service = serviceFor(request)
      const updated = await service.changeMemberRole(projectId, targetUserId, callerUserId, role)
      projectOperationCounter.add(1, { operation: 'update', status: 'success' })
      return reply.send(updated)
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
      const service = serviceFor(request)
      await service.removeMember(projectId, targetUserId, callerUserId)
      projectOperationCounter.add(1, { operation: 'remove_member', status: 'success' })
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
      const service = serviceFor(request)
      const personas = await service.listProjectPersonas(request.params.projectId)
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
      const service = serviceFor(request)
      const worldState = await service.getWorldState(request.params.projectId, userId)
      return reply.send(worldState)
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
      const service = serviceFor(request)
      const worldState = await service.updateWorldState(request.params.projectId, userId, request.body)
      return reply.send(worldState)
    },
  )
}

export default projectsRoute
