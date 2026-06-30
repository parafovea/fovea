import { Persona, Prisma } from '@prisma/client'
import { subject } from '@casl/ability'
import type { AppAbility } from '../lib/abilities.js'
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '../lib/errors.js'
import { invalidateUserAbilities } from '../middleware/abilities.js'
import {
  ProjectRepository,
  AssignableUser,
} from '../repositories/ProjectRepository.js'

/** Convert a value to Prisma JSON without type assertions. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Membership roles assignable through the add-member and change-role
 * endpoints. `project_owner` is excluded: it is assigned only during project
 * creation and is protected by the last-owner rule on removal.
 */
const ASSIGNABLE_ROLES = ['project_manager', 'annotator', 'reviewer', 'viewer'] as const

/** A role that may be assigned through the membership endpoints. */
type AssignableRole = typeof ASSIGNABLE_ROLES[number]

/**
 * Returns true if the value is a role assignable through the membership
 * endpoints.
 *
 * @param value - string to check
 * @returns whether the value is an assignable role
 */
function isAssignableRole(value: string): value is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value)
}

/** Validated fields for creating a project. */
export interface CreateProjectInput {
  name: string
  description?: string
  slug: string
  ownerGroupId?: string
}

/** Validated fields for updating a project (all optional). */
export interface UpdateProjectInput {
  name?: string
  description?: string
  settings?: unknown
  isArchived?: boolean
}

/** Validated fields for the world-state update body (all optional). */
export interface UpdateWorldInput {
  entities?: unknown[]
  events?: unknown[]
  times?: unknown[]
  entityCollections?: unknown[]
  eventCollections?: unknown[]
  timeCollections?: unknown[]
  relations?: unknown[]
}

/** The list scope filter for GET /api/projects. */
export type ListScope = 'personal' | 'group' | 'all'

