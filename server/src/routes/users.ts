import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcrypt'
import { requireAdmin } from '../middleware/auth.js'

/**
 * TypeBox schema for User response.
 * Excludes passwordHash for security.
 */
const UserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  username: Type.String(),
  email: Type.Union([Type.String(), Type.Null()]),
  displayName: Type.String(),
  isAdmin: Type.Boolean(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' })
})

/**
 * TypeBox schema for User with counts.
 * Includes related record counts for personas, sessions, and API keys.
 */
const UserWithCountsSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  username: Type.String(),
  email: Type.Union([Type.String(), Type.Null()]),
  displayName: Type.String(),
  isAdmin: Type.Boolean(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
  _count: Type.Object({
    personas: Type.Number(),
    sessions: Type.Number(),
    apiKeys: Type.Number()
  })
})

/**
 * Zod schema for creating a new user.
 * Validates request body for POST /api/admin/users.
 */
const createUserSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  email: z.string().email().optional().nullable(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  displayName: z.string().min(1, 'Display name is required'),
  isAdmin: z.boolean().optional().default(false)
})

/**
 * Zod schema for updating an existing user.
 * All fields are optional for partial updates.
 */
const updateUserSchema = z.object({
  email: z.string().email().optional().nullable(),
  displayName: z.string().min(1).optional(),
  isAdmin: z.boolean().optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional()
})

/**
 * Fastify plugin for user management routes.
 * Provides admin-only CRUD operations for users and profile management for authenticated users.
 *
 * Routes:
 * - GET /api/user/profile - Get current user's profile
 * - PUT /api/user/profile - Update current user's profile
 * - GET /api/admin/users - List all users
 * - POST /api/admin/users - Create a new user
 * - GET /api/admin/users/:userId - Get a specific user
 * - PUT /api/admin/users/:userId - Update a user
 * - DELETE /api/admin/users/:userId - Delete a user
 */
const usersRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * Get current user's profile.
   *
   * @returns Current user object without passwordHash
   */
  fastify.get('/api/user/profile', {
    schema: {
      description: 'Get current user profile',
      tags: ['user', 'profile'],
      response: {
        200: UserSchema,
        401: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Not authenticated' })
    }

    const user = await fastify.prisma.user.findUnique({
      where: { id: request.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        isAdmin: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }

    return reply.send(user)
  })

  /**
   * Update current user's profile.
   * Users can update their own email, displayName, and password.
   * Users cannot change their own admin status.
   *
   * @param request.body - Fields to update (email, displayName, password)
   * @returns Updated user without passwordHash
   */
  fastify.put('/api/user/profile', {
    schema: {
      description: 'Update current user profile',
      tags: ['user', 'profile'],
      body: Type.Object({
        email: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        displayName: Type.Optional(Type.String({ minLength: 1 })),
        password: Type.Optional(Type.String({ minLength: 6 }))
      }),
      response: {
        200: UserSchema,
        401: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Not authenticated' })
    }

    const validatedData = updateUserSchema.omit({ isAdmin: true }).parse(request.body)

    // Build update data (excluding isAdmin for self-updates)
    const updateData: {
      email?: string | null
      displayName?: string
      passwordHash?: string
    } = {}

    if (validatedData.email !== undefined) {
      updateData.email = validatedData.email
    }
    if (validatedData.displayName !== undefined) {
      updateData.displayName = validatedData.displayName
    }
    if (validatedData.password) {
      updateData.passwordHash = await bcrypt.hash(validatedData.password, 12)
    }

    const user = await fastify.prisma.user.update({
      where: { id: request.user.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        isAdmin: true,
        createdAt: true,
        updatedAt: true
      }
    })

    return reply.send(user)
  })

  /**
   * List all users with related record counts.
   *
   * @returns Array of users with counts
   */
  fastify.get('/api/admin/users', {
    onRequest: [requireAdmin],
    schema: {
      description: 'List all users with related record counts',
      tags: ['admin', 'users'],
      response: {
        200: Type.Array(UserWithCountsSchema)
      }
    }
  }, async (_request, reply) => {
    const users = await fastify.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        isAdmin: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            personas: true,
            sessions: true,
            apiKeys: true
          }
        }
      }
    })

    return reply.send(users)
  })

  /**
   * Create a new user.
   * Hashes the password and creates the user in the database.
   *
   * @param request.body - User data including password
   * @returns Created user without passwordHash
   * @throws 409 if username already exists
   */
  fastify.post('/api/admin/users', {
    onRequest: [requireAdmin],
    schema: {
      description: 'Create a new user',
      tags: ['admin', 'users'],
      body: Type.Object({
        username: Type.String({ minLength: 1 }),
        email: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        password: Type.String({ minLength: 6 }),
        displayName: Type.String({ minLength: 1 }),
        isAdmin: Type.Optional(Type.Boolean())
      }),
      response: {
        201: UserSchema,
        409: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const validatedData = createUserSchema.parse(request.body)

    // Check if username already exists
    const existingUser = await fastify.prisma.user.findUnique({
      where: { username: validatedData.username }
    })

    if (existingUser) {
      return reply.code(409).send({ error: 'Username already exists' })
    }

    // Hash password
    const passwordHash = await bcrypt.hash(validatedData.password, 12)

    // Create user
    const user = await fastify.prisma.user.create({
      data: {
        username: validatedData.username,
        email: validatedData.email || null,
        passwordHash,
        displayName: validatedData.displayName,
        isAdmin: validatedData.isAdmin
      },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        isAdmin: true,
        createdAt: true,
        updatedAt: true
      }
    })

    return reply.code(201).send(user)
  })

  /**
   * Get a specific user by ID.
   *
   * @param request.params.userId - User UUID
   * @returns User object without passwordHash
   * @throws 404 if user not found
   */
  fastify.get<{ Params: { userId: string } }>('/api/admin/users/:userId', {
    onRequest: [requireAdmin],
    schema: {
      description: 'Get a specific user by ID',
      tags: ['admin', 'users'],
      params: Type.Object({
        userId: Type.String({ format: 'uuid' })
      }),
      response: {
        200: UserSchema,
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { userId } = request.params

    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        isAdmin: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!user) {
      return reply.code(404).send({ error: 'User not found' })
    }

    return reply.send(user)
  })

  /**
   * Update a user.
   * Performs partial update of user fields. Hashes password if provided.
   *
   * @param request.params.userId - User UUID
   * @param request.body - Fields to update
   * @returns Updated user without passwordHash
   * @throws 404 if user not found
   */
  fastify.put<{ Params: { userId: string } }>('/api/admin/users/:userId', {
    onRequest: [requireAdmin],
    schema: {
      description: 'Update a user',
      tags: ['admin', 'users'],
      params: Type.Object({
        userId: Type.String({ format: 'uuid' })
      }),
      body: Type.Object({
        email: Type.Optional(Type.Union([Type.String(), Type.Null()])),
        displayName: Type.Optional(Type.String({ minLength: 1 })),
        isAdmin: Type.Optional(Type.Boolean()),
        password: Type.Optional(Type.String({ minLength: 6 }))
      }),
      response: {
        200: UserSchema,
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { userId } = request.params
    const validatedData = updateUserSchema.parse(request.body)

    // Build update data
    const updateData: {
      email?: string | null
      displayName?: string
      isAdmin?: boolean
      passwordHash?: string
    } = {}

    if (validatedData.email !== undefined) {
      updateData.email = validatedData.email
    }
    if (validatedData.displayName !== undefined) {
      updateData.displayName = validatedData.displayName
    }
    if (validatedData.isAdmin !== undefined) {
      updateData.isAdmin = validatedData.isAdmin
    }
    if (validatedData.password) {
      updateData.passwordHash = await bcrypt.hash(validatedData.password, 12)
    }

    try {
      const user = await fastify.prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          isAdmin: true,
          createdAt: true,
          updatedAt: true
        }
      })
      return reply.send(user)
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        return reply.code(404).send({ error: 'User not found' })
      }
      throw error
    }
  })

  /**
   * Delete a user.
   * Deletes the user and cascades to personas, sessions, and API keys.
   * Prevents users from deleting themselves.
   *
   * @param request.params.userId - User UUID
   * @returns Success message
   * @throws 403 if attempting to delete yourself
   * @throws 404 if user not found
   */
  fastify.delete<{ Params: { userId: string } }>('/api/admin/users/:userId', {
    onRequest: [requireAdmin],
    schema: {
      description: 'Delete a user',
      tags: ['admin', 'users'],
      params: Type.Object({
        userId: Type.String({ format: 'uuid' })
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean()
        }),
        403: Type.Object({
          error: Type.String()
        }),
        404: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const { userId } = request.params

    // Prevent self-deletion
    if (request.user?.id === userId) {
      return reply.code(403).send({ error: 'Cannot delete yourself' })
    }

    try {
      await fastify.prisma.user.delete({
        where: { id: userId }
      })
      return reply.send({ success: true })
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
        return reply.code(404).send({ error: 'User not found' })
      }
      throw error
    }
  })
}

export default usersRoute
