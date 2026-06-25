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
import { demoPermitsSummaryRead, demoPermitsSummaryReclaim } from '../lib/demo-rbac.js'

/**
 * Job data for video summarization queue.
 */
/** Type guard for BullMQ job.data payloads from the summarization queue. */
function isSummarizeJobData(data: unknown): data is SummarizeJobData {
  if (typeof data !== 'object' || data === null) return false
  return 'videoId' in data && typeof data.videoId === 'string' &&
         'personaId' in data && typeof data.personaId === 'string'
}

interface GenerationOverridesJob {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

interface AudioOverridesJob {
  beamSize?: number;
  computeType?: 'float16' | 'float32' | 'int8' | 'int8_float16';
  numSpeakers?: number;
  minSpeakers?: number;
  maxSpeakers?: number;
  vadThreshold?: number;
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
  generationOverrides?: GenerationOverridesJob;
  audioOverrides?: AudioOverridesJob;
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
  // The project the summary is scoped to (null for personal personas).
  // Exposed so clients can reflect project scope and so the scope is
  // observable (its prior absence helped hide a stamping defect).
  projectId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

const GenerationOverridesSchema = Type.Partial(
  Type.Object({
    temperature: Type.Number({ minimum: 0, maximum: 2 }),
    topP: Type.Number({ minimum: 0, maximum: 1 }),
    maxTokens: Type.Integer({ minimum: 1, maximum: 32768 }),
  })
)

const AudioOverridesSchema = Type.Partial(
  Type.Object({
    beamSize: Type.Integer({ minimum: 1, maximum: 10 }),
    computeType: Type.Union([
      Type.Literal('float16'),
      Type.Literal('float32'),
      Type.Literal('int8'),
      Type.Literal('int8_float16'),
    ]),
    numSpeakers: Type.Integer({ minimum: 1, maximum: 20 }),
    minSpeakers: Type.Integer({ minimum: 1, maximum: 20 }),
    maxSpeakers: Type.Integer({ minimum: 1, maximum: 20 }),
    vadThreshold: Type.Number({ minimum: 0, maximum: 1 }),
  })
)

const CreateSummaryRequestSchema = Type.Object({
  videoId: Type.String(),
  personaId: Type.String({ format: 'uuid' }),
  frameSampleRate: Type.Optional(Type.Number({ minimum: 1, maximum: 10, default: 1 })),
  maxFrames: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 30 })),
  enableAudio: Type.Optional(Type.Boolean()),
  enableSpeakerDiarization: Type.Optional(Type.Boolean()),
  fusionStrategy: Type.Optional(Type.String()),
  audioLanguage: Type.Optional(Type.String()),
  generationOverrides: Type.Optional(GenerationOverridesSchema),
  audioOverrides: Type.Optional(AudioOverridesSchema),
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
        // Callers whose CASL ability is scoped to their own data (anonymous
        // demo sessions, non-admin users opening a tour) still need to read
        // summaries the seeded persona produced over the shared demo corpus.
        // demoPermitsSummaryRead is true only in demo mode (see
        // lib/demo-rbac.ts).
        if (!demoPermitsSummaryRead()) {
          throw new ForbiddenError('Cannot read this VideoSummary')
        }
      }

      return reply.send(summary)
    }
  )

  /**
   * Batch lookup of summaries for many videos under a single persona.
   *
   * The VideoBrowser checks, for the selected persona, which of the listed
   * videos already have a summary. Doing that one video at a time (GET
   * /api/videos/:videoId/summaries/:personaId per video) fans a single page
   * load out into one request per video — most of them 404 — which on a large
   * deployment trips the rate limit and floods the logs. This endpoint takes a
   * list of video ids plus one persona id and returns only the summaries that
   * exist and that the caller may read (a sparse result: videos with no summary
   * are simply absent). Each row carries its `videoId` so the client can index
   * the result.
   */
  fastify.post<{ Body: { videoIds: string[]; personaId: string } }>(
    '/api/videos/summaries/lookup',
    {
      onRequest: [requireAuth, buildAbilities],
      schema: {
        body: Type.Object({
          videoIds: Type.Array(Type.String(), { maxItems: 100000 }),
          personaId: Type.String(),
        }),
        response: {
          200: Type.Array(VideoSummarySchema),
        },
      },
    },
    async (request, reply) => {
      if (!request.ability) throw new ForbiddenError('No abilities defined')

      const { videoIds, personaId } = request.body
      if (videoIds.length === 0) {
        return reply.send([])
      }

      const summaries = await fastify.prisma.videoSummary.findMany({
        where: {
          personaId,
          videoId: { in: videoIds },
        },
      })

      // Mirror the single-record read semantics, including the demo-mode
      // override, rather than filtering in the query, so behaviour matches
      // GET /api/videos/:videoId/summaries/:personaId exactly.
      const readable = summaries.filter(
        (summary) =>
          request.ability!.can('read', subject('VideoSummary', summary)) ||
          demoPermitsSummaryRead()
      )

      return reply.send(readable)
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
        generationOverrides,
        audioOverrides,
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
        // VideoSummary rows in the demo deployment are routinely orphaned when
        // the idle-reset sweeper deletes a stale demo-anonymous-* user but
        // leaves the row behind with a now-dangling createdBy. Without reclaim,
        // the next demo visitor hits "Cannot update this VideoSummary" on every
        // video any prior demo session touched. demoPermitsSummaryReclaim gates
        // the reclaim on demo mode AND a demo-anonymous-* username (see
        // lib/demo-rbac.ts); we overwrite createdBy to the current demo user
        // before the update, keeping the row scoped to the same persona + video
        // so no cross-user content leaks.
        if (demoPermitsSummaryReclaim(request.user?.username)) {
          await fastify.prisma.videoSummary.update({
            where: { videoId_personaId: { videoId, personaId } },
            data: { createdBy: userId },
          })
        } else {
          throw new ForbiddenError('Cannot update this VideoSummary')
        }
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
      if (generationOverrides !== undefined) {
        jobData.generationOverrides = generationOverrides
      }
      if (audioOverrides !== undefined) {
        jobData.audioOverrides = audioOverrides
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
      // project-scoped conditions to evaluate correctly. Pulled with
      // userId + isSystemGenerated so the ownership precheck below can
      // verify the persona is one the caller is allowed to author
      // under without an extra round-trip.
      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
        select: { projectId: true, userId: true, isSystemGenerated: true },
      })
      if (!persona) throw new NotFoundError('Persona', personaId)

      // Ensure the caller can use this persona as the summary's owner.
      // The v0.4.1 baseline create rule grants any signed-in user a
      // self-owning create on VideoSummary; without an explicit persona
      // precheck a user could hang a summary off another user's
      // private persona (the @@unique([videoId, personaId]) would then
      // wedge the real owner out of their own row). Mirrors the same
      // check the annotations POST route already runs.
      if (!request.ability.can('read', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot create a summary under this Persona')
      }

      // Load any existing row so we can distinguish create vs update and
      // apply the correct instance-level check.
      const existing = await fastify.prisma.videoSummary.findUnique({
        where: { videoId_personaId: { videoId, personaId } },
      })

      if (existing) {
        if (!request.ability.can('update', subject('VideoSummary', existing))) {
          // Same rationale as the queue-summarize route: reclaim orphan
          // summaries left behind by the idle-reset sweeper instead of 403-ing.
          // demoPermitsSummaryReclaim gates this on demo mode AND a
          // demo-anonymous-* username (see lib/demo-rbac.ts).
          if (demoPermitsSummaryReclaim(request.user?.username)) {
            await fastify.prisma.videoSummary.update({
              where: { videoId_personaId: { videoId, personaId } },
              data: { createdBy: userId },
            })
          } else {
            throw new ForbiddenError('Cannot update this VideoSummary')
          }
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
          // Re-stamp the project scope from the persona on every save. The
          // summary's project is always its persona's project; restamping
          // also heals any row created before projectId was stamped.
          projectId: persona.projectId,
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
          // Stamp the persona's project so the summary is born in the right
          // project scope. Without this the row is NULL-scoped and project
          // collaborators (read rule { projectId: { in: [...] } }) cannot see
          // it, which 403s their attempts to add claims under it.
          projectId: persona.projectId,
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
