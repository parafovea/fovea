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
