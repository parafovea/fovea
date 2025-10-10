import { PrismaClient } from '@prisma/client'
import { encryptApiKey, decryptApiKey } from '../lib/encryption.js'

/**
 * @interface CreateApiKeyParams
 * @description Parameters for creating a new API key.
 */
interface CreateApiKeyParams {
  personaId: string | null
  provider: string
  keyName: string
  apiKey: string
}

/**
 * @interface UpdateApiKeyParams
 * @description Parameters for updating an existing API key.
 */
interface UpdateApiKeyParams {
  keyName?: string
  apiKey?: string
  isActive?: boolean
}

/**
 * @interface ApiKeyResponse
 * @description API key data returned to clients with encrypted key omitted.
 */
interface ApiKeyResponse {
  id: string
  personaId: string | null
  provider: string
  keyName: string
  keyMask: string
  isActive: boolean
  lastUsed: Date | null
  usageCount: number
  createdAt: Date
  updatedAt: Date
}

/**
 * Create a new API key.
 * Encrypts the key before storing in database.
 *
 * @param prisma - Prisma client instance
 * @param params - API key parameters
 * @returns Created API key with masked value
 */
export async function createApiKey(
  prisma: PrismaClient,
  params: CreateApiKeyParams
): Promise<ApiKeyResponse> {
  const { personaId, provider, keyName, apiKey } = params

  // Check for existing key (handle NULL personaId case)
  const existing = await prisma.apiKey.findFirst({
    where: {
      personaId,
      provider
    }
  })

  if (existing) {
    // Throw Prisma-like error for consistent error handling
    const error = new Error('Unique constraint failed on the fields: (`personaId`,`provider`)') as Error & { code: string }
    error.code = 'P2002'
    throw error
  }

  const { encrypted, mask } = encryptApiKey(apiKey)

  const apiKeyRecord = await prisma.apiKey.create({
    data: {
      personaId,
      provider,
      keyName,
      encryptedKey: encrypted,
      keyMask: mask,
      isActive: true,
      usageCount: 0
    }
  })

  return toApiKeyResponse(apiKeyRecord)
}

/**
 * Get all API keys for a persona or admin.
 * Returns keys with masked values only.
 *
 * @param prisma - Prisma client instance
 * @param personaId - Persona UUID or null for admin keys
 * @returns Array of API keys
 */
export async function getApiKeys(
  prisma: PrismaClient,
  personaId: string | null
): Promise<ApiKeyResponse[]> {
  const keys = await prisma.apiKey.findMany({
    where: { personaId },
    orderBy: { createdAt: 'desc' }
  })

  return keys.map(toApiKeyResponse)
}

/**
 * Get a single API key by ID.
 * Returns key with masked value only.
 *
 * @param prisma - Prisma client instance
 * @param keyId - API key UUID
 * @param personaId - Persona UUID or null for admin keys
 * @returns API key or null if not found
 */
export async function getApiKey(
  prisma: PrismaClient,
  keyId: string,
  personaId: string | null
): Promise<ApiKeyResponse | null> {
  const key = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      personaId
    }
  })

  return key ? toApiKeyResponse(key) : null
}

/**
 * Delete an API key.
 *
 * @param prisma - Prisma client instance
 * @param keyId - API key UUID
 * @param personaId - Persona UUID or null for admin keys
 * @returns True if deleted, false if not found
 */
export async function deleteApiKey(
  prisma: PrismaClient,
  keyId: string,
  personaId: string | null
): Promise<boolean> {
  const result = await prisma.apiKey.deleteMany({
    where: {
      id: keyId,
      personaId
    }
  })
  return result.count > 0
}

/**
 * Update an API key.
 * Re-encrypts key if apiKey is provided in updates.
 *
 * @param prisma - Prisma client instance
 * @param keyId - API key UUID
 * @param personaId - Persona UUID or null for admin keys
 * @param updates - Fields to update
 * @returns Updated API key or null if not found
 */
export async function updateApiKey(
  prisma: PrismaClient,
  keyId: string,
  personaId: string | null,
  updates: UpdateApiKeyParams
): Promise<ApiKeyResponse | null> {
  // First check if key exists and matches personaId
  const existing = await prisma.apiKey.findFirst({
    where: {
      id: keyId,
      personaId
    }
  })

  if (!existing) {
    return null
  }

  const data: Record<string, unknown> = {}

  if (updates.keyName !== undefined) {
    data.keyName = updates.keyName
  }

  if (updates.isActive !== undefined) {
    data.isActive = updates.isActive
  }

  if (updates.apiKey !== undefined) {
    const { encrypted, mask } = encryptApiKey(updates.apiKey)
    data.encryptedKey = encrypted
    data.keyMask = mask
  }

  const key = await prisma.apiKey.update({
    where: { id: keyId },
    data
  })

  return toApiKeyResponse(key)
}

/**
 * Resolve API key for a provider.
 * Checks user-level key first, then admin-level key.
 *
 * @param prisma - Prisma client instance
 * @param personaId - Persona UUID
 * @param provider - Provider name
 * @returns Decrypted API key or null if not found
 */
export async function resolveApiKey(
  prisma: PrismaClient,
  personaId: string,
  provider: string
): Promise<string | null> {
  // Try user-level key first
  const userKey = await prisma.apiKey.findFirst({
    where: {
      personaId,
      provider,
      isActive: true
    }
  })

  if (userKey) {
    return decryptApiKey(userKey.encryptedKey)
  }

  // Fall back to admin-level key
  const adminKey = await prisma.apiKey.findFirst({
    where: {
      personaId: null,
      provider,
      isActive: true
    }
  })

  if (adminKey) {
    return decryptApiKey(adminKey.encryptedKey)
  }

  return null
}

/**
 * Increment usage count and update last used timestamp.
 *
 * @param prisma - Prisma client instance
 * @param keyId - API key UUID
 */
export async function incrementKeyUsage(
  prisma: PrismaClient,
  keyId: string
): Promise<void> {
  await prisma.apiKey.update({
    where: { id: keyId },
    data: {
      usageCount: { increment: 1 },
      lastUsed: new Date()
    }
  })
}

/**
 * Validate API key by attempting minimal provider API call.
 * This is a placeholder that should be implemented with actual provider validation.
 *
 * @param prisma - Prisma client instance
 * @param keyId - API key UUID
 * @param personaId - Persona UUID or null for admin keys
 * @returns True if key is valid
 */
export async function validateApiKey(
  prisma: PrismaClient,
  keyId: string,
  personaId: string | null
): Promise<boolean> {
  const key = await getApiKey(prisma, keyId, personaId)

  if (!key) {
    return false
  }

  // TODO: Implement actual provider validation
  // For now, just check if key exists and is active
  return key.isActive
}

/**
 * Convert database API key record to response format.
 * Omits encrypted key from response.
 *
 * @param key - Prisma API key record
 * @returns API key response object
 */
function toApiKeyResponse(key: {
  id: string
  personaId: string | null
  provider: string
  keyName: string
  keyMask: string
  isActive: boolean
  lastUsed: Date | null
  usageCount: number
  createdAt: Date
  updatedAt: Date
  encryptedKey: string
}): ApiKeyResponse {
  return {
    id: key.id,
    personaId: key.personaId,
    provider: key.provider,
    keyName: key.keyName,
    keyMask: key.keyMask,
    isActive: key.isActive,
    lastUsed: key.lastUsed,
    usageCount: key.usageCount,
    createdAt: key.createdAt,
    updatedAt: key.updatedAt
  }
}
