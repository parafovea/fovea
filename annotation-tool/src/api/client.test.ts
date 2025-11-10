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

  describe('augmentOntology', () => {
    it('returns ontology suggestions', async () => {
      const response = await client.augmentOntology({
        personaId: 'persona-1',
        domain: 'baseball analytics',
        existingTypes: ['Player', 'Team', 'Game'],
        targetCategory: 'event',
        maxSuggestions: 5,
      })

      expect(response).toMatchObject({
        id: 'augment-1',
        personaId: 'persona-1',
        targetCategory: 'event',
      })
      expect(response.suggestions).toHaveLength(2)
      expect(response.suggestions[0]).toMatchObject({
        name: 'Home Run',
        description: expect.stringContaining('batter'),
        confidence: 0.95,
        examples: expect.arrayContaining(['Grand slam']),
      })
    })

    it('handles optional parameters', async () => {
      const response = await client.augmentOntology({
        personaId: 'persona-1',
        domain: 'sports analytics',
        existingTypes: ['Player'],
        targetCategory: 'entity',
      })

      expect(response.personaId).toBe('persona-1')
    })

    it('throws ApiError on failure', async () => {
      server.use(
        http.post('http://localhost:3001/api/ontology/augment', () => {
          return HttpResponse.json(
            { message: 'Invalid category' },
            { status: 400 }
          )
        })
      )

      await expect(
        client.augmentOntology({
          personaId: 'persona-1',
          domain: 'test',
          existingTypes: [],
          targetCategory: 'entity',
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      })
    })
  })

  describe('detectObjects', () => {
    it('detects objects with manual query', async () => {
      const response = await client.detectObjects({
        videoId: 'video-1',
        manualQuery: 'baseball, bat, glove',
      })

      expect(response).toMatchObject({
        id: 'detection-1',
        videoId: 'video-1',
        query: 'baseball, bat, glove',
        totalDetections: 3,
      })
      expect(response.frames).toHaveLength(2)
      expect(response.frames[0].detections[0]).toMatchObject({
        label: 'baseball',
        confidence: 0.94,
        trackId: 'track-1',
      })
    })

    it('detects objects with persona and query options', async () => {
      const response = await client.detectObjects({
        videoId: 'video-1',
        personaId: 'persona-1',
        queryOptions: {
          includeEntityTypes: true,
          includeEntityGlosses: true,
        },
        frameNumbers: [0, 30, 60],
        confidenceThreshold: 0.7,
        enableTracking: true,
      })

      expect(response.videoId).toBe('video-1')
      expect(response.frames.length).toBeGreaterThan(0)
    })

    it('throws ApiError on failure', async () => {
      server.use(
        http.post('http://localhost:3001/api/videos/:videoId/detect', () => {
          return HttpResponse.json(
            { message: 'Video not found' },
            { status: 404 }
          )
        })
      )

      await expect(
        client.detectObjects({
          videoId: 'invalid',
          manualQuery: 'test',
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })

  describe('getModelConfig', () => {
    it('fetches model configuration', async () => {
      const config = await client.getModelConfig()

      expect(config).toMatchObject({
        cudaAvailable: true,
      })
      expect(config.models.vlm).toMatchObject({
        selected: 'llava',
      })
      expect(config.models.vlm.options.llava).toMatchObject({
        modelId: 'llava-hf/llava-1.5-7b-hf',
        vramGb: 14.0,
      })
      expect(config.inference).toMatchObject({
        maxMemoryPerModel: 24.0,
        offloadThreshold: 0.8,
      })
    })

    it('throws ApiError on failure', async () => {
      server.use(
        http.get('http://localhost:3001/api/models/config', () => {
          return HttpResponse.json(
            { message: 'Service unavailable' },
            { status: 503 }
          )
        })
      )

      await expect(client.getModelConfig()).rejects.toMatchObject({
        statusCode: 503,
      })
    })
  })

  describe('selectModel', () => {
    it('selects a model for a task type', async () => {
      const response = await client.selectModel({
        taskType: 'vlm',
        modelName: 'llava',
      })

      expect(response).toMatchObject({
        status: 'success',
        taskType: 'vlm',
        selectedModel: 'llava',
      })
    })

    it('throws ApiError on failure', async () => {
      server.use(
        http.post('http://localhost:3001/api/models/select', () => {
          return HttpResponse.json(
            { message: 'Invalid model name' },
            { status: 400 }
          )
        })
      )

      await expect(
        client.selectModel({
          taskType: 'vlm',
          modelName: 'invalid',
        })
      ).rejects.toMatchObject({
        statusCode: 400,
      })
    })
  })

  describe('validateMemoryBudget', () => {
    it('validates memory budget', async () => {
      const validation = await client.validateMemoryBudget()

      expect(validation).toMatchObject({
        valid: true,
        totalVramGb: 24.0,
        totalRequiredGb: 18.0,
        threshold: 0.8,
      })
      expect(validation.modelRequirements.vlm).toMatchObject({
        modelId: 'llava-hf/llava-1.5-7b-hf',
        vramGb: 14.0,
      })
    })

    it('throws ApiError on failure', async () => {
      server.use(
        http.post('http://localhost:3001/api/models/validate', () => {
          return HttpResponse.json(
            { message: 'Validation error' },
            { status: 500 }
          )
        })
      )

      await expect(client.validateMemoryBudget()).rejects.toMatchObject({
        statusCode: 500,
      })
    })
  })

  describe('getModelStatus', () => {
    it('fetches model status', async () => {
      const status = await client.getModelStatus()

      expect(status).toMatchObject({
        totalVramAllocatedGb: 14.0,
        totalVramAvailableGb: 24.0,
        cudaAvailable: true,
      })
      expect(status.loadedModels).toHaveLength(1)
      expect(status.loadedModels[0]).toMatchObject({
        modelId: 'llava-hf/llava-1.5-7b-hf',
        taskType: 'vlm',
        health: 'loaded',
        warmUpComplete: true,
      })
      expect(status.loadedModels[0].performanceMetrics).toMatchObject({
        totalRequests: 150,
        averageLatencyMs: 234.5,
      })
    })

    it('throws ApiError on failure', async () => {
      server.use(
        http.get('http://localhost:3001/api/models/status', () => {
          return HttpResponse.json(
            { message: 'Service error' },
            { status: 500 }
          )
        })
      )

      await expect(client.getModelStatus()).rejects.toMatchObject({
        statusCode: 500,
      })
    })
  })

  describe('error handling', () => {
    it('handles timeout errors', async () => {
      server.use(
        http.get('http://localhost:3001/api/videos/:videoId/summaries', () => {
          return HttpResponse.json(null, { status: 408 })
        })
      )

      await expect(client.getVideoSummaries('video-1')).rejects.toMatchObject({
        statusCode: 408,
      })
    })

    it('handles network errors', async () => {
      server.use(
        http.get('http://localhost:3001/api/videos/:videoId/summaries', () => {
          return HttpResponse.error()
        })
      )

      await expect(client.getVideoSummaries('video-1')).rejects.toMatchObject({
        message: expect.stringContaining('Network Error'),
        statusCode: 500,
      })
    })

    it('converts axios errors to ApiError', async () => {
      server.use(
        http.get('http://localhost:3001/api/videos/:videoId/summaries', () => {
          return HttpResponse.json(
            { message: 'Custom error message' },
            { status: 418 }
          )
        })
      )

      await expect(client.getVideoSummaries('video-1')).rejects.toMatchObject({
        message: 'Custom error message',
        statusCode: 418,
      })
    })

    it('handles errors without response data', async () => {
      server.use(
        http.get('http://localhost:3001/api/videos/:videoId/summaries', () => {
          return new HttpResponse(null, { status: 503 })
        })
      )

      const error = await client.getVideoSummaries('video-1').catch((e) => e)
      expect(error).toMatchObject({
        statusCode: 503,
        message: expect.any(String),
      })
    })
  })
})
