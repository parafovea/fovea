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
  createMongoAbility,
  MongoAbility,
  RawRuleFrom,
  InferSubjects,
} from '@casl/ability'
import type { MongoQuery, ForcedSubject } from '@casl/ability'
import type {
  Annotation as PrismaAnnotation,
  Claim as PrismaClaim,
  Persona as PrismaPersona,
  WorldState as PrismaWorldState,
  Video as PrismaVideo,
  VideoSummary as PrismaVideoSummary,
  Project as PrismaProject,
  UserGroup as PrismaUserGroup,
  User as PrismaUser,
} from '@prisma/client'

/**
 * Resource subjects as Prisma row types branded with ForcedSubject so a
 * plain record wrapped in `subject('Name', row)` carries its CASL type
 * tag. `InferSubjects` lifts these into the string-or-object union CASL
 * expects in `can()` calls and rule definitions.
 */
type ResourceSubject =
  | (PrismaAnnotation & ForcedSubject<'Annotation'>)
  | (PrismaClaim & ForcedSubject<'Claim'>)
  | (PrismaPersona & ForcedSubject<'Persona'>)
  | (PrismaWorldState & ForcedSubject<'WorldState'>)
  | (PrismaVideo & ForcedSubject<'Video'>)
  | (PrismaVideoSummary & ForcedSubject<'VideoSummary'>)
  | (PrismaProject & ForcedSubject<'Project'>)
  | (PrismaUserGroup & ForcedSubject<'UserGroup'>)
  | (PrismaUser & ForcedSubject<'User'>)

export type Subjects = InferSubjects<ResourceSubject> | 'all'

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

/** CASL ability type parameterized with Fovea actions and subjects. */
export type AppAbility = MongoAbility<[Actions, Subjects]>

/**
 * A raw CASL rule for AppAbility using the unparameterized MongoQuery.
 *
 * CASL's AbilityBuilder.can() with string-only subjects resolves conditions
 * to MongoQuery<never>, which rejects all condition objects. By using the
 * base MongoQuery (equivalent to MongoQuery<AnyObject>) as the conditions
 * type, we can construct rules with MongoDB-style conditions while keeping
 * action and subject strictly typed.
 */
type AppRule = RawRuleFrom<[Actions, SubjectName], MongoQuery>

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
  const rules: AppRule[] = []

  // System admin gets full access
  if (roles.systemRole === 'system_admin') {
    rules.push({ action: 'manage', subject: 'all' })
    return createMongoAbility<[Actions, Subjects], MongoQuery>(rules)
  }

  // Apply permissions based on role hierarchy
  for (const perm of permissions) {
    const subject = mapResourceTypeToSubject(perm.resourceType)
    if (!subject) continue

    const action = perm.action as Actions

    if (perm.scope === 'system') {
      // System-level permissions apply globally
      if (perm.ownOnly) {
        rules.push({ action, subject, conditions: { createdByUserId: userId } })
      } else {
        rules.push({ action, subject })
      }
    } else if (perm.scope === 'project') {
      // Check if user has this role in any project
      const matchingProjects = roles.projectRoles
        .filter(pr => pr.role === perm.role)
        .map(pr => pr.projectId)

      if (matchingProjects.length > 0) {
        if (perm.ownOnly) {
          rules.push({ action, subject, conditions: { projectId: { $in: matchingProjects }, createdByUserId: userId } })
        } else {
          rules.push({ action, subject, conditions: { projectId: { $in: matchingProjects } } })
        }
      }
    } else if (perm.scope === 'group') {
      // Group-level permissions apply when user holds this role in any group
      const matchingGroups = roles.groupRoles
        .filter(gr => gr.role === perm.role)
        .map(gr => gr.groupId)

      if (matchingGroups.length > 0) {
        if (perm.ownOnly) {
          rules.push({ action, subject, conditions: { createdByUserId: userId } })
        } else {
          rules.push({ action, subject })
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

  return createMongoAbility<[Actions, Subjects], MongoQuery>(rules)
}

/**
 * Maps a RolePermission resourceType string to the corresponding CASL subject.
 *
 * @param resourceType - snake_case resource type from the database
 * @returns PascalCase CASL subject name, or null if unmapped
 */
/**
 * Narrow string-only form of Subjects, used when pushing rules (CASL
 * rules' `subject` field accepts only the PascalCase name or 'all', not
 * a branded record type).
 */
export type SubjectName =
  | 'Annotation' | 'Claim' | 'Persona' | 'WorldState' | 'Video'
  | 'VideoSummary' | 'Project' | 'UserGroup' | 'User' | 'all'

function mapResourceTypeToSubject(resourceType: string): SubjectName | null {
  const map: Record<string, SubjectName> = {
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
