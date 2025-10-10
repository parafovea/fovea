import { PrismaClient, ApiKey } from '@prisma/client'
import { encryptApiKey, decryptApiKey } from '../lib/encryption.js'

/**
 * API key without sensitive data.
 * Excludes encryptedKey for security.
 */
export type SafeApiKey = Omit<ApiKey, 'encryptedKey'>

/**
 * Get all API keys for a user or admin keys.
 *
 * @param prisma - Prisma client instance
 * @param userId - User ID to filter by, or null for admin keys
 * @returns Array of API keys without encrypted data
 */
export async function getApiKeys(
  prisma: PrismaClient,
  userId: string | null
): Promise<SafeApiKey[]> {
  const keys = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  })

  return keys.map(({ encryptedKey, ...rest }) => rest)
}

/**
 * Get a single API key by ID.
 *
 * @param prisma - Prisma client instance
 * @param keyId - API key UUID
 * @param userId - User ID to verify ownership, or null for admin keys
 * @returns API key without encrypted data, or null if not found
 */
export async function getApiKey(
  prisma: PrismaClient,
  keyId: string,
  userId: string | null
): Promise<SafeApiKey | null> {
  const key = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      userId
    }
  })

  if (!key) {
    return null
  }

  const { encryptedKey, ...rest } = key
  return rest
}

/**
 * Create a new API key.
 *
 * @param prisma - Prisma client instance
 * @param data - API key data
 * @param data.userId - User ID or null for admin key
 * @param data.provider - Provider name (ANTHROPIC, OPENAI, GOOGLE)
 * @param data.keyName - Human-readable key name
 * @param data.apiKey - Plaintext API key to encrypt
 * @returns Created API key without encrypted data
 */
export async function createApiKey(
  prisma: PrismaClient,
  data: {
    userId: string | null
    provider: string
    keyName: string
    apiKey: string
  }
): Promise<SafeApiKey> {
  const { encrypted, mask } = encryptApiKey(data.apiKey)

  const key = await prisma.apiKey.create({
    data: {
      userId: data.userId,
      provider: data.provider,
      keyName: data.keyName,
      encryptedKey: encrypted,
      keyMask: mask,
      isActive: true,
      usageCount: 0
    }
  })

  const { encryptedKey, ...rest } = key
  return rest
}

/**
 * Update an API key.
 *
 * @param prisma - Prisma client instance
 * @param keyId - API key UUID
 * @param userId - User ID to verify ownership, or null for admin keys
 * @param data - Fields to update
 * @param data.keyName - Updated key name
 * @param data.apiKey - Updated plaintext API key (will be re-encrypted)
 * @param data.isActive - Updated active status
 * @returns Updated API key without encrypted data, or null if not found
 */
export async function updateApiKey(
  prisma: PrismaClient,
  keyId: string,
  userId: string | null,
  data: {
    keyName?: string
    apiKey?: string
    isActive?: boolean
  }
): Promise<SafeApiKey | null> {
  // Build update data
  const updateData: {
    keyName?: string
    encryptedKey?: string
    keyMask?: string
    isActive?: boolean
  } = {}

  if (data.keyName !== undefined) {
    updateData.keyName = data.keyName
  }
  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive
  }
  if (data.apiKey) {
    const { encrypted, mask } = encryptApiKey(data.apiKey)
    updateData.encryptedKey = encrypted
    updateData.keyMask = mask
  }

  try {
    const key = await prisma.apiKey.update({
      where: {
        id: keyId,
        userId
      },
      data: updateData
    })

    const { encryptedKey, ...rest } = key
    return rest
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return null
    }
    throw error
  }
}

/**
 * Delete an API key.
 *
 * @param prisma - Prisma client instance
 * @param keyId - API key UUID
 * @param userId - User ID to verify ownership, or null for admin keys
 * @returns True if deleted, false if not found
 */
export async function deleteApiKey(
  prisma: PrismaClient,
  keyId: string,
  userId: string | null
): Promise<boolean> {
  try {
    await prisma.apiKey.delete({
      where: {
        id: keyId,
        userId
      }
    })
    return true
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') {
      return false
    }
    throw error
  }
}

/**
 * Resolve API key for use.
 * Checks user key, then admin key, then environment variable.
 * Updates usage statistics when key is found.
 *
 * @param prisma - Prisma client instance
 * @param userId - User ID to check for user-specific key
 * @param provider - Provider name (ANTHROPIC, OPENAI, GOOGLE)
 * @returns Decrypted API key string, or null if not found
 */
export async function resolveApiKey(
  prisma: PrismaClient,
  userId: string | null,
  provider: string
): Promise<string | null> {
  // Try user key first
  if (userId) {
    const userKey = await prisma.apiKey.findFirst({
      where: {
        userId,
        provider,
        isActive: true
      },
      orderBy: { createdAt: 'desc' }
    })

    if (userKey) {
      // Update usage stats
      await prisma.apiKey.update({
        where: { id: userKey.id },
        data: {
          usageCount: { increment: 1 },
          lastUsed: new Date()
        }
      })

      return decryptApiKey(userKey.encryptedKey)
    }
  }

  // Try admin key
  const adminKey = await prisma.apiKey.findFirst({
    where: {
      userId: null,
      provider,
      isActive: true
    },
    orderBy: { createdAt: 'desc' }
  })

  if (adminKey) {
    // Update usage stats
    await prisma.apiKey.update({
      where: { id: adminKey.id },
      data: {
        usageCount: { increment: 1 },
        lastUsed: new Date()
      }
    })

    return decryptApiKey(adminKey.encryptedKey)
  }

  // Try environment variable
  const envVarName = `${provider.toUpperCase()}_API_KEY`
  const envKey = process.env[envVarName]

  return envKey || null
}

/**
 * Validate that an API key exists and is active.
 *
 * @param prisma - Prisma client instance
 * @param keyId - API key UUID
 * @param userId - User ID to verify ownership, or null for admin keys
 * @returns True if key exists and is active, false otherwise
 */
export async function validateApiKey(
  prisma: PrismaClient,
  keyId: string,
  userId: string | null
): Promise<boolean> {
  const key = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      userId,
      isActive: true
    }
  })

  return key !== null
}
