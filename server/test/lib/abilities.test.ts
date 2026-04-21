import { describe, it, expect } from 'vitest'
import {
  defineAbilitiesFor,
  serializeAbilities,
  type UserRoles,
  type RolePermissionRow,
} from '../../src/lib/abilities.js'

/**
 * Standard permission set used across all ability builder tests.
 *
 * The resourceType values use snake_case to match the database schema, while
 * CASL subjects use PascalCase (the mapping is handled by mapResourceTypeToSubject
 * inside abilities.ts).
 */
const basePermissions: RolePermissionRow[] = [
  // project_owner can CRUD annotations in their projects
  { scope: 'project', role: 'project_owner', resourceType: 'annotation', action: 'create', ownOnly: false },
  { scope: 'project', role: 'project_owner', resourceType: 'annotation', action: 'read', ownOnly: false },
  { scope: 'project', role: 'project_owner', resourceType: 'annotation', action: 'update', ownOnly: false },
  { scope: 'project', role: 'project_owner', resourceType: 'annotation', action: 'delete', ownOnly: false },
  // project_owner can manage videos in their projects
  { scope: 'project', role: 'project_owner', resourceType: 'video', action: 'read', ownOnly: false },
  { scope: 'project', role: 'project_owner', resourceType: 'video', action: 'delete', ownOnly: false },
  // annotator can create/read all, but update/delete only own
  { scope: 'project', role: 'annotator', resourceType: 'annotation', action: 'create', ownOnly: false },
  { scope: 'project', role: 'annotator', resourceType: 'annotation', action: 'read', ownOnly: false },
  { scope: 'project', role: 'annotator', resourceType: 'annotation', action: 'update', ownOnly: true },
  { scope: 'project', role: 'annotator', resourceType: 'annotation', action: 'delete', ownOnly: true },
  // viewer is read-only
  { scope: 'project', role: 'viewer', resourceType: 'annotation', action: 'read', ownOnly: false },
  // reviewer can read annotations
  { scope: 'project', role: 'reviewer', resourceType: 'annotation', action: 'read', ownOnly: false },
  // group_admin gets group-level permissions on the group resource
  { scope: 'group', role: 'group_admin', resourceType: 'group', action: 'update', ownOnly: false },
  { scope: 'group', role: 'group_admin', resourceType: 'group', action: 'read', ownOnly: false },
  // group_owner can manage group
  { scope: 'group', role: 'group_owner', resourceType: 'group', action: 'update', ownOnly: false },
  { scope: 'group', role: 'group_owner', resourceType: 'group', action: 'delete', ownOnly: false },
  // system-level permission (applies globally)
  { scope: 'system', role: 'user', resourceType: 'persona', action: 'create', ownOnly: false },
  { scope: 'system', role: 'user', resourceType: 'persona', action: 'read', ownOnly: false },
  { scope: 'system', role: 'user', resourceType: 'persona', action: 'update', ownOnly: true },
  { scope: 'system', role: 'user', resourceType: 'persona', action: 'delete', ownOnly: true },
]

