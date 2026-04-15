/**
 * Fastify middleware that builds CASL abilities for authenticated users.
 *
 * Registers as an onRequest hook to load the user's role assignments and
 * the permission matrix from the database, then attaches a CASL ability
 * instance to the request for downstream authorization checks.
 *
 * Uses a two-level cache:
 *   1. Global permission matrix cache (RolePermission rows) with TTL, so
 *      the full matrix is not re-fetched on every request.
 *   2. Per-user ability cache keyed by userId with explicit invalidation.
 *      Any mutation that affects a user's access (add/remove membership,
 *      role change, RolePermission edit) MUST call the corresponding
 *      invalidation helper so access is denied immediately.
 *
 * @module
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { trace } from '@opentelemetry/api'

import {
  defineAbilitiesFor,
  UserRoles,
  RolePermissionRow,
  AppAbility,
} from '../lib/abilities.js'
import type { Actions, SubjectName } from '../lib/abilities.js'
import { prisma } from '../lib/prisma.js'
import { rbacCheckCounter, rbacCheckDuration } from '../metrics.js'

const tracer = trace.getTracer('fovea-rbac')

/**
 * Global cache for the RolePermission matrix. Because this table is small
 * (~117 rows) and rarely changes, we keep the whole thing in memory with
 * TTL fallback. Any mutation to RolePermission must call
 * {@link invalidatePermissionCache} to force a reload.
 */
let cachedPermissions: RolePermissionRow[] | null = null
let cacheTimestamp = 0
const PERMISSION_CACHE_TTL_MS = 5 * 60_000 // 5 minutes (TTL floor — revocation should not rely on this)

/**
 * Per-user ability cache. Keyed by userId. Invalidated explicitly whenever
 * a user's role assignments change (membership add/remove, role change,
 * system role change). There is no TTL on this cache: callers that change
 * a user's access are responsible for invalidation.
 */
const userAbilityCache = new Map<string, AppAbility>()

/**
 * Loads role permissions from the database, populating the global cache.
 * Returns cached results unless the cache is empty or past its TTL.
 */
async function getPermissions(): Promise<RolePermissionRow[]> {
  const now = Date.now()
  if (cachedPermissions && (now - cacheTimestamp) < PERMISSION_CACHE_TTL_MS) {
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
 * Invalidates the global permission matrix cache AND every per-user ability
 * cache entry. Use this after any edit to the RolePermission table, since
 * such edits change the ability of every user in the system.
 */
export function invalidatePermissionCache(): void {
  cachedPermissions = null
  cacheTimestamp = 0
  userAbilityCache.clear()
}

/**
 * Invalidates a single user's cached ability. Call this after any change
 * that affects only this user's access: group/project membership add or
 * remove, role change on an existing membership, systemRole change.
 *
 * Calling this is load-bearing for security: without it, a user can keep
 * the access they were granted before the change.
 */
export function invalidateUserAbilities(userId: string): void {
  userAbilityCache.delete(userId)
}

/**
 * Invalidates ability caches for every member of a group. Use after any
 * edit that changes the effective permissions attached to a group role
 * (e.g. RolePermission edits at group scope, or a group role being
 * renamed).
 */
export async function invalidateGroupMembers(groupId: string): Promise<void> {
  const members = await prisma.groupMembership.findMany({
    where: { groupId },
    select: { userId: true },
  })
  for (const { userId } of members) userAbilityCache.delete(userId)
}

/**
 * Invalidates ability caches for every member of a project. Use after any
 * edit that changes the effective permissions attached to a project role,
 * or when the project itself is deleted.
 */
export async function invalidateProjectMembers(projectId: string): Promise<void> {
  const members = await prisma.projectMembership.findMany({
    where: { projectId },
    select: { userId: true },
  })
  for (const { userId } of members) userAbilityCache.delete(userId)
}

/**
 * Fastify onRequest hook that builds CASL abilities for the authenticated user.
 *
 * Loads the user's group and project memberships in parallel with the
 * permission matrix, then constructs an AppAbility instance and attaches
 * it to `request.ability`. Cached per-userId with explicit invalidation.
 *
 * Skips processing when no user is attached to the request (unauthenticated
 * requests handled by optionalAuth).
 */
export async function buildAbilities(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!request.user) return

  const span = tracer.startSpan('rbac.buildAbilities')
  try {
    const userId = request.user.id

    const cached = userAbilityCache.get(userId)
    if (cached) {
      request.ability = cached
      span.setAttribute('rbac.cache_hit', true)
      span.setAttribute('rbac.user_id', userId)
      return
    }

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

    span.setAttribute('rbac.cache_hit', false)
    span.setAttribute('rbac.user_id', userId)
    span.setAttribute('rbac.system_role', roles.systemRole)
    span.setAttribute('rbac.group_count', roles.groupRoles.length)
    span.setAttribute('rbac.project_count', roles.projectRoles.length)

    const ability = defineAbilitiesFor(userId, roles, permissions)
    userAbilityCache.set(userId, ability)
    request.ability = ability
  } finally {
    span.end()
  }
}

/**
 * Fastify preHandler that checks a class-level permission. Use this for
 * list endpoints or endpoints where no specific resource instance is
 * involved. For endpoints that touch a single resource, prefer the
 * instance-level helpers {@link ensureCan} or {@link ensureCanOrDeny}.
 *
 * @example
 * ```ts
 * fastify.post('/api/annotations', {
 *   onRequest: [requireAuth, buildAbilities],
 *   preHandler: [authorize('create', 'Annotation')],
 * }, handler)
 * ```
 */
export function authorize(action: Actions, subject: SubjectName) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const start = Date.now()
    const span = tracer.startSpan('rbac.authorize')

    try {
      span.setAttribute('rbac.action', action)
      span.setAttribute('rbac.resource', subject)

      if (!request.ability) {
        span.setAttribute('rbac.result', 'denied')
        rbacCheckCounter.add(1, { action, resource: subject, result: 'denied', role: 'none' })
        rbacCheckDuration.record(Date.now() - start, { action, resource: subject })
        reply.code(403).send({ error: 'FORBIDDEN', message: 'No abilities defined' })
        return
      }

      const allowed = request.ability.can(action, subject)
      const role = request.user?.systemRole || 'user'
      span.setAttribute('rbac.result', allowed ? 'allowed' : 'denied')
      rbacCheckCounter.add(1, { action, resource: subject, result: allowed ? 'allowed' : 'denied', role })
      rbacCheckDuration.record(Date.now() - start, { action, resource: subject })

      if (!allowed) {
        reply.code(403).send({ error: 'FORBIDDEN', message: `Cannot ${action} ${subject}` })
        return
      }
    } finally {
      span.end()
    }
  }
}
