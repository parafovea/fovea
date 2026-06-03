import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import { createVideoStorageProvider, loadStorageConfig } from '../../services/videoStorage.js'
import { VideoRepository } from '../../repositories/VideoRepository.js'
import { VideoAccessService } from '../../services/video-access-service.js'
import { requireAuth } from '../../middleware/auth.js'
import { buildAbilities } from '../../middleware/abilities.js'
import { NotFoundError } from '../../lib/errors.js'
import { listRoutes } from './list.js'
import { streamRoutes } from './stream.js'
import { thumbnailRoutes } from './thumbnail.js'
import { detectRoutes } from './detect.js'
import { transcribeRoutes } from './transcribe.js'
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

  // Require authentication for all video routes
  fastify.addHook('onRequest', requireAuth)
  // Build CASL abilities so per-route ability.can() checks work (e.g.
  // detect.ts verifying the supplied personaId belongs to the requester).
  fastify.addHook('onRequest', buildAbilities)

  // Per-video access check: any request with a :videoId param is verified
  // against the caller's project/group memberships via VideoAccessService.
  const videoAccess = new VideoAccessService(fastify.prisma)

  fastify.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    const params = request.params as Record<string, string>
    if (!params.videoId || !request.user) return

    // Only enforce access if the video actually exists. If it doesn't, let
    // the route return its own error so validation errors (e.g. missing
    // body fields) aren't masked by a 404.
    const video = await videoRepository.findById(params.videoId)
    if (!video) return

    const accessible = await videoAccess.getAccessibleVideoIds(
      request.user.id,
      request.user.systemRole || 'user'
    )
    if (accessible !== 'all' && !accessible.includes(params.videoId)) {
      throw new NotFoundError('Video', params.videoId)
    }
  })

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

  await fastify.register(transcribeRoutes, {
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
