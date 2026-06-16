import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import { VideoStorageProvider } from './videoStorage.js'
import {
  parseVideoManifest,
  selectProjectForVideo,
  ManifestValidationError,
} from './videoManifest.js'

/**
 * Logger interface for dependency injection
 */
export interface Logger {
  info(obj: object, msg?: string): void
  debug(obj: object, msg?: string): void
  warn(obj: object, msg?: string): void
  error(obj: object, msg?: string): void
}

/** Counters describing what the corpus manifest provisioned during sync. */
export interface ManifestSyncResult {
  groupsUpserted: number
  projectsUpserted: number
  membersReconciled: number
  videosAssigned: number
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
  /** Present only when a fovea.manifest.json was found and applied. */
  manifest?: ManifestSyncResult
}

/** Filename of the corpus manifest at the root of the videos storage. */
const MANIFEST_FILENAME = 'fovea.manifest.json'

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
 * Apply the optional corpus manifest (fovea.manifest.json) at the root of the
 * videos storage: upsert the declared user groups and projects by slug,
 * additively reconcile group memberships (add missing members and update roles;
 * existing members are never removed), and assign each discovered video to the
 * project whose path glob is the most specific match. Every write is idempotent
 * so re-syncing creates no duplicates.
 *
 * A missing manifest is a no-op. A malformed manifest is logged and skipped so
 * sync still completes with discovery only.
 */
