/**
 * Tests for JobStatusIndicator component.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { JobStatusIndicator } from './JobStatusIndicator'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('JobStatusIndicator', () => {
  it('renders nothing when jobId is null', () => {
    const { container } = render(
      <JobStatusIndicator jobId={null} />,
      { wrapper: createWrapper() }
    )

    expect(container.firstChild).toBeNull()
  })

  it('shows loading state initially', async () => {
    render(
      <JobStatusIndicator jobId="job-active" />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText(/Loading job status/i)).toBeInTheDocument()
  })

  it('displays active job with progress', async () => {
    render(
      <JobStatusIndicator jobId="job-active" title="Generating Summary" />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('Generating Summary')).toBeInTheDocument()
      expect(screen.getByText(/Processing\.\.\. 50%/i)).toBeInTheDocument()
    })
  })

  it('displays completed job', async () => {
    render(
      <JobStatusIndicator jobId="job-completed" />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText(/Completed successfully/i)).toBeInTheDocument()
    })
  })

  it('displays failed job', async () => {
    render(
      <JobStatusIndicator jobId="job-failed" />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText(/Video file not found/i)).toBeInTheDocument()
    })
  })

  it('calls onComplete callback when job completes', async () => {
    const onComplete = vi.fn()

    render(
      <JobStatusIndicator jobId="job-completed" onComplete={onComplete} />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          state: 'completed',
        })
      )
    })
  })

  it('calls onFail callback when job fails', async () => {
    const onFail = vi.fn()

    render(
      <JobStatusIndicator jobId="job-failed" onFail={onFail} />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(onFail).toHaveBeenCalledWith('Video file not found')
    })
  })

  it('allows dismissing completed jobs', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()

    render(
      <JobStatusIndicator jobId="job-completed" onDismiss={onDismiss} />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText(/Completed successfully/i)).toBeInTheDocument()
    })

    const dismissButton = screen.getByRole('button', { name: /dismiss/i })
    await user.click(dismissButton)

    expect(onDismiss).toHaveBeenCalled()
  })

  it('allows dismissing failed jobs', async () => {
    const onDismiss = vi.fn()
    const user = userEvent.setup()

    render(
      <JobStatusIndicator jobId="job-failed" onDismiss={onDismiss} dismissible />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText(/Video file not found/i)).toBeInTheDocument()
    })

    const dismissButton = screen.getByRole('button', { name: /dismiss/i })
    await user.click(dismissButton)

    expect(onDismiss).toHaveBeenCalled()
  })

  it('hides dismiss button when dismissible is false', async () => {
    render(
      <JobStatusIndicator jobId="job-completed" dismissible={false} />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText(/Completed successfully/i)).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument()
  })

  it('uses custom title', async () => {
    render(
      <JobStatusIndicator jobId="job-active" title="Processing Video Analysis" />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText('Processing Video Analysis')).toBeInTheDocument()
    })
  })

  it('hides when dismissed', async () => {
    const user = userEvent.setup()

    render(
      <JobStatusIndicator jobId="job-completed" />,
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(screen.getByText(/Completed successfully/i)).toBeInTheDocument()
    })

    const dismissButton = screen.getByRole('button', { name: /dismiss/i })
    await user.click(dismissButton)

    await waitFor(() => {
      expect(screen.queryByText(/Completed successfully/i)).not.toBeInTheDocument()
    })
  })
})
