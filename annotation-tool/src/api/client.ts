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
/**
 * Per-request sampling overrides for the VLM call backing summarization.
 * Every field is optional; omitted keys defer to the backend dataclass default
 * (exposed via ``GET /api/models/defaults``).
 */
export interface GenerationOverridesRequest {
  temperature?: number
  topP?: number
  maxTokens?: number
}

/**
 * Per-request transcription / diarization overrides.
 */
export interface AudioOverridesRequest {
  beamSize?: number
  computeType?: 'float16' | 'float32' | 'int8' | 'int8_float16'
  numSpeakers?: number
  minSpeakers?: number
  maxSpeakers?: number
  vadThreshold?: number
}

export interface GenerateSummaryRequest {
  videoId: string
  personaId: string
  frameSampleRate?: number
  maxFrames?: number
  enableAudio?: boolean
  enableSpeakerDiarization?: boolean
  fusionStrategy?: string
  audioLanguage?: string
  generationOverrides?: GenerationOverridesRequest
  audioOverrides?: AudioOverridesRequest
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
 * Raw job status response from the backend API.
 * The progress field may be a plain number (legacy) or an object with percent and stage.
 */
interface JobStatusRaw {
  id: string
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
  progress: number | { percent: number; stage: string } | null
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
 * Job status information (normalized from backend response).
 */
export interface JobStatus {
  id: string
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'
  progress: number
  /** Current processing stage, or null when the backend uses legacy number-only progress. */
  stage: string | null
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
/**
 * Request to transcribe a video's audio track. When `enableDiarization`
 * is true the backend also calls the speaker_diarization model and the
 * response carries a `speakers` list plus a per-segment `speaker` tag.
 */
export interface TranscribeRequest {
  videoId: string
  language?: string | null
  enableDiarization?: boolean
  numSpeakers?: number | null
  minSpeakers?: number | null
  maxSpeakers?: number | null
}

/**
 * Single transcript segment returned by the ASR model.
 */
export interface TranscriptSegment {
  start: number
  end: number
  text: string
  confidence: number
  speaker?: string | null
}

/**
 * Response from the transcription endpoint.
 */
export interface TranscribeResponse {
  text: string
  segments: TranscriptSegment[]
  language: string
  duration: number
  processingTime: number
  modelUsed: string
  speakers?: string[]
  diarizationModelUsed?: string
  diarizationProcessingTime?: number
}

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
  name: string
  modelId: string
  framework: string
  vramGb: number
  cpuMemoryGb: number
  cpuCompatible: boolean
  speed: string
  description: string
  fps: number | null
  requiresApiKey: boolean
}

/**
 * Configuration for a single task type.
 */
export interface TaskConfig {
  selected: string
  options: ModelOption[]
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
  cpuCompatible: boolean
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
 * Response from checking whether a model is cached locally.
 */
export interface TaskReadyResponse {
  taskType: string
  modelId: string
  cached: boolean
  framework: string
}

/**
 * Response from loading or unloading a model.
 */
export interface ModelLoadResponse {
  status: string
  taskType: string
  message: string
}

/**
 * Default sampling parameters for LLM/VLM text generation, returned from
 * ``GET /api/models/defaults``.
 */
export interface GenerationDefaults {
  maxTokens: number
  temperature: number
  topP: number
  stopSequences: string[] | null
}

/**
 * Default loading parameters for a language model.
 */
export interface LLMDefaults {
  quantization: string
  framework: string
  maxTokens: number
  temperature: number
  topP: number
  contextLength: number
}

/**
 * Default loading parameters for audio transcription.
 */
export interface TranscriptionDefaults {
  framework: string
  language: string | null
  task: string
  device: string
  computeType: string
  beamSize: number
}

/**
 * Default parameters for voice-activity detection.
 */
export interface VADDefaults {
  threshold: number
  minSpeechDurationMs: number
  minSilenceDurationMs: number
  device: string
}

/**
 * Default parameters for speaker diarization.
 */
export interface DiarizationDefaults {
  numSpeakers: number | null
  minSpeakers: number
  maxSpeakers: number
  device: string
}

/**
 * Default parameters for object detection.
 */
export interface DetectionDefaults {
  framework: string
  confidenceThreshold: number
  device: string
}

/**
 * Default parameters for object tracking.
 */
export interface TrackingDefaults {
  framework: string
  device: string
}

/**
 * Default loading parameters for a vision-language model.
 */
export interface VLMDefaults {
  quantization: string
  framework: string
  device: string
  trustRemoteCode: boolean
}

/**
 * Response shape for ``GET /api/models/defaults``. Each field maps to the
 * defaults of one dataclass in the Python model-service.
 */
export interface ModelDefaultsResponse {
  generation: GenerationDefaults
  llm: LLMDefaults
  transcription: TranscriptionDefaults
  vad: VADDefaults
  diarization: DiarizationDefaults
  detection: DetectionDefaults
  tracking: TrackingDefaults
  vlm: VLMDefaults
}

/**
 * Per-user inference preferences (full shape with explicit nulls for
 * "defer to backend default"). Written atomically — sending a field as
 * ``null`` clears any prior override.
 */
export interface UserInferencePreferences {
  generation: {
    temperature: number | null
    topP: number | null
    maxTokens: number | null
  }
  audio: {
    beamSize: number | null
    computeType: 'float16' | 'float32' | 'int8' | 'int8_float16' | null
    numSpeakers: number | null
    minSpeakers: number | null
    maxSpeakers: number | null
    vadThreshold: number | null
  }
  detection: {
    confidenceThreshold: number | null
  }
}

export interface UserPreferencesResponse {
  inferencePreferences: UserInferencePreferences
  updatedAt: string
}

export interface UserPreferencesUpdate {
  inferencePreferences: UserInferencePreferences
}

/**
 * Partial per-persona preferences. Any subgroup may be omitted; within a
 * subgroup any field may be omitted — undefined fields inherit from the
 * user-level document at merge time.
 */
export interface PersonaInferenceOverrides {
  generation?: Partial<{
    temperature: number
    topP: number
    maxTokens: number
  }>
  audio?: Partial<{
    beamSize: number
    computeType: 'float16' | 'float32' | 'int8' | 'int8_float16'
    numSpeakers: number
    minSpeakers: number
    maxSpeakers: number
    vadThreshold: number
  }>
  detection?: Partial<{
    confidenceThreshold: number
  }>
}

export interface PersonaPreferencesResponse {
  personaId: string
  inferencePreferences: PersonaInferenceOverrides
  updatedAt: string
}

export interface PersonaPreferencesUpdate {
  inferencePreferences: PersonaInferenceOverrides
}

/**
 * SystemConfig key-value rows. The row shape is a discriminated union on
 * ``key``; ``value`` is constrained by the key.
 */
export type SystemConfigRow =
  | {
      key: 'storagePaths'
      value: {
        videoDataRoot: string
        thumbnailOutputRoot: string
        audioOutputRoot: string
      }
    }
  | {
      key: 'runtime'
      value: {
        cudaDevice: string
        warmupOnStartup: boolean
        defaultBatchSize: number
        maxBatchSize: number
        offloadThreshold: number
        maxVideoFrames: number
        frameSampleRate: number
        vlmMaxSummaryTokens: number
        llmMaxClaimsTokens: number
        llmMaxSynthesisTokens: number
        llmMaxOntologyTokens: number
      }
    }
  | {
      key: 'externalApis'
      value: {
        providers: Array<{
          provider: 'anthropic' | 'openai' | 'google'
          endpoint: string
          timeoutSeconds: number
          maxRetries: number
        }>
      }
    }

export type SystemConfigRowStored = SystemConfigRow & {
  version: number
  updatedAt: string
  updatedByUserId: string | null
}

export interface SystemConfigListResponse {
  rows: SystemConfigRowStored[]
}

/**
 * Response shape for ``GET /api/models/frameworks``.
 *
 * Each field is the list of string values from the corresponding StrEnum
 * in the Python model-service, so UI selectors don't hardcode the lists.
 */
export interface ModelFrameworksResponse {
  llm: string[]
  audio: string[]
  detection: string[]
  tracking: string[]
  vlmInference: string[]
  quantization: string[]
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
 * Per-call timeout (ms) for axios requests that forward through the
 * backend to the model-service. Cold-start CPU LLM / VLM / detection
 * inference can run well past the 30 s axios default; the matching
 * backend ceilings are configured via `MODEL_SERVICE_TIMEOUT_*_MS`
 * env vars (see server/src/lib/fetchModelService.ts). To avoid the
 * magic-number drift of repeating that value here, the frontend
 * reads `VITE_INFERENCE_TIMEOUT_MS` at build time (set on the docker
 * stack via build-arg). When unset (production GPU deployments where
 * the synchronous calls return in seconds), the default mirrors the
 * backend's prod default ceiling of 60_000 ms.
 */
const INFERENCE_TIMEOUT_MS: number = (() => {
  const raw = import.meta.env.VITE_INFERENCE_TIMEOUT_MS as string | undefined
  if (typeof raw === 'string' && raw.length > 0) {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 60_000
})()

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
      // Base ceiling covers the slowest call any route can make. The
      // synchronous model-service-bound routes (ontology augment,
      // detection, thumbnails) need this much for cold-start CPU
      // inference; the rest of the API is fast and just inherits the
      // same ceiling. Per-call overrides are still honored when a
      // specific route wants a tighter bound.
      timeout: config.timeout || INFERENCE_TIMEOUT_MS,
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
      const response = await this.client.get<JobStatusRaw>(`/api/jobs/${jobId}`)
      const raw = response.data

      // Parse progress: backend may send a number (legacy) or { percent, stage } (new format)
      const rawProgress = raw.progress
      let progress: number
      let stage: string | null = null
      if (typeof rawProgress === 'object' && rawProgress !== null) {
        progress = (rawProgress as { percent: number }).percent ?? 0
        stage = (rawProgress as { stage: string }).stage ?? null
      } else {
        progress = (rawProgress as number) ?? 0
      }

      return {
        ...raw,
        progress,
        stage,
      }
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
        },
        // Synchronous model-service-bound call; uses INFERENCE_TIMEOUT_MS
        // so the value tracks the backend's matching env-driven ceiling
        // rather than being repeated as a literal here.
        { timeout: INFERENCE_TIMEOUT_MS }
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
        },
        // Synchronous model-service-bound call (see augmentOntology).
        { timeout: INFERENCE_TIMEOUT_MS }
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Transcribe a video's audio track using the configured ASR model.
   *
   * @param request - Transcription parameters
   * @returns Transcript text and per-segment timings
   * @throws ApiError if request fails
   */
  async transcribeVideo(request: TranscribeRequest): Promise<TranscribeResponse> {
    try {
      const response = await this.client.post<TranscribeResponse>(
        `/api/videos/${request.videoId}/transcribe`,
        {
          language: request.language ?? null,
          enableDiarization: request.enableDiarization ?? false,
          numSpeakers: request.numSpeakers ?? null,
          minSpeakers: request.minSpeakers ?? null,
          maxSpeakers: request.maxSpeakers ?? null,
        },
        { timeout: INFERENCE_TIMEOUT_MS }
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
   * Check whether the selected model for a task type is cached locally.
   *
   * @param taskType - Task type to check
   * @returns Task ready status with cached flag
   * @throws ApiError if request fails
   */
  async checkTaskReady(taskType: string): Promise<TaskReadyResponse> {
    try {
      const response = await this.client.get<TaskReadyResponse>(
        `/api/models/task-ready/${taskType}`
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Load a model into memory (triggers download if not cached).
   *
   * @param taskType - Task type of model to load
   * @returns Load result
   * @throws ApiError if request fails
   */
  async loadModel(taskType: string): Promise<ModelLoadResponse> {
    try {
      const response = await this.client.post<ModelLoadResponse>(
        `/api/models/load/${taskType}`
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Fetch default values for every inference config dataclass.
   *
   * The settings UI binds form controls to these so what the user sees
   * matches what the backend will use when a request field is unset.
   *
   * @returns Defaults keyed by config group (generation, llm, transcription,
   *   vad, diarization, detection, tracking, vlm)
   * @throws ApiError if request fails
   */
  async getModelDefaults(): Promise<ModelDefaultsResponse> {
    try {
      const response = await this.client.get<ModelDefaultsResponse>(
        '/api/models/defaults'
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Fetch the allowed framework/quantization enum values per task group.
   *
   * Used to render framework selectors without hardcoding the lists in the
   * frontend.
   *
   * @returns Enum value arrays keyed by task group
   * @throws ApiError if request fails
   */
  async getModelFrameworks(): Promise<ModelFrameworksResponse> {
    try {
      const response = await this.client.get<ModelFrameworksResponse>(
        '/api/models/frameworks'
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /** Fetch the authenticated user's stored inference preferences. */
  async getMyPreferences(): Promise<UserPreferencesResponse> {
    try {
      const response = await this.client.get<UserPreferencesResponse>('/api/me/preferences')
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /** Upsert the authenticated user's inference preferences. */
  async updateMyPreferences(
    payload: UserPreferencesUpdate
  ): Promise<UserPreferencesResponse> {
    try {
      const response = await this.client.put<UserPreferencesResponse>(
        '/api/me/preferences',
        payload
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /** Fetch the per-persona inference-preferences overrides for a given persona. */
  async getPersonaPreferences(personaId: string): Promise<PersonaPreferencesResponse> {
    try {
      const response = await this.client.get<PersonaPreferencesResponse>(
        `/api/personas/${personaId}/preferences`
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /** Upsert the per-persona inference-preferences overrides. */
  async updatePersonaPreferences(
    personaId: string,
    payload: PersonaPreferencesUpdate
  ): Promise<PersonaPreferencesResponse> {
    try {
      const response = await this.client.put<PersonaPreferencesResponse>(
        `/api/personas/${personaId}/preferences`,
        payload
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /** Fetch the full SystemConfig row set (admin-only). */
  async listSystemConfig(): Promise<SystemConfigListResponse> {
    try {
      const response = await this.client.get<SystemConfigListResponse>('/api/admin/config')
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * Upsert a SystemConfig row. Server propagates the change to the
   * model-service before responding.
   */
  async updateSystemConfig(row: SystemConfigRow): Promise<SystemConfigRowStored> {
    try {
      const response = await this.client.put<SystemConfigRowStored>(
        `/api/admin/config/${row.key}`,
        row
      )
      return response.data
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /** Replay every stored SystemConfig row to the model-service (admin-only). */
  async replaySystemConfig(): Promise<{ replayed: string[] }> {
    try {
      const response = await this.client.post<{ replayed: string[] }>(
        '/api/admin/config/replay'
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
