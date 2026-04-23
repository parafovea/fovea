/**
 * API routes for video summarization operations.
 *
 * Every route that touches VideoSummary runs `buildAbilities` after
 * `requireAuth` so `request.ability` is populated. List endpoints filter
 * through `accessibleBy(ability).VideoSummary`; single-record endpoints load
 * the row first and run an instance-level `ability.can()` check before
 * proceeding. This matches the IDOR-hardened pattern in annotations.ts.
 */

import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { accessibleBy } from '@casl/prisma'
import { subject } from '@casl/ability'
import { videoSummarizationQueue } from '../queues/setup.js'
import { NotFoundError, ForbiddenError } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { buildAbilities } from '../middleware/abilities.js'

/**
 * Job data for video summarization queue.
 */
/** Type guard for BullMQ job.data payloads from the summarization queue. */
function isSummarizeJobData(data: unknown): data is SummarizeJobData {
  if (typeof data !== 'object' || data === null) return false
  return 'videoId' in data && typeof data.videoId === 'string' &&
         'personaId' in data && typeof data.personaId === 'string'
}

interface SummarizeJobData {
  videoId: string;
  personaId: string;
  frameSampleRate: number;
  maxFrames: number;
  enableAudio?: boolean;
  enableSpeakerDiarization?: boolean;
  fusionStrategy?: string;
  audioLanguage?: string;
}

/**
 * TypeBox schema for GlossItem (rich text format with references).
 */
const GlossItemSchema = Type.Object({
  type: Type.Union([
    Type.Literal('text'),
    Type.Literal('typeRef'),
    Type.Literal('objectRef'),
    Type.Literal('annotationRef'),
    Type.Literal('claimRef'),
  ]),
  content: Type.String(),
  refType: Type.Optional(Type.String()),
  refPersonaId: Type.Optional(Type.String()),
  refClaimId: Type.Optional(Type.String()),
})

const KeyFrameSchema = Type.Object({
  timestamp: Type.Number(),
  description: Type.String(),
})

const TranscriptSegmentSchema = Type.Object({
  start: Type.Number(),
  end: Type.Number(),
  text: Type.String(),
  speaker: Type.Optional(Type.String()),
  confidence: Type.Optional(Type.Number()),
  sentiment: Type.Optional(Type.String()),
})

const TranscriptJsonSchema = Type.Object({
  segments: Type.Array(TranscriptSegmentSchema),
  speakers: Type.Optional(Type.Array(Type.String())),
  language: Type.Optional(Type.String()),
})

const VideoSummarySchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  videoId: Type.String(),
  personaId: Type.String({ format: 'uuid' }),
  summary: Type.Array(GlossItemSchema),
  visualAnalysis: Type.Optional(Type.String()),
  audioTranscript: Type.Optional(Type.String()),
  keyFrames: Type.Optional(Type.Array(KeyFrameSchema)),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  transcriptJson: Type.Optional(TranscriptJsonSchema),
  audioLanguage: Type.Optional(Type.String()),
  speakerCount: Type.Optional(Type.Number()),
  audioModelUsed: Type.Optional(Type.String()),
  visualModelUsed: Type.Optional(Type.String()),
  fusionStrategy: Type.Optional(Type.String()),
  processingTimeAudio: Type.Optional(Type.Number()),
  processingTimeVisual: Type.Optional(Type.Number()),
  processingTimeFusion: Type.Optional(Type.Number()),
  comment: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  createdBy: Type.Optional(Type.String()),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

const CreateSummaryRequestSchema = Type.Object({
  videoId: Type.String(),
  personaId: Type.String({ format: 'uuid' }),
  frameSampleRate: Type.Optional(Type.Number({ minimum: 1, maximum: 10, default: 1 })),
  maxFrames: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 30 })),
  enableAudio: Type.Optional(Type.Boolean()),
  enableSpeakerDiarization: Type.Optional(Type.Boolean()),
  fusionStrategy: Type.Optional(Type.String()),
  audioLanguage: Type.Optional(Type.String()),
})

const SummaryJobSchema = Type.Object({
  jobId: Type.String(),
  status: Type.String(),
  videoId: Type.String(),
  personaId: Type.String(),
})

