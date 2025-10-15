import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { prisma } from '../../src/lib/prisma.js'
import { resolveApiKey } from '../../src/services/api-key-service.js'
import { encryptApiKey } from '../../src/lib/encryption.js'

/**
 * Integration tests for API key resolution.
 * Tests the resolution chain: User key → Admin key → Environment variable.
 */
describe('API Key Resolution Integration', () => {
  let testUserId: string
  let otherUserId: string

  beforeAll(async () => {
    // Nothing to initialize
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    // Clean database
    await prisma.apiKey.deleteMany()
    await prisma.session.deleteMany()
    await prisma.annotation.deleteMany()
    await prisma.videoSummary.deleteMany()
    await prisma.ontology.deleteMany()
    await prisma.persona.deleteMany()
    await prisma.user.deleteMany()

    // Create test users
    const user1 = await prisma.user.create({
      data: {
        username: 'user1',
        email: 'user1@example.com',
        displayName: 'User One',
        isAdmin: false
      }
    })
    testUserId = user1.id

    const user2 = await prisma.user.create({
      data: {
        username: 'user2',
        email: 'user2@example.com',
        displayName: 'User Two',
        isAdmin: false
      }
    })
    otherUserId = user2.id

    // Clear any existing environment variables
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.OPENAI_API_KEY
    delete process.env.GOOGLE_API_KEY
  })

  describe('User key takes precedence', () => {
    it('uses user key when both user and admin keys exist', async () => {
      // Create user key
      const userKey = 'sk-user-anthropic-key-12345'
      const { encrypted: userEncrypted } = encryptApiKey(userKey)
      await prisma.apiKey.create({
        data: {
          userId: testUserId,
          provider: 'ANTHROPIC',
          keyName: 'User Key',
          encryptedKey: userEncrypted,
          keyMask: '...2345',
          isActive: true,
          usageCount: 0
        }
      })

      // Create admin key
      const adminKey = 'sk-admin-anthropic-key-67890'
      const { encrypted: adminEncrypted } = encryptApiKey(adminKey)
      await prisma.apiKey.create({
        data: {
          userId: null,
          provider: 'ANTHROPIC',
          keyName: 'Admin Key',
          encryptedKey: adminEncrypted,
          keyMask: '...7890',
          isActive: true,
          usageCount: 0
        }
      })

      // Resolve key
      const resolved = await resolveApiKey(prisma, testUserId, 'ANTHROPIC')

      expect(resolved).toBe(userKey)
      expect(resolved).not.toBe(adminKey)
    })

    it('uses user key when environment variable also exists', async () => {
      // Set environment variable
      process.env.ANTHROPIC_API_KEY = 'sk-env-anthropic-key'

      // Create user key
      const userKey = 'sk-user-anthropic-key-12345'
      const { encrypted } = encryptApiKey(userKey)
      await prisma.apiKey.create({
        data: {
          userId: testUserId,
          provider: 'ANTHROPIC',
          keyName: 'User Key',
          encryptedKey: encrypted,
          keyMask: '...2345',
          isActive: true,
          usageCount: 0
        }
      })

      const resolved = await resolveApiKey(prisma, testUserId, 'ANTHROPIC')

      expect(resolved).toBe(userKey)
      expect(resolved).not.toBe(process.env.ANTHROPIC_API_KEY)

      // Clean up
      delete process.env.ANTHROPIC_API_KEY
    })
  })

  describe('Admin key used when user has no key', () => {
    it('uses admin key when user has no key for provider', async () => {
      // Create admin key
      const adminKey = 'sk-admin-anthropic-key-67890'
      const { encrypted } = encryptApiKey(adminKey)
      await prisma.apiKey.create({
        data: {
          userId: null,
          provider: 'ANTHROPIC',
          keyName: 'Admin Key',
          encryptedKey: encrypted,
          keyMask: '...7890',
          isActive: true,
          usageCount: 0
        }
      })

      const resolved = await resolveApiKey(prisma, testUserId, 'ANTHROPIC')

      expect(resolved).toBe(adminKey)
    })

    it('uses admin key when environment variable also exists', async () => {
      // Set environment variable
      process.env.OPENAI_API_KEY = 'sk-env-openai-key'

      // Create admin key
      const adminKey = 'sk-admin-openai-key-12345'
      const { encrypted } = encryptApiKey(adminKey)
      await prisma.apiKey.create({
        data: {
          userId: null,
          provider: 'OPENAI',
          keyName: 'Admin OpenAI Key',
          encryptedKey: encrypted,
          keyMask: '...2345',
          isActive: true,
          usageCount: 0
        }
      })

      const resolved = await resolveApiKey(prisma, testUserId, 'OPENAI')

      expect(resolved).toBe(adminKey)
      expect(resolved).not.toBe(process.env.OPENAI_API_KEY)

      // Clean up
      delete process.env.OPENAI_API_KEY
    })
  })

  describe('Environment variable used as fallback', () => {
    it('uses environment variable when no user or admin key exists', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-env-anthropic-key-99999'

      const resolved = await resolveApiKey(prisma, testUserId, 'ANTHROPIC')

      expect(resolved).toBe(process.env.ANTHROPIC_API_KEY)

      delete process.env.ANTHROPIC_API_KEY
    })

    it('uses environment variable when keys are inactive', async () => {
      process.env.OPENAI_API_KEY = 'sk-env-openai-key'

      // Create inactive user key
      const userKey = 'sk-user-openai-key-inactive'
      const { encrypted: userEncrypted } = encryptApiKey(userKey)
      await prisma.apiKey.create({
        data: {
          userId: testUserId,
          provider: 'OPENAI',
          keyName: 'Inactive User Key',
          encryptedKey: userEncrypted,
          keyMask: '...tive',
          isActive: false,
          usageCount: 0
        }
      })

      // Create inactive admin key
      const adminKey = 'sk-admin-openai-key-inactive'
      const { encrypted: adminEncrypted } = encryptApiKey(adminKey)
      await prisma.apiKey.create({
        data: {
          userId: null,
          provider: 'OPENAI',
          keyName: 'Inactive Admin Key',
          encryptedKey: adminEncrypted,
          keyMask: '...tive',
          isActive: false,
          usageCount: 0
        }
      })

      const resolved = await resolveApiKey(prisma, testUserId, 'OPENAI')

      expect(resolved).toBe(process.env.OPENAI_API_KEY)

      delete process.env.OPENAI_API_KEY
    })
  })

  describe('Error when no key found', () => {
    it('returns null when no key found at any level', async () => {
      const resolved = await resolveApiKey(prisma, testUserId, 'ANTHROPIC')

      expect(resolved).toBeNull()
    })

    it('returns null for unknown provider', async () => {
      // Create keys for different provider
      const { encrypted } = encryptApiKey('sk-anthropic-key')
      await prisma.apiKey.create({
        data: {
          userId: testUserId,
          provider: 'ANTHROPIC',
          keyName: 'Anthropic Key',
          encryptedKey: encrypted,
          keyMask: '...key',
          isActive: true,
          usageCount: 0
        }
      })

      // Try to resolve key for different provider
      const resolved = await resolveApiKey(prisma, testUserId, 'OPENAI')

      expect(resolved).toBeNull()
    })
  })

  describe('Key updates reflect immediately', () => {
    it('uses updated user key immediately', async () => {
      // Create initial user key
      const initialKey = 'sk-user-initial-key'
      const { encrypted: initialEncrypted, mask: initialMask } = encryptApiKey(initialKey)
      const apiKey = await prisma.apiKey.create({
        data: {
          userId: testUserId,
          provider: 'ANTHROPIC',
          keyName: 'User Key',
          encryptedKey: initialEncrypted,
          keyMask: initialMask,
          isActive: true,
          usageCount: 0
        }
      })

      // Resolve initial key
      let resolved = await resolveApiKey(prisma, testUserId, 'ANTHROPIC')
      expect(resolved).toBe(initialKey)

      // Update key
      const updatedKey = 'sk-user-updated-key'
      const { encrypted: updatedEncrypted, mask: updatedMask } = encryptApiKey(updatedKey)
      await prisma.apiKey.update({
        where: { id: apiKey.id },
        data: {
          encryptedKey: updatedEncrypted,
          keyMask: updatedMask
        }
      })

      // Resolve updated key
      resolved = await resolveApiKey(prisma, testUserId, 'ANTHROPIC')
      expect(resolved).toBe(updatedKey)
    })

    it('uses admin key when user key is deactivated', async () => {
      // Create user key
      const userKey = 'sk-user-key'
      const { encrypted: userEncrypted } = encryptApiKey(userKey)
      const userApiKey = await prisma.apiKey.create({
        data: {
          userId: testUserId,
          provider: 'ANTHROPIC',
          keyName: 'User Key',
          encryptedKey: userEncrypted,
          keyMask: '...key',
          isActive: true,
          usageCount: 0
        }
      })

      // Create admin key
      const adminKey = 'sk-admin-key'
      const { encrypted: adminEncrypted } = encryptApiKey(adminKey)
      await prisma.apiKey.create({
        data: {
          userId: null,
          provider: 'ANTHROPIC',
          keyName: 'Admin Key',
          encryptedKey: adminEncrypted,
          keyMask: '...key',
          isActive: true,
          usageCount: 0
        }
      })

      // Initially uses user key
      let resolved = await resolveApiKey(prisma, testUserId, 'ANTHROPIC')
      expect(resolved).toBe(userKey)

      // Deactivate user key
      await prisma.apiKey.update({
        where: { id: userApiKey.id },
        data: { isActive: false }
      })

      // Now uses admin key
      resolved = await resolveApiKey(prisma, testUserId, 'ANTHROPIC')
      expect(resolved).toBe(adminKey)
    })

    it('uses environment variable when all database keys are deleted', async () => {
      process.env.GOOGLE_API_KEY = 'sk-env-google-key'

      // Create user key
      const userKey = 'sk-user-google-key'
      const { encrypted } = encryptApiKey(userKey)
      const apiKey = await prisma.apiKey.create({
        data: {
          userId: testUserId,
          provider: 'GOOGLE',
          keyName: 'User Google Key',
          encryptedKey: encrypted,
          keyMask: '...key',
          isActive: true,
          usageCount: 0
        }
      })

      // Initially uses user key
      let resolved = await resolveApiKey(prisma, testUserId, 'GOOGLE')
      expect(resolved).toBe(userKey)

      // Delete user key
      await prisma.apiKey.delete({
        where: { id: apiKey.id }
      })

      // Now uses environment variable
      resolved = await resolveApiKey(prisma, testUserId, 'GOOGLE')
      expect(resolved).toBe(process.env.GOOGLE_API_KEY)

      delete process.env.GOOGLE_API_KEY
    })
  })

  describe('Usage statistics', () => {
    it('increments usage count when user key is resolved', async () => {
      // Create user key
      const userKey = 'sk-user-key'
      const { encrypted } = encryptApiKey(userKey)
      const apiKey = await prisma.apiKey.create({
        data: {
          userId: testUserId,
          provider: 'ANTHROPIC',
          keyName: 'User Key',
          encryptedKey: encrypted,
          keyMask: '...key',
          isActive: true,
          usageCount: 0
        }
      })

      // Resolve key multiple times
      await resolveApiKey(prisma, testUserId, 'ANTHROPIC')
      await resolveApiKey(prisma, testUserId, 'ANTHROPIC')
      await resolveApiKey(prisma, testUserId, 'ANTHROPIC')

      // Check usage count
      const updated = await prisma.apiKey.findUnique({
        where: { id: apiKey.id }
      })

      expect(updated!.usageCount).toBe(3)
      expect(updated!.lastUsed).not.toBeNull()
      expect(updated!.lastUsed!.getTime()).toBeGreaterThan(Date.now() - 5000)
    })

    it('increments usage count when admin key is resolved', async () => {
      // Create admin key
      const adminKey = 'sk-admin-key'
      const { encrypted } = encryptApiKey(adminKey)
      const apiKey = await prisma.apiKey.create({
        data: {
          userId: null,
          provider: 'ANTHROPIC',
          keyName: 'Admin Key',
          encryptedKey: encrypted,
          keyMask: '...key',
          isActive: true,
          usageCount: 0
        }
      })

      // Resolve key
      await resolveApiKey(prisma, testUserId, 'ANTHROPIC')

      // Check usage count
      const updated = await prisma.apiKey.findUnique({
        where: { id: apiKey.id }
      })

      expect(updated!.usageCount).toBe(1)
      expect(updated!.lastUsed).not.toBeNull()
    })

    it('does not track usage for environment variable keys', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-env-key'

      // Resolve key
      await resolveApiKey(prisma, testUserId, 'ANTHROPIC')

      // No database records should exist
      const keys = await prisma.apiKey.findMany()
      expect(keys).toHaveLength(0)

      delete process.env.ANTHROPIC_API_KEY
    })
  })

  describe('Multiple users', () => {
    it('each user uses their own key', async () => {
      // Create key for user 1
      const user1Key = 'sk-user1-anthropic-key'
      const { encrypted: user1Encrypted } = encryptApiKey(user1Key)
      await prisma.apiKey.create({
        data: {
          userId: testUserId,
          provider: 'ANTHROPIC',
          keyName: 'User 1 Key',
          encryptedKey: user1Encrypted,
          keyMask: '...er1',
          isActive: true,
          usageCount: 0
        }
      })

      // Create key for user 2
      const user2Key = 'sk-user2-anthropic-key'
      const { encrypted: user2Encrypted } = encryptApiKey(user2Key)
      await prisma.apiKey.create({
        data: {
          userId: otherUserId,
          provider: 'ANTHROPIC',
          keyName: 'User 2 Key',
          encryptedKey: user2Encrypted,
          keyMask: '...er2',
          isActive: true,
          usageCount: 0
        }
      })

      // Resolve keys for each user
      const resolved1 = await resolveApiKey(prisma, testUserId, 'ANTHROPIC')
      const resolved2 = await resolveApiKey(prisma, otherUserId, 'ANTHROPIC')

      expect(resolved1).toBe(user1Key)
      expect(resolved2).toBe(user2Key)
      expect(resolved1).not.toBe(resolved2)
    })

    it('user without key falls back to admin key', async () => {
      // Create key for user 1
      const user1Key = 'sk-user1-anthropic-key'
      const { encrypted: user1Encrypted } = encryptApiKey(user1Key)
      await prisma.apiKey.create({
        data: {
          userId: testUserId,
          provider: 'ANTHROPIC',
          keyName: 'User 1 Key',
          encryptedKey: user1Encrypted,
          keyMask: '...er1',
          isActive: true,
          usageCount: 0
        }
      })

      // Create admin key
      const adminKey = 'sk-admin-anthropic-key'
      const { encrypted: adminEncrypted } = encryptApiKey(adminKey)
      await prisma.apiKey.create({
        data: {
          userId: null,
          provider: 'ANTHROPIC',
          keyName: 'Admin Key',
          encryptedKey: adminEncrypted,
          keyMask: '...min',
          isActive: true,
          usageCount: 0
        }
      })

      // User 1 gets their own key
      const resolved1 = await resolveApiKey(prisma, testUserId, 'ANTHROPIC')
      expect(resolved1).toBe(user1Key)

      // User 2 (no key) gets admin key
      const resolved2 = await resolveApiKey(prisma, otherUserId, 'ANTHROPIC')
      expect(resolved2).toBe(adminKey)
    })
  })
})
