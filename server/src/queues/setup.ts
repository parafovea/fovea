import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';

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
 * Job data structure for video summarization tasks.
 */
export interface VideoSummarizationJobData {
  videoId: string;
  personaId: string;
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
 * Calls the model service API to generate video summaries using vision language models.
 */
export const videoWorker = new Worker<VideoSummarizationJobData, VideoSummarizationResult>(
  'video-summarization',
  async (job): Promise<VideoSummarizationResult> => {
    const { videoId, personaId } = job.data;

    await job.updateProgress(10);

    const response = await fetch(`${process.env.MODEL_SERVICE_URL}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId, personaId }),
    });

    if (!response.ok) {
      throw new Error(`Model service error: ${response.statusText}`);
    }

    await job.updateProgress(90);

    const summary = await response.json() as VideoSummarizationResult;

    await job.updateProgress(100);

    return summary;
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
 * Closes workers and queue events cleanly.
 */
export async function closeQueues(): Promise<void> {
  await videoWorker.close();
  await queueEvents.close();
  await videoSummarizationQueue.close();
  await connection.quit();
}
