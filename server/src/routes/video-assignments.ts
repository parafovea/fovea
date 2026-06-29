/**
 * API routes for video-to-project assignments and assignment rules.
 *
 * Provides endpoints for managing which videos are assigned to which projects,
 * bulk assignment operations, and rule-based automatic assignment.
 *
 * @module
 */

import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { NotFoundError, ValidationError, ForbiddenError, ConflictError, ErrorResponseSchema } from '../lib/errors.js'
import { videoAssignmentCounter } from '../metrics.js'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import { buildAbilities } from '../middleware/abilities.js'

// ---------------------------------------------------------------------------
// Nullable type helpers for fast-json-stringify compatibility.
// See: https://github.com/fastify/fast-json-stringify/issues/152
// ---------------------------------------------------------------------------

const NullableString = Type.Unsafe<string | null>({ type: ['string', 'null'] })

// ---------------------------------------------------------------------------
// Shared TypeBox schemas
// ---------------------------------------------------------------------------

// Video IDs are free-form strings (imported videos use short hex such as
// '49021047b9610ec8'); only the Prisma-generated default is a UUID, so the
// schema must not constrain video IDs to UUID format.
const VideoId = Type.String({ minLength: 1 })

const ProjectIdParams = Type.Object({
  projectId: Type.String({ format: 'uuid' }),
})

const ProjectVideoParams = Type.Object({
  projectId: Type.String({ format: 'uuid' }),
  videoId: VideoId,
})

const AssignmentResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  projectId: Type.String({ format: 'uuid' }),
  videoId: VideoId,
  assignedUserId: NullableString,
  source: Type.String(),
  ruleDefinition: Type.Optional(Type.Unknown()),
  assignedBy: NullableString,
  assignedAt: Type.String({ format: 'date-time' }),
})

const AssignVideoBody = Type.Object({
  videoId: VideoId,
  assignedUserId: Type.Optional(Type.String({ format: 'uuid' })),
})

const BulkAssignBody = Type.Object({
  videoIds: Type.Array(VideoId, { minItems: 1 }),
  projectId: Type.String({ format: 'uuid' }),
  assignedUserId: Type.Optional(Type.String({ format: 'uuid' })),
})

const ConditionSchema = Type.Object({
  field: Type.String(),
  operator: Type.Union([
    Type.Literal('equals'),
    Type.Literal('contains'),
    Type.Literal('startsWith'),
    Type.Literal('endsWith'),
    Type.Literal('regex'),
  ]),
  value: Type.String(),
})

const RuleResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  description: NullableString,
  conditions: Type.Array(ConditionSchema),
  targetType: Type.String(),
  targetId: Type.String(),
  isActive: Type.Boolean(),
  createdBy: Type.String(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

const CreateRuleBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  conditions: Type.Array(ConditionSchema, { minItems: 1 }),
  targetType: Type.Union([
    Type.Literal('user'),
    Type.Literal('project'),
    Type.Literal('group'),
  ]),
  targetId: Type.String({ format: 'uuid' }),
})

const UpdateRuleBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  conditions: Type.Optional(Type.Array(ConditionSchema, { minItems: 1 })),
  targetType: Type.Optional(Type.Union([
    Type.Literal('user'),
    Type.Literal('project'),
    Type.Literal('group'),
  ])),
  targetId: Type.Optional(Type.String({ format: 'uuid' })),
  isActive: Type.Optional(Type.Boolean()),
})

const RuleIdParams = Type.Object({
  ruleId: Type.String({ format: 'uuid' }),
})

// ---------------------------------------------------------------------------
// Rule condition types
// ---------------------------------------------------------------------------

interface RuleCondition {
  field: string
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex'
  value: string
}

/** Type guard: narrows a Prisma Json value to a record. */
function isRecord(json: unknown): json is Record<string, unknown> {
  return typeof json === 'object' && json !== null && !Array.isArray(json)
}

/** Narrow a Prisma Json value to a record or null. */
function toRecord(json: unknown): Record<string, unknown> | null {
  return isRecord(json) ? json : null
}

