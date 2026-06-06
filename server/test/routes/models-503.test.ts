import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import axios from 'axios'
import modelsRoute from '../../src/routes/models.js'
import { AppError } from '../../src/lib/errors.js'

/**
 * Tests that model proxy routes return 503 when the model service is unreachable.
 * Covers the fix that changed the default error status from 500 to 503
 * and provides a clear "Model service is unavailable" message when
 * there is no response object (connection refused, timeout, etc.).
 */

vi.mock('axios')
const mockedAxios = vi.mocked(axios)

describe('Model Routes - 503 Service Unavailable', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify({ logger: false })

    app.setErrorHandler((error, request, reply) => {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON())
      }

      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      })
    })

    await app.register(modelsRoute)
    await app.ready()

    vi.clearAllMocks()
    mockedAxios.get = vi.fn()
    mockedAxios.post = vi.fn()
    mockedAxios.isAxiosError = vi.fn((error) => error?.isAxiosError === true)
  })

  afterEach(async () => {
    await app.close()
  })

  describe('connection refused (no response)', () => {
    /**
     * Creates an Axios-like error with no response object,
     * simulating ECONNREFUSED when the model service is down.
     */
    function createConnectionRefusedError(): Error {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:8000')
      Object.assign(error, {
        isAxiosError: true,
        code: 'ECONNREFUSED',
        response: undefined,
      })
      return error
    }

    it('GET /api/models/config returns 503 when model service is unreachable', async () => {
      mockedAxios.get.mockRejectedValue(createConnectionRefusedError())
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json().error).toBe('Model service is unavailable')
    })

    it('GET /api/models/status returns 503 when model service is unreachable', async () => {
      mockedAxios.get.mockRejectedValue(createConnectionRefusedError())
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/status',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json().error).toBe('Model service is unavailable')
    })

    it('POST /api/models/select returns 503 when model service is unreachable', async () => {
      mockedAxios.post.mockRejectedValue(createConnectionRefusedError())
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/select?taskType=object_detection&modelName=yolov8n',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json().error).toBe('Model service is unavailable')
    })

    it('POST /api/models/validate returns 503 when model service is unreachable', async () => {
      mockedAxios.post.mockRejectedValue(createConnectionRefusedError())
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'POST',
        url: '/api/models/validate',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json().error).toBe('Model service is unavailable')
    })
  })

  describe('timeout (no response)', () => {
    function createTimeoutError(): Error {
      const error = new Error('timeout of 10000ms exceeded')
      Object.assign(error, {
        isAxiosError: true,
        code: 'ECONNABORTED',
        response: undefined,
      })
      return error
    }

    it('returns 503 with unavailable message on timeout', async () => {
      mockedAxios.get.mockRejectedValue(createTimeoutError())
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json().error).toBe('Model service is unavailable')
    })
  })

  describe('model service responds with error', () => {
    it('preserves original status code when model service responds', async () => {
      const serviceError = new Error('Bad Request')
      Object.assign(serviceError, {
        isAxiosError: true,
        response: {
          status: 400,
          data: { detail: 'Invalid model configuration' },
        },
      })

      mockedAxios.get.mockRejectedValue(serviceError)
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config',
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().error).toBe('Invalid model configuration')
    })

    it('uses response detail message when available', async () => {
      const serviceError = new Error('Service Unavailable')
      Object.assign(serviceError, {
        isAxiosError: true,
        response: {
          status: 503,
          data: { detail: 'Model is still loading' },
        },
      })

      mockedAxios.get.mockRejectedValue(serviceError)
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config',
      })

      expect(response.statusCode).toBe(503)
      expect(response.json().error).toBe('Model is still loading')
    })

    it('uses error.message as fallback when response has no detail', async () => {
      const serviceError = new Error('Internal Server Error')
      Object.assign(serviceError, {
        isAxiosError: true,
        response: {
          status: 500,
          data: {},
        },
      })

      mockedAxios.get.mockRejectedValue(serviceError)
      mockedAxios.isAxiosError.mockReturnValue(true)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config',
      })

      expect(response.statusCode).toBe(500)
      expect(response.json().error).toBe('Internal Server Error')
    })
  })

  describe('non-Axios errors', () => {
    it('returns 500 for non-Axios errors', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Unexpected error'))
      mockedAxios.isAxiosError.mockReturnValue(false)

      const response = await app.inject({
        method: 'GET',
        url: '/api/models/config',
      })

      expect(response.statusCode).toBe(500)
      expect(response.json().error).toBe('INTERNAL_ERROR')
    })
  })
})
