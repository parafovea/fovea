import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { encryptApiKey, decryptApiKey, validateEncryptionKey } from '../../src/lib/encryption.js'

/**
 * Unit tests for encryption utilities.
 * Tests AES-256-GCM encryption and decryption of API keys.
 */
describe('Encryption Utilities', () => {
  const originalEnvKey = process.env.API_KEY_ENCRYPTION_KEY

  beforeAll(() => {
    // Set a valid 32-byte (64 hex char) encryption key for tests
    process.env.API_KEY_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  })

  afterAll(() => {
    // Restore original environment
    if (originalEnvKey) {
      process.env.API_KEY_ENCRYPTION_KEY = originalEnvKey
    } else {
      delete process.env.API_KEY_ENCRYPTION_KEY
    }
  })

  describe('encryptApiKey', () => {
    it('encrypts an API key and returns encrypted string with mask', () => {
      const apiKey = 'sk-ant-test-key-12345678'
      const result = encryptApiKey(apiKey)

      expect(result).toHaveProperty('encrypted')
      expect(result).toHaveProperty('mask')
      expect(typeof result.encrypted).toBe('string')
      expect(typeof result.mask).toBe('string')
      expect(result.encrypted.length).toBeGreaterThan(0)
    })

    it('generates mask showing last 4 characters', () => {
      const apiKey = 'sk-ant-test-key-12345678'
      const result = encryptApiKey(apiKey)

      expect(result.mask).toBe('...5678')
    })

    it('generates mask for short keys', () => {
      const apiKey = 'abc'
      const result = encryptApiKey(apiKey)

      expect(result.mask).toBe('...')
    })

    it('produces different encrypted values for same input', () => {
      const apiKey = 'sk-ant-test-key-12345678'
      const result1 = encryptApiKey(apiKey)
      const result2 = encryptApiKey(apiKey)

      // Different encryptions due to unique IV
      expect(result1.encrypted).not.toBe(result2.encrypted)
      // But same mask
      expect(result1.mask).toBe(result2.mask)
    })

    it('handles empty string', () => {
      const result = encryptApiKey('')

      expect(result).toHaveProperty('encrypted')
      expect(result.mask).toBe('...')
    })

    it('handles unicode characters', () => {
      const apiKey = 'key-with-emoji-🔑-test'
      const result = encryptApiKey(apiKey)

      expect(result).toHaveProperty('encrypted')
      expect(result.mask).toBe('...test')
    })
  })

  describe('decryptApiKey', () => {
    it('correctly decrypts an encrypted API key', () => {
      const originalKey = 'sk-ant-test-key-12345678'
      const { encrypted } = encryptApiKey(originalKey)
      const decrypted = decryptApiKey(encrypted)

      expect(decrypted).toBe(originalKey)
    })

    it('decrypts empty string correctly', () => {
      const originalKey = ''
      const { encrypted } = encryptApiKey(originalKey)
      const decrypted = decryptApiKey(encrypted)

      expect(decrypted).toBe(originalKey)
    })

    it('decrypts keys with unicode correctly', () => {
      const originalKey = 'key-with-emoji-🔑-test'
      const { encrypted } = encryptApiKey(originalKey)
      const decrypted = decryptApiKey(encrypted)

      expect(decrypted).toBe(originalKey)
    })

    it('decrypts long keys correctly', () => {
      const originalKey = 'a'.repeat(1000)
      const { encrypted } = encryptApiKey(originalKey)
      const decrypted = decryptApiKey(encrypted)

      expect(decrypted).toBe(originalKey)
    })

    it('throws error for invalid encrypted data', () => {
      expect(() => {
        decryptApiKey('invalid-base64-data')
      }).toThrow()
    })

    it('throws error for corrupted encrypted data', () => {
      const { encrypted } = encryptApiKey('test-key')
      const corrupted = encrypted.slice(0, -5) + 'xxxxx'

      expect(() => {
        decryptApiKey(corrupted)
      }).toThrow()
    })
  })

  describe('validateEncryptionKey', () => {
    it('returns true when encryption key is valid', () => {
      expect(validateEncryptionKey()).toBe(true)
    })

    it('returns false when encryption key is missing', () => {
      const saved = process.env.API_KEY_ENCRYPTION_KEY
      delete process.env.API_KEY_ENCRYPTION_KEY

      expect(validateEncryptionKey()).toBe(false)

      process.env.API_KEY_ENCRYPTION_KEY = saved
    })

    it('returns false when encryption key has invalid length', () => {
      const saved = process.env.API_KEY_ENCRYPTION_KEY
      process.env.API_KEY_ENCRYPTION_KEY = 'short-key'

      expect(validateEncryptionKey()).toBe(false)

      process.env.API_KEY_ENCRYPTION_KEY = saved
    })
  })

  describe('encryption errors', () => {
    it('throws error when encryption key is not set', () => {
      const saved = process.env.API_KEY_ENCRYPTION_KEY
      delete process.env.API_KEY_ENCRYPTION_KEY

      expect(() => {
        encryptApiKey('test-key')
      }).toThrow('API_KEY_ENCRYPTION_KEY environment variable not set')

      process.env.API_KEY_ENCRYPTION_KEY = saved
    })

    it('throws error when encryption key has wrong length', () => {
      const saved = process.env.API_KEY_ENCRYPTION_KEY
      process.env.API_KEY_ENCRYPTION_KEY = 'tooshort'

      expect(() => {
        encryptApiKey('test-key')
      }).toThrow('API_KEY_ENCRYPTION_KEY must be 32 bytes')

      process.env.API_KEY_ENCRYPTION_KEY = saved
    })

    it('throws error when decryption key is not set', () => {
      const { encrypted } = encryptApiKey('test-key')
      const saved = process.env.API_KEY_ENCRYPTION_KEY
      delete process.env.API_KEY_ENCRYPTION_KEY

      expect(() => {
        decryptApiKey(encrypted)
      }).toThrow('API_KEY_ENCRYPTION_KEY environment variable not set')

      process.env.API_KEY_ENCRYPTION_KEY = saved
    })
  })

  describe('round-trip encryption', () => {
    it('successfully encrypts and decrypts various key formats', () => {
      const testKeys = [
        'sk-ant-api03-test-key',
        'sk-proj-openai-test-key',
        'AIzaSyTest-Google-Key',
        'Bearer token-style-key',
        'simple-key',
        'key with spaces and symbols !@#$%'
      ]

      for (const key of testKeys) {
        const { encrypted } = encryptApiKey(key)
        const decrypted = decryptApiKey(encrypted)
        expect(decrypted).toBe(key)
      }
    })
  })
})