async function applyVideoManifest(
  prisma: PrismaClient,
  logger: Logger,
  storageProvider: VideoStorageProvider,
  discoveredVideos: Array<{ id: string; key: string }>,
  actorUserId: string
): Promise<ManifestSyncResult | undefined> {
  const raw = await storageProvider.readTextFile(MANIFEST_FILENAME)
  if (raw === null) {
    return undefined // no manifest; nothing to apply
  }

  let manifest
  try {
    manifest = parseVideoManifest(raw)
  } catch (error) {
    if (error instanceof ManifestValidationError) {
      logger.error({ error: error.message }, 'Invalid fovea.manifest.json; skipping manifest application')
      return undefined
    }
    throw error
  }

  const result: ManifestSyncResult = {
    groupsUpserted: 0,
    projectsUpserted: 0,
    membersReconciled: 0,
    videosAssigned: 0,
  }

  // Upsert groups + additively reconcile their memberships.
  const groupIdBySlug = new Map<string, string>()
  for (const group of manifest.groups) {
    const upserted = await prisma.userGroup.upsert({
      where: { slug: group.slug },
      update: { name: group.name, description: group.description ?? null },
      create: { slug: group.slug, name: group.name, description: group.description ?? null, createdBy: actorUserId },
    })
    groupIdBySlug.set(group.slug, upserted.id)
    result.groupsUpserted++

    for (const member of group.members) {
      const user = await prisma.user.findUnique({ where: { username: member.username }, select: { id: true } })
      if (!user) {
        logger.warn({ username: member.username, group: group.slug }, 'Manifest group member not found; skipping')
        continue
      }
      await prisma.groupMembership.upsert({
        where: { userId_groupId: { userId: user.id, groupId: upserted.id } },
        update: { role: member.role },
        create: { userId: user.id, groupId: upserted.id, role: member.role },
      })
      result.membersReconciled++
    }
  }

  // Upsert projects, resolving owners by slug / username.
  const projectIdBySlug = new Map<string, string>()
  for (const project of manifest.projects) {
    let ownerGroupId: string | null = null
    if (project.ownerGroup) {
      ownerGroupId =
        groupIdBySlug.get(project.ownerGroup) ??
        (await prisma.userGroup.findUnique({ where: { slug: project.ownerGroup }, select: { id: true } }))?.id ??
        null
      if (!ownerGroupId) {
        logger.warn({ project: project.slug, ownerGroup: project.ownerGroup }, 'Manifest project ownerGroup not found')
      }
    }
    let ownerUserId: string | null = null
    if (project.ownerUser) {
      ownerUserId =
        (await prisma.user.findUnique({ where: { username: project.ownerUser }, select: { id: true } }))?.id ?? null
      if (!ownerUserId) {
        logger.warn({ project: project.slug, ownerUser: project.ownerUser }, 'Manifest project ownerUser not found')
      }
    }

    const upserted = await prisma.project.upsert({
      where: { slug: project.slug },
      update: { name: project.name, description: project.description ?? null, ownerGroupId, ownerUserId },
      create: {
        slug: project.slug,
        name: project.name,
        description: project.description ?? null,
        ownerGroupId,
        ownerUserId,
        createdBy: actorUserId,
      },
    })
    projectIdBySlug.set(project.slug, upserted.id)
    result.projectsUpserted++
  }

  // Assign each discovered video to its most-specific matching project.
  const assignmentsByProject = new Map<string, Array<{ videoId: string; key: string }>>()
  for (const video of discoveredVideos) {
    const project = selectProjectForVideo(video.key, manifest.projects)
    if (!project) continue
    const projectId = projectIdBySlug.get(project.slug)
    if (!projectId) continue
    const list = assignmentsByProject.get(projectId) ?? []
    list.push({ videoId: video.id, key: video.key })
    assignmentsByProject.set(projectId, list)
  }

  for (const [projectId, items] of assignmentsByProject) {
    // Dedup against existing assignments so re-sync is idempotent.
    const existing = await prisma.projectVideoAssignment.findMany({
      where: { projectId, videoId: { in: items.map(i => i.videoId) } },
      select: { videoId: true },
    })
    const already = new Set(existing.map(e => e.videoId))
    const toCreate = items.filter(i => !already.has(i.videoId))
    if (toCreate.length > 0) {
      await prisma.projectVideoAssignment.createMany({
        data: toCreate.map(i => ({
          projectId,
          videoId: i.videoId,
          source: 'folder',
          ruleDefinition: { manifest: true, matchedKey: i.key },
          assignedBy: actorUserId,
        })),
        skipDuplicates: true,
      })
      result.videosAssigned += toCreate.length
    }
  }

  logger.info({ ...result }, 'Applied corpus manifest')
  return result
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
  storageConfig: StorageConfig,
  options?: { syncUserId?: string }
): Promise<SyncResult> {
  let added = 0
  let updated = 0
  let deleted = 0
  let errors = 0
  let totalVideos = 0

  // Track all video IDs that exist in storage
  const syncedVideoIds = new Set<string>()
  // Track discovered videos (id + storage-relative key) for manifest matching.
  const discoveredVideos: Array<{ id: string; key: string }> = []

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
          discoveredVideos.push({ id, key: filename })

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

    // Apply the optional corpus manifest (projects / groups / assignments).
    let manifestResult: ManifestSyncResult | undefined
    try {
      // Manifest writes (project/group/membership) need an actor for the
      // required createdBy/assignedBy columns. Prefer the caller-supplied user,
      // otherwise the earliest admin. Without one, skip manifest application.
      let actorUserId = options?.syncUserId
      if (!actorUserId) {
        const admin = await prisma.user.findFirst({
          where: { isAdmin: true },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
        actorUserId = admin?.id
      }
      if (actorUserId) {
        manifestResult = await applyVideoManifest(prisma, logger, storageProvider, discoveredVideos, actorUserId)
      } else {
        const raw = await storageProvider.readTextFile(MANIFEST_FILENAME)
        if (raw !== null) {
          logger.warn({}, 'fovea.manifest.json present but no admin user to attribute it to; skipping')
        }
      }
    } catch (manifestError) {
      logger.error(
        {
          error: manifestError,
          errorMessage: manifestError instanceof Error ? manifestError.message : String(manifestError),
        },
        'Failed to apply corpus manifest'
      )
      // Don't throw - manifest application is optional, video sync succeeded.
    }

    return {
      added,
      updated,
      deleted,
      errors,
      total: totalVideos,
      ...(manifestResult ? { manifest: manifestResult } : {}),
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
