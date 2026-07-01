import { PrismaClient, Project, ProjectMembership, Persona, WorldState, Prisma } from '@prisma/client'
import { ConflictError, NotFoundError } from '../lib/errors.js'

/**
 * Project row joined with its members (each carrying the public user
 * projection) and the video-assignment count. Returned by the project-detail
 * read path.
 */
export type ProjectWithMembersAndCounts = Prisma.ProjectGetPayload<{
  include: {
    members: {
      include: {
        user: {
          select: { id: true; username: true; displayName: true; email: true }
        }
      }
    }
    _count: { select: { videoAssignments: true } }
  }
}>

/**
 * Project membership row joined with the public user projection. Returned by
 * the add-member and change-role write paths and the member-list read path.
 */
export type MembershipWithUser = Prisma.ProjectMembershipGetPayload<{
  include: {
    user: {
      select: { id: true; username: true; displayName: true; email: true }
    }
  }
}>

/**
 * Project row joined with the caller's own membership (at most one row), used
 * by the list endpoint to compute `myRole` and the `_count.members` metadata.
 */
export type ProjectWithMyMembership = Prisma.ProjectGetPayload<{
  include: {
    _count: { select: { members: true } }
    members: { select: { role: true } }
  }
}>

/**
 * Public user projection used by the assignable-users picker.
 */
export type AssignableUser = Prisma.UserGetPayload<{
  select: { id: true; username: true; displayName: true; email: true }
}>

/**
 * Repository for all Project and ProjectMembership database access.
 *
 * This class owns every Prisma call in the projects domain. It performs no
 * authorization: callers (the ProjectService) decide who may invoke a method.
 * Methods return raw Prisma model types and propagate Prisma errors (for
 * example a unique-constraint violation on a duplicate membership) to their
 * callers.
 *
 * @example
 * ```typescript
 * const repo = new ProjectRepository(fastify.prisma)
 * const project = await repo.findById(id)
 * if (!project) {
 *   throw new NotFoundError('Project', id)
 * }
 * ```
 */
export class ProjectRepository {
  /**
   * Creates a new ProjectRepository instance.
   *
   * @param prisma - Prisma client instance for database access
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finds a project by its slug.
   *
   * Used by create to enforce slug uniqueness before the create transaction.
   *
   * @param slug - the project slug
   * @returns the project, or null if no project has that slug
   */
  async findBySlug(slug: string): Promise<Project | null> {
    return this.prisma.project.findUnique({ where: { slug } })
  }

  /**
   * Finds a project by ID.
   *
   * @param id - Project UUID
   * @returns the project, or null if not found
   */
  async findById(id: string): Promise<Project | null> {
    return this.prisma.project.findUnique({ where: { id } })
  }

