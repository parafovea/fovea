import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { FastifyInstance } from 'fastify'
import { NotFoundError, ValidationError, AppError, InternalError } from '../src/lib/errors.js'

/**
 * Integration tests for the global error handler.
 * Each test creates a fresh Fastify instance to register test routes.
 */
describe('Global Error Handler Integration', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    // Create fresh Fastify instance for each test
    app = Fastify({ logger: false })

    // Register the same error handler from app.ts
    app.setErrorHandler((error, request, reply) => {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON())
      }

      request.log.error({
        err: error,
        url: request.url,
        method: request.method,
        params: request.params,
        query: request.query
      }, 'Unexpected error occurred')

      return reply.code(500).send({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      })
    })
  })

  afterEach(async () => {
    await app.close()
  })

  describe('AppError handling', () => {
    it('should handle NotFoundError with correct status code', async () => {
      app.get('/test/not-found', async () => {
        throw new NotFoundError('TestResource', 'test-id-123')
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/not-found'
      })

      expect(response.statusCode).toBe(404)
      expect(response.headers['content-type']).toContain('application/json')

      const body = JSON.parse(response.body)
      expect(body).toEqual({
        error: 'NOT_FOUND',
        message: 'TestResource test-id-123 not found'
      })
    })

    it('should handle ValidationError with correct status code', async () => {
      app.post('/test/validation', async () => {
        throw new ValidationError('Invalid input data', {
          fields: ['email', 'password']
        })
      })

      const response = await app.inject({
        method: 'POST',
        url: '/test/validation',
        payload: {}
      })

      expect(response.statusCode).toBe(400)
      expect(response.headers['content-type']).toContain('application/json')

      const body = JSON.parse(response.body)
      expect(body).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details: {
          fields: ['email', 'password']
        }
      })
    })

    it('should handle custom AppError with any status code', async () => {
      app.get('/test/custom-error', async () => {
        throw new AppError(418, 'TEAPOT', 'I am a teapot', { reason: 'brewing' })
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/custom-error'
      })

      expect(response.statusCode).toBe(418)

      const body = JSON.parse(response.body)
      expect(body).toEqual({
        error: 'TEAPOT',
        message: 'I am a teapot',
        details: { reason: 'brewing' }
      })
    })

    it('should handle InternalError correctly', async () => {
      app.get('/test/internal-error', async () => {
        throw new InternalError('Processing failed', { stage: 'transformation' })
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/internal-error'
      })

      expect(response.statusCode).toBe(500)

      const body = JSON.parse(response.body)
      expect(body).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'Processing failed',
        details: { stage: 'transformation' }
      })
    })

    it('should not include stack traces in error responses', async () => {
      app.get('/test/error-no-stack', async () => {
        throw new NotFoundError('Resource', 'id')
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/error-no-stack'
      })

      const body = JSON.parse(response.body)
      expect(body).not.toHaveProperty('stack')
      expect(body).not.toHaveProperty('name')
      expect(body).not.toHaveProperty('statusCode')
    })

    it('should handle errors without details', async () => {
      app.get('/test/no-details', async () => {
        throw new ValidationError('Simple validation error')
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/no-details'
      })

      const body = JSON.parse(response.body)
      expect(body).toEqual({
        error: 'VALIDATION_ERROR',
        message: 'Simple validation error'
      })
      expect(body).not.toHaveProperty('details')
    })
  })

  describe('Unknown error handling', () => {
    it('should handle unexpected errors with 500 status', async () => {
      app.get('/test/unexpected-error', async () => {
        throw new Error('Something unexpected happened')
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/unexpected-error'
      })

      expect(response.statusCode).toBe(500)

      const body = JSON.parse(response.body)
      expect(body).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      })
    })

    it('should not leak error details for unexpected errors', async () => {
      app.get('/test/sensitive-error', async () => {
        const error = new Error('Database password is: secret123')
        throw error
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/sensitive-error'
      })

      const body = JSON.parse(response.body)
      expect(body.message).toBe('An unexpected error occurred')
      expect(body.message).not.toContain('secret123')
      expect(body.message).not.toContain('password')
      expect(body).not.toHaveProperty('stack')
    })

    it('should handle null/undefined thrown values', async () => {
      app.get('/test/throw-null', async () => {
        throw null
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/throw-null'
      })

      expect(response.statusCode).toBe(500)

      const body = JSON.parse(response.body)
      expect(body).toEqual({
        error: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      })
    })

    it('should handle TypeError from application code', async () => {
      app.get('/test/type-error', async () => {
        // Simulate a TypeError by calling non-function
        const notAFunction = {} as unknown as (() => void)
        notAFunction()
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/type-error'
      })

      expect(response.statusCode).toBe(500)

      const body = JSON.parse(response.body)
      expect(body.error).toBe('INTERNAL_ERROR')
      expect(body.message).toBe('An unexpected error occurred')
    })
  })

  describe('Error response format', () => {
    it('should always return JSON content-type', async () => {
      app.get('/test/error-content-type', async () => {
        throw new NotFoundError('Test', 'id')
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/error-content-type'
      })

      expect(response.headers['content-type']).toContain('application/json')
    })

    it('should return consistent error structure for AppError', async () => {
      app.get('/test/error-structure', async () => {
        throw new ValidationError('Test error', { field: 'test' })
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/error-structure'
      })

      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('error')
      expect(body).toHaveProperty('message')
      expect(body).toHaveProperty('details')
      expect(typeof body.error).toBe('string')
      expect(typeof body.message).toBe('string')
    })

    it('should return consistent error structure for unexpected errors', async () => {
      app.get('/test/unexpected-structure', async () => {
        throw new Error('Unexpected error')
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/unexpected-structure'
      })

      const body = JSON.parse(response.body)
      expect(body).toHaveProperty('error')
      expect(body).toHaveProperty('message')
      expect(typeof body.error).toBe('string')
      expect(typeof body.message).toBe('string')
      expect(body.error).toBe('INTERNAL_ERROR')
    })
  })

  describe('Different HTTP methods', () => {
    it('should handle errors in POST requests', async () => {
      app.post('/test/post-error', async () => {
        throw new ValidationError('Invalid POST data')
      })

      const response = await app.inject({
        method: 'POST',
        url: '/test/post-error',
        payload: { test: 'data' }
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.error).toBe('VALIDATION_ERROR')
    })

    it('should handle errors in PUT requests', async () => {
      app.put('/test/put-error', async () => {
        throw new NotFoundError('Resource', 'id')
      })

      const response = await app.inject({
        method: 'PUT',
        url: '/test/put-error',
        payload: { test: 'data' }
      })

      expect(response.statusCode).toBe(404)
    })

    it('should handle errors in DELETE requests', async () => {
      app.delete('/test/delete-error', async () => {
        throw new NotFoundError('Resource', 'id')
      })

      const response = await app.inject({
        method: 'DELETE',
        url: '/test/delete-error'
      })

      expect(response.statusCode).toBe(404)
    })
  })

  describe('Async error handling', () => {
    it('should handle errors thrown in async operations', async () => {
      app.get('/test/async-error', async () => {
        await new Promise(resolve => setTimeout(resolve, 1))
        throw new ValidationError('Async validation failed')
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/async-error'
      })

      expect(response.statusCode).toBe(400)
      const body = JSON.parse(response.body)
      expect(body.message).toBe('Async validation failed')
    })

    it('should handle promise rejections', async () => {
      app.get('/test/promise-rejection', async () => {
        await Promise.reject(new NotFoundError('AsyncResource', 'async-id'))
      })

      const response = await app.inject({
        method: 'GET',
        url: '/test/promise-rejection'
      })

      expect(response.statusCode).toBe(404)
      const body = JSON.parse(response.body)
      expect(body.message).toContain('AsyncResource')
    })
  })
})