describe('defineAbilitiesFor', () => {
  it('system_admin can manage all resources', () => {
    const roles: UserRoles = {
      systemRole: 'system_admin',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    expect(ability.can('manage', 'all')).toBe(true)
    expect(ability.can('create', 'Annotation')).toBe(true)
    expect(ability.can('delete', 'Video')).toBe(true)
    expect(ability.can('update', 'UserGroup')).toBe(true)
    expect(ability.can('manage', 'Project')).toBe(true)
  })

  it('project_owner can CRUD annotations in their project', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: 'proj-1', role: 'project_owner' }],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    expect(ability.can('create', 'Annotation')).toBe(true)
    expect(ability.can('read', 'Annotation')).toBe(true)
    expect(ability.can('update', 'Annotation')).toBe(true)
    expect(ability.can('delete', 'Annotation')).toBe(true)
  })

  it('viewer can only read annotations', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: 'proj-1', role: 'viewer' }],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    expect(ability.can('read', 'Annotation')).toBe(true)
    // viewer should not create, update, or delete annotations (unless ownOnly baseline grants)
    // The ownOnly baseline grants read/update/delete on own resources, so we check the general case
    expect(ability.can('create', 'Annotation')).toBe(false)
  })

  it('user with no project or group roles has baseline permissions only', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    // All authenticated users can read videos (hardcoded in defineAbilitiesFor)
    expect(ability.can('read', 'Video')).toBe(true)
    // System-level persona create is available to all users
    expect(ability.can('create', 'Persona')).toBe(true)
    expect(ability.can('read', 'Persona')).toBe(true)
    // No project-scoped annotation create
    expect(ability.can('manage', 'all')).toBe(false)
  })

  it('annotator can create and read annotations in their project', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: 'proj-1', role: 'annotator' }],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    expect(ability.can('create', 'Annotation')).toBe(true)
    expect(ability.can('read', 'Annotation')).toBe(true)
    // ownOnly update/delete are granted with conditions, so basic can() may return true
    // since CASL's can() without subject fields cannot enforce conditions
    expect(ability.can('update', 'Annotation')).toBe(true)
    expect(ability.can('delete', 'Annotation')).toBe(true)
  })

  it('group_admin gets group-level update permission', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [{ groupId: 'group-1', role: 'group_admin' }],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    // group_admin has update on 'group' resource type, which maps to 'UserGroup' subject
    expect(ability.can('update', 'UserGroup')).toBe(true)
    expect(ability.can('read', 'UserGroup')).toBe(true)
  })

  it('group_owner gets group-level delete permission', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [{ groupId: 'group-1', role: 'group_owner' }],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    expect(ability.can('update', 'UserGroup')).toBe(true)
    expect(ability.can('delete', 'UserGroup')).toBe(true)
  })

  it('all authenticated users can read videos', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    // Hardcoded in defineAbilitiesFor: can('read', 'Video')
    expect(ability.can('read', 'Video')).toBe(true)
  })

  it('baseline ownership grants read/update/delete on own annotations', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    // The function always grants read/update/delete on own Annotation, VideoSummary, Claim
    expect(ability.can('read', 'Annotation')).toBe(true)
    expect(ability.can('update', 'Annotation')).toBe(true)
    expect(ability.can('delete', 'Annotation')).toBe(true)
  })

  it('baseline ownership grants read/update/delete on own video summaries', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    expect(ability.can('read', 'VideoSummary')).toBe(true)
    expect(ability.can('update', 'VideoSummary')).toBe(true)
    expect(ability.can('delete', 'VideoSummary')).toBe(true)
  })

  it('baseline ownership grants read/update/delete on own claims', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    expect(ability.can('read', 'Claim')).toBe(true)
    expect(ability.can('update', 'Claim')).toBe(true)
    expect(ability.can('delete', 'Claim')).toBe(true)
  })

  it('multiple project roles are combined', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [
        { projectId: 'proj-1', role: 'viewer' },
        { projectId: 'proj-2', role: 'project_owner' },
      ],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)

    // Should have both viewer (read) and owner (CRUD) merged
    expect(ability.can('read', 'Annotation')).toBe(true)
    expect(ability.can('create', 'Annotation')).toBe(true)
    expect(ability.can('delete', 'Annotation')).toBe(true)
  })

  it('handles empty permissions array gracefully', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [{ groupId: 'g1', role: 'group_admin' }],
      projectRoles: [{ projectId: 'p1', role: 'annotator' }],
    }
    const ability = defineAbilitiesFor('user-1', roles, [])

    // Baseline ownership rules still apply
    expect(ability.can('read', 'Annotation')).toBe(true)
    expect(ability.can('read', 'Video')).toBe(true)
    // But project-scoped rules should not be present (no matching permissions)
    expect(ability.can('create', 'Annotation')).toBe(false)
  })

  it('ignores permissions with unknown resource types', () => {
    const unknownPermissions: RolePermissionRow[] = [
      { scope: 'project', role: 'annotator', resourceType: 'unknown_resource', action: 'create', ownOnly: false },
    ]
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: 'p1', role: 'annotator' }],
    }
    const ability = defineAbilitiesFor('user-1', roles, unknownPermissions)

    // Only baseline permissions should exist
    expect(ability.can('read', 'Video')).toBe(true)
    expect(ability.can('manage', 'all')).toBe(false)
  })

  it('system-scope permissions apply globally for matching role', () => {
    const systemPermissions: RolePermissionRow[] = [
      { scope: 'system', role: 'user', resourceType: 'video', action: 'create', ownOnly: false },
    ]
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    // The current code does not match systemRole against system-scope permissions
    // by role name; system-scope permissions in the DB should still be iterated.
    // Since the systemRole is 'user' but the perm role is also 'user', this would
    // only match if the code actually checks system-scope role matching.
    // Based on reading the code: system scope permissions are applied unconditionally
    // (no role matching for system scope in the current implementation).
    const ability = defineAbilitiesFor('user-1', roles, systemPermissions)
    expect(ability.can('create', 'Video')).toBe(true)
  })
})

describe('serializeAbilities', () => {
  it('returns serializable array of rules', () => {
    const roles: UserRoles = {
      systemRole: 'system_admin',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)
    const serialized = serializeAbilities(ability)

    expect(Array.isArray(serialized)).toBe(true)
    expect(serialized.length).toBeGreaterThan(0)
    expect(serialized[0]).toHaveProperty('action')
    expect(serialized[0]).toHaveProperty('subject')
  })

  it('serialized rules can be JSON stringified', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: 'p1', role: 'viewer' }],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)
    const serialized = serializeAbilities(ability)

    expect(() => JSON.stringify(serialized)).not.toThrow()
  })

  it('includes conditions for ownOnly rules', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: 'proj-1', role: 'annotator' }],
    }
    const ability = defineAbilitiesFor('user-1', roles, basePermissions)
    const serialized = serializeAbilities(ability)

    // Some rules should have conditions (ownOnly: createdByUserId)
    const rulesWithConditions = serialized.filter(
      (r: Record<string, unknown>) => r.conditions !== undefined,
    )
    expect(rulesWithConditions.length).toBeGreaterThan(0)
  })

  it('returns rules for user with no roles (baseline only)', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor('user-1', roles, [])
    const serialized = serializeAbilities(ability)

    // Baseline rules: own annotations, own summaries, own claims, read video
    expect(serialized.length).toBeGreaterThan(0)
  })
})
