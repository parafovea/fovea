/**
 * API routes for video summarization operations.
 *
 * This module provides endpoints for creating, retrieving, updating, and deleting
 * video summaries. It integrates with BullMQ for async processing and Prisma for storage.
 */

import { Type, Static } from '@sinclair/typebox'
import { FastifyPluginAsync } from 'fastify'
import { videoSummarizationQueue } from '../queues/setup.js'

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

const VideoSummarySchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  videoId: Type.String(),
  personaId: Type.String({ format: 'uuid' }),
  summary: Type.String(),
  visualAnalysis: Type.Union([Type.String(), Type.Null()]),
  audioTranscript: Type.Union([Type.String(), Type.Null()]),
  keyFrames: Type.Union([Type.Any(), Type.Null()]),
  confidence: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
  transcriptJson: Type.Optional(Type.Union([Type.Any(), Type.Null()])),
  audioLanguage: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  speakerCount: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  audioModelUsed: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  visualModelUsed: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  fusionStrategy: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  processingTimeAudio: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  processingTimeVisual: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
  processingTimeFusion: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
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
        return reply.status(404).send({ error: 'Summary not found' })
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
        return reply.status(404).send({ error: 'Video not found' })
      }

      const persona = await fastify.prisma.persona.findUnique({
        where: { id: personaId },
      })

      if (!persona) {
        return reply.status(404).send({ error: 'Persona not found' })
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
        return reply.status(404).send({ error: 'Job not found' })
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
        body: Type.Object({
          videoId: Type.String(),
          personaId: Type.String({ format: 'uuid' }),
          summary: Type.String(),
          visualAnalysis: Type.Union([Type.String(), Type.Null()]),
          audioTranscript: Type.Union([Type.String(), Type.Null()]),
          keyFrames: Type.Union([Type.Any(), Type.Null()]),
          confidence: Type.Union([Type.Number(), Type.Null()]),
          transcriptJson: Type.Optional(Type.Union([Type.Any(), Type.Null()])),
          audioLanguage: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          speakerCount: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
          audioModelUsed: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          visualModelUsed: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          fusionStrategy: Type.Optional(Type.Union([Type.String(), Type.Null()])),
          processingTimeAudio: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
          processingTimeVisual: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
          processingTimeFusion: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
        }),
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
        },
      })

      return reply.status(201).send(savedSummary)
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
        return reply.status(404).send({ error: 'Summary not found' })
      }
    }
  )
}

export default summariesRoute
