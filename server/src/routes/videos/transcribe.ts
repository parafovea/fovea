import { FastifyPluginAsync } from 'fastify'
import { Type } from '@sinclair/typebox'
import { PrismaClient } from '@prisma/client'
import camelcaseKeys from 'camelcase-keys'
import { VideoRepository } from '../../repositories/VideoRepository.js'
import { NotFoundError, AppError, ErrorResponseSchema } from '../../lib/errors.js'
import {
  fetchModelService,
  MODEL_SERVICE_TIMEOUTS,
  ModelServiceTimeoutError,
  ModelServiceUnreachableError,
} from '../../lib/fetchModelService.js'

/**
 * Audio transcription + (optional) speaker diarization route.
 *
 * Forwards to the model-service's /api/transcribe and, when
 * enableDiarization is true, also to /api/diarize, then merges per-
 * second overlap so every transcript segment carries the speaker that
 * was talking for the majority of its duration. The merge happens on
 * the backend so the frontend has a single mutation and a single
 * response shape regardless of whether diarization was requested.
 *
 * Path translation mirrors detect.ts: `/data/...` on the backend side
 * maps to `/videos/...` (or the e2e `/test-videos/...`) on the
 * model-service mount.
 */

interface TranscriptSegmentRaw {
  start: number
  end: number
  text: string
  confidence: number
}

interface DiarizeSegmentRaw {
  speaker: string
  start: number
  end: number
}

const TranscriptSegmentSchema = Type.Object({
  start: Type.Number(),
  end: Type.Number(),
  text: Type.String(),
  confidence: Type.Number(),
  speaker: Type.Optional(Type.Union([Type.String(), Type.Null()])),
})

const TranscribeResponseSchema = Type.Object({
  text: Type.String(),
  segments: Type.Array(TranscriptSegmentSchema),
  language: Type.String(),
  duration: Type.Number(),
  processingTime: Type.Number(),
  modelUsed: Type.String(),
  speakers: Type.Optional(Type.Array(Type.String())),
  diarizationModelUsed: Type.Optional(Type.String()),
  diarizationProcessingTime: Type.Optional(Type.Number()),
})

/**
 * Pick the speaker that overlaps each transcript segment the longest.
 * If no diarize segment overlaps at all (e.g. silence), the segment's
 * speaker remains null and the renderer falls back to "Unknown".
 */
function attachSpeakers(
  transcript: TranscriptSegmentRaw[],
  diarization: DiarizeSegmentRaw[],
): (TranscriptSegmentRaw & { speaker: string | null })[] {
  return transcript.map((seg) => {
    let bestSpeaker: string | null = null
    let bestOverlap = 0
    for (const d of diarization) {
      const overlap = Math.max(0, Math.min(seg.end, d.end) - Math.max(seg.start, d.start))
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestSpeaker = d.speaker
      }
    }
    return { ...seg, speaker: bestSpeaker }
  })
}

export const transcribeRoutes: FastifyPluginAsync<{
  videoRepository: VideoRepository
  prisma: PrismaClient
}> = async (fastify, opts) => {
  const { videoRepository } = opts

  fastify.post<{
    Params: { videoId: string }
    Body: {
      language?: string | null
      enableDiarization?: boolean
      numSpeakers?: number | null
      minSpeakers?: number | null
      maxSpeakers?: number | null
    }
  }>(
    '/api/videos/:videoId/transcribe',
    {
      schema: {
        description:
          'Transcribe a video, optionally tagging each segment with the speaker who said it.',
        tags: ['videos'],
        params: Type.Object({ videoId: Type.String() }),
        body: Type.Object({
          language: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          enableDiarization: Type.Optional(Type.Boolean()),
          numSpeakers: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
          minSpeakers: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
          maxSpeakers: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
        }),
        response: {
          200: TranscribeResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
          502: ErrorResponseSchema,
          504: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { videoId } = request.params
      const {
        language,
        enableDiarization = false,
        numSpeakers,
        minSpeakers,
        maxSpeakers,
      } = request.body

      const video = await videoRepository.findByIdWithSelect(videoId, { path: true })
      if (!video) {
        throw new NotFoundError('Video', videoId)
      }

      const modelVideoPath = video.path.replace('/data/', '/videos/')
      const modelServiceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8000'

      try {
        const transcribeRes = await fetchModelService(`${modelServiceUrl}/api/transcribe`, {
          method: 'POST',
          timeoutMs: MODEL_SERVICE_TIMEOUTS.transcribe,
          body: { audio_path: modelVideoPath, language: language ?? null },
        })

        if (!transcribeRes.ok) {
          const errorText = await transcribeRes.text()
          fastify.log.error(
            { status: transcribeRes.status, error: errorText },
            'Model service transcription error',
          )
          return reply.code(transcribeRes.status === 400 ? 400 : 500).send({
            error: 'MODEL_SERVICE_ERROR',
            message: `Model service error: ${errorText}`,
          })
        }

        const raw = (await transcribeRes.json()) as Record<string, unknown>
        const transcribe = camelcaseKeys(raw, { deep: true }) as {
          text: string
          segments: TranscriptSegmentRaw[]
          language: string
          duration: number
          processingTime: number
          modelUsed: string
        }

        if (!enableDiarization) {
          return reply.send(transcribe)
        }

        const diarizeRes = await fetchModelService(`${modelServiceUrl}/api/diarize`, {
          method: 'POST',
          timeoutMs: MODEL_SERVICE_TIMEOUTS.transcribe,
          body: {
            audio_path: modelVideoPath,
            num_speakers: numSpeakers ?? null,
            min_speakers: minSpeakers ?? null,
            max_speakers: maxSpeakers ?? null,
          },
        })

        if (!diarizeRes.ok) {
          // Diarization failure is non-fatal: return the plain transcript so
          // the user still sees something useful, log the diarization error.
          const errorText = await diarizeRes.text()
          fastify.log.warn(
            { status: diarizeRes.status, error: errorText },
            'Diarization failed; returning plain transcript',
          )
          return reply.send(transcribe)
        }

        const diarizeRawJson = (await diarizeRes.json()) as Record<string, unknown>
        const diarize = camelcaseKeys(diarizeRawJson, { deep: true }) as {
          segments: DiarizeSegmentRaw[]
          speakers: string[]
          processingTime: number
          modelUsed: string
        }

        const merged = attachSpeakers(transcribe.segments, diarize.segments)
        return reply.send({
          ...transcribe,
          segments: merged,
          speakers: diarize.speakers,
          diarizationModelUsed: diarize.modelUsed,
          diarizationProcessingTime: diarize.processingTime,
        })
      } catch (error) {
        if (error instanceof AppError) throw error
        if (error instanceof ModelServiceTimeoutError) {
          fastify.log.error(
            { endpoint: error.endpoint, timeoutMs: error.timeoutMs },
            'Model service transcription timed out',
          )
          return reply.code(504).send({ error: 'MODEL_SERVICE_TIMEOUT', message: error.message })
        }
        if (error instanceof ModelServiceUnreachableError) {
          fastify.log.error(
            { endpoint: error.endpoint, cause: error.cause.message },
            'Model service transcription unreachable',
          )
          return reply.code(502).send({
            error: 'MODEL_SERVICE_UNREACHABLE',
            message: error.message,
          })
        }
        fastify.log.error(error, 'Transcription request failed')
        return reply.code(500).send({
          error: 'TRANSCRIPTION_FAILED',
          message: error instanceof Error ? error.message : 'Transcription failed',
        })
      }
    },
  )
}