/** Project response shape (ISO date strings, raw `settings` JSON). */
export interface ProjectResponse {
  id: string
  name: string
  description: string | null
  slug: string
  ownerUserId: string | null
  ownerGroupId: string | null
  settings: unknown
  isArchived: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** Project list-item response: project plus `_count.members` and `myRole`. */
export interface ProjectListItem extends ProjectResponse {
  _count: { members: number }
  myRole: string | null
}

/** Public user projection nested in a membership response. */
export interface MembershipUser {
  id: string
  username: string
  displayName: string
  email: string | null
}

/** Membership response (ISO date strings, public user projection). */
export interface MembershipResponse {
  id: string
  userId: string
  projectId: string
  role: string
  joinedAt: string
  user: MembershipUser
}

/** Project-detail response: project plus members and the assignment count. */
export interface ProjectDetailResponse extends ProjectResponse {
  members: MembershipResponse[]
  videoAssignmentCount: number
}

/** World-state response (ISO date strings, JSON arrays defaulted to []). */
export interface WorldStateResponse {
  id: string
  userId: string
  projectId: string | null
  entities: unknown[]
  events: unknown[]
  times: unknown[]
  entityCollections: unknown[]
  eventCollections: unknown[]
  timeCollections: unknown[]
  relations: unknown[]
  createdAt: string
  updatedAt: string
}

/** Assignable-user response: the picker fields for a non-member user. */
export interface AssignableUserResponse {
  id: string
  username: string
  displayName: string
  email: string | null
}

/**
 * Owns project business rules and authorization, delegating all data access to
 * a ProjectRepository. Construct one per request from the request-scoped CASL
 * ability and the authenticated user's id and system role.
 *
 * Per-resource authorization fetches the project row first, then checks
 * `ability.can(action, subject('Project', row))`. The ability already encodes
 * the caller's project memberships, so the service does not fetch the caller's
 * membership for an authorization decision; it fetches membership data only
 * where the response needs it (for example the list's `myRole`).
 *
 * @example
 * ```typescript
 * const service = new ProjectService(repository, request.ability ?? null, request.user?.id, request.user?.systemRole)
 * const projects = await service.list(userId, 'all')
 * ```
 */
export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined,
    /**
     * The caller's system role. CASL already grants `manage all` to
     * system_admin, so the service needs no separate admin branch; the
     * parameter is accepted to keep the construction signature uniform across
     * the domain services.
     */
    _systemRole: string | undefined
  ) {}

  /**
   * Asserts that a CASL ability is present, returning it narrowed.
   *
   * Mirrors the per-request `if (!request.ability) throw new ForbiddenError(...)`
   * guard the route used on every authenticated handler.
   */
  private requireAbility(): AppAbility {
    if (!this.ability) {
      throw new ForbiddenError('No abilities defined')
    }
    return this.ability
  }

  /**
   * Creates a project and the creator's `project_owner` membership atomically.
   *
   * Authorizes against a candidate project carrying the resolved ownership
   * fields: a personal project sets `ownerUserId` to the creator, a group
   * project sets `ownerGroupId`. The creator's cached abilities are invalidated
   * since they are now a `project_owner`.
   *
   * @param input - validated create fields
   * @returns the created project in response shape
   * @throws {ForbiddenError} when no ability is present or the create is denied
   * @throws {ConflictError} when the slug is already taken
   */
  async create(input: CreateProjectInput): Promise<ProjectResponse> {
    const ability = this.requireAbility()
    const userId = this.userId!
    const ownerGroupId = input.ownerGroupId ?? null

    const existing = await this.repository.findBySlug(input.slug)
    if (existing) {
      throw new ConflictError(`Project slug "${input.slug}" is already taken`)
    }

    const candidate = {
      ownerUserId: ownerGroupId ? null : userId,
      ownerGroupId,
    }
    if (!ability.can('create', subject('Project', candidate))) {
      throw new ForbiddenError('You do not have permission to create this project')
    }

    const created = await this.repository.createWithOwnerMembership(
      {
        name: input.name,
        description: input.description ?? null,
        slug: input.slug,
        ownerUserId: ownerGroupId ? null : userId,
        ownerGroupId,
        createdBy: userId,
      },
      userId
    )

    // Creator is now a project_owner; their abilities have changed.
    invalidateUserAbilities(userId)

    return this.mapProject(created)
  }

  /**
   * Lists the projects related to the caller, scoped by `scope`.
   *
   * Relationship scoping (owner, group-owned, direct membership) selects the
   * candidate set; it is not a CASL gate. Results are deduplicated, ordered
   * newest first, and each carries `_count.members` and the caller's `myRole`.
   *
   * @param userId - the caller
   * @param scope - 'personal' (owned), 'group' (group-owned), or 'all'
   * @returns the related projects as list items
   */
  async list(userId: string, scope: ListScope): Promise<ProjectListItem[]> {
    const conditions: Prisma.ProjectWhereInput[] = []

    if (scope === 'personal' || scope === 'all') {
      conditions.push({ ownerUserId: userId })
    }

    if (scope === 'group' || scope === 'all') {
      const groupIds = await this.repository.findGroupIdsForUser(userId)
      if (groupIds.length > 0) {
        conditions.push({ ownerGroupId: { in: groupIds } })
      }
    }

    if (scope === 'all') {
      conditions.push({ members: { some: { userId } } })
    }

    if (conditions.length === 0) {
      return []
    }

    const projects = await this.repository.findManyForList({ OR: conditions }, userId)

    // Deduplicate (a project can match multiple conditions).
    const seen = new Set<string>()
    const unique = projects.filter((p) => {
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    })

    return unique.map((p) => ({
      ...this.mapProject(p),
      _count: p._count,
      myRole: p.members[0]?.role ?? null,
    }))
  }

  /**
   * Gets a project's details, including members and the video-assignment count.
   *
   * @param projectId - Project UUID
   * @returns the project detail in response shape
   * @throws {NotFoundError} when the project does not exist
   * @throws {ForbiddenError} when no ability is present or read access is denied
   */
  async getById(projectId: string): Promise<ProjectDetailResponse> {
    const ability = this.requireAbility()

    const project = await this.repository.findByIdWithMembersAndCounts(projectId)
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    if (!ability.can('read', subject('Project', project))) {
      throw new ForbiddenError('You must be a project member to view this project')
    }

    return {
      ...this.mapProject(project),
      members: project.members.map((m) => this.mapMembership(m)),
      videoAssignmentCount: project._count.videoAssignments,
    }
  }

  /**
   * Updates a project's mutable fields.
   *
   * @param projectId - Project UUID
   * @param input - validated update fields
   * @returns the updated project in response shape
   * @throws {NotFoundError} when the project does not exist
   * @throws {ForbiddenError} when no ability is present or update access is denied
   */
  async update(projectId: string, input: UpdateProjectInput): Promise<ProjectResponse> {
    const ability = this.requireAbility()

    const project = await this.repository.findById(projectId)
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    if (!ability.can('update', subject('Project', project))) {
      throw new ForbiddenError('Only project owners and managers can update the project')
    }

    const updated = await this.repository.update(projectId, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.settings !== undefined && { settings: toJson(input.settings) }),
      ...(input.isArchived !== undefined && { isArchived: input.isArchived }),
    })

    return this.mapProject(updated)
  }

  /**
   * Deletes a project and invalidates every former member's cached abilities.
   *
   * Cascade deletes (memberships, assignments) are handled by the schema. The
   * member IDs are snapshotted before the delete so each can be invalidated.
   *
   * @param projectId - Project UUID
   * @throws {NotFoundError} when the project does not exist
   * @throws {ForbiddenError} when no ability is present or delete access is denied
   */
  async delete(projectId: string): Promise<void> {
    const ability = this.requireAbility()

    const project = await this.repository.findById(projectId)
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    if (!ability.can('delete', subject('Project', project))) {
      throw new ForbiddenError('Only the project owner or a system admin can delete a project')
    }

    // Snapshot member ids before the cascade deletes project memberships.
    const memberIds = await this.repository.findMemberUserIds(projectId)

    await this.repository.delete(projectId)

    // Every former member loses project-scope access.
    for (const memberId of memberIds) {
      invalidateUserAbilities(memberId)
    }
  }

  /**
   * Adds a member to a project.
   *
   * @param projectId - Project UUID
   * @param targetUserId - the user to add
   * @param role - the membership role (must be assignable)
   * @returns the created membership in response shape
   * @throws {ValidationError} when the role is not assignable
   * @throws {NotFoundError} when the project or target user does not exist
   * @throws {ForbiddenError} when no ability is present or member management is denied
   * @throws {ConflictError} when the user is already a member
   */
  async addMember(projectId: string, targetUserId: string, role: string): Promise<MembershipResponse> {
    const ability = this.requireAbility()

    if (!isAssignableRole(role)) {
      throw new ValidationError(
        `Invalid role "${role}". Must be one of: ${ASSIGNABLE_ROLES.join(', ')}`
      )
    }

    const project = await this.repository.findById(projectId)
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    if (!ability.can('manage_members', subject('Project', project))) {
      throw new ForbiddenError('Only project owners and managers can add members')
    }

    const targetUser = await this.repository.findUserById(targetUserId)
    if (!targetUser) {
      throw new NotFoundError('User', targetUserId)
    }

    const existingMembership = await this.repository.findMembership(targetUserId, projectId)
    if (existingMembership) {
      throw new ConflictError('User is already a member of this project')
    }

    const membership = await this.repository.createMembership(targetUserId, projectId, role)

    // Newly added member picks up project-scope role permissions.
    invalidateUserAbilities(targetUserId)

    return this.mapMembership(membership)
  }

  /**
   * Lists a project's members.
   *
   * @param projectId - Project UUID
   * @returns the project's memberships in response shape
   * @throws {NotFoundError} when the project does not exist
   * @throws {ForbiddenError} when no ability is present or read access is denied
   */
  async listMembers(projectId: string): Promise<MembershipResponse[]> {
    const ability = this.requireAbility()

    const project = await this.repository.findByIdWithMembers(projectId)
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    if (!ability.can('read', subject('Project', project))) {
      throw new ForbiddenError('You must be a project member to list members')
    }

    return project.members.map((m) => this.mapMembership(m))
  }

  /**
   * Lists users who are not yet members of a project, projected to the picker
   * fields. Authorized to the same callers who may add members.
   *
   * @param projectId - Project UUID
   * @returns non-member users in response shape
   * @throws {NotFoundError} when the project does not exist
   * @throws {ForbiddenError} when no ability is present or member management is denied
   */
  async listAssignableUsers(projectId: string): Promise<AssignableUserResponse[]> {
    const ability = this.requireAbility()

    const project = await this.repository.findById(projectId)
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    if (!ability.can('manage_members', subject('Project', project))) {
      throw new ForbiddenError('Only project owners and managers can view assignable users')
    }

    const users = await this.repository.findAssignableUsers(projectId)
    return users.map((u) => this.mapAssignableUser(u))
  }

  /**
   * Changes a member's role.
   *
   * @param projectId - Project UUID
   * @param targetUserId - the member whose role changes
   * @param callerUserId - the caller (cannot change their own role)
   * @param role - the new role (must be assignable)
   * @returns the updated membership in response shape
   * @throws {ValidationError} when the role is not assignable or the caller targets themselves
   * @throws {NotFoundError} when the project or target membership does not exist
   * @throws {ForbiddenError} when no ability is present or member management is denied
   */
  async changeMemberRole(
    projectId: string,
    targetUserId: string,
    callerUserId: string,
    role: string
  ): Promise<MembershipResponse> {
    const ability = this.requireAbility()

    if (!isAssignableRole(role)) {
      throw new ValidationError(
        `Invalid role "${role}". Must be one of: ${ASSIGNABLE_ROLES.join(', ')}`
      )
    }

    if (callerUserId === targetUserId) {
      throw new ValidationError('You cannot change your own role')
    }

    const project = await this.repository.findById(projectId)
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    if (!ability.can('manage_members', subject('Project', project))) {
      throw new ForbiddenError('Only project owners and managers can change member roles')
    }

    const targetMembership = await this.repository.findMembership(targetUserId, projectId)
    if (!targetMembership) {
      throw new NotFoundError('ProjectMembership', targetUserId)
    }

    // Cannot demote the last project_owner — `project_owner` is not an assignable
    // role (it is set only at creation), so any role change applied to a current
    // owner is necessarily a demotion that would leave a user-owned project with
    // no owner. Mirror the last-owner rule enforced on removal.
    if (targetMembership.role === 'project_owner') {
      const ownerCount = await this.repository.countMembershipsWithRole(projectId, 'project_owner')
      if (ownerCount <= 1) {
        throw new ValidationError('Cannot demote the last project owner')
      }
    }

    const updated = await this.repository.updateMembershipRole(targetUserId, projectId, role)

    // Role change alters the member's effective permissions.
    invalidateUserAbilities(targetUserId)

    return this.mapMembership(updated)
  }

  /**
   * Removes a member, or lets a member leave the project.
   *
   * Self-removal needs no member-management permission; removing another member
   * does. The last `project_owner` cannot be removed.
   *
   * @param projectId - Project UUID
   * @param targetUserId - the member to remove
   * @param callerUserId - the caller (self-removal is always permitted)
   * @throws {NotFoundError} when the project or target membership does not exist
   * @throws {ForbiddenError} when no ability is present or member management is denied
   * @throws {ValidationError} when removing the last project owner
   */
  async removeMember(projectId: string, targetUserId: string, callerUserId: string): Promise<void> {
    const ability = this.requireAbility()

    const project = await this.repository.findById(projectId)
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    const targetMembership = await this.repository.findMembership(targetUserId, projectId)
    if (!targetMembership) {
      throw new NotFoundError('ProjectMembership', targetUserId)
    }

    // Removing someone else requires member-management permission; self-leave
    // does not.
    if (callerUserId !== targetUserId) {
      if (!ability.can('manage_members', subject('Project', project))) {
        throw new ForbiddenError('Only project owners and managers can remove members')
      }
    }

    // Cannot remove the last project_owner.
    if (targetMembership.role === 'project_owner') {
      const ownerCount = await this.repository.countMembershipsWithRole(projectId, 'project_owner')
      if (ownerCount <= 1) {
        throw new ValidationError('Cannot remove the last project owner')
      }
    }

    await this.repository.deleteMembership(targetUserId, projectId)

    // Removed member loses project-scope permissions immediately.
    invalidateUserAbilities(targetUserId)
  }

  /**
   * Lists the personas scoped to a project, newest first.
   *
   * @param projectId - Project UUID
   * @returns project-scoped personas
   * @throws {NotFoundError} when the project does not exist
   * @throws {ForbiddenError} when no ability is present or read access is denied
   */
  async listProjectPersonas(projectId: string): Promise<Persona[]> {
    const ability = this.requireAbility()

    const project = await this.repository.findById(projectId)
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    if (!ability.can('read', subject('Project', project))) {
      throw new ForbiddenError('You must be a project member to view personas')
    }

    return this.repository.findProjectPersonas(projectId)
  }

  /**
   * Gets the caller's world state for a project, creating an empty one on first
   * access.
   *
   * @param projectId - Project UUID
   * @param userId - the caller
   * @returns the world state in response shape
   * @throws {NotFoundError} when the project does not exist
   * @throws {ForbiddenError} when no ability is present or read access is denied
   */
  async getWorldState(projectId: string, userId: string): Promise<WorldStateResponse> {
    const ability = this.requireAbility()

    const project = await this.repository.findById(projectId)
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    if (!ability.can('read', subject('Project', project))) {
      throw new ForbiddenError('You must be a project member to access world state')
    }

    let worldState = await this.repository.findWorldState(userId, projectId)
    if (!worldState) {
      worldState = await this.repository.createWorldState({
        userId,
        projectId,
        entities: [],
        events: [],
        times: [],
        entityCollections: [],
        eventCollections: [],
        timeCollections: [],
        relations: [],
      })
    }

    return this.mapWorldState(worldState)
  }

  /**
   * Updates the caller's world state for a project, creating it if absent.
   *
   * Only the provided fields are written; omitted fields are preserved.
   *
   * @param projectId - Project UUID
   * @param userId - the caller
   * @param input - the world-state update body
   * @returns the updated world state in response shape
   * @throws {NotFoundError} when the project does not exist
   * @throws {ForbiddenError} when no ability is present or read access is denied
   */
  async updateWorldState(
    projectId: string,
    userId: string,
    input: UpdateWorldInput
  ): Promise<WorldStateResponse> {
    const ability = this.requireAbility()

    const project = await this.repository.findById(projectId)
    if (!project) {
      throw new NotFoundError('Project', projectId)
    }

    if (!ability.can('read', subject('Project', project))) {
      throw new ForbiddenError('You must be a project member to update world state')
    }

    const existing = await this.repository.findWorldState(userId, projectId)

    let worldState
    if (existing) {
      worldState = await this.repository.updateWorldState(userId, projectId, {
        entities: input.entities !== undefined ? toJson(input.entities) : undefined,
        events: input.events !== undefined ? toJson(input.events) : undefined,
        times: input.times !== undefined ? toJson(input.times) : undefined,
        entityCollections: input.entityCollections !== undefined ? toJson(input.entityCollections) : undefined,
        eventCollections: input.eventCollections !== undefined ? toJson(input.eventCollections) : undefined,
        timeCollections: input.timeCollections !== undefined ? toJson(input.timeCollections) : undefined,
        relations: input.relations !== undefined ? toJson(input.relations) : undefined,
      })
    } else {
      worldState = await this.repository.createWorldState({
        userId,
        projectId,
        entities: toJson(input.entities || []),
        events: toJson(input.events || []),
        times: toJson(input.times || []),
        entityCollections: toJson(input.entityCollections || []),
        eventCollections: toJson(input.eventCollections || []),
        timeCollections: toJson(input.timeCollections || []),
        relations: toJson(input.relations || []),
      })
    }

    return this.mapWorldState(worldState)
  }

  /**
   * Maps a Prisma project row to the response shape: ISO date strings, raw
   * `settings` JSON passed through unchanged.
   */
  private mapProject(project: {
    id: string
    name: string
    description: string | null
    slug: string
    ownerUserId: string | null
    ownerGroupId: string | null
    settings: Prisma.JsonValue
    isArchived: boolean
    createdBy: string
    createdAt: Date
    updatedAt: Date
  }): ProjectResponse {
    return {
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
    }
  }

  /**
   * Maps a Prisma membership row (with its user projection) to the response
   * shape: ISO `joinedAt`, public user fields only.
   */
  private mapMembership(membership: {
    id: string
    userId: string
    projectId: string
    role: string
    joinedAt: Date
    user: MembershipUser
  }): MembershipResponse {
    return {
      id: membership.id,
      userId: membership.userId,
      projectId: membership.projectId,
      role: membership.role,
      joinedAt: membership.joinedAt.toISOString(),
      user: membership.user,
    }
  }

  /** Maps a Prisma user projection to the assignable-user response shape. */
  private mapAssignableUser(user: AssignableUser): AssignableUserResponse {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
    }
  }

  /**
   * Maps a Prisma world-state row to the response shape: ISO date strings,
   * JSON arrays defaulted to [] when null.
   */
  private mapWorldState(worldState: {
    id: string
    userId: string
    projectId: string | null
    entities: Prisma.JsonValue
    events: Prisma.JsonValue
    times: Prisma.JsonValue
    entityCollections: Prisma.JsonValue
    eventCollections: Prisma.JsonValue
    timeCollections: Prisma.JsonValue
    relations: Prisma.JsonValue
    createdAt: Date
    updatedAt: Date
  }): WorldStateResponse {
    return {
      id: worldState.id,
      userId: worldState.userId,
      projectId: worldState.projectId,
      entities: (worldState.entities as unknown[]) || [],
      events: (worldState.events as unknown[]) || [],
      times: (worldState.times as unknown[]) || [],
      entityCollections: (worldState.entityCollections as unknown[]) || [],
      eventCollections: (worldState.eventCollections as unknown[]) || [],
      timeCollections: (worldState.timeCollections as unknown[]) || [],
      relations: (worldState.relations as unknown[]) || [],
      createdAt: worldState.createdAt.toISOString(),
      updatedAt: worldState.updatedAt.toISOString(),
    }
  }
}
