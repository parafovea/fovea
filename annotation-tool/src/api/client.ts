/**
 * HTTP client for backend API communication.
 * Provides typed methods for video summary and job management endpoints.
 */

import axios, { AxiosInstance, AxiosError } from 'axios'

/**
 * Video summary data structure returned by the API.
 */
export interface VideoSummary {
  id: string
  videoId: string
  personaId: string
  summary: string
  visualAnalysis: string | null
  audioTranscript: string | null
  keyFrames: number[] | null
  confidence: number | null
  createdAt: string
  updatedAt: string
}

/**
 * Request payload for generating a video summary.
 */
export interface GenerateSummaryRequest {
  videoId: string
  personaId: string
  frameSampleRate?: number
  maxFrames?: number
}

/**
 * Response when a summary generation job is queued.
 */
export interface GenerateSummaryResponse {
  jobId: string
  videoId: string
  personaId: string
}

/**
 * Job status information.
 */
export interface JobStatus {
  id: string
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
  progress: number
  data: {
    videoId: string
    personaId: string
  }
  returnvalue?: VideoSummary
  failedReason?: string
  finishedOn?: number
  processedOn?: number
}

/**
 * Error response from the API.
 */
export interface ApiError {
  message: string
  statusCode: number
}

/**
 * Bounding box coordinates for object detection (normalized 0-1).
 */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Single object detection result.
 */
export interface Detection {
  label: string
  bounding_box: BoundingBox
  confidence: number
  track_id?: string | null
}

/**
 * Detections for a single video frame.
 */
export interface FrameDetections {
  frame_number: number
  timestamp: number
  detections: Detection[]
}

/**
 * Detection query options for persona-based detection.
 */
export interface DetectionQueryOptions {
  includeEntityTypes?: boolean
  includeEntityGlosses?: boolean
  includeEventTypes?: boolean
  includeEventGlosses?: boolean
  includeRoleTypes?: boolean
  includeRoleGlosses?: boolean
  includeRelationTypes?: boolean
  includeRelationGlosses?: boolean
  includeEntityInstances?: boolean
  includeEntityInstanceGlosses?: boolean
  includeEventInstances?: boolean
  includeEventInstanceGlosses?: boolean
  includeLocationInstances?: boolean
  includeLocationInstanceGlosses?: boolean
  includeTimeInstances?: boolean
  includeTimeInstanceGlosses?: boolean
}

/**
 * Request payload for object detection.
 */
export interface DetectionRequest {
  videoId: string
  personaId?: string
  manualQuery?: string
  queryOptions?: DetectionQueryOptions
  frameNumbers?: number[]
  confidenceThreshold?: number
  enableTracking?: boolean
}

/**
 * Response from object detection endpoint.
 */
export interface DetectionResponse {
  id: string
  video_id: string
  query: string
  frames: FrameDetections[]
  total_detections: number
  processing_time: number
}

/**
 * Model metadata for a single model option.
 */
export interface ModelOption {
  model_id: string
  framework: string
  vram_gb: number
  speed: string
  description: string
  fps: number | null
}

/**
 * Configuration for a single task type.
 */
export interface TaskConfig {
  selected: string
  options: Record<string, ModelOption>
}

/**
 * Inference configuration settings.
 */
export interface InferenceConfig {
  max_memory_per_model: number
  offload_threshold: number
  warmup_on_startup: boolean
}

/**
 * Complete model configuration response.
 */
export interface ModelConfig {
  models: Record<string, TaskConfig>
  inference: InferenceConfig
  cuda_available: boolean
}

/**
 * Memory requirement for a single task.
 */
export interface ModelRequirement {
  model_id: string
  vram_gb: number
}

/**
 * Memory validation result.
 */
export interface MemoryValidation {
  valid: boolean
  total_vram_gb: number
  total_required_gb: number
  threshold: number
  max_allowed_gb: number
  model_requirements: Record<string, ModelRequirement>
}

/**
 * Request payload for selecting a model.
 */
