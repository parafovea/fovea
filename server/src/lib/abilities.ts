/**
 * CASL authorization engine for role-based access control.
 *
 * Builds CASL ability instances from the RolePermission table and user role
 * assignments. System admins receive full access; all other users receive
 * permissions based on their system, group, and project roles.
 *
 * @module
 */

import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
} from '@casl/ability'

/**
 * All resource subjects matching Prisma model names.
 * The special value 'all' is a CASL built-in that matches every subject.
 */
type Subjects =
  | 'Annotation'
  | 'Claim'
  | 'Persona'
  | 'WorldState'
  | 'Video'
  | 'VideoSummary'
  | 'Project'
  | 'UserGroup'
  | 'User'
  | 'all'

/**
 * All actions that can be performed on resources.
 * 'manage' is a CASL built-in that grants all actions.
 */
type Actions =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'share'
  | 'export'
  | 'assign'
  | 'manage_members'
  | 'fork'
  | 'review'
  | 'manage'

/** CASL ability type parameterized with Fovea actions and subjects. */
export type AppAbility = MongoAbility<[Actions, Subjects]>

/** Aggregated role information for a single user across all scopes. */
export interface UserRoles {
  /** System-level role: "system_admin" or "user". */
  systemRole: string
  /** Group memberships with their roles. */
  groupRoles: Array<{ groupId: string; role: string }>
  /** Project memberships with their roles. */
  projectRoles: Array<{ projectId: string; role: string }>
}

/** A single row from the RolePermission table. */
export interface RolePermissionRow {
  /** Permission scope: "system", "group", or "project". */
  scope: string
  /** Role identifier (e.g., "annotator", "project_owner"). */
  role: string
  /** Resource type (e.g., "annotation", "video"). */
  resourceType: string
  /** Action identifier (e.g., "create", "read"). */
  action: string
  /** When true, the permission applies only to resources the user created. */
  ownOnly: boolean
}

/**
 * Builds a CASL ability instance for the given user based on their roles and
 * the permission matrix from the database.
 *
 * System admins bypass all permission checks via `can('manage', 'all')`.
 * Other users receive permissions by matching their role assignments against
 * the RolePermission rows.
 *
 * @param userId - UUID of the authenticated user
 * @param roles - aggregated role assignments for the user
 * @param permissions - complete list of RolePermission rows
 * @returns CASL ability instance for authorization checks
 */
export function defineAbilitiesFor(
  userId: string,
  roles: UserRoles,
  permissions: RolePermissionRow[],
): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

  // System admin gets full access
  if (roles.systemRole === 'system_admin') {
    can('manage', 'all')
    return build()
  }

  // Apply permissions based on role hierarchy
  for (const perm of permissions) {
    const subject = mapResourceTypeToSubject(perm.resourceType)
    if (!subject) continue

    const action = perm.action as Actions

    if (perm.scope === 'system') {
      // System-level permissions apply globally
      if (perm.ownOnly) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        can(action, subject, { createdByUserId: userId } as any)
      } else {
        can(action, subject)
      }
    } else if (perm.scope === 'project') {
      // Check if user has this role in any project
      const matchingProjects = roles.projectRoles
        .filter(pr => pr.role === perm.role)
        .map(pr => pr.projectId)

      if (matchingProjects.length > 0) {
        if (perm.ownOnly) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          can(action, subject, { projectId: { $in: matchingProjects }, createdByUserId: userId } as any)
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          can(action, subject, { projectId: { $in: matchingProjects } } as any)
        }
      }
    } else if (perm.scope === 'group') {
      // Group-level permissions apply when user holds this role in any group
      const matchingGroups = roles.groupRoles
        .filter(gr => gr.role === perm.role)
        .map(gr => gr.groupId)

      if (matchingGroups.length > 0) {
        if (perm.ownOnly) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          can(action, subject, { createdByUserId: userId } as any)
        } else {
          can(action, subject)
        }
      }
    }
  }

  // Resource ownership always grants full access to own resources
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  can('read', 'Annotation', { createdByUserId: userId } as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  can('update', 'Annotation', { createdByUserId: userId } as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  can('delete', 'Annotation', { createdByUserId: userId } as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  can('read', 'VideoSummary', { createdBy: userId } as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  can('update', 'VideoSummary', { createdBy: userId } as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  can('delete', 'VideoSummary', { createdBy: userId } as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  can('read', 'Claim', { createdBy: userId } as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  can('update', 'Claim', { createdBy: userId } as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  can('delete', 'Claim', { createdBy: userId } as any)

  // All authenticated users can read videos (filtered by VideoAccessService)
  can('read', 'Video')

  return build()
}

/**
 * Maps a RolePermission resourceType string to the corresponding CASL subject.
 *
 * @param resourceType - snake_case resource type from the database
 * @returns PascalCase CASL subject name, or null if unmapped
 */
function mapResourceTypeToSubject(resourceType: string): Subjects | null {
  const map: Record<string, Subjects> = {
    annotation: 'Annotation',
    claim: 'Claim',
    persona: 'Persona',
    world_state: 'WorldState',
    video: 'Video',
    summary: 'VideoSummary',
    project: 'Project',
    group: 'UserGroup',
    user: 'User',
  }
  return map[resourceType] ?? null
}

/**
 * Serializes a CASL ability instance to a plain array of rules suitable for
 * transmission to the frontend.
 *
 * @param ability - CASL ability instance to serialize
 * @returns array of raw CASL rule objects
 */
export function serializeAbilities(ability: AppAbility): object[] {
  return ability.rules
}
