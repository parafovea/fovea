import { FastifyPluginAsync } from 'fastify'
import { createVideoStorageProvider, loadStorageConfig } from '../../services/videoStorage.js'
import { VideoRepository } from '../../repositories/VideoRepository.js'
import { listRoutes } from './list.js'
import { streamRoutes } from './stream.js'
import { thumbnailRoutes } from './thumbnail.js'
import { detectRoutes } from './detect.js'
import { syncRoutes } from './sync.js'
import { urlRoutes } from './url.js'

/**
 * Videos API routes for listing and streaming video files.
 * Serves videos from the configured storage path.
 *
 * This module aggregates all video-related routes:
 * - List and get video metadata
 * - Stream video files with range support
 * - Generate and serve thumbnails
 * - Object detection
 * - Sync videos from storage
 * - Get video URLs
 */
const videosRoute: FastifyPluginAsync = async (fastify) => {
  const STORAGE_PATH = process.env.STORAGE_PATH || '/videos'

  // Initialize storage provider
  const storageConfig = loadStorageConfig()
  const storageProvider = createVideoStorageProvider(storageConfig)

  // Initialize video repository
  const videoRepository = new VideoRepository(fastify.prisma)

  // Register all sub-route modules
  await fastify.register(listRoutes, { videoRepository })

  await fastify.register(streamRoutes, {
    videoRepository,
    storageProvider,
    storagePath: STORAGE_PATH
  })

  await fastify.register(thumbnailRoutes, {
    videoRepository,
    storageProvider,
    storageConfig,
    storagePath: STORAGE_PATH
  })

  await fastify.register(detectRoutes, {
    videoRepository,
    prisma: fastify.prisma
  })

  await fastify.register(syncRoutes, {
    prisma: fastify.prisma,
    storageProvider,
    storageConfig
  })

  await fastify.register(urlRoutes, {
    videoRepository,
    storageProvider,
    storageConfig,
    storagePath: STORAGE_PATH
  })
}

export default videosRoute