/** Parse a Prisma Json value into a typed RuleCondition array. */
function parseRuleConditions(json: unknown): RuleCondition[] {
  if (!Array.isArray(json)) return []
  return json.filter(
    (item): item is RuleCondition =>
      typeof item === 'object' && item !== null &&
      typeof item.field === 'string' &&
      typeof item.operator === 'string' &&
      typeof item.value === 'string'
  )
}

// ---------------------------------------------------------------------------
// Helper: project membership check
// ---------------------------------------------------------------------------

const MANAGER_ROLES = new Set([
  'project_owner',
  'project_manager',
])

/**
 * Checks whether the given video matches all rule conditions against its metadata.
 *
 * @param metadata - the video's metadata JSON object (may be null)
 * @param conditions - array of conditions to evaluate
 * @returns true if the video matches all conditions
 */
function videoMatchesConditions(
  metadata: Record<string, unknown> | null,
  conditions: RuleCondition[]
): boolean {
  if (!metadata) return false

  for (const condition of conditions) {
    const fieldValue = String(metadata[condition.field] ?? '')

    switch (condition.operator) {
      case 'equals':
        if (fieldValue !== condition.value) return false
        break
      case 'contains':
        if (!fieldValue.includes(condition.value)) return false
        break
      case 'startsWith':
        if (!fieldValue.startsWith(condition.value)) return false
        break
      case 'endsWith':
        if (!fieldValue.endsWith(condition.value)) return false
        break
      case 'regex': {
        try {
          const re = new RegExp(condition.value)
          if (!re.test(fieldValue)) return false
        } catch {
          // Invalid regex never matches
          return false
        }
        break
      }
    }
  }

  return true
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

const videoAssignmentsRoute: FastifyPluginAsync = async (fastify) => {
  // =========================================================================
  // Project-scoped routes (requireAuth + buildAbilities)
  // =========================================================================

  /**
   * List videos assigned to a project.
   *
   * @route GET /api/projects/:projectId/videos
   * @param projectId - UUID of the project
   * @returns array of video assignments for the project
   */
  fastify.get<{ Params: Static<typeof ProjectIdParams> }>(
    '/api/projects/:projectId/videos',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'List videos assigned to a project',
        tags: ['video-assignments'],
        params: ProjectIdParams,
        response: {
          200: Type.Array(AssignmentResponseSchema),
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params

      // Verify project exists
      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
      })
      if (!project) {
        throw new NotFoundError('Project', projectId)
      }

      // Verify user is a project member
      const membership = await fastify.prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: request.user!.id,
            projectId,
          },
        },
      })

      if (!membership && !request.user!.isAdmin) {
        throw new ForbiddenError('You must be a project member to view assignments')
      }

      const assignments = await fastify.prisma.projectVideoAssignment.findMany({
        where: { projectId },
        orderBy: { assignedAt: 'desc' },
      })

      return reply.send(assignments)
    }
  )

  /**
   * Assign a video to a project.
   *
   * @route POST /api/projects/:projectId/videos
   * @param projectId - UUID of the project
   * @returns the created assignment
   */
  fastify.post<{
    Params: Static<typeof ProjectIdParams>
    Body: Static<typeof AssignVideoBody>
  }>(
    '/api/projects/:projectId/videos',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Assign a video to a project',
        tags: ['video-assignments'],
        params: ProjectIdParams,
        body: AssignVideoBody,
        response: {
          201: AssignmentResponseSchema,
          409: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params
      const { videoId, assignedUserId } = request.body

      // Verify project exists
      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
      })
      if (!project) {
        throw new NotFoundError('Project', projectId)
      }

      // Verify user has project_manager+ role
      const membership = await fastify.prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: request.user!.id,
            projectId,
          },
        },
      })

      if (!membership || !MANAGER_ROLES.has(membership.role)) {
        if (!request.user!.isAdmin) {
          throw new ForbiddenError('Project manager or higher role required')
        }
      }

      // Verify video exists
      const video = await fastify.prisma.video.findUnique({
        where: { id: videoId },
      })
      if (!video) {
        throw new NotFoundError('Video', videoId)
      }

      // Verify assigned user exists if provided
      if (assignedUserId) {
        const user = await fastify.prisma.user.findUnique({
          where: { id: assignedUserId },
        })
        if (!user) {
          throw new NotFoundError('User', assignedUserId)
        }
      }

      // Create assignment. The @@unique([projectId, videoId]) raises P2002 on a
      // duplicate; surface it as a 409 rather than letting it become an
      // unhandled 500 (re-assigning an already-assigned video is a user error,
      // not a server fault).
      const assignment = await fastify.prisma.projectVideoAssignment
        .create({
          data: {
            projectId,
            videoId,
            assignedUserId: assignedUserId ?? null,
            source: 'manual',
            assignedBy: request.user!.id,
          },
        })
        .catch((err) => {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            throw new ConflictError('This video is already assigned to the project')
          }
          throw err
        })

      videoAssignmentCounter.add(1, { operation: 'assign', source: 'manual' })
      return reply.status(201).send(assignment)
    }
  )

  /**
   * Unassign a video from a project.
   *
   * @route DELETE /api/projects/:projectId/videos/:videoId
   * @param projectId - UUID of the project
   * @param videoId - UUID of the video
   * @returns success confirmation
   */
  fastify.delete<{ Params: Static<typeof ProjectVideoParams> }>(
    '/api/projects/:projectId/videos/:videoId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        description: 'Unassign a video from a project',
        tags: ['video-assignments'],
        params: ProjectVideoParams,
        response: {
          200: Type.Object({ success: Type.Boolean() }),
        },
      },
    },
    async (request, reply) => {
      const { projectId, videoId } = request.params

      // Verify user has project_manager+ role
      const membership = await fastify.prisma.projectMembership.findUnique({
        where: {
          userId_projectId: {
            userId: request.user!.id,
            projectId,
          },
        },
      })

      if (!membership || !MANAGER_ROLES.has(membership.role)) {
        if (!request.user!.isAdmin) {
          throw new ForbiddenError('Project manager or higher role required')
        }
      }

      // Find the assignment
      const assignment = await fastify.prisma.projectVideoAssignment.findUnique({
        where: {
          projectId_videoId: {
            projectId,
            videoId,
          },
        },
      })

      if (!assignment) {
        throw new NotFoundError('ProjectVideoAssignment', `${projectId}/${videoId}`)
      }

      await fastify.prisma.projectVideoAssignment.delete({
        where: { id: assignment.id },
      })

      videoAssignmentCounter.add(1, { operation: 'unassign', source: 'manual' })
      return reply.send({ success: true })
    }
  )

  // =========================================================================
  // Admin-only routes
  // =========================================================================

  /**
   * Bulk assign videos to a project.
   *
   * @route POST /api/admin/video-assignments/bulk
   * @returns count of assignments created
   */
  fastify.post<{ Body: Static<typeof BulkAssignBody> }>(
    '/api/admin/video-assignments/bulk',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Bulk assign videos to a project',
        tags: ['video-assignments', 'admin'],
        body: BulkAssignBody,
        response: {
          200: Type.Object({
            created: Type.Number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const { videoIds, projectId, assignedUserId } = request.body

      // Verify project exists
      const project = await fastify.prisma.project.findUnique({
        where: { id: projectId },
      })
      if (!project) {
        throw new NotFoundError('Project', projectId)
      }

      // Verify all videos exist
      const existingVideos = await fastify.prisma.video.findMany({
        where: { id: { in: videoIds } },
        select: { id: true },
      })
      const existingIds = new Set(existingVideos.map(v => v.id))
      const missingIds = videoIds.filter(id => !existingIds.has(id))
      if (missingIds.length > 0) {
        throw new ValidationError(
          `Videos not found: ${missingIds.join(', ')}`
        )
      }

      // Find existing assignments to skip duplicates
      const existingAssignments = await fastify.prisma.projectVideoAssignment.findMany({
        where: {
          projectId,
          videoId: { in: videoIds },
        },
        select: { videoId: true },
      })
      const alreadyAssigned = new Set(existingAssignments.map(a => a.videoId))
      const newVideoIds = videoIds.filter(id => !alreadyAssigned.has(id))

      if (newVideoIds.length > 0) {
        await fastify.prisma.projectVideoAssignment.createMany({
          data: newVideoIds.map(videoId => ({
            projectId,
            videoId,
            assignedUserId: assignedUserId ?? null,
            source: 'manual',
            assignedBy: request.user!.id,
          })),
        })
      }

      videoAssignmentCounter.add(newVideoIds.length, { operation: 'assign', source: 'manual' })
      return reply.send({ created: newVideoIds.length })
    }
  )

  /**
   * List all assignment rules.
   *
   * @route GET /api/admin/video-assignments/rules
   * @returns array of assignment rules
   */
  fastify.get(
    '/api/admin/video-assignments/rules',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'List all video assignment rules',
        tags: ['video-assignments', 'admin'],
        response: {
          200: Type.Array(RuleResponseSchema),
        },
      },
    },
    async (_request, reply) => {
      const rules = await fastify.prisma.videoAssignmentRule.findMany({
        orderBy: { createdAt: 'desc' },
      })

      return reply.send(rules)
    }
  )

  /**
   * Create a new assignment rule.
   *
   * @route POST /api/admin/video-assignments/rules
   * @returns the created rule
   */
  fastify.post<{ Body: Static<typeof CreateRuleBody> }>(
    '/api/admin/video-assignments/rules',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Create a video assignment rule',
        tags: ['video-assignments', 'admin'],
        body: CreateRuleBody,
        response: {
          201: RuleResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { name, description, conditions, targetType, targetId } = request.body

      const rule = await fastify.prisma.videoAssignmentRule.create({
        data: {
          name,
          description: description ?? null,
          conditions,
          targetType,
          targetId,
          isActive: true,
          createdBy: request.user!.id,
        },
      })

      return reply.status(201).send(rule)
    }
  )

  /**
   * Update an existing assignment rule.
   *
   * @route PUT /api/admin/video-assignments/rules/:ruleId
   * @param ruleId - UUID of the rule
   * @returns the updated rule
   */
  fastify.put<{
    Params: Static<typeof RuleIdParams>
    Body: Static<typeof UpdateRuleBody>
  }>(
    '/api/admin/video-assignments/rules/:ruleId',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Update a video assignment rule',
        tags: ['video-assignments', 'admin'],
        params: RuleIdParams,
        body: UpdateRuleBody,
        response: {
          200: RuleResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { ruleId } = request.params

      const existing = await fastify.prisma.videoAssignmentRule.findUnique({
        where: { id: ruleId },
      })
      if (!existing) {
        throw new NotFoundError('VideoAssignmentRule', ruleId)
      }

      const rule = await fastify.prisma.videoAssignmentRule.update({
        where: { id: ruleId },
        data: request.body,
      })

      return reply.send(rule)
    }
  )

  /**
   * Delete an assignment rule.
   *
   * @route DELETE /api/admin/video-assignments/rules/:ruleId
   * @param ruleId - UUID of the rule
   * @returns success confirmation
   */
  fastify.delete<{ Params: Static<typeof RuleIdParams> }>(
    '/api/admin/video-assignments/rules/:ruleId',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Delete a video assignment rule',
        tags: ['video-assignments', 'admin'],
        params: RuleIdParams,
        response: {
          200: Type.Object({ success: Type.Boolean() }),
        },
      },
    },
    async (request, reply) => {
      const { ruleId } = request.params

      const existing = await fastify.prisma.videoAssignmentRule.findUnique({
        where: { id: ruleId },
      })
      if (!existing) {
        throw new NotFoundError('VideoAssignmentRule', ruleId)
      }

      await fastify.prisma.videoAssignmentRule.delete({
        where: { id: ruleId },
      })

      return reply.send({ success: true })
    }
  )

  /**
   * Dry-run evaluation of a single rule against all videos.
   *
   * Evaluates the rule's conditions against every video's metadata field
   * and returns the count and IDs of matching videos, without creating
   * any assignments.
   *
   * @route POST /api/admin/video-assignments/rules/:ruleId/evaluate
   * @param ruleId - UUID of the rule to evaluate
   * @returns matching video count and IDs
   */
  fastify.post<{ Params: Static<typeof RuleIdParams> }>(
    '/api/admin/video-assignments/rules/:ruleId/evaluate',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Dry-run evaluation of a single assignment rule',
        tags: ['video-assignments', 'admin'],
        params: RuleIdParams,
        response: {
          200: Type.Object({
            ruleId: Type.String({ format: 'uuid' }),
            matchingVideoCount: Type.Number(),
            matchingVideoIds: Type.Array(VideoId),
          }),
        },
      },
    },
    async (request, reply) => {
      const { ruleId } = request.params

      const rule = await fastify.prisma.videoAssignmentRule.findUnique({
        where: { id: ruleId },
      })
      if (!rule) {
        throw new NotFoundError('VideoAssignmentRule', ruleId)
      }

      const conditions = parseRuleConditions(rule.conditions)
      const videos = await fastify.prisma.video.findMany({
        select: { id: true, metadata: true },
      })

      const matchingVideoIds = videos
        .filter(v => videoMatchesConditions(toRecord(v.metadata), conditions))
        .map(v => v.id)

      videoAssignmentCounter.add(1, { operation: 'rule_evaluate', source: 'rule' })
      return reply.send({
        ruleId,
        matchingVideoCount: matchingVideoIds.length,
        matchingVideoIds,
      })
    }
  )

  /**
   * Evaluate all active rules and create assignments for matching videos.
   *
   * For each active rule, evaluates its conditions against all videos.
   * When a video matches and the rule targets a project, creates a
   * ProjectVideoAssignment if one does not already exist for that
   * project-video pair.
   *
   * @route POST /api/admin/video-assignments/rules/evaluate-all
   * @returns count of newly created assignments
   */
  fastify.post(
    '/api/admin/video-assignments/rules/evaluate-all',
    {
      onRequest: [requireAdmin],
      schema: {
        description: 'Evaluate all active rules and create assignments',
        tags: ['video-assignments', 'admin'],
        response: {
          200: Type.Object({
            rulesEvaluated: Type.Number(),
            assignmentsCreated: Type.Number(),
          }),
        },
      },
    },
    async (request, reply) => {
      const activeRules = await fastify.prisma.videoAssignmentRule.findMany({
        where: { isActive: true },
      })

      const videos = await fastify.prisma.video.findMany({
        select: { id: true, metadata: true },
      })

      let assignmentsCreated = 0

      for (const rule of activeRules) {
        const conditions = parseRuleConditions(rule.conditions)
        const matchingVideoIds = videos
          .filter(v => videoMatchesConditions(toRecord(v.metadata), conditions))
          .map(v => v.id)

        if (matchingVideoIds.length === 0) continue

        // Only "project" target type creates ProjectVideoAssignment records
        if (rule.targetType === 'project') {
          // Find existing assignments for this project to avoid duplicates
          const existingAssignments = await fastify.prisma.projectVideoAssignment.findMany({
            where: {
              projectId: rule.targetId,
              videoId: { in: matchingVideoIds },
            },
            select: { videoId: true },
          })
          const alreadyAssigned = new Set(existingAssignments.map(a => a.videoId))
          const newVideoIds = matchingVideoIds.filter(id => !alreadyAssigned.has(id))

          if (newVideoIds.length > 0) {
            await fastify.prisma.projectVideoAssignment.createMany({
              data: newVideoIds.map(videoId => ({
                projectId: rule.targetId,
                videoId,
                source: 'rule',
                ruleDefinition: {
                  ruleId: rule.id,
                  ruleName: rule.name,
                  conditions: rule.conditions,
                },
                assignedBy: request.user!.id,
              })),
            })
            assignmentsCreated += newVideoIds.length
          }
        }
      }

      videoAssignmentCounter.add(1, { operation: 'rule_evaluate', source: 'rule' })
      if (assignmentsCreated > 0) {
        videoAssignmentCounter.add(assignmentsCreated, { operation: 'assign', source: 'rule' })
      }
      return reply.send({
        rulesEvaluated: activeRules.length,
        assignmentsCreated,
      })
    }
  )
}

export default videoAssignmentsRoute
