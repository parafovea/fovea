/**
 * TanStack Query hook for background job status monitoring.
 * Provides automatic polling and completion detection.
 */

import { useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query'
import { apiClient, JobStatus, ApiError } from '../api/client'
import { summaryKeys } from './useSummaries'

/**
 * Query key factory for job status.
 */
export const jobKeys = {
  all: ['jobs'] as const,
  job: (jobId: string) => [...jobKeys.all, jobId] as const,
}

/**
 * Hook options for job status polling.
 */
export interface UseJobStatusOptions
  extends Omit<UseQueryOptions<JobStatus, ApiError>, 'queryKey' | 'queryFn'> {
  /**
   * Polling interval in milliseconds when job is active.
   * @default 2000
   */
  pollingInterval?: number
  /**
   * Callback when job completes successfully.
   */
  onComplete?: (result: JobStatus) => void
  /**
   * Callback when job fails.
   */
  onFail?: (error: string) => void
}

/**
 * Monitor the status of a background job with automatic polling.
 * Polls at regular intervals while the job is active, stops when completed or failed.
 *
 * @param jobId - Job identifier
 * @param options - Hook options including polling configuration
 * @returns Query result with job status
 */
export function useJobStatus(jobId: string | null, options: UseJobStatusOptions = {}) {
  const { pollingInterval = 2000, onComplete, onFail, ...queryOptions } = options
  const queryClient = useQueryClient()

  const query = useQuery<JobStatus, ApiError>({
    queryKey: jobKeys.job(jobId || ''),
    queryFn: () => {
      if (!jobId) {
        throw new Error('Job ID is required')
      }
      return apiClient.getJobStatus(jobId)
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data
      // Stop polling if job is completed, failed, or query is disabled
      if (!data || data.state === 'completed' || data.state === 'failed') {
        return false
      }
      // Continue polling for active, waiting, or delayed jobs
      return pollingInterval
    },
    staleTime: 0, // Always refetch on mount
    ...queryOptions,
  })

  // Handle completion and failure
  const { data } = query
  const previousStateRef = React.useRef<JobStatus['state'] | null>(null)

  React.useEffect(() => {
    if (!data || data.state === previousStateRef.current) {
      return
    }

    if (data.state === 'completed') {
      if (onComplete) {
        onComplete(data)
      }
      // Invalidate related summary queries when job completes
      if (data.returnvalue) {
        const { videoId, personaId } = data.data
        queryClient.invalidateQueries({
          queryKey: summaryKeys.summary(videoId, personaId),
        })
        queryClient.invalidateQueries({
          queryKey: summaryKeys.video(videoId),
        })
      }
    } else if (data.state === 'failed') {
      if (onFail) {
        onFail(data.failedReason || 'Job failed with unknown error')
      }
    }

    previousStateRef.current = data.state
  }, [data, onComplete, onFail, queryClient])

  return query
}

/**
 * Get a human-readable status message for a job.
 *
 * @param status - Job status object
 * @returns Human-readable status message
 */
export function getJobStatusMessage(status: JobStatus): string {
  switch (status.state) {
    case 'waiting':
      return 'Waiting in queue...'
    case 'delayed':
      return 'Delayed, will retry soon...'
    case 'active':
      if (status.progress > 0) {
        return `Processing... ${Math.round(status.progress)}%`
      }
      return 'Processing...'
    case 'completed':
      return 'Completed successfully'
    case 'failed':
      return `Failed: ${status.failedReason || 'Unknown error'}`
    default:
      return 'Unknown status'
  }
}

/**
 * Check if a job is still in progress.
 *
 * @param status - Job status object
 * @returns True if job is still active
 */
export function isJobActive(status: JobStatus): boolean {
  return status.state === 'waiting' || status.state === 'active' || status.state === 'delayed'
}

// React import for useEffect and useRef
import React from 'react'
