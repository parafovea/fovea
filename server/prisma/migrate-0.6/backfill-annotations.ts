/**
 * Copies each legacy `annotations` row into the native layers annotation store
 * through the SAME lens + bridge the application uses — no row construction here.
 *
 * The legacy `Annotation` columns map 1:1 onto the `VideoAnnotationInput` the
 * video lens consumes (id / videoId / personaId / type / label / linkType /
 * frames / confidence / source). The copy assembles that input and calls
 * `writeVideoAnnotation(prisma, input, scope)`, which runs `annotationToLayers`
 * (the panproto video lens) internally, get-or-creates the video expression and
 * the denoted node, and persists deterministically (idempotent on re-run).
 *
 * @module
 */

import type { PrismaClient, Annotation } from '@prisma/client'

import {
  writeVideoAnnotation,
  type AnnotationScope,
} from '../../src/services/layers-bridge/annotation-bridge.js'
import type {
  VideoAnnotationInput,
  VideoAnnotationLinkType,
} from '../../src/services/layers-lens/video-lens.js'
import type { BoundingBoxSequence } from '../../src/services/layers-conversion-service.js'

import { reuseAnnotationId } from './id-map.js'
import type { StepStats } from './helpers.js'

const LINK_TYPES: readonly string[] = ['entity', 'event', 'time', 'location']

/** Narrows the legacy free-text linkType to the lens's union, else null. */
function linkTypeOf(value: string | null): VideoAnnotationLinkType | null {
  return value && LINK_TYPES.includes(value) ? (value as VideoAnnotationLinkType) : null
}

/**
 * Copies a batch of legacy annotations into native layers annotations.
 *
 * @param prisma - the Prisma client
 * @param rows - the legacy Annotation rows
 * @returns the created/updated tally (one annotation written per row)
 */
export async function backfillAnnotations(
  prisma: PrismaClient,
  rows: Annotation[],
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  for (const row of rows) {
    const input: VideoAnnotationInput = {
      id: row.id,
      videoId: row.videoId,
      personaId: row.personaId,
      type: row.type,
      label: row.label,
      linkType: linkTypeOf(row.linkType),
      frames: row.frames as unknown as BoundingBoxSequence,
      confidence: row.confidence,
      source: row.source,
    }
    const scope: AnnotationScope = {
      userId: row.createdByUserId ?? row.userId ?? null,
      projectId: row.projectId,
    }
    const existed =
      (await prisma.layersAnnotation.count({ where: { id: reuseAnnotationId(row.id) } })) > 0
    await writeVideoAnnotation(prisma, input, scope)
    existed ? (stats.updated += 1) : (stats.created += 1)
  }
  return stats
}
