/**
 * Materializes each legacy `videos` row's native layers scaffold (the video
 * `Media` record and its `Expression`) through the SAME writer the application
 * uses, so a video with no annotations still gets its layers rows and every
 * later domain (annotations, summaries) resolves the same expression id.
 *
 * `getOrCreateVideoExpression` derives the ids deterministically and upserts, so
 * a re-run is idempotent and it is the exact path `writeVideoAnnotation` calls.
 *
 * @module
 */

import type { PrismaClient, Video } from '@prisma/client'

import { expressionVideoId } from '../../src/services/layers-id-map.js'
import { getOrCreateVideoExpression } from '../../src/services/video-expression-service.js'

import type { StepStats } from './helpers.js'

/**
 * Ensures the native media + expression scaffold exists for a batch of legacy
 * videos.
 *
 * @param prisma - the Prisma client
 * @param rows - the legacy Video rows
 * @returns the created/updated tally (one scaffold ensured per video)
 */
export async function backfillVideos(prisma: PrismaClient, rows: Video[]): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  for (const row of rows) {
    const existed = (await prisma.expression.count({ where: { id: expressionVideoId(row.id) } })) > 0
    await getOrCreateVideoExpression(prisma, row.id)
    existed ? (stats.updated += 1) : (stats.created += 1)
  }
  return stats
}
