/**
 * Fastify middleware that builds CASL abilities for authenticated users.
 *
 * Registers as an onRequest hook to load the user's role assignments and
 * the permission matrix from the database, then attaches a CASL ability
 * instance to the request for downstream authorization checks.
 *
 * @module
 */

import { FastifyRequest, FastifyReply } from 'fastify'

import {
  defineAbilitiesFor,
  UserRoles,
  RolePermissionRow,
} from '../lib/abilities.js'
import { prisma } from '../lib/prisma.js'

/** In-memory cache for role permissions, invalidated after CACHE_TTL_MS. */
let cachedPermissions: RolePermissionRow[] | null = null
let cacheTimestamp = 0
const CACHE_TTL_MS = 60_000 // 1 minute

/**
 * Loads role permissions from the database with a time-based cache.
 * Returns cached results if less than CACHE_TTL_MS has elapsed since the
 * last fetch.
 *
 * @returns all RolePermission rows
 */
async function getPermissions(): Promise<RolePermissionRow[]> {
  const now = Date.now()
  if (cachedPermissions && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedPermissions
  }

  const rows = await prisma.rolePermission.findMany()
  cachedPermissions = rows.map(r => ({
    scope: r.scope,
    role: r.role,
    resourceType: r.resourceType,
    action: r.action,
    ownOnly: r.ownOnly,
  }))
  cacheTimestamp = now
  return cachedPermissions
}

/**
 * Invalidates the in-memory permission cache.
 * Call this after any admin edits to the RolePermission table so that
 * subsequent requests pick up the new permission matrix.
 */
export function invalidatePermissionCache(): void {
  cachedPermissions = null
  cacheTimestamp = 0
}

/**
 * Fastify onRequest hook that builds CASL abilities for the authenticated user.
 *
 * Loads the user's group and project memberships in parallel with the
 * permission matrix, then constructs an AppAbility instance and attaches
 * it to `request.ability`.
 *
 * Skips processing when no user is attached to the request (unauthenticated
 * requests handled by optionalAuth).
 *
 * @param request - Fastify request with optional user from auth middleware
 * @param _reply - Fastify reply (unused)
 */
export async function buildAbilities(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!request.user) return

  const userId = request.user.id

  // Load user's roles from all scopes in parallel
  const [groupMemberships, projectMemberships, permissions] = await Promise.all([
    prisma.groupMembership.findMany({
      where: { userId },
      select: { groupId: true, role: true },
    }),
    prisma.projectMembership.findMany({
      where: { userId },
      select: { projectId: true, role: true },
    }),
    getPermissions(),
  ])

  const roles: UserRoles = {
    systemRole: request.user.systemRole || 'user',
    groupRoles: groupMemberships.map(gm => ({ groupId: gm.groupId, role: gm.role })),
    projectRoles: projectMemberships.map(pm => ({ projectId: pm.projectId, role: pm.role })),
  }

  request.ability = defineAbilitiesFor(userId, roles, permissions)
}

/**
 * Creates a Fastify preHandler hook that checks whether the authenticated
 * user has a specific permission.
 *
 * Returns a 403 response if no ability is defined on the request or if the
 * user lacks the requested permission.
 *
 * @param action - action to check (e.g., "create", "read")
 * @param subject - resource subject to check (e.g., "Video", "Annotation")
 * @returns Fastify preHandler hook function
 *
 * @example
 * ```typescript
 * fastify.post('/api/annotations', {
 *   onRequest: [requireAuth],
 *   preHandler: [authorize('create', 'Annotation')],
 * }, handler)
 * ```
 */
export function authorize(action: string, subject: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.ability) {
      reply.code(403).send({ error: 'FORBIDDEN', message: 'No abilities defined' })
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!request.ability.can(action as any, subject as any)) {
      reply.code(403).send({ error: 'FORBIDDEN', message: `Cannot ${action} ${subject}` })
      return
    }
  }
}
