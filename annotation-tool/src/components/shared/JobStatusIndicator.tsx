/**
 * Component for displaying background job status with progress indication.
 * Provides real-time updates for video summarization and other long-running tasks.
 */

import React from 'react'

import { CheckCircle, CircleAlert, X } from 'lucide-react'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { useJobStatus, getJobStatusMessage } from '@store/queries/useJobStatus'
import type { JobStatus } from '@api/client'

/**
 * Props for JobStatusIndicator component.
 */
export interface JobStatusIndicatorProps {
  /**
   * Job ID to monitor, or null to hide the component.
   */
  jobId: string | null
  /**
   * Callback when job completes successfully.
   */
  onComplete?: (result: JobStatus) => void
  /**
   * Callback when job fails.
   */
  onFail?: (error: string) => void
  /**
   * Callback when user dismisses the status indicator.
   */
  onDismiss?: () => void
  /**
   * Custom title for the status indicator.
   * @default "Processing"
   */
  title?: string
  /**
   * Show dismiss button for completed or failed jobs.
   * @default true
   */
  dismissible?: boolean
}

/**
 * Component for displaying background job status with progress indication.
 * Polls job status at regular intervals and displays progress, completion, or error states.
 *
 * @param props - Component props
 * @returns JobStatusIndicator component
 *
 * @example
 * ```tsx
 * // Basic usage
 * <JobStatusIndicator
 *   jobId={jobId}
 *   onComplete={(result) => console.log('Job completed', result)}
 *   onFail={(error) => console.error('Job failed', error)}
 * />
 *
 * // With custom title
 * <JobStatusIndicator
 *   jobId={jobId}
 *   title="Generating video summary"
 *   onDismiss={() => setJobId(null)}
 * />
 * ```
 */
export function JobStatusIndicator({
  jobId,
  onComplete,
  onFail,
  onDismiss,
  title = 'Processing',
  dismissible = true,
}: JobStatusIndicatorProps): JSX.Element | null {
  const [dismissed, setDismissed] = React.useState(false)

  const { data: status, isLoading, isError, error } = useJobStatus(jobId, {
    onComplete,
    onFail,
  })

  const handleDismiss = (): void => {
    setDismissed(true)
    onDismiss?.()
  }

  // Don't show if no job ID or dismissed
  if (!jobId || dismissed) {
    return null
  }

  const dismissButton = dismissible ? (
    <AlertAction>
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleDismiss}
        aria-label="dismiss"
      >
        <X className="size-3.5" />
      </Button>
    </AlertAction>
  ) : null

  // Loading state
  if (isLoading) {
    return (
      <div className="mb-2 w-full">
        <Alert>
          <Spinner className="size-4" />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>Loading job status...</AlertDescription>
        </Alert>
      </div>
    )
  }

  // Error fetching job status
  if (isError) {
    return (
      <div className="mb-2 w-full">
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error?.message || 'Failed to fetch job status'}</AlertDescription>
          {dismissButton}
        </Alert>
      </div>
    )
  }

  // No status data
  if (!status) {
    return null
  }

  // Completed state
  if (status.state === 'completed') {
    return (
      <div className="mb-2 w-full">
        <Alert>
          <CheckCircle className="size-4 text-green-600" />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{getJobStatusMessage(status)}</AlertDescription>
          {dismissButton}
        </Alert>
      </div>
    )
  }

  // Failed state
  if (status.state === 'failed') {
    return (
      <div className="mb-2 w-full">
        <Alert variant="destructive">
          <CircleAlert className="size-4" />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{getJobStatusMessage(status)}</AlertDescription>
          {dismissButton}
        </Alert>
      </div>
    )
  }

  // Active, waiting, or delayed state
  return (
    <div className="mb-2 w-full">
      <Alert>
        <Spinner className="size-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p className="mb-2">{getJobStatusMessage(status)}</p>
          <Progress value={status.progress > 0 ? status.progress : null} />
          {status.stage === 'downloading' && (
            <p className="mt-1 text-xs text-muted-foreground">
              Model downloads are cached and only happen once.
            </p>
          )}
        </AlertDescription>
      </Alert>
    </div>
  )
}
