/**
 * Component for displaying background job status with progress indication.
 * Provides real-time updates for video summarization and other long-running tasks.
 */

import React from 'react'
import {
  Box,
  LinearProgress,
  Typography,
  Alert,
  AlertTitle,
  Collapse,
  IconButton,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import CloseIcon from '@mui/icons-material/Close'
import { useJobStatus, getJobStatusMessage } from '../hooks/useJobStatus'
import type { JobStatus } from '../api/client'

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
}: JobStatusIndicatorProps) {
  const [dismissed, setDismissed] = React.useState(false)

  const { data: status, isLoading, isError, error } = useJobStatus(jobId, {
    onComplete,
    onFail,
  })

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  // Don't show if no job ID or dismissed
  if (!jobId || dismissed) {
    return null
  }

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ width: '100%', mb: 2 }}>
        <Alert severity="info">
          <AlertTitle>{title}</AlertTitle>
          Loading job status...
        </Alert>
      </Box>
    )
  }

  // Error fetching job status
  if (isError) {
    return (
      <Box sx={{ width: '100%', mb: 2 }}>
        <Alert
          severity="error"
          action={
            dismissible && (
              <IconButton
                aria-label="dismiss"
                color="inherit"
                size="small"
                onClick={handleDismiss}
              >
                <CloseIcon fontSize="inherit" />
              </IconButton>
            )
          }
        >
          <AlertTitle>Error</AlertTitle>
          {error?.message || 'Failed to fetch job status'}
        </Alert>
      </Box>
    )
  }

  // No status data
  if (!status) {
    return null
  }

  // Completed state
  if (status.state === 'completed') {
    return (
      <Collapse in={!dismissed}>
        <Box sx={{ width: '100%', mb: 2 }}>
          <Alert
            severity="success"
            icon={<CheckCircleIcon />}
            action={
              dismissible && (
                <IconButton
                  aria-label="dismiss"
                  color="inherit"
                  size="small"
                  onClick={handleDismiss}
                >
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              )
            }
          >
            <AlertTitle>{title}</AlertTitle>
            {getJobStatusMessage(status)}
          </Alert>
        </Box>
      </Collapse>
    )
  }

  // Failed state
  if (status.state === 'failed') {
    return (
      <Collapse in={!dismissed}>
        <Box sx={{ width: '100%', mb: 2 }}>
          <Alert
            severity="error"
            icon={<ErrorIcon />}
            action={
              dismissible && (
                <IconButton
                  aria-label="dismiss"
                  color="inherit"
                  size="small"
                  onClick={handleDismiss}
                >
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              )
            }
          >
            <AlertTitle>{title}</AlertTitle>
            {getJobStatusMessage(status)}
          </Alert>
        </Box>
      </Collapse>
    )
  }

  // Active, waiting, or delayed state
  return (
    <Box sx={{ width: '100%', mb: 2 }}>
      <Alert severity="info">
        <AlertTitle>{title}</AlertTitle>
        <Typography variant="body2" gutterBottom>
          {getJobStatusMessage(status)}
        </Typography>
        <LinearProgress
          variant={status.progress > 0 ? 'determinate' : 'indeterminate'}
          value={status.progress}
          sx={{ mt: 1 }}
        />
      </Alert>
    </Box>
  )
}
