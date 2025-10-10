import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

/**
 * Integration tests for the API Keys API.
 * Tests all CRUD operations for API keys with encryption.
 */
describe('API Keys API', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  let testPersonaId: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma

    // Set encryption key for tests
    if (!process.env.API_KEY_ENCRYPTION_KEY) {
      process.env.API_KEY_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    }
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    await prisma.apiKey.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()

    // Create a test persona
    const persona = await prisma.persona.create({
      data: {
        name: 'Test Persona',
        role: 'Test Role',
        informationNeed: 'Test information need'
      }
    })
    testPersonaId = persona.id
  })

  describe('GET /api/personas/:personaId/api-keys', () => {
    it('returns an empty array when no API keys exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${testPersonaId}/api-keys`
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual([])
    })

    it('returns all API keys for a persona with masked values', async () => {
      await prisma.apiKey.createMany({
        data: [
          {
            personaId: testPersonaId,
            provider: 'anthropic',
            keyName: 'My Anthropic Key',
            encryptedKey: 'encrypted1',
            keyMask: '...xyz1'
          },
          {
            personaId: testPersonaId,
            provider: 'openai',
            keyName: 'My OpenAI Key',
            encryptedKey: 'encrypted2',
            keyMask: '...xyz2'
          }
        ]
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${testPersonaId}/api-keys`
      })

      expect(response.statusCode).toBe(200)
      const keys = response.json()
      expect(keys).toHaveLength(2)
      expect(keys[0]).toHaveProperty('keyMask')
      expect(keys[0]).not.toHaveProperty('encryptedKey')
      expect(keys[0].keyMask).toMatch(/^\.{3}/)
    })
  })

  describe('POST /api/personas/:personaId/api-keys', () => {
    it('creates a new API key with encryption', async () => {
      const newKey = {
        provider: 'anthropic',
        keyName: 'My Test Key',
        apiKey: 'sk-ant-test-key-12345678'
      }

      const response = await app.inject({
        method: 'POST',
        url: `/api/personas/${testPersonaId}/api-keys`,
        payload: newKey
      })

      expect(response.statusCode).toBe(201)
      const created = response.json()
      expect(created.provider).toBe('anthropic')
      expect(created.keyName).toBe('My Test Key')
      expect(created.keyMask).toBe('...5678')
      expect(created.isActive).toBe(true)
      expect(created.usageCount).toBe(0)
      expect(created).toHaveProperty('id')
      expect(created).not.toHaveProperty('encryptedKey')
    })

    it('returns 409 when creating duplicate API key for same provider', async () => {
      const newKey = {
        provider: 'anthropic',
        keyName: 'My Test Key',
        apiKey: 'sk-ant-test-key-12345678'
      }

      await app.inject({
        method: 'POST',
        url: `/api/personas/${testPersonaId}/api-keys`,
        payload: newKey
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/personas/${testPersonaId}/api-keys`,
        payload: newKey
      })

      expect(response.statusCode).toBe(409)
      expect(response.json()).toHaveProperty('error')
    })
  })

  describe('GET /api/personas/:personaId/api-keys/:keyId', () => {
    it('returns a specific API key', async () => {
      const key = await prisma.apiKey.create({
        data: {
          personaId: testPersonaId,
          provider: 'anthropic',
          keyName: 'My Key',
          encryptedKey: 'encrypted',
          keyMask: '...xyz1'
        }
      })

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${testPersonaId}/api-keys/${key.id}`
      })

      expect(response.statusCode).toBe(200)
      const retrieved = response.json()
      expect(retrieved.id).toBe(key.id)
      expect(retrieved.keyName).toBe('My Key')
      expect(retrieved).not.toHaveProperty('encryptedKey')
    })

    it('returns 404 when API key not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${testPersonaId}/api-keys/00000000-0000-0000-0000-000000000000`
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toHaveProperty('error')
    })
  })

  describe('PUT /api/personas/:personaId/api-keys/:keyId', () => {
    it('updates API key name', async () => {
      const key = await prisma.apiKey.create({
        data: {
          personaId: testPersonaId,
          provider: 'anthropic',
          keyName: 'Old Name',
          encryptedKey: 'encrypted',
          keyMask: '...xyz1'
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/personas/${testPersonaId}/api-keys/${key.id}`,
        payload: { keyName: 'New Name' }
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.keyName).toBe('New Name')
    })

    it('updates API key value and re-encrypts', async () => {
      const key = await prisma.apiKey.create({
        data: {
          personaId: testPersonaId,
          provider: 'anthropic',
          keyName: 'My Key',
          encryptedKey: 'old-encrypted',
          keyMask: '...old1'
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/personas/${testPersonaId}/api-keys/${key.id}`,
        payload: { apiKey: 'sk-ant-new-key-87654321' }
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.keyMask).toBe('...4321')

      // Verify key was re-encrypted in database
      const dbKey = await prisma.apiKey.findUnique({ where: { id: key.id } })
      expect(dbKey?.encryptedKey).not.toBe('old-encrypted')
    })

    it('updates isActive status', async () => {
      const key = await prisma.apiKey.create({
        data: {
          personaId: testPersonaId,
          provider: 'anthropic',
          keyName: 'My Key',
          encryptedKey: 'encrypted',
          keyMask: '...xyz1',
          isActive: true
        }
      })

      const response = await app.inject({
        method: 'PUT',
        url: `/api/personas/${testPersonaId}/api-keys/${key.id}`,
        payload: { isActive: false }
      })

      expect(response.statusCode).toBe(200)
      const updated = response.json()
      expect(updated.isActive).toBe(false)
    })

    it('returns 404 when updating non-existent key', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/api/personas/${testPersonaId}/api-keys/00000000-0000-0000-0000-000000000000`,
        payload: { keyName: 'New Name' }
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toHaveProperty('error')
    })
  })

  describe('DELETE /api/personas/:personaId/api-keys/:keyId', () => {
    it('deletes an API key', async () => {
      const key = await prisma.apiKey.create({
        data: {
          personaId: testPersonaId,
          provider: 'anthropic',
          keyName: 'My Key',
          encryptedKey: 'encrypted',
          keyMask: '...xyz1'
        }
      })

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/personas/${testPersonaId}/api-keys/${key.id}`
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveProperty('message')

      // Verify key was deleted
      const deleted = await prisma.apiKey.findUnique({ where: { id: key.id } })
      expect(deleted).toBeNull()
    })

    it('returns 404 when deleting non-existent key', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/personas/${testPersonaId}/api-keys/00000000-0000-0000-0000-000000000000`
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toHaveProperty('error')
    })
  })

  describe('POST /api/personas/:personaId/api-keys/:keyId/validate', () => {
    it('validates an active API key', async () => {
      const key = await prisma.apiKey.create({
        data: {
          personaId: testPersonaId,
          provider: 'anthropic',
          keyName: 'My Key',
          encryptedKey: 'encrypted',
          keyMask: '...xyz1',
          isActive: true
        }
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/personas/${testPersonaId}/api-keys/${key.id}/validate`
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveProperty('valid', true)
    })

    it('returns 404 for inactive API key', async () => {
      const key = await prisma.apiKey.create({
        data: {
          personaId: testPersonaId,
          provider: 'anthropic',
          keyName: 'My Key',
          encryptedKey: 'encrypted',
          keyMask: '...xyz1',
          isActive: false
        }
      })

      const response = await app.inject({
        method: 'POST',
        url: `/api/personas/${testPersonaId}/api-keys/${key.id}/validate`
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('GET /api/personas/:personaId/api-keys/resolve', () => {
    it('resolves user-level key when available', async () => {
      const response1 = await app.inject({
        method: 'POST',
        url: `/api/personas/${testPersonaId}/api-keys`,
        payload: {
          provider: 'anthropic',
          keyName: 'User Key',
          apiKey: 'sk-ant-user-key-12345678'
        }
      })
      expect(response1.statusCode).toBe(201)

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${testPersonaId}/api-keys/resolve?provider=anthropic`
      })

      expect(response.statusCode).toBe(200)
      const resolved = response.json()
      expect(resolved).toHaveProperty('apiKey')
      expect(resolved.source).toBe('user')
    })

    it('falls back to admin key when user key not available', async () => {
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        payload: {
          provider: 'anthropic',
          keyName: 'Admin Key',
          apiKey: 'sk-ant-admin-key-87654321'
        }
      })
      expect(response1.statusCode).toBe(201)

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${testPersonaId}/api-keys/resolve?provider=anthropic`
      })

      expect(response.statusCode).toBe(200)
      const resolved = response.json()
      expect(resolved.source).toBe('admin')
    })

    it('falls back to environment variable when no database keys', async () => {
      process.env.ANTHROPIC_API_KEY = 'env-test-key'

      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${testPersonaId}/api-keys/resolve?provider=anthropic`
      })

      expect(response.statusCode).toBe(200)
      const resolved = response.json()
      expect(resolved.source).toBe('env')
      expect(resolved.apiKey).toBe('env-test-key')

      delete process.env.ANTHROPIC_API_KEY
    })

    it('returns 404 when no key found anywhere', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/personas/${testPersonaId}/api-keys/resolve?provider=nonexistent`
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toHaveProperty('error')
    })
  })

  describe('GET /api/admin/api-keys', () => {
    it('returns admin-level API keys only', async () => {
      await prisma.apiKey.createMany({
        data: [
          {
            personaId: null,
            provider: 'anthropic',
            keyName: 'Admin Anthropic',
            encryptedKey: 'encrypted1',
            keyMask: '...adm1'
          },
          {
            personaId: testPersonaId,
            provider: 'openai',
            keyName: 'User OpenAI',
            encryptedKey: 'encrypted2',
            keyMask: '...usr1'
          },
          {
            personaId: null,
            provider: 'google',
            keyName: 'Admin Google',
            encryptedKey: 'encrypted3',
            keyMask: '...adm2'
          }
        ]
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/api-keys'
      })

      expect(response.statusCode).toBe(200)
      const keys = response.json()
      expect(keys).toHaveLength(2)
      expect(keys.every((k: { personaId: string | null }) => k.personaId === null)).toBe(true)
    })
  })

  describe('POST /api/admin/api-keys', () => {
    it('creates an admin-level API key', async () => {
      const newKey = {
        provider: 'anthropic',
        keyName: 'Admin Key',
        apiKey: 'sk-ant-admin-key-12345678'
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        payload: newKey
      })

      expect(response.statusCode).toBe(201)
      const created = response.json()
      expect(created.personaId).toBeNull()
      expect(created.provider).toBe('anthropic')
      expect(created.keyName).toBe('Admin Key')
    })

    it('returns 409 when creating duplicate admin key for same provider', async () => {
      const newKey = {
        provider: 'anthropic',
        keyName: 'Admin Key',
        apiKey: 'sk-ant-admin-key-12345678'
      }

      const response1 = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        payload: newKey
      })
      expect(response1.statusCode).toBe(201)

      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        payload: newKey
      })

      expect(response.statusCode).toBe(409)
      expect(response.json()).toHaveProperty('error')
    })
  })
})
