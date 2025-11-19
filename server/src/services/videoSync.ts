import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import { VideoStorageProvider } from './videoStorage.js'

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  info(obj: object, msg?: string): void
  debug(obj: object, msg?: string): void
  warn(obj: object, msg?: string): void
  error(obj: object, msg?: string): void
}

/**
 * Result of video sync operation
 */
export interface SyncResult {
  added: number
  updated: number
  deleted: number
  errors: number
  total: number
}

/**
 * Storage configuration for sync operation
 */
export interface StorageConfig {
  type: 'local' | 's3' | 'hybrid'
  localPath?: string
}

/**
 * Create a short hash from filename for use as video ID
 */
function createVideoId(filename: string): string {
  return crypto.createHash('md5').update(filename).digest('hex').slice(0, 16)
}

/**
 * Extract FPS from metadata (handles multiple field name variations)
 */
function extractFps(metadata: Record<string, unknown> | null): number | null {
  if (!metadata) return null

  // Check various field names used by different metadata sources
  const fps = (metadata.fps as number) ||
              (metadata.frame_rate as number) ||
              (metadata.framerate as number) ||
              (metadata.r_frame_rate ? parseFloat(String(metadata.r_frame_rate)) : null)

  return fps || null
}

/**
 * Extract resolution from metadata
 */
function extractResolution(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null

  if (metadata.resolution) {
    return metadata.resolution as string
  }

  if (metadata.width && metadata.height) {
    return `${metadata.width}x${metadata.height}`
  }

  return null
}

/**
 * Load video metadata from .info.json file
 */
async function loadMetadataFile(
  videoFilename: string,
  storageProvider: VideoStorageProvider,
  logger: Logger
): Promise<Record<string, unknown> | null> {
  // Generate .info.json filename
  const infoFilename = videoFilename.replace(/\.(webm|mp4|ogg|mov|avi|mkv)$/i, '.info.json')

  try {
    const content = await storageProvider.readTextFile(infoFilename)

    if (!content) {
      logger.debug({ videoFilename, infoFilename }, 'No metadata file found')
      return null
    }

    return JSON.parse(content)
  } catch (error) {
    logger.warn({ videoFilename, infoFilename, error }, 'Failed to parse metadata file')
    return null
  }
}

/**
 * Sync videos from storage to database.
 * Works with local, S3, and hybrid storage via storage provider abstraction.
 *
 * @param prisma - Prisma client for database operations
 * @param logger - Logger for output
 * @param storageProvider - Storage provider abstraction
 * @param storageConfig - Storage configuration
 * @returns Sync statistics
 */
export async function syncVideosFromStorage(
  prisma: PrismaClient,
  logger: Logger,
  storageProvider: VideoStorageProvider,
  storageConfig: StorageConfig
): Promise<SyncResult> {
  let added = 0
  let updated = 0
  let deleted = 0
  let errors = 0
  let totalVideos = 0

  // Track all video IDs that exist in storage
  const syncedVideoIds = new Set<string>()

  try {
    logger.info({ storageType: storageConfig.type }, 'Starting video sync from storage')

    // List all videos from storage (supports pagination)
    let continuationToken: string | undefined
    let isTruncated = true

    while (isTruncated) {
      const listResult = await storageProvider.listVideos({
        maxKeys: 100, // Process in batches of 100
        continuationToken,
      })

      const { videos, continuationToken: nextToken, isTruncated: hasMore } = listResult
      continuationToken = nextToken
      isTruncated = hasMore

      logger.info(
        {
          batchSize: videos.length,
          hasMore,
          totalProcessed: totalVideos
        },
        'Processing video batch'
      )

      // Process each video in the batch
      for (const videoInfo of videos) {
        totalVideos++

        try {
          const { filename, path: videoPath, size, lastModified } = videoInfo

          // Generate video ID from filename
          const id = createVideoId(filename)

          // Track this video as synced
          syncedVideoIds.add(id)

          // Load metadata file (.info.json) if it exists
          const metadata = await loadMetadataFile(filename, storageProvider, logger)

          // Enrich metadata with file stats
          const enrichedMetadata = {
            ...(metadata || {}),
            filesize: size,
            original_filename: filename,
            storage_path: videoPath,
            last_modified: lastModified?.toISOString(),
          }

          // Extract video properties from metadata
          const duration = (metadata?.duration as number) || null
          const fps = extractFps(metadata)
          const resolution = extractResolution(metadata)

          // Check if video already exists in database
          const existing = await prisma.video.findUnique({
            where: { id },
            select: { id: true }
          })

          // Upsert video to database
          await prisma.video.upsert({
            where: { id },
            update: {
              filename,
              path: videoPath,
              duration,
              frameRate: fps,
              resolution,
              metadata: enrichedMetadata as object,
              lastMetadataSync: new Date(),
              metadataSyncStatus: 'synced',
            },
            create: {
              id,
              filename,
              path: videoPath,
              duration,
              frameRate: fps,
              resolution,
              metadata: enrichedMetadata as object,
              lastMetadataSync: new Date(),
              metadataSyncStatus: 'synced',
            },
          })

          if (existing) {
            updated++
          } else {
            added++
          }

          logger.debug({ filename, id, videoPath, hasMetadata: !!metadata }, 'Synced video')

        } catch (videoError) {
          errors++
          logger.error(
            {
              filename: videoInfo.filename,
              error: videoError,
              errorMessage: videoError instanceof Error ? videoError.message : String(videoError)
            },
            'Failed to sync video'
          )
        }
      }
    }

    logger.info(
      {
        added,
        updated,
        errors,
        total: totalVideos,
        storageType: storageConfig.type
      },
      'Video sync completed'
    )

    // Clean up orphaned videos (videos in database but not in storage)
    logger.info({ syncedCount: syncedVideoIds.size }, 'Cleaning up orphaned videos')

    try {
      // Find all videos in database that are NOT in the synced set
      const allDbVideos = await prisma.video.findMany({
        select: { id: true }
      })

      const orphanedIds = allDbVideos
        .filter(video => !syncedVideoIds.has(video.id))
        .map(video => video.id)

      if (orphanedIds.length > 0) {
        // Delete orphaned videos
        const deleteResult = await prisma.video.deleteMany({
          where: {
            id: {
              in: orphanedIds
            }
          }
        })

        deleted = deleteResult.count

        logger.info(
          {
            deleted,
            orphanedIds: orphanedIds.slice(0, 10) // Log first 10 IDs for debugging
          },
          'Deleted orphaned videos'
        )
      } else {
        logger.info({}, 'No orphaned videos found')
      }
    } catch (cleanupError) {
      logger.error(
        {
          error: cleanupError,
          errorMessage: cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        },
        'Failed to clean up orphaned videos'
      )
      // Don't throw - cleanup is optional, sync succeeded
    }

    return {
      added,
      updated,
      deleted,
      errors,
      total: totalVideos,
    }

  } catch (error) {
    logger.error(
      {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        storageType: storageConfig.type
      },
      'Fatal error during video sync'
    )
    throw error
  }
}
