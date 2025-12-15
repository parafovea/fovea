import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { buildApp } from '../../src/app.js'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../../src/lib/password.js'
import { decryptApiKey } from '../../src/lib/encryption.js'

/**
 * Integration tests for API Key Routes.
 * Tests user and admin API key operations including CRUD, encryption, and authorization.
 */
describe('API Key Routes', () => {
  let app: FastifyInstance
  let prisma: PrismaClient
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let adminUserId: string
  let adminSessionToken: string
  let regularUserId: string
  let regularSessionToken: string

  beforeAll(async () => {
    app = await buildApp()
    prisma = app.prisma
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Clean database in dependency order
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()

    // Create admin user
    const adminPasswordHash = await hashPassword('adminpass123')
    const adminUser = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@example.com',
        passwordHash: adminPasswordHash,
        displayName: 'Admin User',
        isAdmin: true
      }
    })
    adminUserId = adminUser.id

    // Create regular user
    const userPasswordHash = await hashPassword('userpass123')
    const regularUser = await prisma.user.create({
      data: {
        username: 'regular',
        email: 'regular@example.com',
        passwordHash: userPasswordHash,
        displayName: 'Regular User',
        isAdmin: false
      }
    })
    regularUserId = regularUser.id

    // Get admin session token
    const adminLoginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'adminpass123' }
    })
    const adminCookie = adminLoginResponse.cookies.find((c) => c.name === 'session_token')
    adminSessionToken = adminCookie!.value

    // Get regular user session token
    const userLoginResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'regular', password: 'userpass123' }
    })
    const userCookie = userLoginResponse.cookies.find((c) => c.name === 'session_token')
    regularSessionToken = userCookie!.value
  })

  describe('User API Key Operations', () => {
    describe('GET /api/api-keys', () => {
      it('returns current user API keys', async () => {
        // Create API key for regular user
        await prisma.apiKey.create({
          data: {
            userId: regularUserId,
            provider: 'ANTHROPIC',
            keyName: 'My Anthropic Key',
            encryptedKey: 'encrypted-key-data',
            keyMask: '...xyz1',
            isActive: true,
            usageCount: 0
          }
        })

        const response = await app.inject({
          method: 'GET',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken }
        })

        expect(response.statusCode).toBe(200)
        const keys = response.json()
        expect(keys).toHaveLength(1)
        expect(keys[0].provider).toBe('ANTHROPIC')
        expect(keys[0].keyName).toBe('My Anthropic Key')
        expect(keys[0].keyMask).toBe('...xyz1')
        expect(keys[0].userId).toBe(regularUserId)
      })

      it('masks encrypted keys in response', async () => {
        await prisma.apiKey.create({
          data: {
            userId: regularUserId,
            provider: 'OPENAI',
            keyName: 'OpenAI Key',
            encryptedKey: 'encrypted-key-data',
            keyMask: '...abc2',
            isActive: true,
            usageCount: 0
          }
        })

        const response = await app.inject({
          method: 'GET',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken }
        })

        expect(response.statusCode).toBe(200)
        const keys = response.json()
        expect(keys).toHaveLength(1)
        expect(keys[0].encryptedKey).toBeUndefined()
      })

      it('returns empty array for new user', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken }
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual([])
      })

      it('returns 401 without authentication', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/api-keys'
        })

        expect(response.statusCode).toBe(401)
      })
    })

    describe('POST /api/api-keys', () => {
      it('creates user API key', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'My Test Key',
            apiKey: 'sk-ant-test-key-12345'
          }
        })

        expect(response.statusCode).toBe(201)
        const key = response.json()
        expect(key.provider).toBe('ANTHROPIC')
        expect(key.keyName).toBe('My Test Key')
        expect(key.userId).toBe(regularUserId)
        expect(key.isActive).toBe(true)
        expect(key.usageCount).toBe(0)
        expect(key.id).toBeDefined()
        expect(key.encryptedKey).toBeUndefined()
      })

      it('enforces unique constraint per provider', async () => {
        // Create first key
        await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'First Key',
            apiKey: 'sk-ant-test-key-1'
          }
        })

        // Try to create second key for same provider
        const response = await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'Second Key',
            apiKey: 'sk-ant-test-key-2'
          }
        })

        expect(response.statusCode).toBe(409)
        expect(response.json().error).toBe('CONFLICT')
        expect(response.json().message).toContain('already exists')
      })

      it('encrypts key value', async () => {
        const plainKey = 'sk-ant-test-key-12345'

        const response = await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'Test Key',
            apiKey: plainKey
          }
        })

        expect(response.statusCode).toBe(201)
        const key = response.json()

        // Check database for encrypted key
        const dbKey = await prisma.apiKey.findUnique({
          where: { id: key.id }
        })

        expect(dbKey).toBeDefined()
        expect(dbKey!.encryptedKey).not.toBe(plainKey)
        expect(dbKey!.encryptedKey).toBeTruthy()

        // Verify key can be decrypted
        const decrypted = decryptApiKey(dbKey!.encryptedKey)
        expect(decrypted).toBe(plainKey)
      })

      it('validates required fields', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: '',
            apiKey: 'sk-ant-test'
          }
        })

        expect(response.statusCode).toBe(400)
      })

      it('validates provider is supported', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken },
          payload: {
            provider: 'INVALID_PROVIDER',
            keyName: 'Test Key',
            apiKey: 'test-key'
          }
        })

        expect(response.statusCode).toBe(400)
      })

      it('returns 401 without authentication', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'Test Key',
            apiKey: 'sk-ant-test'
          }
        })

        expect(response.statusCode).toBe(401)
      })
    })

    describe('PUT /api/api-keys/:keyId', () => {
      it('updates user API key', async () => {
        // Create key first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'Original Name',
            apiKey: 'sk-ant-original'
          }
        })
        const key = createResponse.json()

        // Update key
        const updateResponse = await app.inject({
          method: 'PUT',
          url: `/api/api-keys/${key.id}`,
          cookies: { session_token: regularSessionToken },
          payload: {
            keyName: 'Updated Name'
          }
        })

        expect(updateResponse.statusCode).toBe(200)
        const updated = updateResponse.json()
        expect(updated.keyName).toBe('Updated Name')
        expect(updated.provider).toBe('ANTHROPIC')
      })

      it('prevents updating other user keys', async () => {
        // Create key as admin
        const createResponse = await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          cookies: { session_token: adminSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'Admin Key',
            apiKey: 'sk-ant-admin'
          }
        })
        const adminKey = createResponse.json()

        // Try to update as regular user
        const updateResponse = await app.inject({
          method: 'PUT',
          url: `/api/api-keys/${adminKey.id}`,
          cookies: { session_token: regularSessionToken },
          payload: {
            keyName: 'Hacked Name'
          }
        })

        expect(updateResponse.statusCode).toBe(404)
      })

      it('maintains encryption on update', async () => {
        // Create key
        const createResponse = await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'Test Key',
            apiKey: 'sk-ant-original'
          }
        })
        const key = createResponse.json()

        // Update with new key value
        const newApiKey = 'sk-ant-updated-key-12345'
        await app.inject({
          method: 'PUT',
          url: `/api/api-keys/${key.id}`,
          cookies: { session_token: regularSessionToken },
          payload: {
            apiKey: newApiKey
          }
        })

        // Check database
        const dbKey = await prisma.apiKey.findUnique({
          where: { id: key.id }
        })

        expect(dbKey).toBeDefined()
        expect(dbKey!.encryptedKey).not.toBe(newApiKey)

        // Verify decryption
        const decrypted = decryptApiKey(dbKey!.encryptedKey)
        expect(decrypted).toBe(newApiKey)
      })

      it('returns 404 for non-existent key', async () => {
        const response = await app.inject({
          method: 'PUT',
          url: '/api/api-keys/00000000-0000-0000-0000-000000000000',
          cookies: { session_token: regularSessionToken },
          payload: {
            keyName: 'Updated Name'
          }
        })

        expect(response.statusCode).toBe(404)
      })

      it('returns 401 without authentication', async () => {
        const response = await app.inject({
          method: 'PUT',
          url: '/api/api-keys/some-id',
          payload: {
            keyName: 'Updated Name'
          }
        })

        expect(response.statusCode).toBe(401)
      })
    })

    describe('DELETE /api/api-keys/:keyId', () => {
      it('deletes user API key', async () => {
        // Create key
        const createResponse = await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          cookies: { session_token: regularSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'Test Key',
            apiKey: 'sk-ant-test'
          }
        })
        const key = createResponse.json()

        // Delete key
        const deleteResponse = await app.inject({
          method: 'DELETE',
          url: `/api/api-keys/${key.id}`,
          cookies: { session_token: regularSessionToken }
        })

        expect(deleteResponse.statusCode).toBe(200)
        expect(deleteResponse.json()).toEqual({ success: true })

        // Verify deleted from database
        const dbKey = await prisma.apiKey.findUnique({
          where: { id: key.id }
        })
        expect(dbKey).toBeNull()
      })

      it('prevents deleting other user keys', async () => {
        // Create key as admin
        const createResponse = await app.inject({
          method: 'POST',
          url: '/api/api-keys',
          cookies: { session_token: adminSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'Admin Key',
            apiKey: 'sk-ant-admin'
          }
        })
        const adminKey = createResponse.json()

        // Try to delete as regular user
        const deleteResponse = await app.inject({
          method: 'DELETE',
          url: `/api/api-keys/${adminKey.id}`,
          cookies: { session_token: regularSessionToken }
        })

        expect(deleteResponse.statusCode).toBe(404)

        // Verify key still exists
        const dbKey = await prisma.apiKey.findUnique({
          where: { id: adminKey.id }
        })
        expect(dbKey).not.toBeNull()
      })

      it('returns 404 for non-existent key', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/api/api-keys/00000000-0000-0000-0000-000000000000',
          cookies: { session_token: regularSessionToken }
        })

        expect(response.statusCode).toBe(404)
      })

      it('returns 401 without authentication', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/api/api-keys/some-id'
        })

        expect(response.statusCode).toBe(401)
      })
    })
  })

  describe('Admin API Key Operations', () => {
    describe('GET /api/admin/api-keys', () => {
      it('returns all admin API keys', async () => {
        // Create admin-level key
        await prisma.apiKey.create({
          data: {
            userId: null,
            provider: 'ANTHROPIC',
            keyName: 'System Anthropic Key',
            encryptedKey: 'encrypted-admin-key',
            keyMask: '...adm1',
            isActive: true,
            usageCount: 0
          }
        })

        const response = await app.inject({
          method: 'GET',
          url: '/api/admin/api-keys',
          cookies: { session_token: adminSessionToken }
        })

        expect(response.statusCode).toBe(200)
        const keys = response.json()
        expect(keys).toHaveLength(1)
        expect(keys[0].provider).toBe('ANTHROPIC')
        expect(keys[0].keyName).toBe('System Anthropic Key')
        expect(keys[0].userId).toBeNull()
        expect(keys[0].encryptedKey).toBeUndefined()
      })

      it('returns 403 for non-admin', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/admin/api-keys',
          cookies: { session_token: regularSessionToken }
        })

        expect(response.statusCode).toBe(403)
      })

      it('returns 401 without authentication', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/api/admin/api-keys'
        })

        expect(response.statusCode).toBe(401)
      })
    })

    describe('POST /api/admin/api-keys', () => {
      it('creates admin-level key with userId null', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/admin/api-keys',
          cookies: { session_token: adminSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'System Anthropic Key',
            apiKey: 'sk-ant-system-key'
          }
        })

        expect(response.statusCode).toBe(201)
        const key = response.json()
        expect(key.provider).toBe('ANTHROPIC')
        expect(key.keyName).toBe('System Anthropic Key')
        expect(key.userId).toBeNull()
        expect(key.isActive).toBe(true)
        expect(key.encryptedKey).toBeUndefined()

        // Verify in database
        const dbKey = await prisma.apiKey.findUnique({
          where: { id: key.id }
        })
        expect(dbKey).toBeDefined()
        expect(dbKey!.userId).toBeNull()
      })

      it('allows multiple admin keys for same provider', async () => {
        // Note: PostgreSQL treats NULL as not equal to NULL in unique constraints,
        // so multiple admin keys (userId: null) can exist for the same provider.
        // This is a known limitation of the current schema design.

        // Create first admin key
        const firstResponse = await app.inject({
          method: 'POST',
          url: '/api/admin/api-keys',
          cookies: { session_token: adminSessionToken },
          payload: {
            provider: 'OPENAI',
            keyName: 'System OpenAI Key 1',
            apiKey: 'sk-openai-key-1'
          }
        })
        expect(firstResponse.statusCode).toBe(201)

        // Create second admin key for same provider (currently allowed)
        const secondResponse = await app.inject({
          method: 'POST',
          url: '/api/admin/api-keys',
          cookies: { session_token: adminSessionToken },
          payload: {
            provider: 'OPENAI',
            keyName: 'System OpenAI Key 2',
            apiKey: 'sk-openai-key-2'
          }
        })

        // Currently succeeds due to NULL != NULL in PostgreSQL
        expect(secondResponse.statusCode).toBe(201)

        // Verify both keys exist
        const keys = await prisma.apiKey.findMany({
          where: { userId: null, provider: 'OPENAI' }
        })
        expect(keys).toHaveLength(2)
      })

      it('returns 403 for non-admin', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/admin/api-keys',
          cookies: { session_token: regularSessionToken },
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'Hacked System Key',
            apiKey: 'sk-ant-hacked'
          }
        })

        expect(response.statusCode).toBe(403)

        // Verify no key was created
        const keys = await prisma.apiKey.findMany({
          where: { userId: null }
        })
        expect(keys).toHaveLength(0)
      })

      it('returns 401 without authentication', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/admin/api-keys',
          payload: {
            provider: 'ANTHROPIC',
            keyName: 'System Key',
            apiKey: 'sk-ant-test'
          }
        })

        expect(response.statusCode).toBe(401)
      })
    })
  })

  describe('Authorization', () => {
    it('user endpoints return 401 without authentication', async () => {
      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/api-keys'
      })
      expect(getResponse.statusCode).toBe(401)

      const postResponse = await app.inject({
        method: 'POST',
        url: '/api/api-keys',
        payload: {
          provider: 'ANTHROPIC',
          keyName: 'Test',
          apiKey: 'test'
        }
      })
      expect(postResponse.statusCode).toBe(401)
    })

    it('admin endpoints return 403 for non-admin users', async () => {
      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/admin/api-keys',
        cookies: { session_token: regularSessionToken }
      })
      expect(getResponse.statusCode).toBe(403)

      const postResponse = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        cookies: { session_token: regularSessionToken },
        payload: {
          provider: 'ANTHROPIC',
          keyName: 'Test',
          apiKey: 'test'
        }
      })
      expect(postResponse.statusCode).toBe(403)
    })
  })

  describe('Validation', () => {
    it('validates provider is supported', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/api-keys',
        cookies: { session_token: regularSessionToken },
        payload: {
          provider: 'UNSUPPORTED',
          keyName: 'Test Key',
          apiKey: 'test-key'
        }
      })

      expect(response.statusCode).toBe(400)
    })

    it('validates keyName is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/api-keys',
        cookies: { session_token: regularSessionToken },
        payload: {
          provider: 'ANTHROPIC',
          keyName: '',
          apiKey: 'test-key'
        }
      })

      expect(response.statusCode).toBe(400)
    })

    it('validates keyValue is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/api-keys',
        cookies: { session_token: regularSessionToken },
        payload: {
          provider: 'ANTHROPIC',
          keyName: 'Test Key',
          apiKey: ''
        }
      })

      expect(response.statusCode).toBe(400)
    })
  })
})
