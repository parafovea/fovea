/**
 * Backfills a legacy Video into the layers store.
 *
 * A Video maps to a Media(kind=video) plus a video Expression. When the video's
 * metadata carries social-media text (a description or tweet body), it also maps
 * to a second Expression(kind=social-media, sourceKind=video-metadata-text) with
 * a whitespace Segmentation + Tokenization over that text.
 *
 * The write is additive and idempotent: every produced row has a stable id
 * (derived from the Video id) and is upserted, so re-running mints no duplicates
 * and never touches the legacy Video row.
 *
 * @module
 */

import { PrismaClient, type Video } from '@prisma/client'

import {
  expressionVideoId,
  expressionVideoMetadataTextId,
  mediaVideoId,
  segmentationVideoMetadataTextId,
  tokenizationVideoMetadataTextId,
} from './id-map.js'
import { toJson, whitespaceTokens, type StepStats } from './helpers.js'

/** A parsed `WIDTHxHEIGHT` resolution string. */
interface Resolution {
  width: number | null
  height: number | null
}

/**
 * Parses a `Video.resolution` string of the form `1920x1080` into numeric
 * width/height. Returns nulls when the string is absent or malformed.
 */
function parseResolution(resolution: string | null): Resolution {
  if (!resolution) return { width: null, height: null }
  const match = /^(\d+)\s*x\s*(\d+)$/i.exec(resolution.trim())
  if (!match) return { width: null, height: null }
  return { width: Number(match[1]), height: Number(match[2]) }
}

/**
 * Extracts the social-media text a video's metadata carries, if any. Checks the
 * common description/tweet fields in priority order. Returns null when none is
 * present or the value is blank.
 */
function extractMetadataText(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const bag = metadata as Record<string, unknown>
  const candidates = [bag.description, bag.tweetText, bag.text, bag.caption, bag.title]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate
  }
  return null
}

/**
 * Backfills one Video into a Media(video) + Expression(video) pair, plus an
 * optional metadata-text Expression with its whitespace token decomposition.
 *
 * @param prisma - the Prisma client
 * @param video - the legacy Video row
 * @returns the created/updated tally for this video
 */
export async function backfillVideo(prisma: PrismaClient, video: Video): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }

  const { width, height } = parseResolution(video.resolution)
  const durationMs = video.duration != null ? Math.round(video.duration * 1000) : null
  const frameRateX100 = video.frameRate != null ? Math.round(video.frameRate * 100) : null

  // Media(kind=video): the source material the expression attaches to.
  const mediaId = mediaVideoId(video.id)
  const videoDescriptor = {
    width,
    height,
    frameRate: frameRateX100,
    durationMs,
  }
  const mediaData = {
    kind: 'video',
    title: video.filename,
    durationMs,
    video: toJson(videoDescriptor),
    metadata: toJson(video.metadata),
    videoId: video.id,
    projectId: null,
    createdByUserId: null,
  }
  const mediaExisted = (await prisma.media.count({ where: { id: mediaId } })) > 0
  await prisma.media.upsert({
    where: { id: mediaId },
    create: { id: mediaId, ...mediaData },
    update: mediaData,
  })
  mediaExisted ? (stats.updated += 1) : (stats.created += 1)

  // Expression(kind=video): the signal-bearing unit annotations layer over.
  const exprId = expressionVideoId(video.id)
  const exprData = {
    layersId: video.platformVideoId ?? video.filename,
    kind: 'video',
    sourceKind: 'video',
    mediaId,
    videoId: video.id,
    projectId: null,
    createdByUserId: null,
  }
  const exprExisted = (await prisma.expression.count({ where: { id: exprId } })) > 0
  await prisma.expression.upsert({
    where: { id: exprId },
    create: { id: exprId, ...exprData },
    update: exprData,
  })
  exprExisted ? (stats.updated += 1) : (stats.created += 1)

  // Optional Expression(sourceKind=video-metadata-text) over the caption/tweet.
  const metadataText = extractMetadataText(video.metadata)
  if (metadataText) {
    const metaExprId = expressionVideoMetadataTextId(video.id)
    const metaExprData = {
      layersId: `${video.platformVideoId ?? video.filename}#metadata-text`,
      kind: 'social-media',
      text: metadataText,
      sourceKind: 'video-metadata-text',
      videoId: video.id,
      projectId: null,
      createdByUserId: null,
    }
    const metaExisted = (await prisma.expression.count({ where: { id: metaExprId } })) > 0
    await prisma.expression.upsert({
      where: { id: metaExprId },
      create: { id: metaExprId, ...metaExprData },
      update: metaExprData,
    })
    metaExisted ? (stats.updated += 1) : (stats.created += 1)

    const segId = segmentationVideoMetadataTextId(video.id)
    await prisma.segmentation.upsert({
      where: { id: segId },
      create: { id: segId, expressionId: metaExprId, projectId: null, createdByUserId: null },
      update: { expressionId: metaExprId },
    })

    const tokId = tokenizationVideoMetadataTextId(video.id)
    const tokens = whitespaceTokens(metadataText)
    await prisma.tokenization.upsert({
      where: { id: tokId },
      create: {
        id: tokId,
        segmentationId: segId,
        expressionId: metaExprId,
        kind: 'whitespace',
        isCanonical: true,
        tokens: toJson(tokens) ?? [],
      },
      update: {
        segmentationId: segId,
        expressionId: metaExprId,
        kind: 'whitespace',
        tokens: toJson(tokens) ?? [],
      },
    })
  }

  return stats
}

/**
 * Backfills a batch of videos, aggregating their tallies.
 *
 * @param prisma - the Prisma client
 * @param videos - the legacy Video rows
 * @returns the aggregate created/updated tally
 */
export async function backfillVideos(prisma: PrismaClient, videos: Video[]): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  for (const video of videos) {
    const step = await backfillVideo(prisma, video)
    stats.created += step.created
    stats.updated += step.updated
  }
  return stats
}
