import { Redis } from 'ioredis'
import { cacheHitCounter, cacheOperationDuration } from '../metrics.js'

/**
 * Cache service for storing and retrieving frequently accessed data using Redis.
 *
 * Provides a centralized caching layer with:
 * - Automatic JSON serialization/deserialization
 * - Configurable TTLs (time-to-live)
 * - Graceful error handling (cache failures don't crash the app)
 * - OpenTelemetry metrics tracking
 *
 * ## Usage Example:
 * ```typescript
 * const cache = new CacheService(redis)
 *
 * // Set a value with 1 hour TTL
 * await cache.set('video:123', videoData, 3600)
 *
 * // Get a value
 * const video = await cache.get<Video>('video:123')
 *
 * // Delete a value
 * await cache.del('video:123')
 * ```
 *
 * ## Error Handling:
 * All cache operations fail gracefully. If Redis is unavailable:
 * - `get()` returns null
 * - `set()` returns false
 * - `del()` returns false
 *
 * This ensures the application continues to function even if caching is degraded.
 */
export class CacheService {
  /**
   * Creates a new CacheService instance.
   *
   * @param redis - Redis client instance for cache operations
   */
  constructor(private readonly redis: Redis) {}

  /**
   * Retrieves a value from the cache.
   *
   * @param key - Cache key to retrieve
   * @returns Deserialized value if found, null if not found or on error
   *
   * @example
   * ```typescript
   * const video = await cache.get<Video>('video:123')
   * if (video) {
   *   // Cache hit
   *   console.log('Video found in cache:', video.filename)
   * } else {
   *   // Cache miss or error
   *   const video = await database.findVideo('123')
   * }
   * ```
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now()

    try {
      const cached = await this.redis.get(key)

      if (cached === null) {
        // Cache miss
        this.recordMetrics('get', 'miss', Date.now() - startTime)
        return null
      }

      // Cache hit - deserialize JSON
      const value = JSON.parse(cached) as T
      this.recordMetrics('get', 'hit', Date.now() - startTime)
      return value
    } catch (error) {
      // Log error but don't crash
      console.error(`Cache get error for key ${key}:`, error)
      this.recordMetrics('get', 'error', Date.now() - startTime)
      return null
    }
  }

  /**
   * Stores a value in the cache with optional TTL.
   *
   * @param key - Cache key to store
   * @param value - Value to cache (will be JSON serialized)
   * @param ttlSeconds - Time-to-live in seconds (optional)
   * @returns True if successful, false on error
   *
   * @example
   * ```typescript
   * // Set with 1 hour TTL
   * await cache.set('video:123', videoData, 3600)
   *
   * // Set without TTL (no expiration)
   * await cache.set('config:app', config)
   * ```
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
    const startTime = Date.now()

    try {
      const serialized = JSON.stringify(value)

      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        // Set with expiration
        await this.redis.setex(key, ttlSeconds, serialized)
      } else {
        // Set without expiration
        await this.redis.set(key, serialized)
      }

      this.recordMetrics('set', 'success', Date.now() - startTime)
      return true
    } catch (error) {
      // Log error but don't crash
      console.error(`Cache set error for key ${key}:`, error)
      this.recordMetrics('set', 'error', Date.now() - startTime)
      return false
    }
  }

  /**
   * Deletes a value from the cache.
   *
   * @param key - Cache key to delete
   * @returns True if successful, false on error
   *
   * @example
   * ```typescript
   * // Delete cache entry after update
   * await database.updateVideo('123', { duration: 120 })
   * await cache.del('video:123') // Invalidate cache
   * ```
   */
  async del(key: string): Promise<boolean> {
    const startTime = Date.now()

    try {
      await this.redis.del(key)
      this.recordMetrics('del', 'success', Date.now() - startTime)
      return true
    } catch (error) {
      // Log error but don't crash
      console.error(`Cache del error for key ${key}:`, error)
      this.recordMetrics('del', 'error', Date.now() - startTime)
      return false
    }
  }

  /**
   * Deletes multiple keys matching a pattern.
   *
   * @param pattern - Redis pattern (e.g., 'video:*' to delete all video cache entries)
   * @returns Number of keys deleted, or 0 on error
   *
   * @example
   * ```typescript
   * // Delete all video cache entries
   * await cache.delPattern('video:*')
   *
   * // Delete all cache entries for a specific user
   * await cache.delPattern('user:123:*')
   * ```
   */
  async delPattern(pattern: string): Promise<number> {
    const startTime = Date.now()

    try {
      // Find all keys matching pattern
      const keys = await this.redis.keys(pattern)

      if (keys.length === 0) {
        this.recordMetrics('delPattern', 'success', Date.now() - startTime)
        return 0
      }

      // Delete all matching keys
      await this.redis.del(...keys)
      this.recordMetrics('delPattern', 'success', Date.now() - startTime)
      return keys.length
    } catch (error) {
      // Log error but don't crash
      console.error(`Cache delPattern error for pattern ${pattern}:`, error)
      this.recordMetrics('delPattern', 'error', Date.now() - startTime)
      return 0
    }
  }

  /**
   * Clears all cache entries.
   *
   * WARNING: This flushes the entire Redis database. Use with caution!
   * Only use in development/testing or when you're certain you want to clear everything.
   *
   * @returns True if successful, false on error
   *
   * @example
   * ```typescript
   * // Clear all cache (use carefully!)
   * await cache.flush()
   * ```
   */
  async flush(): Promise<boolean> {
    const startTime = Date.now()

    try {
      await this.redis.flushdb()
      this.recordMetrics('flush', 'success', Date.now() - startTime)
      return true
    } catch (error) {
      // Log error but don't crash
      console.error('Cache flush error:', error)
      this.recordMetrics('flush', 'error', Date.now() - startTime)
      return false
    }
  }

  /**
   * Records cache operation metrics for OpenTelemetry.
   *
   * Tracks both counter (hit/miss/error) and duration metrics.
   *
   * @param operation - Cache operation type (get, set, del, flush)
   * @param status - Operation status (hit, miss, success, error)
   * @param durationMs - Operation duration in milliseconds
   */
  private recordMetrics(operation: string, status: string, durationMs: number): void {
    try {
      cacheHitCounter.add(1, { operation, status })
      cacheOperationDuration.record(durationMs, { operation, status })
    } catch (error) {
      // Silently fail if metrics recording fails
      // Don't let metrics failures affect cache operations
      console.error('Failed to record cache metrics:', error)
    }
  }
}
