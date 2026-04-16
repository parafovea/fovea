/**
 * Negative security tests for RBAC hardening.
 *
 * These are unit tests that verify the CASL ability rules produced by
 * defineAbilitiesFor and the caching behavior of the abilities middleware.
 * No live database or HTTP server is required.
 *
 * @module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { subject } from '@casl/ability'
import {
  defineAbilitiesFor,
  type UserRoles,
  type RolePermissionRow,
} from '../../src/lib/abilities.js'

// ---------------------------------------------------------------------------
// Mock prisma before importing the middleware (must be hoisted)
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    rolePermission: { findMany: vi.fn().mockResolvedValue([]) },
    groupMembership: { findMany: vi.fn().mockResolvedValue([]) },
    projectMembership: { findMany: vi.fn().mockResolvedValue([]) },
  },
}))

vi.mock('../../src/metrics.js', () => ({
  rbacCheckCounter: { add: vi.fn() },
  rbacCheckDuration: { record: vi.fn() },
}))

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: () => ({
      startSpan: () => ({
        setAttribute: vi.fn(),
        end: vi.fn(),
      }),
    }),
  },
}))

import {
  buildAbilities,
  invalidateUserAbilities,
  invalidatePermissionCache,
} from '../../src/middleware/abilities.js'
import { prisma } from '../../src/lib/prisma.js'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const USER_A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const USER_B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb'
const PROJECT_P1 = 'p1p1p1p1-p1p1-4p1p-p1p1-p1p1p1p1p1p1'
const PROJECT_P2 = 'p2p2p2p2-p2p2-4p2p-p2p2-p2p2p2p2p2p2'

/**
 * Permission rows that mirror a realistic annotator + admin setup.
 */
const permissions: RolePermissionRow[] = [
  // annotator: create/read all, update/delete ownOnly
  { scope: 'project', role: 'annotator', resourceType: 'annotation', action: 'create', ownOnly: false },
  { scope: 'project', role: 'annotator', resourceType: 'annotation', action: 'read', ownOnly: false },
  { scope: 'project', role: 'annotator', resourceType: 'annotation', action: 'update', ownOnly: true },
  { scope: 'project', role: 'annotator', resourceType: 'annotation', action: 'delete', ownOnly: true },
  // viewer: read-only
  { scope: 'project', role: 'viewer', resourceType: 'annotation', action: 'read', ownOnly: false },
  // read_only share simulation (system scope, ownOnly false, read only)
  { scope: 'system', role: 'user', resourceType: 'persona', action: 'read', ownOnly: false },
  { scope: 'system', role: 'user', resourceType: 'persona', action: 'create', ownOnly: false },
  { scope: 'system', role: 'user', resourceType: 'persona', action: 'update', ownOnly: true },
  { scope: 'system', role: 'user', resourceType: 'persona', action: 'delete', ownOnly: true },
]

// ---------------------------------------------------------------------------
// 1. Cross-tenant IDOR prevention
// ---------------------------------------------------------------------------

