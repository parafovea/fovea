import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { queueJobCounter, queueJobDuration, modelServiceCounter, modelServiceDuration } from '../metrics.js';
import { buildPersonaPrompts } from '../utils/queryBuilder.js';

/**
 * Response type from model service /api/summarize endpoint.
 */
interface ModelSummarizeResponse {
  summary: string;
  visual_analysis: string;
  audio_transcript: string;
  key_frames: number[];
  confidence: number;
}

/**
 * Redis connection configuration for BullMQ.
 * Uses environment variables with localhost defaults for development.
 */
const connection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null,
});

/**
 * Queue for processing video summarization jobs.
 * Jobs include video analysis using vision language models to generate summaries.
 */
export const videoSummarizationQueue = new Queue('video-summarization', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});

/**
 * Queue events for monitoring video summarization job lifecycle.
 * Provides logging for completed and failed jobs.
 */
const queueEvents = new QueueEvents('video-summarization', { connection });

queueEvents.on('completed', async ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed with result:`, returnvalue);

  // Get job details to calculate duration
  const job = await videoSummarizationQueue.getJob(jobId);
  if (job) {
    const duration = job.finishedOn ? job.finishedOn - (job.processedOn || job.timestamp) : 0;
    queueJobCounter.add(1, { queue: 'video-summarization', status: 'completed' });
    queueJobDuration.record(duration, { queue: 'video-summarization', status: 'completed' });
  }
});

queueEvents.on('failed', async ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed:`, failedReason);

  // Get job details to calculate duration
  const job = await videoSummarizationQueue.getJob(jobId);
  if (job) {
    const duration = job.finishedOn ? job.finishedOn - (job.processedOn || job.timestamp) : 0;
    queueJobCounter.add(1, { queue: 'video-summarization', status: 'failed' });
    queueJobDuration.record(duration, { queue: 'video-summarization', status: 'failed' });
  }
});

/**
 * Prisma client instance for database operations within workers.
 */
const prisma = new PrismaClient();

/**
 * Job data structure for video summarization tasks.
 */
export interface VideoSummarizationJobData {
  videoId: string;
  personaId: string;
  frameSampleRate?: number;
  maxFrames?: number;
}

/**
 * Result structure returned by video summarization jobs.
 */
export interface VideoSummarizationResult {
  summaryId: string;
  videoId: string;
  personaId: string;
  summary: string;
  visualAnalysis?: string;
  audioTranscript?: string;
  keyFrames?: Array<{
    timestamp: number;
    description: string;
  }>;
  confidence?: number;
}

/**
 * Worker for processing video summarization jobs.
 * Calls the model service API to generate video summaries using vision language models,
 * then saves the results to Prisma database.
 */
export const videoWorker = new Worker<VideoSummarizationJobData, VideoSummarizationResult>(
  'video-summarization',
  async (job): Promise<VideoSummarizationResult> => {
    const { videoId, personaId, frameSampleRate = 1, maxFrames = 30 } = job.data;

    await job.updateProgress(10);

    // Fetch persona prompts for context-specific summarization
    const persona = await prisma.persona.findUnique({
      where: { id: personaId },
    });

    if (!persona) {
      throw new Error(`Persona not found: ${personaId}`);
    }

    // Build persona prompts (null for Automated persona)
    let personaRole: string | null = null;
    let informationNeed: string | null = null;

    if (persona.name !== 'Automated') {
      const prompts = await buildPersonaPrompts(personaId, prisma);
      personaRole = prompts.persona_role;
      informationNeed = prompts.information_need;
    }

    // Call model service with metrics tracking
    const modelServiceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8000';
    const modelStartTime = Date.now();

    const response = await fetch(`${modelServiceUrl}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: videoId,
        persona_id: personaId,
        frame_sample_rate: frameSampleRate,
        max_frames: maxFrames,
        persona_role: personaRole,
        information_need: informationNeed,
      }),
    });

    const modelDuration = Date.now() - modelStartTime;

    if (!response.ok) {
      modelServiceCounter.add(1, { endpoint: '/api/summarize', status: response.status });
      modelServiceDuration.record(modelDuration, { endpoint: '/api/summarize', status: response.status });

      const errorText = await response.text();
      throw new Error(`Model service error (${response.status}): ${errorText}`);
    }

    modelServiceCounter.add(1, { endpoint: '/api/summarize', status: response.status });
    modelServiceDuration.record(modelDuration, { endpoint: '/api/summarize', status: response.status });

    await job.updateProgress(50);

    const modelResponse = await response.json() as ModelSummarizeResponse;

    await job.updateProgress(70);

    const savedSummary = await prisma.videoSummary.upsert({
      where: {
        videoId_personaId: {
          videoId,
          personaId,
        },
      },
      update: {
        summary: modelResponse.summary,
        visualAnalysis: modelResponse.visual_analysis,
        audioTranscript: modelResponse.audio_transcript,
        keyFrames: modelResponse.key_frames,
        confidence: modelResponse.confidence,
        updatedAt: new Date(),
      },
      create: {
        videoId,
        personaId,
        summary: modelResponse.summary,
        visualAnalysis: modelResponse.visual_analysis,
        audioTranscript: modelResponse.audio_transcript,
        keyFrames: modelResponse.key_frames,
        confidence: modelResponse.confidence,
      },
    });

    await job.updateProgress(100);

    return {
      summaryId: savedSummary.id,
      videoId: savedSummary.videoId,
      personaId: savedSummary.personaId,
      summary: savedSummary.summary,
      visualAnalysis: savedSummary.visualAnalysis || undefined,
      audioTranscript: savedSummary.audioTranscript || undefined,
      keyFrames: savedSummary.keyFrames as Array<{ timestamp: number; description: string }> | undefined,
      confidence: savedSummary.confidence || undefined,
    };
  },
  {
    connection,
    concurrency: 5,
    limiter: {
      max: 10,
      duration: 60000,
    },
  }
);

/**
 * Graceful shutdown handler for queue connections.
 * Closes workers, queue events, and Prisma client cleanly.
 */
export async function closeQueues(): Promise<void> {
  await videoWorker.close();
  await queueEvents.close();
  await videoSummarizationQueue.close();
  await connection.quit();
  await prisma.$disconnect();
}