  /**
   * Finds a project by ID with its members (public user projection) and the
   * video-assignment count.
   *
   * @param id - Project UUID
   * @returns the project with members and counts, or null if not found
   */
  async findByIdWithMembersAndCounts(id: string): Promise<ProjectWithMembersAndCounts | null> {
    return this.prisma.project.findUnique({
      where: { id },
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
  }

  /**
   * Finds a project by ID with its members (public user projection) only.
   *
   * @param id - Project UUID
   * @returns the project with members, or null if not found
   */
  async findByIdWithMembers(id: string): Promise<Prisma.ProjectGetPayload<{
    include: {
      members: {
        include: {
          user: { select: { id: true; username: true; displayName: true; email: true } }
        }
      }
    }
  }> | null> {
    return this.prisma.project.findUnique({
      where: { id },
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
  }

  /**
   * Lists projects matching a WHERE clause, newest first, with the
   * `_count.members` metadata and the caller's own membership role.
   *
   * @param where - Prisma WHERE clause selecting the candidate projects
   * @param userId - the caller, whose membership role is included as the
   *   single `members` row (used to compute `myRole`)
   * @returns matching projects, newest first
   */
  async findManyForList(where: Prisma.ProjectWhereInput, userId: string): Promise<ProjectWithMyMembership[]> {
    return this.prisma.project.findMany({
      where,
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
  }

  /**
   * Lists the group IDs the user belongs to.
   *
   * @param userId - the user whose group memberships to list
   * @returns the group IDs the user is a member of
   */
  async findGroupIdsForUser(userId: string): Promise<string[]> {
    const memberships = await this.prisma.groupMembership.findMany({
      where: { userId },
      select: { groupId: true },
    })
    return memberships.map((gm) => gm.groupId)
  }

  /**
   * Finds a user's group membership in a single group.
   *
   * @param userId - the user
   * @param groupId - the group
   * @returns the membership, or null if the user is not a member
   */
  async findGroupMembership(userId: string, groupId: string): Promise<{ role: string } | null> {
    return this.prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId, groupId } },
      select: { role: true },
    })
  }

  /**
   * Creates a project together with the creator's `project_owner` membership in
   * a single transaction.
   *
   * @param data - project create input
   * @param ownerUserId - the user who receives the `project_owner` membership
   * @returns the created project
   */
  async createWithOwnerMembership(
    data: Prisma.ProjectUncheckedCreateInput,
    ownerUserId: string
  ): Promise<Project> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({ data })

      await tx.projectMembership.create({
        data: {
          userId: ownerUserId,
          projectId: created.id,
          role: 'project_owner',
        },
      })

      return created
    })
  }

  /**
   * Updates a project.
   *
   * @param id - Project UUID
   * @param data - Prisma project update input
   * @returns the updated project
   */
  async update(id: string, data: Prisma.ProjectUpdateInput): Promise<Project> {
    return this.prisma.project.update({ where: { id }, data })
  }

  /**
   * Deletes a project. Cascade deletes (memberships, assignments) are handled
   * by the schema's `onDelete: Cascade` relations.
   *
   * @param id - Project UUID
   * @returns the deleted project
   */
  async delete(id: string): Promise<Project> {
    return this.prisma.project.delete({ where: { id } })
  }

  /**
   * Lists the user IDs of every member of a project.
   *
   * Used to snapshot the affected members before a project delete so each can
   * have their cached abilities invalidated.
   *
   * @param projectId - Project UUID
   * @returns the member user IDs
   */
  async findMemberUserIds(projectId: string): Promise<string[]> {
    const members = await this.prisma.projectMembership.findMany({
      where: { projectId },
      select: { userId: true },
    })
    return members.map((m) => m.userId)
  }

  /**
   * Finds a single membership by (userId, projectId).
   *
   * @param userId - the member user
   * @param projectId - Project UUID
   * @returns the membership, or null if the user is not a member
   */
  async findMembership(userId: string, projectId: string): Promise<ProjectMembership | null> {
    return this.prisma.projectMembership.findUnique({
      where: { userId_projectId: { userId, projectId } },
    })
  }

  /**
   * Creates a project membership, returning it with the public user projection.
   *
   * @param userId - the member user
   * @param projectId - Project UUID
   * @param role - the membership role
   * @returns the created membership with its user
   */
  async createMembership(userId: string, projectId: string, role: string): Promise<MembershipWithUser> {
    return this.prisma.projectMembership.create({
      data: { userId, projectId, role },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, email: true },
        },
      },
    })
  }

  /**
   * Updates a membership's role, returning it with the public user projection.
   *
   * @param userId - the member user
   * @param projectId - Project UUID
   * @param role - the new role
   * @returns the updated membership with its user
   */
  async updateMembershipRole(userId: string, projectId: string, role: string): Promise<MembershipWithUser> {
    return this.prisma.projectMembership.update({
      where: { userId_projectId: { userId, projectId } },
      data: { role },
      include: {
        user: {
          select: { id: true, username: true, displayName: true, email: true },
        },
      },
    })
  }

  /**
   * Deletes a membership by (userId, projectId).
   *
   * @param userId - the member user
   * @param projectId - Project UUID
   */
  async deleteMembership(userId: string, projectId: string): Promise<void> {
    await this.prisma.projectMembership.delete({
      where: { userId_projectId: { userId, projectId } },
    })
  }

  /**
   * Counts the memberships holding a given role in a project.
   *
   * Used to enforce the last-`project_owner` protection.
   *
   * @param projectId - Project UUID
   * @param role - the role to count
   * @returns number of memberships with that role
   */
  async countMembershipsWithRole(projectId: string, role: string): Promise<number> {
    return this.prisma.projectMembership.count({
      where: { projectId, role },
    })
  }

  /**
   * Finds a user by ID.
   *
   * @param id - User UUID
   * @returns the user, or null if not found
   */
  async findUserById(id: string): Promise<{ id: string } | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    })
  }

  /**
   * Lists users who are not yet members of a project, projected to the fields
   * the member-add picker needs.
   *
   * @param projectId - Project UUID
   * @returns users with no membership in the project
   */
  async findAssignableUsers(projectId: string): Promise<AssignableUser[]> {
    return this.prisma.user.findMany({
      where: { projectMemberships: { none: { projectId } } },
      select: { id: true, username: true, displayName: true, email: true },
    })
  }

  /**
   * Lists the personas scoped to a project, newest first.
   *
   * @param projectId - Project UUID
   * @returns project-scoped personas, newest first
   */
  async findProjectPersonas(projectId: string): Promise<Persona[]> {
    return this.prisma.persona.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Finds the caller's world state for a project.
   *
   * @param userId - the caller
   * @param projectId - Project UUID
   * @returns the world state, or null if none exists yet
   */
  async findWorldState(userId: string, projectId: string): Promise<WorldState | null> {
    return this.prisma.worldState.findUnique({
      where: { userId_projectId: { userId, projectId } },
    })
  }

  /**
   * Creates a world state for the caller in a project.
   *
   * @param data - Prisma world state create input
   * @returns the created world state
   */
  async createWorldState(data: Prisma.WorldStateUncheckedCreateInput): Promise<WorldState> {
    return this.prisma.worldState.create({ data })
  }

  /**
   * Gets-or-creates the caller's empty world state for a project, keyed on the
   * compound unique (userId, projectId).
   *
   * Using upsert (rather than find-then-create) makes concurrent first access
   * safe: two callers that both miss the row would, with a separate create,
   * race into the `@@unique([userId, projectId])` constraint (P2002). The
   * upsert collapses that into a single atomic statement, leaving the existing
   * row untouched on a hit and creating the empty arrays on a miss.
   *
   * @param userId - the caller
   * @param projectId - Project UUID
   * @returns the existing or newly-created world state
   */
  async upsertEmptyWorldState(userId: string, projectId: string): Promise<WorldState> {
    return this.prisma.worldState.upsert({
      where: { userId_projectId: { userId, projectId } },
      create: {
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
      update: {},
    })
  }

  /**
   * Applies an optimistic-concurrency update to the caller's project world
   * state.
   *
   * Reads the current (userId, projectId) row, lets `transform` compute the new
   * column values from it, then writes them guarded by the row's `version`. If
   * a concurrent writer committed first the version has advanced, the guard
   * misses (count 0), and we retry against the freshly-read row, so both writes
   * land instead of one silently clobbering the other. The guard keys on the
   * monotonic `version` rather than `updatedAt` because two writes landing in
   * the same millisecond can share an `updatedAt`, which would let the second
   * silently overwrite the first. Project world state is multi-user (every
   * member shares the row), which makes this guard essential for the whole-blob
   * PUT to be a safe per-id merge under concurrent writers (the transform
   * re-runs on fresh state each attempt).
   *
   * @param userId - the caller
   * @param projectId - Project UUID
   * @param transform - computes the Prisma update input from the current row
   * @returns the updated world state
   * @throws {NotFoundError} when no project row exists
   * @throws {ConflictError} when the write keeps conflicting after retries
   */
  async updateProjectWorldStateOptimistic(
    userId: string,
    projectId: string,
    transform: (current: WorldState) => Prisma.WorldStateUpdateInput,
  ): Promise<WorldState> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = await this.prisma.worldState.findUnique({
        where: { userId_projectId: { userId, projectId } },
      })
      if (!current) {
        throw new NotFoundError('Project world state', `${userId}:${projectId}`)
      }
      const result = await this.prisma.worldState.updateMany({
        where: { userId, projectId, version: current.version },
        data: { ...transform(current), version: { increment: 1 } },
      })
      if (result.count === 1) {
        return this.prisma.worldState.findUniqueOrThrow({ where: { id: current.id } })
      }
    }
    throw new ConflictError('Project world state update conflicted after retries')
  }
}
