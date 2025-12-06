/**
 * API routes for video summarization operations.
 *
 * This module provides endpoints for creating, retrieving, updating, and deleting
 * video summaries. It integrates with BullMQ for async processing and Prisma for storage.
 */

import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { videoSummarizationQueue } from '../queues/setup.js'
import { NotFoundError } from '../lib/errors.js'

/**
 * Job data for video summarization queue.
 */
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
   * Get all summaries for a video.
   */
  fastify.get<{ Params: { videoId: string } }>(
    '/api/videos/:videoId/summaries',
    {
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
      const summaries = await fastify.prisma.videoSummary.findMany({
        where: { videoId: request.params.videoId },
      })
      return reply.send(summaries)
    }
  )

  /**
   * Get summary for a specific video and persona.
   */
  fastify.get<{ Params: { videoId: string; personaId: string } }>(
    '/api/videos/:videoId/summaries/:personaId',
    {
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

      return reply.send(summary)
    }
  )

  /**
   * Request video summarization (queues job for async processing).
   */
  fastify.post<{ Body: Static<typeof CreateSummaryRequestSchema> }>(
    '/api/videos/summaries/generate',
    {
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

      const video = await fastify.prisma.video.findUnique({
        where: { id: videoId },
      })

      if (!video) {
        throw new NotFoundError('Video', videoId)
      }

      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
      })

      if (!persona) {
        throw new NotFoundError('Persona', personaId)
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
        jobId: job.id as string,
        status: 'queued',
        videoId,
        personaId,
      })
    }
  )

  /**
   * Get status of summarization job.
   */
  fastify.get<{ Params: { jobId: string } }>(
    '/api/jobs/:jobId',
    {
      schema: {
        params: Type.Object({
          jobId: Type.String(),
        }),
        response: {
          200: Type.Object({
            jobId: Type.String(),
            status: Type.String(),
            progress: Type.Union([Type.Number(), Type.Null()]),
            result: Type.Union([VideoSummarySchema, Type.Null()]),
            error: Type.Union([Type.String(), Type.Null()]),
          }),
          404: Type.Object({ error: Type.String() }),
        },
      },
    },
    async (request, reply) => {
      const job = await videoSummarizationQueue.getJob(request.params.jobId)

      if (!job) {
        throw new NotFoundError('Job', request.params.jobId)
      }

      const state = await job.getState()
      const progress = job.progress as number | null

      let result = null
      let error = null

      if (state === 'completed') {
        result = job.returnvalue
      } else if (state === 'failed') {
        error = job.failedReason || 'Job failed'
      }

      return reply.send({
        jobId: job.id as string,
        status: state,
        progress,
        result,
        error,
      })
    }
  )

  /**
   * Save or update a video summary directly (from worker or manual entry).
   */
  fastify.post<{ Body: Omit<Static<typeof VideoSummarySchema>, 'id' | 'createdAt' | 'updatedAt'> }>(
    '/api/summaries',
    {
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
        createdBy,
      } = request.body

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
          createdBy: createdBy || undefined,
        },
      })

      return reply.status(201).send(savedSummary)
    }
  )

  /**
   * Update a video summary by ID.
   */
  fastify.put<{
    Params: { videoId: string; summaryId: string }
    Body: { summary: Static<typeof GlossItemSchema>[] }
  }>(
    '/api/videos/:videoId/summaries/:summaryId',
    {
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

      const existing = await fastify.prisma.videoSummary.findUnique({
        where: { id: summaryId },
      })

      if (!existing) {
        throw new NotFoundError('Summary', summaryId)
      }

      const updated = await fastify.prisma.videoSummary.update({
        where: { id: summaryId },
        data: { summary: summary || [] },
      })

      return reply.send(updated)
    }
  )

  /**
   * Delete a video summary.
   */
  fastify.delete<{ Params: { videoId: string; personaId: string } }>(
    '/api/videos/:videoId/summaries/:personaId',
    {
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

      try {
        await fastify.prisma.videoSummary.delete({
          where: {
            videoId_personaId: {
              videoId,
              personaId,
            },
          },
        })

        return reply.send({ success: true })
      } catch (error) {
        throw new NotFoundError('Summary', `${videoId}-${personaId}`)
      }
    }
  )
}

export default summariesRoute