describe('Cross-tenant IDOR prevention', () => {
  it('User A (annotator in P1) CAN read an annotation in P1 that they created', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: PROJECT_P1, role: 'annotator' }],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    const allowed = ability.can(
      'read',
      subject('Annotation', { projectId: PROJECT_P1, createdByUserId: USER_A } as any),
    )
    expect(allowed).toBe(true)
  })

  it('User A (annotator in P1) CANNOT read an annotation in P2 created by User B', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: PROJECT_P1, role: 'annotator' }],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    const allowed = ability.can(
      'read',
      subject('Annotation', { projectId: PROJECT_P2, createdByUserId: USER_B } as any),
    )
    expect(allowed).toBe(false)
  })

  it('User A (annotator in P1) CANNOT update an annotation in P1 created by User B (ownOnly)', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: PROJECT_P1, role: 'annotator' }],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    const allowed = ability.can(
      'update',
      subject('Annotation', { projectId: PROJECT_P1, createdByUserId: USER_B } as any),
    )
    expect(allowed).toBe(false)
  })

  it('System admin CAN read/update/delete any annotation regardless of project or owner', () => {
    const roles: UserRoles = {
      systemRole: 'system_admin',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    expect(ability.can('read', subject('Annotation', { projectId: PROJECT_P2, createdByUserId: USER_B } as any))).toBe(true)
    expect(ability.can('update', subject('Annotation', { projectId: PROJECT_P2, createdByUserId: USER_B } as any))).toBe(true)
    expect(ability.can('delete', subject('Annotation', { projectId: PROJECT_P2, createdByUserId: USER_B } as any))).toBe(true)
  })

  it('User with no project memberships CANNOT read project-scoped annotations', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    // Project-scoped annotation from another user: denied
    const allowed = ability.can(
      'read',
      subject('Annotation', { projectId: PROJECT_P1, createdByUserId: USER_B } as any),
    )
    expect(allowed).toBe(false)
  })

  it('User with no project memberships CAN read their own personal annotations (no projectId)', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    // Own annotation without projectId: allowed via baseline ownership rules
    const allowed = ability.can(
      'read',
      subject('Annotation', { createdByUserId: USER_A } as any),
    )
    expect(allowed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. Ownership field enforcement
// ---------------------------------------------------------------------------

describe('Ownership field enforcement', () => {
  it('Annotation with createdByUserId: null is NOT readable by a non-admin user', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    // Legacy annotation with null owner: the condition { createdByUserId: userId }
    // does not match null, so it should be denied.
    const allowed = ability.can(
      'read',
      subject('Annotation', { createdByUserId: null } as any),
    )
    expect(allowed).toBe(false)
  })

  it('After backfill: annotation with createdByUserId matching userId IS readable', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    const allowed = ability.can(
      'read',
      subject('Annotation', { createdByUserId: USER_A } as any),
    )
    expect(allowed).toBe(true)
  })

  it('System admin CAN read annotation with null createdByUserId', () => {
    const roles: UserRoles = {
      systemRole: 'system_admin',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    const allowed = ability.can(
      'read',
      subject('Annotation', { createdByUserId: null } as any),
    )
    expect(allowed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 3. Cache invalidation correctness
// ---------------------------------------------------------------------------

describe('Cache invalidation correctness', () => {
  function createMockRequest(userId: string, systemRole = 'user') {
    return {
      user: { id: userId, systemRole },
      ability: null as any,
    } as any
  }

  const mockReply = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
    // Always start with a clean cache
    invalidatePermissionCache()
  })

  it('second buildAbilities call for the same userId hits cache (prisma called once)', async () => {
    const req1 = createMockRequest(USER_A)
    const req2 = createMockRequest(USER_A)

    await buildAbilities(req1, mockReply)
    await buildAbilities(req2, mockReply)

    // groupMembership.findMany should only be called once (first call)
    expect(prisma.groupMembership.findMany).toHaveBeenCalledTimes(1)
    // Both requests should have an ability attached
    expect(req1.ability).toBeDefined()
    expect(req2.ability).toBeDefined()
  })

  it('invalidateUserAbilities forces re-query on next buildAbilities call', async () => {
    const req1 = createMockRequest(USER_A)
    await buildAbilities(req1, mockReply)
    expect(prisma.groupMembership.findMany).toHaveBeenCalledTimes(1)

    invalidateUserAbilities(USER_A)

    const req2 = createMockRequest(USER_A)
    await buildAbilities(req2, mockReply)
    expect(prisma.groupMembership.findMany).toHaveBeenCalledTimes(2)
  })

  it('invalidatePermissionCache clears ALL user caches', async () => {
    const reqA = createMockRequest(USER_A)
    const reqB = createMockRequest(USER_B)

    await buildAbilities(reqA, mockReply)
    await buildAbilities(reqB, mockReply)
    expect(prisma.groupMembership.findMany).toHaveBeenCalledTimes(2)

    invalidatePermissionCache()

    const reqA2 = createMockRequest(USER_A)
    const reqB2 = createMockRequest(USER_B)
    await buildAbilities(reqA2, mockReply)
    await buildAbilities(reqB2, mockReply)

    // Both users should have been re-queried (2 original + 2 after invalidation)
    expect(prisma.groupMembership.findMany).toHaveBeenCalledTimes(4)
  })

  it('buildAbilities skips processing when request has no user', async () => {
    const req = { user: undefined, ability: null } as any
    await buildAbilities(req, mockReply)

    expect(prisma.groupMembership.findMany).not.toHaveBeenCalled()
    expect(req.ability).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4. Sharing privilege escalation prevention
// ---------------------------------------------------------------------------

describe('Sharing privilege escalation prevention', () => {
  it('read-only viewer CANNOT fork a resource', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: PROJECT_P1, role: 'viewer' }],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    expect(ability.can('fork', 'Annotation')).toBe(false)
    expect(ability.can('fork', 'VideoSummary')).toBe(false)
  })

  it('read-only viewer CANNOT share a resource', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: PROJECT_P1, role: 'viewer' }],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    expect(ability.can('share', 'Annotation')).toBe(false)
    expect(ability.can('share', 'Video')).toBe(false)
    expect(ability.can('share', 'Project')).toBe(false)
  })

  it('annotator without explicit share permission CANNOT share annotations', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: PROJECT_P1, role: 'annotator' }],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    expect(ability.can('share', 'Annotation')).toBe(false)
  })

  it('user with no roles CANNOT fork or share anything', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    expect(ability.can('fork', 'Annotation')).toBe(false)
    expect(ability.can('fork', 'Persona')).toBe(false)
    expect(ability.can('share', 'Video')).toBe(false)
    expect(ability.can('share', 'Project')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 5. Admin-only enforcement
// ---------------------------------------------------------------------------

describe('Admin-only enforcement', () => {
  it('non-admin user abilities do NOT include manage on all', () => {
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: PROJECT_P1, role: 'annotator' }],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    expect(ability.can('manage', 'all')).toBe(false)
  })

  it('system_admin abilities DO include manage on all', () => {
    const roles: UserRoles = {
      systemRole: 'system_admin',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    expect(ability.can('manage', 'all')).toBe(true)
  })

  it('requireAdmin rejects non-admin users with ForbiddenError', async () => {
    // Import requireAdmin dynamically to avoid pulling in authService at module level
    const { requireAdmin } = await import('../../src/middleware/auth.js')

    const request = {
      user: {
        id: USER_A,
        username: 'regular-user',
        email: null,
        displayName: 'Regular User',
        isAdmin: false,
        systemRole: 'user',
      },
      cookies: { session_token: 'valid-token' },
    } as any

    const reply = {} as any

    // requireAdmin calls requireAuth first, which validates the session.
    // We mock authService.validateSession to return the user so requireAuth passes.
    const { authService } = await import('../../src/services/auth-service.js')
    vi.spyOn(authService, 'validateSession').mockResolvedValue({
      id: USER_A,
      username: 'regular-user',
      email: null,
      displayName: 'Regular User',
      isAdmin: false,
      systemRole: 'user',
    } as any)

    await expect(requireAdmin(request, reply)).rejects.toThrow('Admin access required')
  })

  it('system_admin can perform any action on any subject type', () => {
    const roles: UserRoles = {
      systemRole: 'system_admin',
      groupRoles: [],
      projectRoles: [],
    }
    const ability = defineAbilitiesFor(USER_A, roles, permissions)

    const subjects = ['Annotation', 'Claim', 'Persona', 'Video', 'VideoSummary', 'Project', 'UserGroup', 'User'] as const
    const actions = ['create', 'read', 'update', 'delete', 'share', 'fork', 'manage'] as const

    for (const s of subjects) {
      for (const a of actions) {
        expect(ability.can(a, s)).toBe(true)
      }
    }
  })

  it('authorize middleware denies access when no ability is attached', async () => {
    const { authorize } = await import('../../src/middleware/abilities.js')

    const handler = authorize('create', 'Annotation')
    const request = { ability: undefined, user: undefined } as any
    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as any

    await handler(request, reply)

    expect(reply.code).toHaveBeenCalledWith(403)
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'FORBIDDEN' }),
    )
  })
})

