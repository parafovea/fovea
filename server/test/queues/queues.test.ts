import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { Queue, Worker, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'
import type {
  VideoSummarizationJobData,
  VideoSummarizationResult,
} from '../src/queues/setup.js'

describe('BullMQ Queue Setup', () => {
  let connection: IORedis
  let testQueue: Queue

  beforeAll(() => {
    connection = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    })

    testQueue = new Queue('test-video-summarization', {
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
    })
  })

  afterAll(async () => {
    await testQueue.close()
    await connection.quit()
  })

  beforeEach(async () => {
    await testQueue.obliterate({ force: true })
  })

  describe('Queue Configuration', () => {
    it('should create a queue instance with correct configuration', () => {
      expect(testQueue).toBeDefined()
      expect(testQueue.name).toBe('test-video-summarization')
    })

    it('should add a job to the queue', async () => {
      const jobData: VideoSummarizationJobData = {
        videoId: 'video-123',
        personaId: 'persona-456',
      }

      const job = await testQueue.add('summarize', jobData)

      expect(job).toBeDefined()
      expect(job.id).toBeDefined()
      expect(job.data).toEqual(jobData)
    })

    it('should configure default job options', async () => {
      const jobData: VideoSummarizationJobData = {
        videoId: 'video-789',
        personaId: 'persona-012',
      }

      const job = await testQueue.add('summarize', jobData)

      expect(job.opts.attempts).toBe(3)
      expect(job.opts.backoff).toEqual({
        type: 'exponential',
        delay: 2000,
      })
      expect(job.opts.removeOnComplete).toBe(100)
      expect(job.opts.removeOnFail).toBe(100)
    })

    it('should retrieve job from queue', async () => {
      const jobData: VideoSummarizationJobData = {
        videoId: 'video-abc',
        personaId: 'persona-def',
      }

      const addedJob = await testQueue.add('summarize', jobData)
      const retrievedJob = await testQueue.getJob(addedJob.id!)

      expect(retrievedJob).toBeDefined()
      expect(retrievedJob?.data).toEqual(jobData)
    })

    it('should add multiple jobs to the queue', async () => {
      const jobData1: VideoSummarizationJobData = {
        videoId: 'video-1',
        personaId: 'persona-1',
      }
      const jobData2: VideoSummarizationJobData = {
        videoId: 'video-2',
        personaId: 'persona-2',
      }

      const job1 = await testQueue.add('summarize', jobData1)
      const job2 = await testQueue.add('summarize', jobData2)

      expect(job1.id).toBeDefined()
      expect(job2.id).toBeDefined()
      expect(job1.id).not.toBe(job2.id)
    })

    it('should remove a job from the queue', async () => {
      const jobData: VideoSummarizationJobData = {
        videoId: 'video-remove',
        personaId: 'persona-remove',
      }

      const job = await testQueue.add('summarize', jobData)
      await job.remove()

      const retrievedJob = await testQueue.getJob(job.id!)
      expect(retrievedJob).toBeUndefined()
    })
  })

  describe('Worker job processing', () => {
    it('should process a job successfully', async () => {
      const testWorker = new Worker<VideoSummarizationJobData, VideoSummarizationResult>(
        'test-video-summarization',
        async (job) => {
          const { videoId, personaId } = job.data
          await job.updateProgress(50)

          const mockResult: VideoSummarizationResult = {
            summaryId: 'summary-123',
            videoId,
            personaId,
            summary: 'Test video summary',
            visualAnalysis: 'Visual analysis of test video',
            confidence: 0.95,
          }

          await job.updateProgress(100)
          return mockResult
        },
        {
          connection,
          autorun: false,
        }
      )

      const jobData: VideoSummarizationJobData = {
        videoId: 'video-test',
        personaId: 'persona-test',
      }

      await testQueue.add('summarize', jobData)

      testWorker.run()

      const result = await new Promise<VideoSummarizationResult>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 5000)

        testWorker.on('completed', (completedJob) => {
          clearTimeout(timeout)
          resolve(completedJob.returnvalue)
        })
        testWorker.on('failed', (failedJob, error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      expect(result).toBeDefined()
      expect(result.videoId).toBe('video-test')
      expect(result.personaId).toBe('persona-test')
      expect(result.summary).toBe('Test video summary')

      await testWorker.close()
    }, 10000)

    it('should update job progress during processing', async () => {
      const progressUpdates: number[] = []
      const queueEvents = new QueueEvents('test-video-summarization', { connection })

      const testWorker = new Worker<VideoSummarizationJobData, VideoSummarizationResult>(
        'test-video-summarization',
        async (job) => {
          await job.updateProgress(25)
          await job.updateProgress(50)
          await job.updateProgress(75)
          await job.updateProgress(100)

          const mockResult: VideoSummarizationResult = {
            summaryId: 'summary-progress',
            videoId: job.data.videoId,
            personaId: job.data.personaId,
            summary: 'Progress test summary',
            confidence: 0.9,
          }

          return mockResult
        },
        {
          connection,
          autorun: false,
        }
      )

      const jobData: VideoSummarizationJobData = {
        videoId: 'video-progress',
        personaId: 'persona-progress',
      }

      const job = await testQueue.add('summarize', jobData)

      queueEvents.on('progress', ({ jobId, data }) => {
        if (jobId === job.id) {
          progressUpdates.push(data as number)
        }
      })

      testWorker.run()

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 5000)

        testWorker.on('completed', () => {
          clearTimeout(timeout)
          resolve()
        })
        testWorker.on('failed', (failedJob, error) => {
          clearTimeout(timeout)
          reject(error)
        })
      })

      expect(progressUpdates.length).toBeGreaterThan(0)

      await testWorker.close()
      await queueEvents.close()
    }, 10000)

    it('should retry failed jobs according to configuration', async () => {
      let attemptCount = 0

      const testWorker = new Worker<VideoSummarizationJobData, VideoSummarizationResult>(
        'test-video-summarization',
        async (job) => {
          attemptCount++
          if (attemptCount < 3) {
            throw new Error('Simulated failure')
          }

          const mockResult: VideoSummarizationResult = {
            summaryId: 'summary-retry',
            videoId: job.data.videoId,
            personaId: job.data.personaId,
            summary: 'Retry test summary',
            confidence: 0.85,
          }

          return mockResult
        },
        {
          connection,
          autorun: false,
        }
      )

      const jobData: VideoSummarizationJobData = {
        videoId: 'video-retry',
        personaId: 'persona-retry',
      }

      await testQueue.add('summarize', jobData)

      testWorker.run()

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 15000)

        testWorker.on('completed', () => {
          clearTimeout(timeout)
          resolve()
        })
        testWorker.on('failed', (failedJob, error) => {
          if ((failedJob?.attemptsMade ?? 0) >= 3) {
            clearTimeout(timeout)
            reject(error)
          }
        })
      })

      expect(attemptCount).toBe(3)

      await testWorker.close()
    }, 20000)
  })

  describe('Queue concurrency', () => {
    it('should respect concurrency settings', async () => {
      const concurrentJobs = new Set<string>()
      let maxConcurrent = 0

      const testWorker = new Worker<VideoSummarizationJobData, VideoSummarizationResult>(
        'test-video-summarization',
        async (job) => {
          concurrentJobs.add(job.id!)
          maxConcurrent = Math.max(maxConcurrent, concurrentJobs.size)

          await new Promise(resolve => setTimeout(resolve, 100))

          concurrentJobs.delete(job.id!)

          const mockResult: VideoSummarizationResult = {
            summaryId: `summary-${job.id}`,
            videoId: job.data.videoId,
            personaId: job.data.personaId,
            summary: 'Concurrent test summary',
            confidence: 0.88,
          }

          return mockResult
        },
        {
          connection,
          concurrency: 2,
          autorun: false,
        }
      )

      const jobs = []
      for (let i = 0; i < 5; i++) {
        jobs.push(
          testQueue.add('summarize', {
            videoId: `video-${i}`,
            personaId: `persona-${i}`,
          })
        )
      }

      await Promise.all(jobs)

      testWorker.run()

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Test timeout')), 10000)
        let completedCount = 0
        testWorker.on('completed', () => {
          completedCount++
          if (completedCount === 5) {
            clearTimeout(timeout)
            resolve()
          }
        })
      })

      expect(maxConcurrent).toBeLessThanOrEqual(2)
      expect(maxConcurrent).toBeGreaterThan(0)

      await testWorker.close()
    }, 15000)
  })
})
