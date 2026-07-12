/**
 * Get-or-create the layers `Expression` (and its backing `Media`) for a Fovea
 * video, so the video-annotation endpoint has an expression to layer over.
 *
 * The produced rows carry the same deterministic ids the layers backfill uses
 * (see `src/services/layers-id-map.ts`), so a video that was already backfilled
 * reuses its existing Media and Expression rather than minting duplicates, and a
 * later backfill run over a video first annotated through the endpoint upserts
 * the same rows in place. The video Expression is shared infrastructure (like
 * the Video itself): it is owned by no user and no project, mirroring the
 * backfill, so every annotator layers over the same expression.
 *
 * @module
 */

import { PrismaClient, Prisma, type Video } from '@prisma/client'

import { NotFoundError } from '../lib/errors.js'
import { mediaVideoId, expressionVideoId } from './layers-id-map.js'

/** The resolved video expression plus the video row it was derived from. */
export interface VideoExpressionResult {
  /** The video's `Expression` id (the annotation layers hang off this). */
  expressionId: string
  /** The video row, carrying the frame rate and resolution the mapper needs. */
  video: Video
}

/** A parsed `WIDTHxHEIGHT` resolution string. */
interface Resolution {
  width: number | null
  height: number | null
}

/**
 * Parses a `Video.resolution` string of the form `1920x1080` into numeric
 * width/height. Returns nulls when the string is absent or malformed.
 */
export function parseResolution(resolution: string | null): Resolution {
  if (!resolution) return { width: null, height: null }
  const match = /^(\d+)\s*x\s*(\d+)$/i.exec(resolution.trim())
  if (!match) return { width: null, height: null }
  return { width: Number(match[1]), height: Number(match[2]) }
}

/** Coerces a nullable JSON value to a Prisma create/update input. */
function jsonOrNull(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

/**
 * Returns the video's `Expression` id, creating the `Media(video)` and
 * `Expression(video)` pair on first call. Idempotent: both rows key on the
 * video id, so repeated calls upsert the same rows.
 *
 * @param prisma - the Prisma client
 * @param videoId - the Fovea video id
 * @returns the expression id and the video row
 * @throws {NotFoundError} when the video does not exist
 */
export async function getOrCreateVideoExpression(
  prisma: PrismaClient,
  videoId: string,
): Promise<VideoExpressionResult> {
  const video = await prisma.video.findUnique({ where: { id: videoId } })
  if (!video) throw new NotFoundError('Video', videoId)

  const { width, height } = parseResolution(video.resolution)
  const durationMs = video.duration != null ? Math.round(video.duration * 1000) : null
  const frameRateX100 = video.frameRate != null ? Math.round(video.frameRate * 100) : null

  // Media(kind=video): the source material the expression attaches to.
  const mediaId = mediaVideoId(video.id)
  const videoDescriptor = { width, height, frameRate: frameRateX100, durationMs }
  const mediaData = {
    kind: 'video',
    title: video.filename,
    durationMs,
    video: jsonOrNull(videoDescriptor),
    metadata: jsonOrNull(video.metadata),
    videoId: video.id,
    projectId: null,
    createdByUserId: null,
  }
  await prisma.media.upsert({
    where: { id: mediaId },
    create: { id: mediaId, ...mediaData },
    update: mediaData,
  })

  // Expression(kind=video): the signal-bearing unit annotations layer over.
  const expressionId = expressionVideoId(video.id)
  const expressionData = {
    layersId: video.platformVideoId ?? video.filename,
    kind: 'video',
    sourceKind: 'video',
    mediaId,
    videoId: video.id,
    projectId: null,
    createdByUserId: null,
  }
  await prisma.expression.upsert({
    where: { id: expressionId },
    create: { id: expressionId, ...expressionData },
    update: expressionData,
  })

  return { expressionId, video }
}
