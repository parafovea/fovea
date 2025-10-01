/**
 * Tests for API client.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ApiClient } from './client'
import { server } from '../../test/setup'
import { http, HttpResponse } from 'msw'

describe('ApiClient', () => {
  let client: ApiClient

  beforeEach(() => {
    client = new ApiClient({ baseURL: 'http://localhost:3001' })
  })

  describe('getVideoSummaries', () => {
    it('fetches all summaries for a video', async () => {
      const summaries = await client.getVideoSummaries('video-1')

      expect(summaries).toHaveLength(1)
      expect(summaries[0]).toMatchObject({
        id: 'summary-1',
        videoId: 'video-1',
        personaId: 'persona-1',
        summary: expect.stringContaining('Baseball scout'),
      })
    })

    it('throws ApiError on network failure', async () => {
      server.use(
        http.get('http://localhost:3001/api/videos/:videoId/summaries', () => {
          return HttpResponse.json(
            { message: 'Internal server error' },
            { status: 500 }
          )
        })
      )

      await expect(client.getVideoSummaries('video-1')).rejects.toMatchObject({
        statusCode: 500,
      })
    })
  })

  describe('getVideoSummary', () => {
    it('fetches a specific summary', async () => {
      const summary = await client.getVideoSummary('video-1', 'persona-1')

      expect(summary).toMatchObject({
        videoId: 'video-1',
        personaId: 'persona-1',
        summary: expect.stringContaining('Wildlife researcher'),
      })
    })

    it('returns null for 404 responses', async () => {
      const summary = await client.getVideoSummary('video-1', 'persona-missing')

      expect(summary).toBeNull()
    })

    it('throws ApiError on other errors', async () => {
      server.use(
        http.get('http://localhost:3001/api/videos/:videoId/summaries/:personaId', () => {
          return HttpResponse.json(
            { message: 'Bad request' },
            { status: 400 }
          )
        })
      )

      await expect(client.getVideoSummary('video-1', 'persona-1')).rejects.toMatchObject({
        statusCode: 400,
      })
    })
  })

  describe('generateSummary', () => {
    it('queues a summary generation job', async () => {
      const response = await client.generateSummary({
        videoId: 'video-1',
        personaId: 'persona-1',
      })

      expect(response).toMatchObject({
        jobId: 'job-123',
        videoId: 'video-1',
        personaId: 'persona-1',
      })
    })

    it('passes optional parameters', async () => {
      const response = await client.generateSummary({
        videoId: 'video-1',
        personaId: 'persona-1',
        frameSampleRate: 10,
        maxFrames: 100,
      })

      expect(response.jobId).toBe('job-123')
    })

    it('throws ApiError on failure', async () => {
      server.use(
        http.post('http://localhost:3001/api/videos/summaries/generate', () => {
          return HttpResponse.json(
            { message: 'Validation failed' },
            { status: 422 }
          )
        })
      )

      await expect(
        client.generateSummary({
          videoId: 'video-1',
          personaId: 'persona-1',
        })
      ).rejects.toMatchObject({
        statusCode: 422,
      })
    })
  })

  describe('getJobStatus', () => {
    it('fetches job status', async () => {
      const status = await client.getJobStatus('job-active')

      expect(status).toMatchObject({
        id: 'job-active',
        state: 'active',
        progress: 50,
      })
    })

    it('handles completed jobs', async () => {
      const status = await client.getJobStatus('job-completed')

      expect(status).toMatchObject({
        state: 'completed',
        progress: 100,
        returnvalue: expect.objectContaining({
          summary: expect.stringContaining('Retail analyst'),
        }),
      })
    })

    it('handles failed jobs', async () => {
      const status = await client.getJobStatus('job-failed')

      expect(status).toMatchObject({
        state: 'failed',
        failedReason: 'Video file not found',
      })
    })
  })

  describe('saveSummary', () => {
    it('saves a summary', async () => {
      const summary = await client.saveSummary({
        videoId: 'video-1',
        personaId: 'persona-1',
        summary: 'Test summary',
        visualAnalysis: 'Test analysis',
        audioTranscript: null,
        keyFrames: [0, 100],
        confidence: 0.9,
      })

      expect(summary).toMatchObject({
        id: 'summary-new',
        videoId: 'video-1',
        personaId: 'persona-1',
        summary: 'Test summary',
      })
    })
  })

  describe('deleteSummary', () => {
    it('deletes a summary', async () => {
      await expect(
        client.deleteSummary('video-1', 'persona-1')
      ).resolves.toBeUndefined()
    })

    it('throws ApiError on failure', async () => {
      server.use(
        http.delete('http://localhost:3001/api/videos/:videoId/summaries/:personaId', () => {
          return HttpResponse.json(
            { message: 'Not found' },
            { status: 404 }
          )
        })
      )

      await expect(
        client.deleteSummary('video-1', 'persona-1')
      ).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })
})
