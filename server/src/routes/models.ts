import { FastifyPluginAsync } from 'fastify'
import axios, { AxiosError } from 'axios'
import camelcaseKeys from 'camelcase-keys'
import { InternalError, ValidationError } from '../lib/errors.js'

/**
 * Map a user-supplied taskType to one of the nine canonical
 * task-type literals from `model-service/src/domain/types.py`.
 *
 * Each branch returns a hard-coded string literal so the value
 * downstream consumers (URL templates, query params) build with
 * is data-flow-independent from `taskType`. Throws on miss.
 */
function normalizeAndAssertTaskType(taskType: string): string {
  const normalized = taskType.replace(/([A-Z])/g, '_$1').toLowerCase()
  switch (normalized) {
    case 'video_summarization': return 'video_summarization'
    case 'ontology_augmentation': return 'ontology_augmentation'
    case 'object_detection': return 'object_detection'
    case 'video_tracking': return 'video_tracking'
    case 'audio_transcription': return 'audio_transcription'
    case 'speaker_diarization': return 'speaker_diarization'
    case 'voice_activity_detection': return 'voice_activity_detection'
    case 'claim_extraction': return 'claim_extraction'
    case 'claim_synthesis': return 'claim_synthesis'
    default: throw new ValidationError(`Invalid task type: ${taskType}`)
  }
}

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
/**
 * Convert a camelCase string to snake_case.
 * Used to convert frontend task type identifiers (e.g. "videoSummarization")
 * back to the Python model-service format (e.g. "video_summarization").
 *
 * Note: snakecaseKeys only converts object KEYS, not string values,
 * so this helper is needed for URL path segments and query param values.
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
      return camelcaseKeys(response.data, { deep: true })
    } catch (err) {
      // Return the validation message under the same {error} shape the
      // route uses for axios failures so the caller does not have to
      // branch on which field carries the error text.
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.message })
      }
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 503
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || (error.response ? error.message : 'Model service is unavailable')
        return reply.code(statusCode).send({ error: message })
      }
      throw new InternalError('Internal server error')
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
      return camelcaseKeys(response.data, { deep: true })
    } catch (err) {
      // Return the validation message under the same {error} shape the
      // route uses for axios failures so the caller does not have to
      // branch on which field carries the error text.
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.message })
      }
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 503
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || (error.response ? error.message : 'Model service is unavailable')
        return reply.code(statusCode).send({ error: message })
      }
      throw new InternalError('Internal server error')
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
      taskType: string
      modelName: string
    }
  }>('/api/models/select', {
    schema: {
      description: 'Select model for task type',
      tags: ['models'],
      querystring: {
        type: 'object',
        required: ['taskType', 'modelName'],
        properties: {
          taskType: { type: 'string' },
          modelName: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { taskType, modelName } = request.query
      const normalizedTaskType = normalizeAndAssertTaskType(taskType)
      const response = await axios.post(
        `${MODEL_SERVICE_URL}/api/models/select`,
        null,
        {
          params: {
            task_type: normalizedTaskType,
            model_name: modelName,
          },
          timeout: 30000
        }
      )
      return camelcaseKeys(response.data, { deep: true })
    } catch (err) {
      // Return the validation message under the same {error} shape the
      // route uses for axios failures so the caller does not have to
      // branch on which field carries the error text.
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.message })
      }
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 503
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || (error.response ? error.message : 'Model service is unavailable')
        return reply.code(statusCode).send({ error: message })
      }
      throw new InternalError('Internal server error')
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
      return camelcaseKeys(response.data, { deep: true })
    } catch (err) {
      // Return the validation message under the same {error} shape the
      // route uses for axios failures so the caller does not have to
      // branch on which field carries the error text.
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.message })
      }
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 503
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || (error.response ? error.message : 'Model service is unavailable')
        return reply.code(statusCode).send({ error: message })
      }
      throw new InternalError('Internal server error')
    }
  })

  /**
   * Check whether a model is cached locally.
   *
   * @route GET /api/models/task-ready/:taskType
   */
  fastify.get<{
    Params: { taskType: string }
  }>('/api/models/task-ready/:taskType', {
    schema: {
      description: 'Check if model is cached locally',
      tags: ['models'],
      params: {
        type: 'object',
        required: ['taskType'],
        properties: {
          taskType: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const normalizedTaskType = normalizeAndAssertTaskType(request.params.taskType)
      const response = await axios.get(
        `${MODEL_SERVICE_URL}/api/models/task-ready/${normalizedTaskType}`,
        { timeout: 10000 }
      )
      return camelcaseKeys(response.data, { deep: true })
    } catch (err) {
      // Return the validation message under the same {error} shape the
      // route uses for axios failures so the caller does not have to
      // branch on which field carries the error text.
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.message })
      }
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 503
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || (error.response ? error.message : 'Model service is unavailable')
        return reply.code(statusCode).send({ error: message })
      }
      throw new InternalError('Internal server error')
    }
  })

  /**
   * Load a model into memory (triggers download if not cached).
   *
   * @route POST /api/models/load/:taskType
   */
  fastify.post<{
    Params: { taskType: string }
  }>('/api/models/load/:taskType', {
    schema: {
      description: 'Load model for task type',
      tags: ['models'],
      params: {
        type: 'object',
        required: ['taskType'],
        properties: {
          taskType: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const normalizedTaskType = normalizeAndAssertTaskType(request.params.taskType)
      const response = await axios.post(
        `${MODEL_SERVICE_URL}/api/models/load/${normalizedTaskType}`,
        null,
        { timeout: 300000 } // 5 min timeout for model download + load
      )
      return camelcaseKeys(response.data, { deep: true })
    } catch (err) {
      // Return the validation message under the same {error} shape the
      // route uses for axios failures so the caller does not have to
      // branch on which field carries the error text.
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.message })
      }
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 503
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || (error.response ? error.message : 'Model service is unavailable')
        return reply.code(statusCode).send({ error: message })
      }
      throw new InternalError('Internal server error')
    }
  })

  /**
   * Unload a model from memory.
   *
   * @route POST /api/models/unload/:taskType
   */
  fastify.post<{
    Params: { taskType: string }
  }>('/api/models/unload/:taskType', {
    schema: {
      description: 'Unload model for task type',
      tags: ['models'],
      params: {
        type: 'object',
        required: ['taskType'],
        properties: {
          taskType: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const normalizedTaskType = normalizeAndAssertTaskType(request.params.taskType)
      const response = await axios.post(
        `${MODEL_SERVICE_URL}/api/models/unload/${normalizedTaskType}`,
        null,
        { timeout: 30000 }
      )
      return camelcaseKeys(response.data, { deep: true })
    } catch (err) {
      // Return the validation message under the same {error} shape the
      // route uses for axios failures so the caller does not have to
      // branch on which field carries the error text.
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.message })
      }
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 503
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || (error.response ? error.message : 'Model service is unavailable')
        return reply.code(statusCode).send({ error: message })
      }
      throw new InternalError('Internal server error')
    }
  })

  /**
   * Get default inference config values.
   *
   * Returns the dataclass defaults the model-service uses to construct each
   * inference config (generation, transcription, diarization, VAD, detection,
   * tracking). The settings UI binds form controls to these so what the user
   * sees matches what the backend will use when a field is left unset.
   *
   * @route GET /api/models/defaults
   *
   * @returns Object keyed by config group. Each group is a flat object of
   *   scalar defaults. See ModelDefaultsResponse in the model-service's
   *   `routes/models.py` for the exact field list.
   *
   * @throws {503} Service unavailable if model service cannot be reached
   */
  fastify.get('/api/models/defaults', {
    schema: {
      description: 'Get default inference config values per task group',
      tags: ['models']
    }
  }, async (_request, reply) => {
    try {
      const response = await axios.get(`${MODEL_SERVICE_URL}/api/models/defaults`, {
        timeout: 10000
      })
      return camelcaseKeys(response.data, { deep: true })
    } catch (err) {
      // Return the validation message under the same {error} shape the
      // route uses for axios failures so the caller does not have to
      // branch on which field carries the error text.
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.message })
      }
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 503
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || (error.response ? error.message : 'Model service is unavailable')
        return reply.code(statusCode).send({ error: message })
      }
      throw new InternalError('Internal server error')
    }
  })

  /**
   * Get framework enum values per task group.
   *
   * Enumerates the string values of LLMFramework, AudioFramework,
   * DetectionFramework, TrackingFramework, VLM InferenceFramework, and
   * QuantizationType so the UI can render selectors without duplicating the
   * lists.
   *
   * @route GET /api/models/frameworks
   *
   * @returns `{ llm, audio, detection, tracking, vlmInference, quantization }`,
   *   each a string[] of enum values.
   *
   * @throws {503} Service unavailable if model service cannot be reached
   */
  fastify.get('/api/models/frameworks', {
    schema: {
      description: 'Get framework enum values per task group',
      tags: ['models']
    }
  }, async (_request, reply) => {
    try {
      const response = await axios.get(`${MODEL_SERVICE_URL}/api/models/frameworks`, {
        timeout: 10000
      })
      return camelcaseKeys(response.data, { deep: true })
    } catch (err) {
      // Return the validation message under the same {error} shape the
      // route uses for axios failures so the caller does not have to
      // branch on which field carries the error text.
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.message })
      }
      const error = err as AxiosError
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status || 503
        const data = error.response?.data as { detail?: string } | undefined
        const message = data?.detail || (error.response ? error.message : 'Model service is unavailable')
        return reply.code(statusCode).send({ error: message })
      }
      throw new InternalError('Internal server error')
    }
  })
}

export default modelsRoute
