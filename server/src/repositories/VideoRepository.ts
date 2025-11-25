import { PrismaClient, Video, Prisma } from '@prisma/client'
import { CacheService } from '../services/CacheService.js'

/**
 * Query options for finding all videos.
 */
export interface FindAllOptions {
  /** Field to order by (default: 'createdAt') */
  orderBy?: 'createdAt' | 'filename'
  /** Sort direction (default: 'desc') */
  direction?: 'asc' | 'desc'
}

/**
 * Repository pattern implementation for Video database access.
 *
 * This class provides a centralized location for all Video-related database queries,
 * following the Repository pattern to:
 * - Separate data access logic from business logic
 * - Enable easy mocking and testing
 * - Provide a single source of truth for queries
 * - Allow future caching layer integration (see EVALUATION.md Phase 10)
 *
 * ## When to Use Repository Pattern:
 * - ✅ Common queries used across multiple routes
 * - ✅ Queries that benefit from caching
 * - ✅ Queries that need optimization
 * - ✅ Queries with reusable logic
 *
 * ## When to Use Prisma Directly:
 * - ❌ Complex joins with multiple includes
 * - ❌ Transactions spanning multiple models
 * - ❌ One-off queries specific to a single route
 *
 * ## Benefits:
 * - Single source of truth for database queries
 * - Easier to test (mock repository instead of Prisma)
 * - Reusable query logic
 * - Can add caching layer easily
 * - Easier to add query optimization
 *
 * @example
 * ```typescript
 * const videoRepo = new VideoRepository(prisma)
 *
 * // Get all videos ordered by creation date
 * const videos = await videoRepo.findAll()
 *
 * // Get videos alphabetically
 * const videos = await videoRepo.findAll({
 *   orderBy: 'filename',
 *   direction: 'asc'
 * })
 *
 * // Get a specific video
 * const video = await videoRepo.findById('abc123')
 * if (!video) {
 *   throw new NotFoundError('Video', 'abc123')
 * }
 * ```
 */
export class VideoRepository {
  /**
   * Cache TTL for video metadata (1 hour = 3600 seconds).
   * Video metadata rarely changes, so 1 hour TTL provides good performance
   * while ensuring stale data doesn't persist too long.
   */
  private static readonly CACHE_TTL = 3600

  /**
   * Creates a new VideoRepository instance.
   *
   * @param prisma - Prisma client instance for database access
   * @param cache - Optional CacheService for caching video metadata
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache?: CacheService
  ) {}

  /**
   * Generates cache key for a video.
   *
   * @param id - Video ID
   * @returns Cache key in format "video:{id}"
   */
  private getCacheKey(id: string): string {
    return `video:${id}`
  }

  /**
   * Finds all videos with optional ordering.
   *
   * This method is used by the GET /api/videos endpoint to list all available videos.
   * By default, videos are ordered by creation date in descending order (newest first).
   *
   * @param options - Query options for ordering
   * @param options.orderBy - Field to order by (default: 'createdAt')
   * @param options.direction - Sort direction (default: 'desc')
   * @returns Array of all videos
   *
   * @example
   * ```typescript
   * // Get latest videos (default)
   * const videos = await repo.findAll()
   *
   * // Get videos alphabetically
   * const videos = await repo.findAll({
   *   orderBy: 'filename',
   *   direction: 'asc'
   * })
   * ```
   */
  async findAll(options?: FindAllOptions): Promise<Video[]> {
    const orderBy = options?.orderBy || 'createdAt'
    const direction = options?.direction || 'desc'

    return this.prisma.video.findMany({
      orderBy: { [orderBy]: direction }
    })
  }

  /**
   * Finds a video by its ID.
   *
   * This method returns the complete video record with all fields.
   * Returns null if the video is not found (caller should handle error).
   *
   * **Caching:** If CacheService is provided, video metadata is cached for 1 hour.
   * Cache is automatically checked before querying the database.
   *
   * Used by GET /api/videos/:videoId to retrieve video metadata.
   *
   * @param id - Video ID (MD5 hash of filename)
   * @returns Video record if found, null otherwise
   *
   * @example
   * ```typescript
   * const video = await repo.findById('abc123')
   * if (!video) {
   *   throw new NotFoundError('Video', 'abc123')
   * }
   * ```
   */
  async findById(id: string): Promise<Video | null> {
    // Try cache first if available
    if (this.cache) {
      const cacheKey = this.getCacheKey(id)
      const cached = await this.cache.get<Video>(cacheKey)

      if (cached) {
        // Cache hit - return cached video
        return cached
      }

      // Cache miss - fetch from database
      const video = await this.prisma.video.findUnique({
        where: { id }
      })

      // Cache the result if found (don't cache null results)
      if (video) {
        await this.cache.set(cacheKey, video, VideoRepository.CACHE_TTL)
      }

      return video
    }

    // No cache service - fetch directly from database
    return this.prisma.video.findUnique({
      where: { id }
    })
  }

