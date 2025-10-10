import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import * as apiKeyService from '../../src/services/api-key-service.js'

/**
 * Unit tests for API key service layer.
 * Tests service functions with real Prisma client and database.
 */
describe('API Key Service', () => {
  let prisma: PrismaClient
  let testPersonaId: string

  beforeAll(async () => {
    prisma = new PrismaClient()

    // Set encryption key for tests
    if (!process.env.API_KEY_ENCRYPTION_KEY) {
      process.env.API_KEY_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
    }
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.apiKey.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()

    // Create test persona
    const persona = await prisma.persona.create({
      data: {
        name: 'Test Persona',
        role: 'Test Role',
        informationNeed: 'Test information need'
      }
    })
    testPersonaId = persona.id
  })

  describe('createApiKey', () => {
    it('creates an API key with encryption', async () => {
      const params = {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'My Test Key',
        apiKey: 'sk-ant-test-key-12345678'
      }

      const result = await apiKeyService.createApiKey(prisma, params)

      expect(result).toHaveProperty('id')
      expect(result.personaId).toBe(testPersonaId)
      expect(result.provider).toBe('anthropic')
      expect(result.keyName).toBe('My Test Key')
      expect(result.keyMask).toBe('...5678')
      expect(result.isActive).toBe(true)
      expect(result.usageCount).toBe(0)
      expect(result).not.toHaveProperty('encryptedKey')
    })

    it('creates admin-level API key when personaId is null', async () => {
      const params = {
        personaId: null,
        provider: 'openai',
        keyName: 'Admin Key',
        apiKey: 'sk-proj-admin-key-87654321'
      }

      const result = await apiKeyService.createApiKey(prisma, params)

      expect(result.personaId).toBeNull()
      expect(result.provider).toBe('openai')
      expect(result.keyMask).toBe('...4321')
    })

    it('stores encrypted key in database', async () => {
      const params = {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Test Key',
        apiKey: 'sk-ant-test-key-12345678'
      }

      const result = await apiKeyService.createApiKey(prisma, params)

      const dbKey = await prisma.apiKey.findUnique({ where: { id: result.id } })
      expect(dbKey?.encryptedKey).toBeDefined()
      expect(dbKey?.encryptedKey).not.toBe('sk-ant-test-key-12345678')
    })
  })

  describe('getApiKeys', () => {
    it('returns all API keys for a persona', async () => {
      await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Key 1',
        apiKey: 'key1'
      })

      await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'openai',
        keyName: 'Key 2',
        apiKey: 'key2'
      })

      const keys = await apiKeyService.getApiKeys(prisma, testPersonaId)

      expect(keys).toHaveLength(2)
      expect(keys[0]).not.toHaveProperty('encryptedKey')
    })

    it('returns empty array when no keys exist', async () => {
      const keys = await apiKeyService.getApiKeys(prisma, testPersonaId)
      expect(keys).toEqual([])
    })

    it('returns only admin keys when personaId is null', async () => {
      await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'User Key',
        apiKey: 'user-key'
      })

      await apiKeyService.createApiKey(prisma, {
        personaId: null,
        provider: 'openai',
        keyName: 'Admin Key',
        apiKey: 'admin-key'
      })

      const keys = await apiKeyService.getApiKeys(prisma, null)

      expect(keys).toHaveLength(1)
      expect(keys[0].personaId).toBeNull()
    })

    it('returns keys sorted by creation date (newest first)', async () => {
      await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Older Key',
        apiKey: 'key1'
      })

      await new Promise(resolve => setTimeout(resolve, 10))

      await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'openai',
        keyName: 'Newer Key',
        apiKey: 'key2'
      })

      const keys = await apiKeyService.getApiKeys(prisma, testPersonaId)

      expect(keys[0].keyName).toBe('Newer Key')
      expect(keys[1].keyName).toBe('Older Key')
    })
  })

  describe('getApiKey', () => {
    it('returns a specific API key', async () => {
      const created = await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Test Key',
        apiKey: 'test-key'
      })

      const retrieved = await apiKeyService.getApiKey(prisma, created.id, testPersonaId)

      expect(retrieved).not.toBeNull()
      expect(retrieved?.id).toBe(created.id)
      expect(retrieved?.keyName).toBe('Test Key')
    })

    it('returns null when key not found', async () => {
      const result = await apiKeyService.getApiKey(
        prisma,
        '00000000-0000-0000-0000-000000000000',
        testPersonaId
      )

      expect(result).toBeNull()
    })

    it('returns null when personaId does not match', async () => {
      const created = await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Test Key',
        apiKey: 'test-key'
      })

      const result = await apiKeyService.getApiKey(
        prisma,
        created.id,
        '00000000-0000-0000-0000-000000000000'
      )

      expect(result).toBeNull()
    })
  })

  describe('deleteApiKey', () => {
    it('deletes an API key and returns true', async () => {
      const created = await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Test Key',
        apiKey: 'test-key'
      })

      const result = await apiKeyService.deleteApiKey(prisma, created.id, testPersonaId)

      expect(result).toBe(true)

      const deleted = await prisma.apiKey.findUnique({ where: { id: created.id } })
      expect(deleted).toBeNull()
    })

    it('returns false when key not found', async () => {
      const result = await apiKeyService.deleteApiKey(
        prisma,
        '00000000-0000-0000-0000-000000000000',
        testPersonaId
      )

      expect(result).toBe(false)
    })
  })

  describe('updateApiKey', () => {
    it('updates API key name', async () => {
      const created = await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Old Name',
        apiKey: 'test-key'
      })

      const updated = await apiKeyService.updateApiKey(
        prisma,
        created.id,
        testPersonaId,
        { keyName: 'New Name' }
      )

      expect(updated).not.toBeNull()
      expect(updated?.keyName).toBe('New Name')
    })

    it('updates API key value and re-encrypts', async () => {
      const created = await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Test Key',
        apiKey: 'old-key-12345678'
      })

      const oldDbKey = await prisma.apiKey.findUnique({ where: { id: created.id } })

      const updated = await apiKeyService.updateApiKey(
        prisma,
        created.id,
        testPersonaId,
        { apiKey: 'new-key-87654321' }
      )

      expect(updated?.keyMask).toBe('...4321')

      const newDbKey = await prisma.apiKey.findUnique({ where: { id: created.id } })
      expect(newDbKey?.encryptedKey).not.toBe(oldDbKey?.encryptedKey)
    })

    it('updates isActive flag', async () => {
      const created = await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Test Key',
        apiKey: 'test-key'
      })

      const updated = await apiKeyService.updateApiKey(
        prisma,
        created.id,
        testPersonaId,
        { isActive: false }
      )

      expect(updated?.isActive).toBe(false)
    })

    it('returns null when key not found', async () => {
      const result = await apiKeyService.updateApiKey(
        prisma,
        '00000000-0000-0000-0000-000000000000',
        testPersonaId,
        { keyName: 'New Name' }
      )

      expect(result).toBeNull()
    })
  })

  describe('resolveApiKey', () => {
    it('returns user-level key when available', async () => {
      await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'User Key',
        apiKey: 'user-test-key-12345678'
      })

      const resolved = await apiKeyService.resolveApiKey(prisma, testPersonaId, 'anthropic')

      expect(resolved).toBe('user-test-key-12345678')
    })

    it('falls back to admin key when user key not available', async () => {
      await apiKeyService.createApiKey(prisma, {
        personaId: null,
        provider: 'anthropic',
        keyName: 'Admin Key',
        apiKey: 'admin-test-key-87654321'
      })

      const resolved = await apiKeyService.resolveApiKey(prisma, testPersonaId, 'anthropic')

      expect(resolved).toBe('admin-test-key-87654321')
    })

    it('prefers user key over admin key', async () => {
      await apiKeyService.createApiKey(prisma, {
        personaId: null,
        provider: 'anthropic',
        keyName: 'Admin Key',
        apiKey: 'admin-key'
      })

      await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'User Key',
        apiKey: 'user-key'
      })

      const resolved = await apiKeyService.resolveApiKey(prisma, testPersonaId, 'anthropic')

      expect(resolved).toBe('user-key')
    })

    it('returns null when no key found', async () => {
      const resolved = await apiKeyService.resolveApiKey(prisma, testPersonaId, 'nonexistent')

      expect(resolved).toBeNull()
    })

    it('ignores inactive keys', async () => {
      await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Test Key',
        apiKey: 'test-key'
      })

      const created = await prisma.apiKey.findFirst({
        where: { personaId: testPersonaId, provider: 'anthropic' }
      })

      await prisma.apiKey.update({
        where: { id: created!.id },
        data: { isActive: false }
      })

      const resolved = await apiKeyService.resolveApiKey(prisma, testPersonaId, 'anthropic')

      expect(resolved).toBeNull()
    })
  })

  describe('incrementKeyUsage', () => {
    it('increments usage count and updates lastUsed timestamp', async () => {
      const created = await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Test Key',
        apiKey: 'test-key'
      })

      expect(created.usageCount).toBe(0)
      expect(created.lastUsed).toBeNull()

      await apiKeyService.incrementKeyUsage(prisma, created.id)

      const updated = await prisma.apiKey.findUnique({ where: { id: created.id } })

      expect(updated?.usageCount).toBe(1)
      expect(updated?.lastUsed).not.toBeNull()
      expect(updated?.lastUsed).toBeInstanceOf(Date)
    })

    it('increments usage count multiple times', async () => {
      const created = await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Test Key',
        apiKey: 'test-key'
      })

      await apiKeyService.incrementKeyUsage(prisma, created.id)
      await apiKeyService.incrementKeyUsage(prisma, created.id)
      await apiKeyService.incrementKeyUsage(prisma, created.id)

      const updated = await prisma.apiKey.findUnique({ where: { id: created.id } })

      expect(updated?.usageCount).toBe(3)
    })
  })

  describe('validateApiKey', () => {
    it('returns true for active key', async () => {
      const created = await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Test Key',
        apiKey: 'test-key'
      })

      const valid = await apiKeyService.validateApiKey(prisma, created.id, testPersonaId)

      expect(valid).toBe(true)
    })

    it('returns false for inactive key', async () => {
      const created = await apiKeyService.createApiKey(prisma, {
        personaId: testPersonaId,
        provider: 'anthropic',
        keyName: 'Test Key',
        apiKey: 'test-key'
      })

      await prisma.apiKey.update({
        where: { id: created.id },
        data: { isActive: false }
      })

      const valid = await apiKeyService.validateApiKey(prisma, created.id, testPersonaId)

      expect(valid).toBe(false)
    })

    it('returns false for non-existent key', async () => {
      const valid = await apiKeyService.validateApiKey(
        prisma,
        '00000000-0000-0000-0000-000000000000',
        testPersonaId
      )

      expect(valid).toBe(false)
    })
  })
})
