import { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import { PrismaClient } from '@prisma/client'
import { syncVideosFromStorage } from '../../services/videoSync.js'
import { VideoStorageProvider, VideoStorageConfig } from '../../services/videoStorage.js'
import { InternalError } from '../../lib/errors.js'
import { requireAdmin } from '../../middleware/auth.js'

/**
 * Video synchronization route.
 */
export const syncRoutes: FastifyPluginAsync<{
  prisma: PrismaClient
  storageProvider: VideoStorageProvider
  storageConfig: VideoStorageConfig
}> = async (fastify, opts) => {
  const { prisma, storageProvider, storageConfig } = opts

  /**
   * Sync videos from storage to database.
   * Scans the storage provider, loads metadata, and upserts videos into database.
   * Admin-only endpoint for manual sync in production.
   *
   * @route POST /api/videos/sync
   * @returns Sync statistics
   */
  fastify.post('/api/videos/sync', {
    onRequest: [requireAdmin],
    schema: {
      description: 'Sync videos from storage to database (admin only)',
      tags: ['videos'],
      response: {
        200: Type.Object({
          added: Type.Number(),
          updated: Type.Number(),
          deleted: Type.Number(),
          errors: Type.Number(),
          total: Type.Number(),
          manifest: Type.Optional(Type.Object({
            groupsUpserted: Type.Number(),
            projectsUpserted: Type.Number(),
            membersReconciled: Type.Number(),
            videosAssigned: Type.Number(),
          })),
        }),
        500: Type.Object({
          error: Type.String()
        })
      }
    }
  }, async (request, reply) => {
    try {
      fastify.log.info('Manual video sync requested')

      // Use the storage-aware sync function. Thread the requesting admin as the
      // actor so any manifest-provisioned projects/groups/assignments are
      // attributed to them.
      const result = await syncVideosFromStorage(
        prisma,
        fastify.log,
        storageProvider,
        { type: storageConfig.type, localPath: storageConfig.localPath },
        { syncUserId: request.user?.id }
      )

      fastify.log.info(
        {
          added: result.added,
          updated: result.updated,
          deleted: result.deleted,
          errors: result.errors
        },
        'Manual sync completed'
      )

      return reply.send({
        added: result.added,
        updated: result.updated,
        deleted: result.deleted,
        errors: result.errors,
        total: result.total,
        ...(result.manifest ? { manifest: result.manifest } : {}),
      })
    } catch (error) {
      fastify.log.error({ error }, 'Video sync failed')
      throw new InternalError(error instanceof Error ? error.message : 'Failed to sync videos')
    }
  })
}