const summariesRoute: FastifyPluginAsync = async (fastify) => {
  /**
   * List summaries for a video, filtered to what the caller can read.
   */
  fastify.get<{ Params: { videoId: string } }>(
    '/api/videos/:videoId/summaries',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        params: Type.Object({
          videoId: Type.String(),
        }),
        response: {
          200: Type.Array(VideoSummarySchema),
        },
      },
    },
    async (request, reply) => {
      if (!request.ability) throw new ForbiddenError('No abilities defined')

      const summaries = await fastify.prisma.videoSummary.findMany({
        where: {
          AND: [
            { videoId: request.params.videoId },
            accessibleBy(request.ability, 'read').VideoSummary,
          ],
        },
      })
      return reply.send(summaries)
    }
  )

  /**
   * Get summary for a specific video and persona. Caller must have `read`
   * permission on the resulting row.
   */
  fastify.get<{ Params: { videoId: string; personaId: string } }>(
    '/api/videos/:videoId/summaries/:personaId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        params: Type.Object({
          videoId: Type.String(),
          personaId: Type.String(),
        }),
        response: {
          200: VideoSummarySchema,
          404: Type.Object({ error: Type.String() }),
        },
      },
    },
    async (request, reply) => {
      if (!request.ability) throw new ForbiddenError('No abilities defined')

      const summary = await fastify.prisma.videoSummary.findUnique({
        where: {
          videoId_personaId: {
            videoId: request.params.videoId,
            personaId: request.params.personaId,
          },
        },
      })

      if (!summary) {
        throw new NotFoundError('Summary', `${request.params.videoId}-${request.params.personaId}`)
      }

      if (!request.ability.can('read', subject('VideoSummary', summary))) {
        throw new ForbiddenError('Cannot read this VideoSummary')
      }

      return reply.send(summary)
    }
  )

  /**
   * Queue a video summarization job. Since this job produces (and upserts)
   * a VideoSummary row scoped to the persona's project, we pre-authorize
   * the caller with `can('update', ...)` on the candidate summary shape.
   * If the row already exists, we also require `update` on the existing
   * record; extraction modifies the stored summary in either case.
   */
  fastify.post<{ Body: Static<typeof CreateSummaryRequestSchema> }>(
    '/api/videos/summaries/generate',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        body: CreateSummaryRequestSchema,
        response: {
          202: SummaryJobSchema,
          400: Type.Object({ error: Type.String() }),
        },
      },
    },
    async (request, reply) => {
      const {
        videoId,
        personaId,
        frameSampleRate = 1,
        maxFrames = 30,
        enableAudio,
        enableSpeakerDiarization,
        fusionStrategy,
        audioLanguage,
      } = request.body
      if (!request.ability) throw new ForbiddenError('No abilities defined')
      const userId = request.user!.id

      const video = await fastify.prisma.video.findUnique({
        where: { id: videoId },
      })

      if (!video) {
        throw new NotFoundError('Video', videoId)
      }

      // Summaries inherit project scope from the persona they target.
      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
        select: { projectId: true },
      })

      if (!persona) {
        throw new NotFoundError('Persona', personaId)
      }

      // Pre-authorize as an update in the resolved scope. The candidate
      // shape carries the final projectId and createdBy so CASL's MongoQuery
      // conditions resolve against actual field values.
      const candidate = subject('VideoSummary', {
        projectId: persona.projectId,
        createdBy: userId,
      })
      if (!request.ability.can('update', candidate)) {
        throw new ForbiddenError('Cannot update this VideoSummary')
      }

      // If a row already exists, enforce instance-level update rights too:
      // the existing createdBy may belong to another user.
      const existing = await fastify.prisma.videoSummary.findUnique({
        where: { videoId_personaId: { videoId, personaId } },
      })
      if (existing && !request.ability.can('update', subject('VideoSummary', existing))) {
        throw new ForbiddenError('Cannot update this VideoSummary')
      }

      const jobData: SummarizeJobData = {
        videoId,
        personaId,
        frameSampleRate,
        maxFrames,
      }

      if (enableAudio !== undefined) {
        jobData.enableAudio = enableAudio
      }
      if (enableSpeakerDiarization !== undefined) {
        jobData.enableSpeakerDiarization = enableSpeakerDiarization
      }
      if (fusionStrategy !== undefined) {
        jobData.fusionStrategy = fusionStrategy
      }
      if (audioLanguage !== undefined) {
        jobData.audioLanguage = audioLanguage
      }

      const job = await videoSummarizationQueue.add(
        'summarize',
        jobData,
        {
          jobId: `${videoId}-${personaId}-${Date.now()}`,
        }
      )

      return reply.status(202).send({
        jobId: job.id ?? '',
        status: 'queued',
        videoId,
        personaId,
      })
    }
  )

  /**
   * Get status of summarization job.
   *
   * Jobs are keyed by `${videoId}-${personaId}-${timestamp}`; we parse the
   * target summary coordinates out of the job id and authorize against the
   * summary that the job mutates (or will mutate). This prevents job-status
   * probing from leaking existence of other users' summaries.
   */
  fastify.get<{ Params: { jobId: string } }>(
    '/api/jobs/:jobId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        params: Type.Object({
          jobId: Type.String(),
        }),
        response: {
          200: Type.Object({
            id: Type.String(),
            state: Type.String(),
            progress: Type.Union([
              Type.Number(),
              Type.Object({ percent: Type.Number(), stage: Type.String() }),
              Type.Null(),
            ]),
            data: Type.Object({
              videoId: Type.String(),
              personaId: Type.String(),
            }),
            returnvalue: Type.Optional(Type.Union([VideoSummarySchema, Type.Null()])),
            failedReason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
            finishedOn: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
            processedOn: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
          }),
          404: Type.Object({ error: Type.String() }),
        },
      },
    },
    async (request, reply) => {
      if (!request.ability) throw new ForbiddenError('No abilities defined')

      const job = await videoSummarizationQueue.getJob(request.params.jobId)

      if (!job) {
        throw new NotFoundError('Job', request.params.jobId)
      }

      // Authorize against the summary targeted by this job. Fall back to
      // the job payload if the id format is unexpected.
      const jobData = isSummarizeJobData(job.data) ? job.data : null
      const targetVideoId = jobData?.videoId
      const targetPersonaId = jobData?.personaId
      if (targetVideoId && targetPersonaId) {
        const existing = await fastify.prisma.videoSummary.findUnique({
          where: { videoId_personaId: { videoId: targetVideoId, personaId: targetPersonaId } },
        })
        if (existing && !request.ability.can('read', subject('VideoSummary', existing))) {
          throw new ForbiddenError('Cannot read this VideoSummary')
        }
      }

      const state = await job.getState()
      // job.progress is typed as number | object in BullMQ; narrow to the
      // shapes this queue actually emits without an unsafe cast.
      const rawProgress = job.progress
      const progress =
        typeof rawProgress === 'number'
          ? rawProgress
          : (typeof rawProgress === 'object' && rawProgress !== null
              && 'percent' in rawProgress && typeof rawProgress.percent === 'number'
              && 'stage' in rawProgress && typeof rawProgress.stage === 'string'
              ? { percent: rawProgress.percent, stage: rawProgress.stage }
              : null)
      const validJobData = isSummarizeJobData(job.data) ? job.data : null

      return reply.send({
        id: job.id ?? '',
        state,
        progress,
        data: validJobData
          ? { videoId: validJobData.videoId, personaId: validJobData.personaId }
          : { videoId: '', personaId: '' },
        returnvalue: state === 'completed' ? job.returnvalue : null,
        failedReason: state === 'failed' ? (job.failedReason || 'Job failed') : null,
        finishedOn: job.finishedOn ?? null,
        processedOn: job.processedOn ?? null,
      })
    }
  )

  /**
   * Save or update a video summary directly (from worker or manual entry).
   *
   * The row is scoped to the persona's project. Callers must be authorized
   * to create/update a VideoSummary in the resolved scope. On update, the
   * existing row must also pass an instance-level update check.
   */
  fastify.post<{ Body: Omit<Static<typeof VideoSummarySchema>, 'id' | 'createdAt' | 'updatedAt'> }>(
    '/api/summaries',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        body: Type.Intersect([
          Type.Object({
            videoId: Type.String(),
            personaId: Type.String({ format: 'uuid' }),
            summary: Type.Array(GlossItemSchema),
          }),
          Type.Partial(Type.Object({
            visualAnalysis: Type.String(),
            audioTranscript: Type.String(),
            keyFrames: Type.Array(KeyFrameSchema),
            confidence: Type.Number(),
            transcriptJson: TranscriptJsonSchema,
            audioLanguage: Type.String(),
            speakerCount: Type.Number(),
            audioModelUsed: Type.String(),
            visualModelUsed: Type.String(),
            fusionStrategy: Type.String(),
            processingTimeAudio: Type.Number(),
            processingTimeVisual: Type.Number(),
            processingTimeFusion: Type.Number(),
            createdBy: Type.String(),
          })),
        ]),
        response: {
          201: VideoSummarySchema,
          400: Type.Object({ error: Type.String() }),
        },
      },
    },
    async (request, reply) => {
      const {
        videoId,
        personaId,
        summary,
        visualAnalysis,
        audioTranscript,
        keyFrames,
        confidence,
        transcriptJson,
        audioLanguage,
        speakerCount,
        audioModelUsed,
        visualModelUsed,
        fusionStrategy,
        processingTimeAudio,
        processingTimeVisual,
        processingTimeFusion,
      } = request.body
      if (!request.ability) throw new ForbiddenError('No abilities defined')
      const userId = request.user!.id

      // Resolve project scope from the persona. Required for CASL's
      // project-scoped conditions to evaluate correctly.
      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
        select: { projectId: true },
      })
      if (!persona) throw new NotFoundError('Persona', personaId)

      // Load any existing row so we can distinguish create vs update and
      // apply the correct instance-level check.
      const existing = await fastify.prisma.videoSummary.findUnique({
        where: { videoId_personaId: { videoId, personaId } },
      })

      if (existing) {
        if (!request.ability.can('update', subject('VideoSummary', existing))) {
          throw new ForbiddenError('Cannot update this VideoSummary')
        }
      } else {
        const candidate = subject('VideoSummary', {
          projectId: persona.projectId,
          createdBy: userId,
        })
        if (!request.ability.can('create', candidate)) {
          throw new ForbiddenError('Cannot create this VideoSummary')
        }
      }

      const savedSummary = await fastify.prisma.videoSummary.upsert({
        where: {
          videoId_personaId: {
            videoId,
            personaId,
          },
        },
        update: {
          summary,
          visualAnalysis,
          audioTranscript,
          keyFrames: keyFrames || undefined,
          confidence,
          transcriptJson: transcriptJson || undefined,
          audioLanguage: audioLanguage || undefined,
          speakerCount: speakerCount || undefined,
          audioModelUsed: audioModelUsed || undefined,
          visualModelUsed: visualModelUsed || undefined,
          fusionStrategy: fusionStrategy || undefined,
          processingTimeAudio: processingTimeAudio || undefined,
          processingTimeVisual: processingTimeVisual || undefined,
          processingTimeFusion: processingTimeFusion || undefined,
          updatedAt: new Date(),
        },
        create: {
          videoId,
          personaId,
          summary,
          visualAnalysis,
          audioTranscript,
          keyFrames: keyFrames || undefined,
          confidence,
          transcriptJson: transcriptJson || undefined,
          audioLanguage: audioLanguage || undefined,
          speakerCount: speakerCount || undefined,
          audioModelUsed: audioModelUsed || undefined,
          visualModelUsed: visualModelUsed || undefined,
          fusionStrategy: fusionStrategy || undefined,
          processingTimeAudio: processingTimeAudio || undefined,
          processingTimeVisual: processingTimeVisual || undefined,
          processingTimeFusion: processingTimeFusion || undefined,
          createdBy: userId,
        },
      })

      return reply.status(201).send(savedSummary)
    }
  )

  /**
   * Update a video summary by ID. Caller must have `update` permission on
   * the specific row.
   */
  fastify.put<{
    Params: { videoId: string; summaryId: string }
    Body: { summary: Static<typeof GlossItemSchema>[] }
  }>(
    '/api/videos/:videoId/summaries/:summaryId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        params: Type.Object({
          videoId: Type.String(),
          summaryId: Type.String({ format: 'uuid' }),
        }),
        body: Type.Object({
          summary: Type.Array(GlossItemSchema),
        }),
        response: {
          200: VideoSummarySchema,
          404: Type.Object({ error: Type.String() }),
        },
      },
    },
    async (request, reply) => {
      const { summaryId } = request.params
      const { summary } = request.body
      if (!request.ability) throw new ForbiddenError('No abilities defined')

      const existing = await fastify.prisma.videoSummary.findUnique({
        where: { id: summaryId },
      })

      if (!existing) {
        throw new NotFoundError('Summary', summaryId)
      }

      if (!request.ability.can('update', subject('VideoSummary', existing))) {
        throw new ForbiddenError('Cannot update this VideoSummary')
      }

      const updated = await fastify.prisma.videoSummary.update({
        where: { id: summaryId },
        data: { summary: summary || [] },
      })

      return reply.send(updated)
    }
  )

  /**
   * Delete a video summary. Caller must have `delete` permission on the
   * specific row.
   */
  fastify.delete<{ Params: { videoId: string; personaId: string } }>(
    '/api/videos/:videoId/summaries/:personaId',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        params: Type.Object({
          videoId: Type.String(),
          personaId: Type.String(),
        }),
        response: {
          200: Type.Object({ success: Type.Boolean() }),
          404: Type.Object({ error: Type.String() }),
        },
      },
    },
    async (request, reply) => {
      const { videoId, personaId } = request.params
      if (!request.ability) throw new ForbiddenError('No abilities defined')

      const existing = await fastify.prisma.videoSummary.findUnique({
        where: { videoId_personaId: { videoId, personaId } },
      })

      if (!existing) {
        throw new NotFoundError('Summary', `${videoId}-${personaId}`)
      }

      if (!request.ability.can('delete', subject('VideoSummary', existing))) {
        throw new ForbiddenError('Cannot delete this VideoSummary')
      }

      await fastify.prisma.videoSummary.delete({
        where: { videoId_personaId: { videoId, personaId } },
      })

      return reply.send({ success: true })
    }
  )
}

export default summariesRoute
