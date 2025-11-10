import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import axios from 'axios'
import modelsRoute from '../../src/routes/models.js'

/**
 * Test suite for model service API routes.
 * Tests proxy behavior, error handling, and request/response validation.
 */

// Mock axios module
vi.mock('axios')
const mockedAxios = vi.mocked(axios)

describe('Model Routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    // Create fresh Fastify instance for each test
    app = Fastify()
    await app.register(modelsRoute)
    await app.ready()

    // Reset all mocks
    vi.clearAllMocks()

    // Setup default axios.get mock
    mockedAxios.get = vi.fn()
    // Setup default axios.post mock
    mockedAxios.post = vi.fn()
    // Setup default axios.isAxiosError mock
    mockedAxios.isAxiosError = vi.fn((error) => error?.isAxiosError === true)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /api/models/config', () => {
    it('returns full configuration from model service', async () => {
      const mockConfig = {
        availableModels: {
          detection: [
            { name: 'yolov8n', vramMb: 512, speed: 'fast' },
            { name: 'yolov8s', vramMb: 1024, speed: 'medium' }
          ],
          tracking: [
            { name: 'botsort', vramMb: 256, speed: 'fast' }
          ],
          summarization: [
            { name: 'llava-1.5-7b', vramMb: 4096, speed: 'slow' }
          ]
        },
        selectedModels: {
          detection: 'yolov8n',
          tracking: null,
          summarization: null
        },
        device: 'cuda'
      }

      mockedAxios.get.mockResolvedValue({ data: mockConfig })

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config'
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(mockConfig)
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://localhost:8000/api/models/config',
        { timeout: 10000 }
      )
    })

    it('returns CPU-only configuration when CUDA unavailable', async () => {
      const mockConfig = {
        available_models: {
          detection: [],
          tracking: [],
          summarization: []
        },
        selected_models: {
          detection: null,
          tracking: null,
          summarization: null
        },
        device: 'cpu'
      }

      mockedAxios.get.mockResolvedValue({ data: mockConfig })

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.device).toBe('cpu')
    })

    it('handles model service timeout error', async () => {
      const timeoutError = new Error('timeout of 10000ms exceeded')
      Object.assign(timeoutError, {
        isAxiosError: true,
        code: 'ECONNABORTED',
        response: undefined
      })

      mockedAxios.get.mockRejectedValue(timeoutError)
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config'
      })

      expect(response.statusCode).toBe(500)
      const body = response.json()
      expect(body.error).toContain('timeout')
    })

    it('handles model service unavailable (503)', async () => {
      const serviceError = new Error('Service Unavailable')
      Object.assign(serviceError, {
        isAxiosError: true,
        response: {
          status: 503,
          data: { detail: 'Model service is starting' }
        }
      })

      mockedAxios.get.mockRejectedValue(serviceError)
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config'
      })

      expect(response.statusCode).toBe(503)
      const body = response.json()
      expect(body.error).toBe('Model service is starting')
    })

    it('handles non-axios errors', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Unknown error'))
      mockedAxios.isAxiosError.mockReturnValue(false)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config'
      })

      expect(response.statusCode).toBe(500)
      const body = response.json()
      expect(body.error).toBe('Internal server error')
    })
  })

  describe('GET /api/models/status', () => {
    it('returns loaded models and memory usage', async () => {
      const mockStatus = {
        loadedModels: [
          {
            taskType: 'detection',
            modelName: 'yolov8n',
            vramUsedMb: 512,
            health: 'healthy',
            lastInferenceMs: 45
          }
        ],
        totalVramUsedMb: 512,
        totalVramAvailableMb: 8192,
        device: 'cuda'
      }

      mockedAxios.get.mockResolvedValue({ data: mockStatus })

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/status'
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(mockStatus)
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://localhost:8000/api/models/status',
        { timeout: 10000 }
      )
    })

    it('returns empty status when no models loaded', async () => {
      const mockStatus = {
        loadedModels: [],
        totalVramUsedMb: 0,
        totalVramAvailableMb: 8192,
        device: 'cuda'
      }

      mockedAxios.get.mockResolvedValue({ data: mockStatus })

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/status'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.loadedModels).toHaveLength(0)
      expect(body.totalVramUsedMb).toBe(0)
    })

    it('includes health status for degraded models', async () => {
      const mockStatus = {
        loadedModels: [
          {
            taskType: 'detection',
            modelName: 'yolov8s',
            vramUsedMb: 1024,
            health: 'degraded',
            lastInferenceMs: 150
          }
        ],
        totalVramUsedMb: 1024,
        totalVramAvailableMb: 8192,
        device: 'cuda'
      }

      mockedAxios.get.mockResolvedValue({ data: mockStatus })

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/status'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.loadedModels[0].health).toBe('degraded')
    })

    it('handles model service error', async () => {
      const serviceError = new Error('Internal Server Error')
      Object.assign(serviceError, {
        isAxiosError: true,
        response: {
          status: 500,
          data: { detail: 'Failed to retrieve model status' }
        }
      })

      mockedAxios.get.mockRejectedValue(serviceError)
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/status'
      })

      expect(response.statusCode).toBe(500)
      const body = response.json()
      expect(body.error).toBe('Failed to retrieve model status')
    })
  })

  describe('POST /api/models/select', () => {
    it('selects model for detection task', async () => {
      const mockResult = {
        taskType: 'detection',
        modelName: 'yolov8n',
        status: 'loading'
      }

      mockedAxios.post.mockResolvedValue({ data: mockResult })

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/select?taskType=detection&modelName=yolov8n'
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(mockResult)
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8000/api/models/select',
        null,
        {
          params: { task_type: 'detection', model_name: 'yolov8n' },
          timeout: 30000
        }
      )
    })

    it('selects model for tracking task', async () => {
      const mockResult = {
        taskType: 'tracking',
        modelName: 'botsort',
        status: 'loaded'
      }

      mockedAxios.post.mockResolvedValue({ data: mockResult })

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/select?taskType=tracking&modelName=botsort'
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(mockResult)
    })

    it('selects model for summarization task', async () => {
      const mockResult = {
        taskType: 'summarization',
        modelName: 'llava-1.5-7b',
        status: 'loading'
      }

      mockedAxios.post.mockResolvedValue({ data: mockResult })

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/select?taskType=summarization&modelName=llava-1.5-7b'
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(mockResult)
    })

    it('validates required task_type parameter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/models/select?modelName=yolov8n'
      })

      expect(response.statusCode).toBe(400)
    })

    it('validates required model_name parameter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/models/select?taskType=detection'
      })

      expect(response.statusCode).toBe(400)
    })

    it('handles invalid task type (400)', async () => {
      const validationError = new Error('Bad Request')
      Object.assign(validationError, {
        isAxiosError: true,
        response: {
          status: 400,
          data: { detail: 'Invalid task type: invalid_task' }
        }
      })

      mockedAxios.post.mockRejectedValue(validationError)
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/select?taskType=invalid_task&modelName=yolov8n'
      })

      expect(response.statusCode).toBe(400)
      const body = response.json()
      expect(body.error).toContain('Invalid task type')
    })

    it('handles model not found (404)', async () => {
      const notFoundError = new Error('Not Found')
      Object.assign(notFoundError, {
        isAxiosError: true,
        response: {
          status: 404,
          data: { detail: 'Model not found: nonexistent_model' }
        }
      })

      mockedAxios.post.mockRejectedValue(notFoundError)
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/select?taskType=detection&modelName=nonexistent_model'
      })

      expect(response.statusCode).toBe(404)
      const body = response.json()
      expect(body.error).toContain('Model not found')
    })

    it('handles model loading failure (503)', async () => {
      const loadingError = new Error('Service Unavailable')
      Object.assign(loadingError, {
        isAxiosError: true,
        response: {
          status: 503,
          data: { detail: 'Failed to load model' }
        }
      })

      mockedAxios.post.mockRejectedValue(loadingError)
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/select?taskType=detection&modelName=yolov8n'
      })

      expect(response.statusCode).toBe(503)
      const body = response.json()
      expect(body.error).toBe('Failed to load model')
    })
  })

  describe('POST /api/models/validate', () => {
    it('returns valid budget when models fit in VRAM', async () => {
      const mockValidation = {
        valid: true,
        total_required_mb: 1536,
        total_available_mb: 8192,
        breakdown: {
          detection: 512,
          tracking: 1024,
          summarization: 0
        },
        warnings: ['VRAM usage at 18.75% of capacity']
      }

      mockedAxios.post.mockResolvedValue({ data: mockValidation })

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/validate'
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(mockValidation)
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:8000/api/models/validate',
        null,
        { timeout: 10000 }
      )
    })

    it('returns invalid budget when models exceed VRAM', async () => {
      const mockValidation = {
        valid: false,
        total_required_mb: 12288,
        total_available_mb: 8192,
        breakdown: {
          detection: 1024,
          tracking: 2048,
          summarization: 9216
        },
        errors: ['Total VRAM required (12288 MB) exceeds available (8192 MB)']
      }

      mockedAxios.post.mockResolvedValue({ data: mockValidation })

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/validate'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.valid).toBe(false)
      expect(body.errors).toHaveLength(1)
      expect(body.errors[0]).toContain('exceeds available')
    })

    it('returns valid budget with no models selected', async () => {
      const mockValidation = {
        valid: true,
        total_required_mb: 0,
        total_available_mb: 8192,
        breakdown: {
          detection: 0,
          tracking: 0,
          summarization: 0
        }
      }

      mockedAxios.post.mockResolvedValue({ data: mockValidation })

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/validate'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.valid).toBe(true)
      expect(body.total_required_mb).toBe(0)
    })

    it('includes warnings for high VRAM usage', async () => {
      const mockValidation = {
        valid: true,
        total_required_mb: 7168,
        total_available_mb: 8192,
        breakdown: {
          detection: 1024,
          tracking: 2048,
          summarization: 4096
        },
        warnings: [
          'VRAM usage at 87.5% of capacity',
          'High memory usage may impact performance'
        ]
      }

      mockedAxios.post.mockResolvedValue({ data: mockValidation })

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/validate'
      })

      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.valid).toBe(true)
      expect(body.warnings).toHaveLength(2)
    })

    it('handles validation service error', async () => {
      const serviceError = new Error('Internal Server Error')
      Object.assign(serviceError, {
        isAxiosError: true,
        response: {
          status: 500,
          data: { detail: 'Failed to validate memory budget' }
        }
      })

      mockedAxios.post.mockRejectedValue(serviceError)
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/validate'
      })

      expect(response.statusCode).toBe(500)
      const body = response.json()
      expect(body.error).toBe('Failed to validate memory budget')
    })
  })

  describe('Error Handling', () => {
    it('handles network errors consistently across all routes', async () => {
      const networkError = new Error('Network Error')
      Object.assign(networkError, {
        isAxiosError: true,
        code: 'ECONNREFUSED'
      })

      mockedAxios.get.mockRejectedValue(networkError)
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config'
      })

      expect(response.statusCode).toBe(500)
      const body = response.json()
      expect(body.error).toContain('Network Error')
    })

    it('proxies requests to model service with correct timeout', async () => {
      mockedAxios.get.mockResolvedValue({ data: {} })

      await app.inject({
        method: 'GET',
        url: '/api/models/config'
      })

      // Verify timeout is set correctly for GET requests
      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/models/config'),
        expect.objectContaining({ timeout: 10000 })
      )
    })
  })
})