export interface SelectModelRequest {
  task_type: string
  model_name: string
}

/**
 * Response from model selection.
 */
export interface SelectModelResponse {
  status: string
  task_type: string
  selected_model: string
}

/**
 * Model health status indicator.
 */
export type ModelHealth = 'loaded' | 'loading' | 'failed' | 'unloaded'

/**
 * Performance metrics for a loaded model.
 */
export interface ModelPerformanceMetrics {
  total_requests: number
  average_latency_ms: number
  requests_per_second: number
  average_fps: number | null
}

/**
 * Status information for a single loaded model.
 */
export interface LoadedModelStatus {
  model_id: string
  task_type: string
  model_name: string
  framework: string
  quantization: string | null
  health: ModelHealth
  vram_allocated_gb: number
  vram_used_gb: number | null
  warm_up_complete: boolean
  last_used: string | null
  load_time_ms: number | null
  performance_metrics: ModelPerformanceMetrics | null
  error_message: string | null
}

/**
 * Overall model service status.
 */
export interface ModelStatusResponse {
  loaded_models: LoadedModelStatus[]
  total_vram_allocated_gb: number
  total_vram_available_gb: number
  timestamp: string
  cuda_available: boolean
}

/**
 * Category of ontology type to augment.
 */
export type OntologyCategory = 'entity' | 'event' | 'role' | 'relation'

/**
 * Suggested ontology type from the AI.
 */
export interface OntologySuggestion {
  name: string
  description: string
  parent: string | null
  confidence: number
  examples: string[]
}

/**
 * Request payload for ontology augmentation.
 */
export interface AugmentOntologyRequest {
  personaId: string
  domain: string
  existingTypes: string[]
  targetCategory: OntologyCategory
  maxSuggestions?: number
}

/**
 * Response from ontology augmentation API.
 */
export interface AugmentationResponse {
  id: string
  persona_id: string
  target_category: OntologyCategory
  suggestions: OntologySuggestion[]
  reasoning: string
}

/**
 * API client configuration options.
 */
export interface ApiClientConfig {
  baseURL?: string
  timeout?: number
}

/**
 * HTTP client for backend API communication.
 * Wraps axios with typed methods for video summary and job management.
 */
export class ApiClient {
  private client: AxiosInstance

