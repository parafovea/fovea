/**
 * CASL authorization engine for role-based access control.
 *
 * Builds CASL ability instances from the RolePermission table and user role
 * assignments. System admins receive full access; all other users receive
 * permissions based on their system, group, and project roles.
 *
 * Uses PrismaAbility from @casl/prisma so the ability type is natively
 * compatible with accessibleBy() — no cast required at call sites.
 *
 * @module
 */

import { Prisma } from '@prisma/client'
import { createPrismaAbility } from '@casl/prisma'
import type { ForcedSubject, PureAbility, RawRuleFrom } from '@casl/ability'
import type { PrismaQuery } from '@casl/prisma'

/**
 * Narrow string-only form of subjects, used in rule definitions and
 * class-level authorize() checks. Must match Prisma.ModelName values
 * exactly so accessibleBy() can resolve them to Prisma WHERE clauses.
 */
export type SubjectName =
  | 'Annotation' | 'Claim' | 'Persona' | 'WorldState' | 'Video'
  | 'VideoSummary' | 'Project' | 'UserGroup' | 'User'

/**
 * All actions that can be performed on resources.
 * 'manage' is a CASL built-in that grants all actions.
 */
export type Actions =
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

/**
 * Subject type for CASL abilities. Includes both string model names (for
 * accessibleBy) and ForcedSubject-tagged objects (for subject() helper).
 */
type Subjects =
  | Prisma.ModelName
  | 'all'
  | ForcedSubject<Prisma.ModelName>

/**
 * CASL ability parameterized with Fovea actions and Prisma model names.
 * Uses PureAbility with PrismaQuery conditions so the type works with both
 * accessibleBy() and subject()-tagged objects passed to can().
 */
export type AppAbility = PureAbility<[Actions, Subjects], PrismaQuery>

/** Raw rule shape for building ability rule arrays. */
type AppRule = RawRuleFrom<[Actions, Subjects], PrismaQuery>

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
 */
export function defineAbilitiesFor(
  userId: string,
  roles: UserRoles,
  permissions: RolePermissionRow[],
): AppAbility {
  const rules: AppRule[] = []

  // System admin gets full access
  if (roles.systemRole === 'system_admin') {
    rules.push({ action: 'manage', subject: 'all' })
    return createPrismaAbility(rules)
  }

  // Apply permissions based on role hierarchy
  for (const perm of permissions) {
    const modelName = mapResourceTypeToModelName(perm.resourceType)
    if (!modelName) continue

    const action = perm.action as Actions

    if (perm.scope === 'system') {
      if (perm.ownOnly) {
        rules.push({ action, subject: modelName, conditions: { createdByUserId: userId } })
      } else {
        rules.push({ action, subject: modelName })
      }
    } else if (perm.scope === 'project') {
      const matchingProjects = roles.projectRoles
        .filter(pr => pr.role === perm.role)
        .map(pr => pr.projectId)

      if (matchingProjects.length > 0) {
        if (perm.ownOnly) {
          rules.push({ action, subject: modelName, conditions: { projectId: { in: matchingProjects }, createdByUserId: userId } })
        } else {
          rules.push({ action, subject: modelName, conditions: { projectId: { in: matchingProjects } } })
        }
      }
    } else if (perm.scope === 'group') {
      const matchingGroups = roles.groupRoles
        .filter(gr => gr.role === perm.role)
        .map(gr => gr.groupId)

      if (matchingGroups.length > 0) {
        if (perm.ownOnly) {
          rules.push({ action, subject: modelName, conditions: { createdByUserId: userId } })
        } else {
          rules.push({ action, subject: modelName })
        }
      }
    }
  }

  // Resource ownership always grants full access to own resources
  rules.push({ action: 'read', subject: 'Annotation', conditions: { createdByUserId: userId } })
  rules.push({ action: 'update', subject: 'Annotation', conditions: { createdByUserId: userId } })
  rules.push({ action: 'delete', subject: 'Annotation', conditions: { createdByUserId: userId } })
  rules.push({ action: 'read', subject: 'VideoSummary', conditions: { createdBy: userId } })
  rules.push({ action: 'update', subject: 'VideoSummary', conditions: { createdBy: userId } })
  rules.push({ action: 'delete', subject: 'VideoSummary', conditions: { createdBy: userId } })
  rules.push({ action: 'read', subject: 'Claim', conditions: { createdBy: userId } })
  rules.push({ action: 'update', subject: 'Claim', conditions: { createdBy: userId } })
  rules.push({ action: 'delete', subject: 'Claim', conditions: { createdBy: userId } })

  // All authenticated users can read videos (filtered by VideoAccessService)
  rules.push({ action: 'read', subject: 'Video' })

  return createPrismaAbility(rules)
}

/**
 * Maps a RolePermission resourceType string to the corresponding Prisma
 * model name. Returns null for unmapped types.
 */
function mapResourceTypeToModelName(resourceType: string): Prisma.ModelName | null {
  const map: Record<string, Prisma.ModelName> = {
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
 */
export function serializeAbilities(ability: AppAbility): object[] {
  return ability.rules
}