// =============================================================================
// 6. Cross-resource ownership conditions (VideoSummary, Claim, Persona)
// =============================================================================

describe('Cross-resource ownership conditions', () => {
  const ANNOTATOR_PERMS: RolePermissionRow[] = [
    { scope: 'system', role: 'user', resourceType: 'summary', action: 'read', ownOnly: true },
    { scope: 'system', role: 'user', resourceType: 'summary', action: 'update', ownOnly: true },
    { scope: 'system', role: 'user', resourceType: 'claim', action: 'read', ownOnly: true },
    { scope: 'system', role: 'user', resourceType: 'claim', action: 'update', ownOnly: true },
    { scope: 'system', role: 'user', resourceType: 'persona', action: 'read', ownOnly: true },
    { scope: 'system', role: 'user', resourceType: 'persona', action: 'update', ownOnly: true },
    { scope: 'system', role: 'user', resourceType: 'persona', action: 'delete', ownOnly: true },
  ]

  it('User can read their own VideoSummary but not another user\'s', () => {
    const roles: UserRoles = { systemRole: 'user', groupRoles: [], projectRoles: [] }
    const ability = defineAbilitiesFor('user-a', roles, ANNOTATOR_PERMS)

    expect(ability.can('read', subject('VideoSummary', { createdBy: 'user-a' } as any))).toBe(true)
    expect(ability.can('read', subject('VideoSummary', { createdBy: 'user-b' } as any))).toBe(false)
  })

  it('User can read their own Claim but not another user\'s', () => {
    const roles: UserRoles = { systemRole: 'user', groupRoles: [], projectRoles: [] }
    const ability = defineAbilitiesFor('user-a', roles, ANNOTATOR_PERMS)

    expect(ability.can('read', subject('Claim', { createdBy: 'user-a' } as any))).toBe(true)
    expect(ability.can('read', subject('Claim', { createdBy: 'user-b' } as any))).toBe(false)
  })

  it('User can read/update/delete their own Persona but not another user\'s', () => {
    const roles: UserRoles = { systemRole: 'user', groupRoles: [], projectRoles: [] }
    const ability = defineAbilitiesFor('user-a', roles, ANNOTATOR_PERMS)

    const own = subject('Persona', { userId: 'user-a', createdByUserId: 'user-a' } as any)
    const foreign = subject('Persona', { userId: 'user-b', createdByUserId: 'user-b' } as any)

    expect(ability.can('read', own)).toBe(true)
    expect(ability.can('update', own)).toBe(true)
    expect(ability.can('delete', own)).toBe(true)
    expect(ability.can('read', foreign)).toBe(false)
    expect(ability.can('update', foreign)).toBe(false)
    expect(ability.can('delete', foreign)).toBe(false)
  })

  it('Project-scoped annotator can read summaries in their project', () => {
    const perms: RolePermissionRow[] = [
      { scope: 'project', role: 'annotator', resourceType: 'summary', action: 'read', ownOnly: false },
    ]
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: 'proj-1', role: 'annotator' }],
    }
    const ability = defineAbilitiesFor('user-a', roles, perms)

    const inProject = subject('VideoSummary', { createdBy: 'user-b', projectId: 'proj-1' } as any)
    const otherProject = subject('VideoSummary', { createdBy: 'user-b', projectId: 'proj-2' } as any)

    expect(ability.can('read', inProject)).toBe(true)
    expect(ability.can('read', otherProject)).toBe(false)
  })
})