  /**
   * Create a new API client.
   *
   * @param config - Client configuration options
   */
  constructor(config: ApiClientConfig = {}) {
    this.client = axios.create({
      baseURL: config.baseURL || import.meta.env.VITE_API_URL || 'http://localhost:3001',
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Fetch all summaries for a video.
   *
   * @param videoId - Video identifier
   * @returns Array of video summaries
   * @throws ApiError if request fails
   */
  async getVideoSummaries(videoId: string): Promise<VideoSummary[]> {
    try {
      const response = await this.client.get<VideoSummary[]>(
        `/api/videos/${videoId}/summaries`
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Fetch a specific summary for a video and persona combination.
   *
   * @param videoId - Video identifier
   * @param personaId - Persona identifier
   * @returns Video summary or null if not found
   * @throws ApiError if request fails (except 404)
   */
  async getVideoSummary(
    videoId: string,
    personaId: string
  ): Promise<VideoSummary | null> {
    try {
      const response = await this.client.get<VideoSummary>(
        `/api/videos/${videoId}/summaries/${personaId}`
      )
      return response.data
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null
      }
      throw this.handleError(error)
    }
  }

  /**
   * Queue a video summary generation job.
   *
   * @param request - Summary generation parameters
   * @returns Job information with job ID
   * @throws ApiError if request fails
   */
  async generateSummary(
    request: GenerateSummaryRequest
  ): Promise<GenerateSummaryResponse> {
    try {
      const response = await this.client.post<GenerateSummaryResponse>(
        '/api/videos/summaries/generate',
        request
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Check the status of a background job.
   *
   * @param jobId - Job identifier
   * @returns Job status information
   * @throws ApiError if request fails
   */
  async getJobStatus(jobId: string): Promise<JobStatus> {
    try {
      const response = await this.client.get<JobStatus>(`/api/jobs/${jobId}`)
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Save or update a video summary directly.
   *
   * @param summary - Summary data to save
   * @returns Saved summary
   * @throws ApiError if request fails
   */
  async saveSummary(
    summary: Omit<VideoSummary, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<VideoSummary> {
    try {
      const response = await this.client.post<VideoSummary>(
        '/api/summaries',
        summary
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Delete a video summary.
   *
   * @param videoId - Video identifier
   * @param personaId - Persona identifier
   * @throws ApiError if request fails
   */
  async deleteSummary(videoId: string, personaId: string): Promise<void> {
    try {
      await this.client.delete(
        `/api/videos/${videoId}/summaries/${personaId}`
      )
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Request AI-generated ontology type suggestions.
   *
   * @param request - Augmentation parameters
   * @returns Suggestions with confidence scores and reasoning
   * @throws ApiError if request fails
   */
  async augmentOntology(
    request: AugmentOntologyRequest
  ): Promise<AugmentationResponse> {
    try {
      const response = await this.client.post<AugmentationResponse>(
        '/api/ontology/augment',
        {
          persona_id: request.personaId,
          domain: request.domain,
          existing_types: request.existingTypes,
          target_category: request.targetCategory,
          max_suggestions: request.maxSuggestions,
        }
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Detect objects in video frames using open-vocabulary detection models.
   * Supports both persona-based queries (using ontology and world state) and manual text queries.
   *
   * @param request - Detection parameters
   * @returns Detection results with bounding boxes and confidence scores
   * @throws ApiError if request fails
   */
  async detectObjects(request: DetectionRequest): Promise<DetectionResponse> {
    try {
      const response = await this.client.post<DetectionResponse>(
        `/api/videos/${request.videoId}/detect`,
        {
          persona_id: request.personaId,
          manual_query: request.manualQuery,
          query_options: request.queryOptions,
          frame_numbers: request.frameNumbers,
          confidence_threshold: request.confidenceThreshold,
          enable_tracking: request.enableTracking,
        }
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Get current model configuration for all task types.
   *
   * @returns Model configuration with all task types and options
   * @throws ApiError if request fails
   */
  async getModelConfig(): Promise<ModelConfig> {
    try {
      const response = await this.client.get<ModelConfig>('/api/models/config')
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Select a model for a specific task type.
   *
   * @param request - Task type and model name to select
   * @returns Selection confirmation
   * @throws ApiError if request fails
   */
  async selectModel(request: SelectModelRequest): Promise<SelectModelResponse> {
    try {
      const response = await this.client.post<SelectModelResponse>(
        '/api/models/select',
        null,
        {
          params: {
            task_type: request.task_type,
            model_name: request.model_name,
          },
        }
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Validate memory budget for currently selected models.
   *
   * @returns Memory validation results
   * @throws ApiError if request fails
   */
  async validateMemoryBudget(): Promise<MemoryValidation> {
    try {
      const response = await this.client.post<MemoryValidation>(
        '/api/models/validate'
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Get status information for all loaded models.
   * Includes health status, VRAM usage, and performance metrics.
   *
   * @returns Model status with loaded model information
   * @throws ApiError if request fails
   */
  async getModelStatus(): Promise<ModelStatusResponse> {
    try {
      const response = await this.client.get<ModelStatusResponse>(
        '/api/models/status'
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Convert axios errors to typed API errors.
   *
   * @param error - Error from axios
   * @returns Typed API error
   */
  private handleError(error: unknown): ApiError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ message?: string }>
      return {
        message:
          axiosError.response?.data?.message ||
          axiosError.message ||
          'An unknown error occurred',
        statusCode: axiosError.response?.status || 500,
      }
    }
    return {
      message: error instanceof Error ? error.message : 'An unknown error occurred',
      statusCode: 500,
    }
  }
}

/**
 * Default API client instance.
 */
export const apiClient = new ApiClient()
