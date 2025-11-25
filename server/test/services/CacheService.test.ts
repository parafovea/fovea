import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CacheService } from '../../src/services/CacheService.js'
import { Redis } from 'ioredis'

/**
 * Unit tests for CacheService.
 *
 * Tests all cache operations with mocked Redis client.
 * Ensures graceful error handling and metrics tracking.
 */
describe('CacheService', () => {
  // Mock Redis client
  const mockRedis = {
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    flushdb: vi.fn()
  } as unknown as Redis

  let cacheService: CacheService

  // Sample test data
  const testKey = 'test:key:123'
  const testValue = { id: '123', name: 'test', count: 42 }
  const testTTL = 3600

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()
    cacheService = new CacheService(mockRedis)

    // Suppress console.error for tests (we test error cases)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('get()', () => {
    it('should return cached value on cache hit', async () => {
      const serialized = JSON.stringify(testValue)
      mockRedis.get = vi.fn().mockResolvedValue(serialized)

      const result = await cacheService.get<typeof testValue>(testKey)

      expect(mockRedis.get).toHaveBeenCalledWith(testKey)
      expect(result).toEqual(testValue)
    })

    it('should return null on cache miss', async () => {
      mockRedis.get = vi.fn().mockResolvedValue(null)

      const result = await cacheService.get(testKey)

      expect(mockRedis.get).toHaveBeenCalledWith(testKey)
      expect(result).toBeNull()
    })

    it('should deserialize JSON correctly', async () => {
      const complexValue = {
        id: 'video-123',
        metadata: { encoding: 'h264', bitrate: 5000 },
        tags: ['tag1', 'tag2'],
        timestamp: '2024-01-01T00:00:00Z'
      }
      mockRedis.get = vi.fn().mockResolvedValue(JSON.stringify(complexValue))

      const result = await cacheService.get<typeof complexValue>(testKey)

      expect(result).toEqual(complexValue)
    })

    it('should handle empty string value', async () => {
      mockRedis.get = vi.fn().mockResolvedValue('""')

      const result = await cacheService.get<string>(testKey)

      expect(result).toBe('')
    })

    it('should handle numeric value', async () => {
      mockRedis.get = vi.fn().mockResolvedValue('42')

      const result = await cacheService.get<number>(testKey)

      expect(result).toBe(42)
    })

    it('should handle boolean value', async () => {
      mockRedis.get = vi.fn().mockResolvedValue('true')

      const result = await cacheService.get<boolean>(testKey)

      expect(result).toBe(true)
    })

    it('should handle array value', async () => {
      const arrayValue = [1, 2, 3, 4, 5]
      mockRedis.get = vi.fn().mockResolvedValue(JSON.stringify(arrayValue))

      const result = await cacheService.get<number[]>(testKey)

      expect(result).toEqual(arrayValue)
    })

    it('should return null on Redis error', async () => {
      const redisError = new Error('Redis connection failed')
      mockRedis.get = vi.fn().mockRejectedValue(redisError)

      const result = await cacheService.get(testKey)

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Cache get error'),
        redisError
      )
    })

    it('should return null on JSON parse error', async () => {
      mockRedis.get = vi.fn().mockResolvedValue('invalid json {{{')

      const result = await cacheService.get(testKey)

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalled()
    })
  })

  describe('set()', () => {
    it('should set value without TTL', async () => {
      mockRedis.set = vi.fn().mockResolvedValue('OK')

      const result = await cacheService.set(testKey, testValue)

      expect(mockRedis.set).toHaveBeenCalledWith(testKey, JSON.stringify(testValue))
      expect(result).toBe(true)
    })

    it('should set value with TTL', async () => {
      mockRedis.setex = vi.fn().mockResolvedValue('OK')

      const result = await cacheService.set(testKey, testValue, testTTL)

      expect(mockRedis.setex).toHaveBeenCalledWith(
        testKey,
        testTTL,
        JSON.stringify(testValue)
      )
      expect(result).toBe(true)
    })

    it('should serialize complex objects correctly', async () => {
      const complexValue = {
        nested: { deep: { value: 'test' } },
        array: [1, 2, { id: 3 }],
        nullValue: null,
        undefinedValue: undefined
      }
      mockRedis.setex = vi.fn().mockResolvedValue('OK')

      const result = await cacheService.set(testKey, complexValue, testTTL)

      expect(mockRedis.setex).toHaveBeenCalledWith(
        testKey,
        testTTL,
        JSON.stringify(complexValue)
      )
      expect(result).toBe(true)
    })

    it('should handle string value', async () => {
      mockRedis.setex = vi.fn().mockResolvedValue('OK')

      await cacheService.set(testKey, 'simple string', testTTL)

      expect(mockRedis.setex).toHaveBeenCalledWith(
        testKey,
        testTTL,
        JSON.stringify('simple string')
      )
    })

    it('should handle numeric value', async () => {
      mockRedis.setex = vi.fn().mockResolvedValue('OK')

      await cacheService.set(testKey, 42, testTTL)

      expect(mockRedis.setex).toHaveBeenCalledWith(testKey, testTTL, '42')
    })

    it('should handle boolean value', async () => {
      mockRedis.setex = vi.fn().mockResolvedValue('OK')

      await cacheService.set(testKey, false, testTTL)

      expect(mockRedis.setex).toHaveBeenCalledWith(testKey, testTTL, 'false')
    })

    it('should handle null value', async () => {
      mockRedis.setex = vi.fn().mockResolvedValue('OK')

      await cacheService.set(testKey, null, testTTL)

      expect(mockRedis.setex).toHaveBeenCalledWith(testKey, testTTL, 'null')
    })

    it('should not set with TTL when TTL is 0', async () => {
      mockRedis.set = vi.fn().mockResolvedValue('OK')

      await cacheService.set(testKey, testValue, 0)

      expect(mockRedis.set).toHaveBeenCalledWith(testKey, JSON.stringify(testValue))
      expect(mockRedis.setex).not.toHaveBeenCalled()
    })

    it('should not set with TTL when TTL is negative', async () => {
      mockRedis.set = vi.fn().mockResolvedValue('OK')

      await cacheService.set(testKey, testValue, -100)

      expect(mockRedis.set).toHaveBeenCalledWith(testKey, JSON.stringify(testValue))
      expect(mockRedis.setex).not.toHaveBeenCalled()
    })

    it('should return false on Redis error', async () => {
      const redisError = new Error('Redis write failed')
      mockRedis.setex = vi.fn().mockRejectedValue(redisError)

      const result = await cacheService.set(testKey, testValue, testTTL)

      expect(result).toBe(false)
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Cache set error'),
        redisError
      )
    })
  })

  describe('del()', () => {
    it('should delete cache entry', async () => {
      mockRedis.del = vi.fn().mockResolvedValue(1)

      const result = await cacheService.del(testKey)

      expect(mockRedis.del).toHaveBeenCalledWith(testKey)
      expect(result).toBe(true)
    })

    it('should return true even if key does not exist', async () => {
      mockRedis.del = vi.fn().mockResolvedValue(0)

      const result = await cacheService.del(testKey)

      expect(result).toBe(true)
    })

    it('should return false on Redis error', async () => {
      const redisError = new Error('Redis delete failed')
      mockRedis.del = vi.fn().mockRejectedValue(redisError)

      const result = await cacheService.del(testKey)

      expect(result).toBe(false)
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Cache del error'),
        redisError
      )
    })
  })

  describe('delPattern()', () => {
    it('should delete all keys matching pattern', async () => {
      const keys = ['video:1', 'video:2', 'video:3']
      mockRedis.keys = vi.fn().mockResolvedValue(keys)
      mockRedis.del = vi.fn().mockResolvedValue(keys.length)

      const result = await cacheService.delPattern('video:*')

      expect(mockRedis.keys).toHaveBeenCalledWith('video:*')
      expect(mockRedis.del).toHaveBeenCalledWith(...keys)
      expect(result).toBe(3)
    })

    it('should return 0 when no keys match pattern', async () => {
      mockRedis.keys = vi.fn().mockResolvedValue([])

      const result = await cacheService.delPattern('nonexistent:*')

      expect(mockRedis.keys).toHaveBeenCalledWith('nonexistent:*')
      expect(mockRedis.del).not.toHaveBeenCalled()
      expect(result).toBe(0)
    })

    it('should handle single key match', async () => {
      mockRedis.keys = vi.fn().mockResolvedValue(['video:123'])
      mockRedis.del = vi.fn().mockResolvedValue(1)

      const result = await cacheService.delPattern('video:123')

      expect(result).toBe(1)
    })

    it('should return 0 on Redis error', async () => {
      const redisError = new Error('Redis keys command failed')
      mockRedis.keys = vi.fn().mockRejectedValue(redisError)

      const result = await cacheService.delPattern('video:*')

      expect(result).toBe(0)
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Cache delPattern error'),
        redisError
      )
    })

    it('should return 0 on delete error', async () => {
      mockRedis.keys = vi.fn().mockResolvedValue(['video:1', 'video:2'])
      mockRedis.del = vi.fn().mockRejectedValue(new Error('Delete failed'))

      const result = await cacheService.delPattern('video:*')

      expect(result).toBe(0)
    })
  })

  describe('flush()', () => {
    it('should flush all cache entries', async () => {
      mockRedis.flushdb = vi.fn().mockResolvedValue('OK')

      const result = await cacheService.flush()

      expect(mockRedis.flushdb).toHaveBeenCalled()
      expect(result).toBe(true)
    })

    it('should return false on Redis error', async () => {
      const redisError = new Error('Redis flush failed')
      mockRedis.flushdb = vi.fn().mockRejectedValue(redisError)

      const result = await cacheService.flush()

      expect(result).toBe(false)
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Cache flush error'),
        redisError
      )
    })
  })

  describe('Round-trip operations', () => {
    it('should correctly serialize and deserialize data', async () => {
      const data = { id: 'test', nested: { value: 42 } }
      const serialized = JSON.stringify(data)

      mockRedis.setex = vi.fn().mockResolvedValue('OK')
      mockRedis.get = vi.fn().mockResolvedValue(serialized)

      await cacheService.set(testKey, data, testTTL)
      const result = await cacheService.get<typeof data>(testKey)

      expect(result).toEqual(data)
    })

    it('should handle Date objects', async () => {
      const date = new Date('2024-01-01T00:00:00Z')
      const data = { timestamp: date.toISOString() }
      const serialized = JSON.stringify(data)

      mockRedis.setex = vi.fn().mockResolvedValue('OK')
      mockRedis.get = vi.fn().mockResolvedValue(serialized)

      await cacheService.set(testKey, data, testTTL)
      const result = await cacheService.get<typeof data>(testKey)

      expect(result?.timestamp).toBe(date.toISOString())
    })
  })

  describe('CacheService instantiation', () => {
    it('should create service with Redis client', () => {
      const service = new CacheService(mockRedis)
      expect(service).toBeInstanceOf(CacheService)
    })
  })
})