// =============================================================================
// 7. Import CASL integration
// =============================================================================

describe('Import CASL enforcement', () => {
  it('Ability denies annotation create with no permissions', () => {
    const roles: UserRoles = { systemRole: 'user', groupRoles: [], projectRoles: [] }
    const ability = defineAbilitiesFor('user-a', roles, [])

    const candidate = subject('Annotation', { createdByUserId: 'user-a', projectId: null } as any)
    expect(ability.can('create', candidate)).toBe(false)
  })

  it('Ability allows annotation create with system-level ownOnly permission', () => {
    const perms: RolePermissionRow[] = [
      { scope: 'system', role: 'user', resourceType: 'annotation', action: 'create', ownOnly: true },
    ]
    const roles: UserRoles = { systemRole: 'user', groupRoles: [], projectRoles: [] }
    const ability = defineAbilitiesFor('user-a', roles, perms)

    const candidate = subject('Annotation', { createdByUserId: 'user-a', projectId: null } as any)
    expect(ability.can('create', candidate)).toBe(true)
  })

  it('Ability denies create into a project the user is not a member of', () => {
    const perms: RolePermissionRow[] = [
      { scope: 'project', role: 'annotator', resourceType: 'annotation', action: 'create', ownOnly: false },
    ]
    const roles: UserRoles = {
      systemRole: 'user',
      groupRoles: [],
      projectRoles: [{ projectId: 'proj-1', role: 'annotator' }],
    }
    const ability = defineAbilitiesFor('user-a', roles, perms)

    const inProject = subject('Annotation', { createdByUserId: 'user-a', projectId: 'proj-1' } as any)
    const wrongProject = subject('Annotation', { createdByUserId: 'user-a', projectId: 'proj-999' } as any)

    expect(ability.can('create', inProject)).toBe(true)
    expect(ability.can('create', wrongProject)).toBe(false)
  })
})
