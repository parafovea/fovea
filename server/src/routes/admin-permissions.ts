/**
 * Admin API for editing the RolePermission matrix at runtime.
 *
 * Every mutation invalidates the global permission cache so new rules
 * take effect on the next request without a server restart. All endpoints
 * require `systemRole = 'system_admin'` via requireAdmin.
 *
 * @module
 */

import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import { NotFoundError, ConflictError } from '../lib/errors.js'
import { requireAdmin } from '../middleware/auth.js'
import { invalidatePermissionCache } from '../middleware/abilities.js'

const PermissionSchema = Type.Object({
  id: Type.String(),
  scope: Type.String(),
  role: Type.String(),
  resourceType: Type.String(),
  action: Type.String(),
  ownOnly: Type.Boolean(),
  createdAt: Type.String(),
  updatedAt: Type.String(),
})

const PermissionInputSchema = Type.Object({
  scope: Type.Union([Type.Literal('system'), Type.Literal('group'), Type.Literal('project')]),
  role: Type.String({ minLength: 1 }),
  resourceType: Type.String({ minLength: 1 }),
  action: Type.String({ minLength: 1 }),
  ownOnly: Type.Optional(Type.Boolean()),
})

const adminPermissionsRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * List all RolePermission rows. Paged client-side; the table is small.
   */
  fastify.get('/api/admin/permissions', {
    onRequest: [requireAdmin],
    schema: {
      description: 'List all RolePermission rows (admin only)',
      tags: ['admin', 'rbac'],
      response: { 200: Type.Array(PermissionSchema) },
    },
  }, async (_request, reply) => {
    const rows = await fastify.prisma.rolePermission.findMany({
      orderBy: [{ scope: 'asc' }, { role: 'asc' }, { resourceType: 'asc' }, { action: 'asc' }],
    })
    return reply.send(rows.map(r => ({
      id: r.id,
      scope: r.scope,
      role: r.role,
      resourceType: r.resourceType,
      action: r.action,
      ownOnly: r.ownOnly,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })))
  })

  /**
   * Create a RolePermission row. The unique index on
   * (scope, role, resourceType, action) forbids duplicates.
   */
  fastify.post('/api/admin/permissions', {
    onRequest: [requireAdmin],
    schema: {
      description: 'Create a new RolePermission row (admin only)',
      tags: ['admin', 'rbac'],
      body: PermissionInputSchema,
      response: { 201: PermissionSchema },
    },
  }, async (request, reply) => {
    const data = request.body as {
      scope: string
      role: string
      resourceType: string
      action: string
      ownOnly?: boolean
    }
    try {
      const row = await fastify.prisma.rolePermission.create({
        data: { ...data, ownOnly: data.ownOnly ?? false },
      })
      invalidatePermissionCache()
      return reply.code(201).send({
        id: row.id,
        scope: row.scope,
        role: row.role,
        resourceType: row.resourceType,
        action: row.action,
        ownOnly: row.ownOnly,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictError('Permission already exists for this scope/role/resource/action')
      }
      throw err
    }
  })

  /**
   * Update a RolePermission row. Only `ownOnly` is mutable; the identity
   * (scope/role/resourceType/action) is immutable because it is the
   * unique key, and changing it would silently re-identify the row.
   */
  fastify.patch('/api/admin/permissions/:id', {
    onRequest: [requireAdmin],
    schema: {
      description: 'Update the ownOnly flag on a RolePermission (admin only)',
      tags: ['admin', 'rbac'],
      params: Type.Object({ id: Type.String() }),
      body: Type.Object({ ownOnly: Type.Boolean() }),
      response: { 200: PermissionSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const { ownOnly } = request.body as { ownOnly: boolean }
    const existing = await fastify.prisma.rolePermission.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('RolePermission', id)
    const row = await fastify.prisma.rolePermission.update({
      where: { id },
      data: { ownOnly },
    })
    invalidatePermissionCache()
    return reply.send({
      id: row.id,
      scope: row.scope,
      role: row.role,
      resourceType: row.resourceType,
      action: row.action,
      ownOnly: row.ownOnly,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })
  })

  /**
   * Delete a RolePermission row.
   */
  fastify.delete('/api/admin/permissions/:id', {
    onRequest: [requireAdmin],
    schema: {
      description: 'Delete a RolePermission row (admin only)',
      tags: ['admin', 'rbac'],
      params: Type.Object({ id: Type.String() }),
      response: { 204: Type.Null() },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const existing = await fastify.prisma.rolePermission.findUnique({ where: { id } })
    if (!existing) throw new NotFoundError('RolePermission', id)
    await fastify.prisma.rolePermission.delete({ where: { id } })
    invalidatePermissionCache()
    return reply.code(204).send()
  })
}

export default adminPermissionsRoute
