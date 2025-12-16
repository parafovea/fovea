import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import {
  getApiKeys,
  createApiKey,
  updateApiKey,
  deleteApiKey
} from '../services/api-key-service.js'
import { NotFoundError, ConflictError, ErrorResponseSchema } from '../lib/errors.js'

/**
 * TypeBox schema for ApiKey response.
 * Excludes encryptedKey for security.
 */
const ApiKeySchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  userId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  provider: Type.String(),
  keyName: Type.String(),
  keyMask: Type.String(),
  isActive: Type.Boolean(),
  usageCount: Type.Number(),
  lastUsed: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' })
})

/**
 * Zod schema for creating an API key.
 * Validates request body for POST /api/api-keys.
 */
const createApiKeySchema = z.object({
  provider: z.enum(['ANTHROPIC', 'OPENAI', 'GOOGLE']),
  keyName: z.string().min(1, 'Key name is required'),
  apiKey: z.string().min(1, 'API key is required')
})

/**
 * Zod schema for updating an API key.
 * All fields are optional for partial updates.
 */
const updateApiKeySchema = z.object({
  keyName: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  isActive: z.boolean().optional()
})

/**
 * Fastify plugin for API key management routes.
 * Provides endpoints for managing user and admin API keys.
 *
 * Routes:
 * - GET /api/api-keys - List user's API keys
 * - POST /api/api-keys - Create user API key
 * - PUT /api/api-keys/:keyId - Update user API key
 * - DELETE /api/api-keys/:keyId - Delete user API key
 * - GET /api/admin/api-keys - List admin API keys
 * - POST /api/admin/api-keys - Create admin API key
 */
const apiKeysRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * List current user's API keys.
   *
   * @returns Array of user's API keys
   */
  fastify.get('/api/api-keys', {
    onRequest: [requireAuth],
    schema: {
      description: 'List current user\'s API keys',
      tags: ['api-keys'],
      response: {
        200: Type.Array(ApiKeySchema)
      }
    }
  }, async (request, reply) => {
    const keys = await getApiKeys(fastify.prisma, request.user!.id)
    return reply.send(keys)
  })

  /**
   * Create a new user API key.
   *
   * @param request.body - API key data
   * @returns Created API key
   * @throws 409 if key for provider already exists
   */
  fastify.post('/api/api-keys', {
    onRequest: [requireAuth],
    schema: {
      description: 'Create a new user API key',
      tags: ['api-keys'],
      body: Type.Object({
        provider: Type.Union([
          Type.Literal('ANTHROPIC'),
          Type.Literal('OPENAI'),
          Type.Literal('GOOGLE')
        ]),
        keyName: Type.String({ minLength: 1 }),
        apiKey: Type.String({ minLength: 1 })
      }),
      response: {
        201: ApiKeySchema,
        409: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
    const validatedData = createApiKeySchema.parse(request.body)

    try {
      const key = await createApiKey(fastify.prisma, {
        userId: request.user!.id,
        provider: validatedData.provider,
        keyName: validatedData.keyName,
        apiKey: validatedData.apiKey
      })

      return reply.code(201).send(key)
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new ConflictError('API key for this provider already exists')
      }
      throw error
    }
  })

  /**
   * Update a user API key.
   *
   * @param request.params.keyId - API key UUID
   * @param request.body - Fields to update
   * @returns Updated API key
   * @throws 404 if key not found
   */
  fastify.put<{ Params: { keyId: string } }>('/api/api-keys/:keyId', {
    onRequest: [requireAuth],
    schema: {
      description: 'Update a user API key',
      tags: ['api-keys'],
      params: Type.Object({
        keyId: Type.String({ format: 'uuid' })
      }),
      body: Type.Object({
        keyName: Type.Optional(Type.String({ minLength: 1 })),
        apiKey: Type.Optional(Type.String({ minLength: 1 })),
        isActive: Type.Optional(Type.Boolean())
      }),
      response: {
        200: ApiKeySchema,
        404: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
    const { keyId } = request.params
    const validatedData = updateApiKeySchema.parse(request.body)

    const key = await updateApiKey(
      fastify.prisma,
      keyId,
      request.user!.id,
      validatedData
    )

    if (!key) {
      throw new NotFoundError('API key', keyId)
    }

    return reply.send(key)
  })

  /**
   * Delete a user API key.
   *
   * @param request.params.keyId - API key UUID
   * @returns Success message
   * @throws 404 if key not found
   */
  fastify.delete<{ Params: { keyId: string } }>('/api/api-keys/:keyId', {
    onRequest: [requireAuth],
    schema: {
      description: 'Delete a user API key',
      tags: ['api-keys'],
      params: Type.Object({
        keyId: Type.String({ format: 'uuid' })
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean()
        }),
        404: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
    const { keyId } = request.params

    const deleted = await deleteApiKey(fastify.prisma, keyId, request.user!.id)

    if (!deleted) {
      throw new NotFoundError('API key', keyId)
    }

    return reply.send({ success: true })
  })

  /**
   * List admin-level API keys.
   *
   * @returns Array of admin API keys
   */
  fastify.get('/api/admin/api-keys', {
    onRequest: [requireAdmin],
    schema: {
      description: 'List admin-level API keys',
      tags: ['admin', 'api-keys'],
      response: {
        200: Type.Array(ApiKeySchema)
      }
    }
  }, async (_request, reply) => {
    const keys = await getApiKeys(fastify.prisma, null)
    return reply.send(keys)
  })

  /**
   * Create an admin-level API key.
   *
   * @param request.body - API key data
   * @returns Created API key
   * @throws 409 if key for provider already exists
   */
  fastify.post('/api/admin/api-keys', {
    onRequest: [requireAdmin],
    schema: {
      description: 'Create an admin-level API key',
      tags: ['admin', 'api-keys'],
      body: Type.Object({
        provider: Type.Union([
          Type.Literal('ANTHROPIC'),
          Type.Literal('OPENAI'),
          Type.Literal('GOOGLE')
        ]),
        keyName: Type.String({ minLength: 1 }),
        apiKey: Type.String({ minLength: 1 })
      }),
      response: {
        201: ApiKeySchema,
        409: ErrorResponseSchema
      }
    }
  }, async (request, reply) => {
    const validatedData = createApiKeySchema.parse(request.body)

    try {
      const key = await createApiKey(fastify.prisma, {
        userId: null,
        provider: validatedData.provider,
        keyName: validatedData.keyName,
        apiKey: validatedData.apiKey
      })

      return reply.code(201).send(key)
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw new ConflictError('Admin API key for this provider already exists')
      }
      throw error
    }
  })
}

export default apiKeysRoute
