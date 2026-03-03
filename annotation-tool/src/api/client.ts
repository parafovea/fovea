/**
 * HTTP client for backend API communication.
 * Provides typed methods for video summary and job management endpoints.
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import { GlossItem } from '@models/types'
import { TranscriptJson } from '@components/video/types'
import { logError } from '@services/errorLogging'

/**
 * Video summary data structure returned by the API.
 */
export interface VideoSummary {
  id: string
  videoId: string
  personaId: string
  summary: GlossItem[]
  visualAnalysis: string | null
  audioTranscript: string | null
  keyFrames: number[] | null
  confidence: number | null
  createdAt: string
  updatedAt: string
  /** Structured transcript with segments, speakers, and language. */
  transcriptJson?: TranscriptJson | null
  /** ISO language code detected from audio (e.g., "en", "es"). */
  audioLanguage?: string | null
  /** Number of distinct speakers detected. */
  speakerCount?: number | null
  /** Name of audio transcription model used (e.g., "whisper-v3-turbo", "assemblyai-universal"). */
  audioModelUsed?: string | null
  /** Name of visual analysis model used (e.g., "gemini-2-5-flash", "gpt-4o"). */
  visualModelUsed?: string | null
  /** Audio-visual fusion strategy used (e.g., "sequential", "timestamp_aligned"). */
  fusionStrategy?: string | null
  /** Processing time for audio transcription in seconds. */
  processingTimeAudio?: number | null
  /** Processing time for visual analysis in seconds. */
  processingTimeVisual?: number | null
  /** Processing time for audio-visual fusion in seconds. */
  processingTimeFusion?: number | null
  /** Optional comment about this summary */
  comment?: string | null
}

/**
 * Request payload for saving a video summary.
 * Required fields: videoId, personaId, summary
 * All other fields are optional and should be omitted (not null) if not provided.
 */
export interface SaveSummaryRequest {
  videoId: string
  personaId: string
  summary: GlossItem[]
  visualAnalysis?: string
  audioTranscript?: string
  keyFrames?: number[]
  confidence?: number
  transcriptJson?: TranscriptJson
  audioLanguage?: string
  speakerCount?: number
  audioModelUsed?: string
  visualModelUsed?: string
  fusionStrategy?: string
  processingTimeAudio?: number
  processingTimeVisual?: number
  processingTimeFusion?: number
  comment?: string | null
  createdBy?: string
}

/**
 * Request payload for generating a video summary.
 */
export interface GenerateSummaryRequest {
  videoId: string
  personaId: string
  frameSampleRate?: number
  maxFrames?: number
  enableAudio?: boolean
  enableSpeakerDiarization?: boolean
  fusionStrategy?: string
  audioLanguage?: string
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
  boundingBox: BoundingBox
  confidence: number
  trackId?: string | null
}

/**
 * Detections for a single video frame.
 */
export interface FrameDetections {
  frameNumber: number
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
  videoId: string
  query: string
  frames: FrameDetections[]
  totalDetections: number
  processingTime: number
}

/**
 * Model metadata for a single model option.
 */
export interface ModelOption {
  modelId: string
  framework: string
  vramGb: number
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
  maxMemoryPerModel: number
  offloadThreshold: number
  warmupOnStartup: boolean
}

/**
 * Complete model configuration response.
 */
export interface ModelConfig {
  models: Record<string, TaskConfig>
  inference: InferenceConfig
  cudaAvailable: boolean
  modelsAvailable: boolean
  cpuModelsAvailable: boolean
}

/**
 * Memory requirement for a single task.
 */
export interface ModelRequirement {
  modelId: string
  vramGb: number
}

/**
 * Memory validation result.
 */
export interface MemoryValidation {
  valid: boolean
  totalVramGb: number
  totalRequiredGb: number
  threshold: number
  maxAllowedGb: number
  modelRequirements: Record<string, ModelRequirement>
}

/**
 * Request payload for selecting a model.
 */
export interface SelectModelRequest {
  taskType: string
  modelName: string
}

/**
 * Response from model selection.
 */
export interface SelectModelResponse {
  status: string
  taskType: string
  selectedModel: string
}

/**
 * Model health status indicator.
 */
export type ModelHealth = 'loaded' | 'loading' | 'failed' | 'unloaded'

/**
 * Performance metrics for a loaded model.
 */
export interface ModelPerformanceMetrics {
  totalRequests: number
  averageLatencyMs: number
  requestsPerSecond: number
  averageFps: number | null
}

/**
 * Status information for a single loaded model.
 */
export interface LoadedModelStatus {
  modelId: string
  taskType: string
  modelName: string
  framework: string
  quantization: string | null
  health: ModelHealth
  vramAllocatedGb: number
  vramUsedGb: number | null
  warmUpComplete: boolean
  lastUsed: string | null
  loadTimeMs: number | null
  performanceMetrics: ModelPerformanceMetrics | null
  errorMessage: string | null
}

/**
 * Overall model service status.
 */
export interface ModelStatusResponse {
  loadedModels: LoadedModelStatus[]
  totalVramAllocatedGb: number
  totalVramAvailableGb: number
  timestamp: string
  cudaAvailable: boolean
  modelsAvailable: boolean
  cpuModelsAvailable: boolean
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
  personaId: string
  targetCategory: OntologyCategory
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
   * By default, uses relative URLs which work with the Vite proxy in development
   * and direct backend access in production. This ensures compatibility with
   * SSH port forwarding scenarios where only port 3000 may be forwarded.
   *
   * @param config - Client configuration options
   */
  constructor(config: ApiClientConfig = {}) {
    // Use relative URLs by default to work with Vite proxy
    // This ensures SSH port forwarding works when only port 3000 is forwarded
    // The Vite proxy forwards /api/* to the backend server
    const baseURL = config.baseURL ?? import.meta.env.VITE_API_URL ?? ''

    this.client = axios.create({
      baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      withCredentials: true, // Required for Safari and cross-origin cookie handling
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
  async saveSummary(summary: SaveSummaryRequest): Promise<VideoSummary> {
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
          personaId: request.personaId,
          domain: request.domain,
          existingTypes: request.existingTypes,
          targetCategory: request.targetCategory,
          maxSuggestions: request.maxSuggestions,
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
          personaId: request.personaId,
          manualQuery: request.manualQuery,
          queryOptions: request.queryOptions,
          frameNumbers: request.frameNumbers,
          confidenceThreshold: request.confidenceThreshold,
          enableTracking: request.enableTracking,
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
            taskType: request.taskType,
            modelName: request.modelName,
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
      const apiError: ApiError = {
        message:
          axiosError.response?.data?.message ||
          axiosError.message ||
          'An unknown error occurred',
        statusCode: axiosError.response?.status || 500,
      }

      // Log API errors for metrics tracking
      logError(new Error(apiError.message), undefined, {
        component: 'ApiClient',
        statusCode: apiError.statusCode,
        url: axiosError.config?.url,
        method: axiosError.config?.method,
      })

      return apiError
    }

    const genericError: ApiError = {
      message: error instanceof Error ? error.message : 'An unknown error occurred',
      statusCode: 500,
    }

    // Log non-axios errors
    logError(
      error instanceof Error ? error : new Error(genericError.message),
      undefined,
      { component: 'ApiClient' }
    )

    return genericError
  }
}

/**
 * Default API client instance.
 */
export const apiClient = new ApiClient()
