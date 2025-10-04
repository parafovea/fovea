import { FastifyPluginAsync } from 'fastify'
import axios, { AxiosError } from 'axios'

/**
 * Model service API routes.
 *
 * Provides REST endpoints for managing ML model configuration and status.
 * All routes proxy requests to the Python model-service and handle errors.
 *
 * Routes:
 * - GET /api/models/config - Returns available models and current selections
 * - GET /api/models/status - Returns loaded models and memory usage
 * - POST /api/models/select - Selects model for a task type
 * - POST /api/models/validate - Validates memory budget for selected models
 *
 * @example
 * ```typescript
 * // Register routes in Fastify app
 * import modelsRoute from './routes/models.js'
 * app.register(modelsRoute, { prefix: '/api/models' })
 * ```
 */
const modelsRoute: FastifyPluginAsync = async (fastify) => {
  const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || 'http://model-service:8000'

  /**
   * Get model configuration.
   *
   * Returns available models grouped by task type (detection, tracking, summarization)
   * and the currently selected model for each task.
   *
   * @route GET /api/models/config
   *
   * @returns Configuration object with:
   *   - available_models: Record<TaskType, ModelInfo[]> - Available models per task
   *   - selected_models: Record<TaskType, string> - Currently selected model names
   *   - device: 'cuda' | 'cpu' - Device availability
   *
   * @throws {500} Internal server error if model service is unavailable
   * @throws {503} Service unavailable if model service cannot be reached
   *
   * @example
   * ```typescript
   * const response = await fetch('/api/models/config')
   * const config = await response.json()
   * // {
   * //   available_models: {
   * //     detection: [{ name: 'yolov8n', vram_mb: 512, speed: 'fast' }, ...],
   * //     tracking: [...],
   * //     summarization: [...]
   * //   },
   * //   selected_models: { detection: 'yolov8n', tracking: null, ... },
   * //   device: 'cuda'
   * // }
   * ```
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
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || error.message
        return reply.code(statusCode).send({ error: message })
      }
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })

  /**
   * Get model status.
   *
   * Returns information about currently loaded models, including memory usage,
   * health status, and performance metrics.
   *
   * @route GET /api/models/status
   *
   * @returns Status object with:
   *   - loaded_models: LoadedModelInfo[] - Array of loaded model information
   *   - total_vram_used_mb: number - Total VRAM allocated across all models
   *   - total_vram_available_mb: number - Total VRAM available on device
   *   - device: 'cuda' | 'cpu' - Current device
   *
   * LoadedModelInfo includes:
   *   - task_type: string - Task type (detection, tracking, summarization)
   *   - model_name: string - Name of loaded model
   *   - vram_used_mb: number - VRAM used by this model
   *   - health: 'healthy' | 'degraded' | 'error' - Model health status
   *   - last_inference_ms?: number - Last inference time in milliseconds
   *
   * @throws {500} Internal server error if model service is unavailable
   * @throws {503} Service unavailable if model service cannot be reached
   *
   * @example
   * ```typescript
   * const response = await fetch('/api/models/status')
   * const status = await response.json()
   * // {
   * //   loaded_models: [
   * //     { task_type: 'detection', model_name: 'yolov8n', vram_used_mb: 512, health: 'healthy' }
   * //   ],
   * //   total_vram_used_mb: 512,
   * //   total_vram_available_mb: 8192,
   * //   device: 'cuda'
   * // }
   * ```
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
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || error.message
        return reply.code(statusCode).send({ error: message })
      }
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })

  /**
   * Select a model for a specific task type.
   *
   * Updates the model selection for a given task type. This triggers model
   * loading in the model service. The selected model is persisted in the
   * model configuration.
   *
   * @route POST /api/models/select
   *
   * @param task_type - Query parameter: Task type (detection, tracking, summarization)
   * @param model_name - Query parameter: Name of model to select
   *
   * @returns Selection result with:
   *   - task_type: string - The task type
   *   - model_name: string - The selected model name
   *   - status: 'selected' | 'loading' | 'loaded' - Current status
   *
   * @throws {400} Bad request if task_type or model_name is invalid
   * @throws {404} Not found if model_name does not exist for task_type
   * @throws {500} Internal server error if model service is unavailable
   * @throws {503} Service unavailable if model loading fails
   *
   * @example
   * ```typescript
   * const response = await fetch(
   *   '/api/models/select?task_type=detection&model_name=yolov8n',
   *   { method: 'POST' }
   * )
   * const result = await response.json()
   * // { task_type: 'detection', model_name: 'yolov8n', status: 'loading' }
   * ```
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
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || error.message
        return reply.code(statusCode).send({ error: message })
      }
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })

  /**
   * Validate memory budget for currently selected models.
   *
   * Checks whether the currently selected models can fit within the available
   * VRAM budget. Returns validation status and memory allocation details.
   *
   * @route POST /api/models/validate
   *
   * @returns Validation result with:
   *   - valid: boolean - Whether memory budget is valid
   *   - total_required_mb: number - Total VRAM required for selected models
   *   - total_available_mb: number - Total VRAM available on device
   *   - breakdown: Record<TaskType, number> - VRAM required per task
   *   - warnings?: string[] - Optional warnings about memory usage
   *   - errors?: string[] - Validation errors if invalid
   *
   * @throws {500} Internal server error if model service is unavailable
   * @throws {503} Service unavailable if validation cannot be performed
   *
   * @example
   * ```typescript
   * const response = await fetch('/api/models/validate', { method: 'POST' })
   * const result = await response.json()
   * // {
   * //   valid: true,
   * //   total_required_mb: 1536,
   * //   total_available_mb: 8192,
   * //   breakdown: { detection: 512, tracking: 1024, summarization: 0 },
   * //   warnings: ['VRAM usage at 18.75% of capacity']
   * // }
   * ```
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
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || error.message
        return reply.code(statusCode).send({ error: message })
      }
      return reply.code(500).send({ error: 'Internal server error' })
    }
  })
}

export default modelsRoute
