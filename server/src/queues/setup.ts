import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';

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

queueEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed with result:`, returnvalue);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed:`, failedReason);
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

    const modelServiceUrl = process.env.MODEL_SERVICE_URL || 'http://localhost:8000';
    const response = await fetch(`${modelServiceUrl}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id: videoId,
        persona_id: personaId,
        frame_sample_rate: frameSampleRate,
        max_frames: maxFrames,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Model service error (${response.status}): ${errorText}`);
    }

    await job.updateProgress(50);

    const modelResponse = await response.json();

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
      keyFrames: savedSummary.keyFrames as any,
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