  /**
   * Finds a video by ID with selective field retrieval.
   *
   * This method is optimized for performance-sensitive endpoints that only need
   * specific fields. Use this instead of findById() when you don't need all fields.
   *
   * Used by:
   * - GET /api/videos/:videoId/stream (needs: path, filename)
   * - POST /api/videos/:videoId/detect (needs: path)
   * - GET /api/videos/:videoId/thumbnail (needs: id, path, filename, localThumbnailPath)
   * - GET /api/videos/:videoId/url (needs: path)
   *
   * @param id - Video ID (MD5 hash of filename)
   * @param select - Prisma select object specifying which fields to retrieve
   * @returns Partial video record with selected fields, or null if not found
   *
   * @example
   * ```typescript
   * // Get only path for streaming
   * const video = await repo.findByIdWithSelect('abc123', {
   *   path: true,
   *   filename: true
   * })
   *
   * if (!video) {
   *   return reply.code(404).send({ error: 'Video not found' })
   * }
   * ```
   */
  async findByIdWithSelect<T extends Prisma.VideoSelect>(
    id: string,
    select: T
  ): Promise<Prisma.VideoGetPayload<{ select: T }> | null> {
    return this.prisma.video.findUnique({
      where: { id },
      select
    })
  }

  /**
   * Creates a new video record.
   *
   * This method is currently used by the video sync functionality and
   * will be used by future video upload features.
   *
   * @param data - Video creation data
   * @returns The created video record
   *
   * @example
   * ```typescript
   * const video = await repo.create({
   *   id: 'abc123',
   *   filename: 'video.mp4',
   *   path: '/data/video.mp4',
   *   duration: 120.5,
   *   frameRate: 30,
   *   resolution: '1920x1080'
   * })
   * ```
   */
  async create(data: Prisma.VideoCreateInput): Promise<Video> {
    return this.prisma.video.create({ data })
  }

  /**
   * Updates a video record.
   *
   * This method updates any fields of an existing video record.
   * Note: This method does not throw if the video is not found;
   * it propagates Prisma's error. Callers should handle NotFoundError.
   *
   * **Cache Invalidation:** If CacheService is provided, the cache entry
   * for this video is invalidated after the update.
   *
   * @param id - Video ID to update
   * @param data - Partial video data to update
   * @returns The updated video record
   * @throws {Prisma.PrismaClientKnownRequestError} P2025 if video not found
   *
   * @example
   * ```typescript
   * const updated = await repo.update('abc123', {
   *   duration: 125.0,
   *   metadata: { encoding: 'h264' }
   * })
   * ```
   */
  async update(id: string, data: Prisma.VideoUpdateInput): Promise<Video> {
    const video = await this.prisma.video.update({
      where: { id },
      data
    })

    // Invalidate cache after update
    if (this.cache) {
      const cacheKey = this.getCacheKey(id)
      await this.cache.del(cacheKey)
    }

    return video
  }

  /**
   * Updates the thumbnail path for a video.
   *
   * This is a specialized update method for setting the local thumbnail path
   * after thumbnail generation. It's more efficient than a general update
   * and makes the intent clearer.
   *
   * **Cache Invalidation:** If CacheService is provided, the cache entry
   * for this video is invalidated after the update.
   *
   * Used by GET /api/videos/:videoId/thumbnail after generating a thumbnail.
   *
   * @param id - Video ID
   * @param thumbnailPath - Relative path to thumbnail (e.g., 'thumbnails/abc123_medium.jpg')
   * @returns The updated video record
   * @throws {Prisma.PrismaClientKnownRequestError} P2025 if video not found
   *
   * @example
   * ```typescript
   * await repo.updateThumbnailPath(videoId, 'thumbnails/abc123_medium.jpg')
   * ```
   */
  async updateThumbnailPath(id: string, thumbnailPath: string): Promise<Video> {
    const video = await this.prisma.video.update({
      where: { id },
      data: { localThumbnailPath: thumbnailPath }
    })

    // Invalidate cache after update
    if (this.cache) {
      const cacheKey = this.getCacheKey(id)
      await this.cache.del(cacheKey)
    }

    return video
  }

  /**
   * Deletes a video record.
   *
   * This method removes a video from the database. Note that related records
   * (annotations, summaries) will be cascade deleted due to Prisma schema configuration.
   *
   * **Cache Invalidation:** If CacheService is provided, the cache entry
   * for this video is invalidated after deletion.
   *
   * Note: This method does not throw if the video is not found;
   * it propagates Prisma's error. Callers should handle NotFoundError.
   *
   * @param id - Video ID to delete
   * @returns The deleted video record
   * @throws {Prisma.PrismaClientKnownRequestError} P2025 if video not found
   *
   * @example
   * ```typescript
   * const deleted = await repo.delete('abc123')
   * ```
   */
  async delete(id: string): Promise<Video> {
    const video = await this.prisma.video.delete({
      where: { id }
    })

    // Invalidate cache after deletion
    if (this.cache) {
      const cacheKey = this.getCacheKey(id)
      await this.cache.del(cacheKey)
    }

    return video
  }
}
