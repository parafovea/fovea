/**
 * Tests for job status hook.
 */

import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { ReactNode } from 'react'
import { useJobStatus, getJobStatusMessage, isJobActive } from './useJobStatus'
import type { JobStatus } from '../api/client'

/**
 * Create a wrapper component with QueryClient for testing hooks.
 */
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useJobStatus', () => {
  it('fetches job status when jobId is provided', async () => {
    const { result } = renderHook(() => useJobStatus('job-active'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toMatchObject({
      id: 'job-active',
      state: 'active',
      progress: 50,
    })
  })

  it('does not fetch when jobId is null', async () => {
    const { result } = renderHook(() => useJobStatus(null), {
      wrapper: createWrapper(),
    })

    expect(result.current.isPending).toBe(true)
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('calls onComplete callback when job completes', async () => {
    const onComplete = vi.fn()

    const { result } = renderHook(
      () => useJobStatus('job-completed', { onComplete }),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'completed',
      })
    ))
  })

  it('calls onFail callback when job fails', async () => {
    const onFail = vi.fn()

    const { result } = renderHook(
      () => useJobStatus('job-failed', { onFail }),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    await waitFor(() => expect(onFail).toHaveBeenCalledWith(
      'Video file not found'
    ))
  })

  it('stops polling when job is completed', async () => {
    const { result } = renderHook(() => useJobStatus('job-completed'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Check that refetchInterval is false (no polling)
    expect(result.current.data?.state).toBe('completed')
  })

  it('continues polling for active jobs', async () => {
    const { result } = renderHook(
      () => useJobStatus('job-active', { pollingInterval: 100 }),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data?.state).toBe('active')
  })
})

describe('getJobStatusMessage', () => {
  it('returns correct message for waiting state', () => {
    const status: JobStatus = {
      id: 'job-1',
      state: 'waiting',
      progress: 0,
      data: { videoId: 'video-1', personaId: 'persona-1' },
    }

    expect(getJobStatusMessage(status)).toBe('Waiting in queue...')
  })

  it('returns correct message for delayed state', () => {
    const status: JobStatus = {
      id: 'job-1',
      state: 'delayed',
      progress: 0,
      data: { videoId: 'video-1', personaId: 'persona-1' },
    }

    expect(getJobStatusMessage(status)).toBe('Delayed, will retry soon...')
  })

  it('returns progress percentage for active state', () => {
    const status: JobStatus = {
      id: 'job-1',
      state: 'active',
      progress: 75,
      data: { videoId: 'video-1', personaId: 'persona-1' },
    }

    expect(getJobStatusMessage(status)).toBe('Processing... 75%')
  })

  it('returns generic message for active state with no progress', () => {
    const status: JobStatus = {
      id: 'job-1',
      state: 'active',
      progress: 0,
      data: { videoId: 'video-1', personaId: 'persona-1' },
    }

    expect(getJobStatusMessage(status)).toBe('Processing...')
  })

  it('returns completed message', () => {
    const status: JobStatus = {
      id: 'job-1',
      state: 'completed',
      progress: 100,
      data: { videoId: 'video-1', personaId: 'persona-1' },
    }

    expect(getJobStatusMessage(status)).toBe('Completed successfully')
  })

  it('returns failed message with reason', () => {
    const status: JobStatus = {
      id: 'job-1',
      state: 'failed',
      progress: 50,
      data: { videoId: 'video-1', personaId: 'persona-1' },
      failedReason: 'Network timeout',
    }

    expect(getJobStatusMessage(status)).toBe('Failed: Network timeout')
  })
})

describe('isJobActive', () => {
  it('returns true for waiting jobs', () => {
    const status: JobStatus = {
      id: 'job-1',
      state: 'waiting',
      progress: 0,
      data: { videoId: 'video-1', personaId: 'persona-1' },
    }

    expect(isJobActive(status)).toBe(true)
  })

  it('returns true for active jobs', () => {
    const status: JobStatus = {
      id: 'job-1',
      state: 'active',
      progress: 50,
      data: { videoId: 'video-1', personaId: 'persona-1' },
    }

    expect(isJobActive(status)).toBe(true)
  })

  it('returns true for delayed jobs', () => {
    const status: JobStatus = {
      id: 'job-1',
      state: 'delayed',
      progress: 0,
      data: { videoId: 'video-1', personaId: 'persona-1' },
    }

    expect(isJobActive(status)).toBe(true)
  })

  it('returns false for completed jobs', () => {
    const status: JobStatus = {
      id: 'job-1',
      state: 'completed',
      progress: 100,
      data: { videoId: 'video-1', personaId: 'persona-1' },
    }

    expect(isJobActive(status)).toBe(false)
  })

  it('returns false for failed jobs', () => {
    const status: JobStatus = {
      id: 'job-1',
      state: 'failed',
      progress: 70,
      data: { videoId: 'video-1', personaId: 'persona-1' },
      failedReason: 'Error',
    }

    expect(isJobActive(status)).toBe(false)
  })
})
