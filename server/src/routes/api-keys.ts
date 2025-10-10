import { Type } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import * as apiKeyService from '../services/api-key-service.js'

/**
 * TypeBox schema for API Key response.
 * Defines the structure of API key data returned by the API.
 */
const ApiKeySchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  personaId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  provider: Type.String(),
  keyName: Type.String(),
  keyMask: Type.String(),
  isActive: Type.Boolean(),
  lastUsed: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  usageCount: Type.Number(),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' })
})

/**
 * TypeBox schema for resolved API key response.
 * Used when returning decrypted keys.
 */
const ResolvedApiKeySchema = Type.Object({
  apiKey: Type.String(),
  keyId: Type.String({ format: 'uuid' }),
  source: Type.Union([Type.Literal('user'), Type.Literal('admin'), Type.Literal('env')])
})

/**
 * Zod schema for creating a new API key.
 * Validates request body for POST endpoints.
 */
const createApiKeySchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
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
 * Provides CRUD operations for API keys with encryption.
 *
 * Routes:
 * - GET /api/personas/:personaId/api-keys - List persona API keys
 * - POST /api/personas/:personaId/api-keys - Create persona API key
 * - GET /api/personas/:personaId/api-keys/:keyId - Get specific API key
 * - PUT /api/personas/:personaId/api-keys/:keyId - Update API key
 * - DELETE /api/personas/:personaId/api-keys/:keyId - Delete API key
 * - POST /api/personas/:personaId/api-keys/:keyId/validate - Validate API key
 * - GET /api/personas/:personaId/api-keys/resolve - Resolve API key for provider
 * - GET /api/admin/api-keys - List admin API keys
 * - POST /api/admin/api-keys - Create admin API key
 */
const apiKeysRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * List all API keys for a persona.
   * Returns keys with masked values only.
   *
   * @route GET /api/personas/:personaId/api-keys
   * @param request.params.personaId - Persona UUID
   * @returns Array of API keys
   */
  fastify.get<{ Params: { personaId: string } }>(
    '/api/personas/:personaId/api-keys',
    {
      schema: {
        description: 'Retrieve all API keys for a persona',
        tags: ['api-keys'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' })
        }),
        response: {
          200: Type.Array(ApiKeySchema)
        }
      }
    },
    async (request, reply) => {
      const { personaId } = request.params
      const keys = await apiKeyService.getApiKeys(fastify.prisma, personaId)
      return reply.send(keys)
    }
  )

  /**
   * Create a new API key for a persona.
   * Encrypts the key before storing.
   *
   * @route POST /api/personas/:personaId/api-keys
   * @param request.params.personaId - Persona UUID
   * @param request.body - API key data
   * @returns Created API key
   */
  fastify.post<{ Params: { personaId: string } }>(
    '/api/personas/:personaId/api-keys',
    {
      schema: {
        description: 'Create a new API key for a persona',
        tags: ['api-keys'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' })
        }),
        body: Type.Object({
          provider: Type.String({ minLength: 1 }),
          keyName: Type.String({ minLength: 1 }),
          apiKey: Type.String({ minLength: 1 })
        }),
        response: {
          201: ApiKeySchema,
          409: Type.Object({
            error: Type.String()
          })
        }
      }
    },
    async (request, reply) => {
      const { personaId } = request.params
      const validatedData = createApiKeySchema.parse(request.body)

      try {
        const key = await apiKeyService.createApiKey(fastify.prisma, {
          personaId,
          provider: validatedData.provider,
          keyName: validatedData.keyName,
          apiKey: validatedData.apiKey
        })
        return reply.code(201).send(key)
      } catch (error: unknown) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
          return reply.code(409).send({ error: 'API key for this provider already exists' })
        }
        throw error
      }
    }
  )

  /**
   * Get a specific API key by ID.
   *
   * @route GET /api/personas/:personaId/api-keys/:keyId
   * @param request.params.personaId - Persona UUID
   * @param request.params.keyId - API key UUID
   * @returns API key object
   */
  fastify.get<{ Params: { personaId: string; keyId: string } }>(
    '/api/personas/:personaId/api-keys/:keyId',
    {
      schema: {
        description: 'Get a specific API key by ID',
        tags: ['api-keys'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          keyId: Type.String({ format: 'uuid' })
        }),
        response: {
          200: ApiKeySchema,
          404: Type.Object({
            error: Type.String()
          })
        }
      }
    },
    async (request, reply) => {
      const { personaId, keyId } = request.params

      const key = await apiKeyService.getApiKey(fastify.prisma, keyId, personaId)

      if (!key) {
        return reply.code(404).send({ error: 'API key not found' })
      }

      return reply.send(key)
    }
  )

  /**
   * Update an API key.
   * Re-encrypts if new API key value is provided.
   *
   * @route PUT /api/personas/:personaId/api-keys/:keyId
   * @param request.params.personaId - Persona UUID
   * @param request.params.keyId - API key UUID
   * @param request.body - Fields to update
   * @returns Updated API key
   */
  fastify.put<{ Params: { personaId: string; keyId: string } }>(
    '/api/personas/:personaId/api-keys/:keyId',
    {
      schema: {
        description: 'Update an API key',
        tags: ['api-keys'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          keyId: Type.String({ format: 'uuid' })
        }),
        body: Type.Object({
          keyName: Type.Optional(Type.String({ minLength: 1 })),
          apiKey: Type.Optional(Type.String({ minLength: 1 })),
          isActive: Type.Optional(Type.Boolean())
        }),
        response: {
          200: ApiKeySchema,
          404: Type.Object({
            error: Type.String()
          })
        }
      }
    },
    async (request, reply) => {
      const { personaId, keyId } = request.params
      const validatedData = updateApiKeySchema.parse(request.body)

      const key = await apiKeyService.updateApiKey(
        fastify.prisma,
        keyId,
        personaId,
        validatedData
      )

      if (!key) {
        return reply.code(404).send({ error: 'API key not found' })
      }

      return reply.send(key)
    }
  )

  /**
   * Delete an API key.
   *
   * @route DELETE /api/personas/:personaId/api-keys/:keyId
   * @param request.params.personaId - Persona UUID
   * @param request.params.keyId - API key UUID
   * @returns Success message
   */
  fastify.delete<{ Params: { personaId: string; keyId: string } }>(
    '/api/personas/:personaId/api-keys/:keyId',
    {
      schema: {
        description: 'Delete an API key',
        tags: ['api-keys'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          keyId: Type.String({ format: 'uuid' })
        }),
        response: {
          200: Type.Object({
            message: Type.String()
          }),
          404: Type.Object({
            error: Type.String()
          })
        }
      }
    },
    async (request, reply) => {
      const { personaId, keyId } = request.params

      const deleted = await apiKeyService.deleteApiKey(fastify.prisma, keyId, personaId)

      if (!deleted) {
        return reply.code(404).send({ error: 'API key not found' })
      }

      return reply.send({ message: 'API key deleted successfully' })
    }
  )

  /**
   * Validate an API key.
   * Tests key validity with minimal provider API call.
   *
   * @route POST /api/personas/:personaId/api-keys/:keyId/validate
   * @param request.params.personaId - Persona UUID
   * @param request.params.keyId - API key UUID
   * @returns Validation result
   */
  fastify.post<{ Params: { personaId: string; keyId: string } }>(
    '/api/personas/:personaId/api-keys/:keyId/validate',
    {
      schema: {
        description: 'Validate an API key',
        tags: ['api-keys'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' }),
          keyId: Type.String({ format: 'uuid' })
        }),
        response: {
          200: Type.Object({
            valid: Type.Boolean()
          }),
          404: Type.Object({
            error: Type.String()
          })
        }
      }
    },
    async (request, reply) => {
      const { personaId, keyId } = request.params

      const valid = await apiKeyService.validateApiKey(fastify.prisma, keyId, personaId)

      if (!valid) {
        return reply.code(404).send({ error: 'API key not found or invalid' })
      }

      return reply.send({ valid })
    }
  )

  /**
   * Resolve API key for a provider.
   * Returns user key if available, otherwise admin key.
   *
   * @route GET /api/personas/:personaId/api-keys/resolve
   * @param request.params.personaId - Persona UUID
   * @param request.query.provider - Provider name
   * @returns Decrypted API key
   */
  fastify.get<{
    Params: { personaId: string }
    Querystring: { provider: string }
  }>(
    '/api/personas/:personaId/api-keys/resolve',
    {
      schema: {
        description: 'Resolve API key for a provider',
        tags: ['api-keys'],
        params: Type.Object({
          personaId: Type.String({ format: 'uuid' })
        }),
        querystring: Type.Object({
          provider: Type.String({ minLength: 1 })
        }),
        response: {
          200: ResolvedApiKeySchema,
          404: Type.Object({
            error: Type.String()
          })
        }
      }
    },
    async (request, reply) => {
      const { personaId } = request.params
      const { provider } = request.query

      const apiKey = await apiKeyService.resolveApiKey(
        fastify.prisma,
        personaId,
        provider
      )

      if (!apiKey) {
        // Check environment variables as final fallback
        const envKeyName = `${provider.toUpperCase()}_API_KEY`
        const envKey = process.env[envKeyName]

        if (envKey) {
          return reply.send({
            apiKey: envKey,
            keyId: 'env',
            source: 'env' as const
          })
        }

        return reply.code(404).send({
          error: `No API key found for provider ${provider}`
        })
      }

      // Find the key record to return its ID
      const userKey = await fastify.prisma.apiKey.findFirst({
        where: {
          personaId,
          provider,
          isActive: true
        }
      })

      if (userKey) {
        return reply.send({
          apiKey,
          keyId: userKey.id,
          source: 'user' as const
        })
      }

      const adminKey = await fastify.prisma.apiKey.findFirst({
        where: {
          personaId: null,
          provider,
          isActive: true
        }
      })

      return reply.send({
        apiKey,
        keyId: adminKey!.id,
        source: 'admin' as const
      })
    }
  )

  /**
   * List all admin-level API keys.
   * Returns keys with masked values only.
   *
   * @route GET /api/admin/api-keys
   * @returns Array of admin API keys
   */
  fastify.get('/api/admin/api-keys', {
    schema: {
      description: 'Retrieve all admin-level API keys',
      tags: ['api-keys', 'admin'],
      response: {
        200: Type.Array(ApiKeySchema)
      }
    }
  }, async (_request, reply) => {
    const keys = await apiKeyService.getApiKeys(fastify.prisma, null)
    return reply.send(keys)
  })

  /**
   * Create a new admin-level API key.
   * Encrypts the key before storing.
   *
   * @route POST /api/admin/api-keys
   * @param request.body - API key data
   * @returns Created API key
   */
  fastify.post('/api/admin/api-keys', {
    schema: {
      description: 'Create a new admin-level API key',
      tags: ['api-keys', 'admin'],
      body: Type.Object({
        provider: Type.String({ minLength: 1 }),
        keyName: Type.String({ minLength: 1 }),
        apiKey: Type.String({ minLength: 1 })
      }),
      response: {
        201: ApiKeySchema,
        409: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    const validatedData = createApiKeySchema.parse(request.body)

    try {
      const key = await apiKeyService.createApiKey(fastify.prisma, {
        personaId: null,
        provider: validatedData.provider,
        keyName: validatedData.keyName,
        apiKey: validatedData.apiKey
      })
      return reply.code(201).send(key)
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return reply.code(409).send({ error: 'Admin API key for this provider already exists' })
      }
      throw error
    }
  })
}

export default apiKeysRoute
