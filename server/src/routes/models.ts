import { FastifyPluginAsync } from 'fastify'
import axios, { AxiosError } from 'axios'

/**
 * Model service API routes.
 * Proxies model configuration and status requests to the model-service.
 */
const modelsRoute: FastifyPluginAsync = async (fastify) => {
  const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || 'http://model-service:8000'

  /**
   * Get model configuration.
   * Returns available models and current selections for each task type.
   *
   * @route GET /api/models/config
   */
  fastify.get('/api/models/config', {
    schema: {
      description: 'Get model configuration',
      tags: ['models']
    }
  }, async (_request, reply) => {
    try {
      const response = await axios.get(`${MODEL_SERVICE_URL}/api/models/config`, {
        timeout: 10000
      })
      return response.data
    } catch (err) {
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 500
        const message = (error.response?.data as any)?.detail || error.message
        return reply.code(statusCode).send({ error: message })
      }
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })

  /**
   * Get model status.
   * Returns currently loaded models and memory usage.
   *
   * @route GET /api/models/status
   */
  fastify.get('/api/models/status', {
    schema: {
      description: 'Get model status',
      tags: ['models']
    }
  }, async (_request, reply) => {
    try {
      const response = await axios.get(`${MODEL_SERVICE_URL}/api/models/status`, {
        timeout: 10000
      })
      return response.data
    } catch (err) {
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 500
        const message = (error.response?.data as any)?.detail || error.message
        return reply.code(statusCode).send({ error: message })
      }
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })

  /**
   * Select a model for a specific task type.
   *
   * @route POST /api/models/select
   */
  fastify.post<{
    Querystring: {
      task_type: string
      model_name: string
    }
  }>('/api/models/select', {
    schema: {
      description: 'Select model for task type',
      tags: ['models'],
      querystring: {
        type: 'object',
        required: ['task_type', 'model_name'],
        properties: {
          task_type: { type: 'string' },
          model_name: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { task_type, model_name } = request.query
      const response = await axios.post(
        `${MODEL_SERVICE_URL}/api/models/select`,
        null,
        {
          params: { task_type, model_name },
          timeout: 30000
        }
      )
      return response.data
    } catch (err) {
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 500
        const message = (error.response?.data as any)?.detail || error.message
        return reply.code(statusCode).send({ error: message })
      }
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })

  /**
   * Validate memory budget for currently selected models.
   *
   * @route POST /api/models/validate
   */
  fastify.post('/api/models/validate', {
    schema: {
      description: 'Validate memory budget',
      tags: ['models']
    }
  }, async (_request, reply) => {
    try {
      const response = await axios.post(`${MODEL_SERVICE_URL}/api/models/validate`, null, {
        timeout: 10000
      })
      return response.data
    } catch (err) {
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 500
        const message = (error.response?.data as any)?.detail || error.message
        return reply.code(statusCode).send({ error: message })
      }
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })
}

export default modelsRoute
