/**
 * Visual indicator for auto-save status.
 *
 * Displays the current state of auto-save operations with appropriate
 * icons, messages, and retry controls.
 *
 * @module components/shared/SaveStatusIndicator
 */

import {
  Box,
  Typography,
  CircularProgress,
  IconButton,
  Tooltip,
} from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import ErrorIcon from '@mui/icons-material/Error'
import RefreshIcon from '@mui/icons-material/Refresh'

/**
 * Status of the save operation.
 */
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'retrying'

/**
 * Props for SaveStatusIndicator component.
 */
export interface SaveStatusIndicatorProps {
  /** Current save status */
  status: SaveStatus
  /** Timestamp of last successful save */
  lastSavedAt: Date | null
  /** Error message if save failed */
  errorMessage: string | null
  /** Current retry attempt count */
  retryCount: number
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number
  /** Callback to manually retry a failed save */
  onRetry?: () => void
  /** Use compact display mode (icons only) */
  compact?: boolean
}

/**
 * Formats a date to a localized time string.
 *
 * @param date - Date to format
 * @returns Formatted time string (e.g., "2:30 PM")
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/**
 * Visual indicator for auto-save status.
 *
 * Supports both compact (icon-only) and full display modes. Shows appropriate
 * feedback for saving, saved, error, and retrying states.
 *
 * @param props - Component props
 * @returns SaveStatusIndicator component, or null when idle
 *
 * @example
 * ```tsx
 * // Full display mode
 * <SaveStatusIndicator
 *   status={saveStatus}
 *   lastSavedAt={lastSavedAt}
 *   errorMessage={errorMessage}
 *   retryCount={retryCount}
 *   onRetry={forceSave}
 * />
 *
 * // Compact mode for tight spaces
 * <SaveStatusIndicator
 *   status={saveStatus}
 *   lastSavedAt={lastSavedAt}
 *   errorMessage={errorMessage}
 *   retryCount={retryCount}
 *   compact
 * />
 * ```
 */
export function SaveStatusIndicator({
  status,
  lastSavedAt,
  errorMessage,
  retryCount,
  maxRetries = 3,
  onRetry,
  compact = false,
}: SaveStatusIndicatorProps) {
  if (status === 'idle') {
    return null
  }

  if (compact) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {status === 'saving' && <CircularProgress size={14} />}
        {status === 'saved' && (
          <CheckIcon sx={{ fontSize: 14, color: 'success.main' }} />
        )}
        {status === 'error' && (
          <Tooltip title={errorMessage || 'Save failed'}>
            <ErrorIcon sx={{ fontSize: 14, color: 'error.main' }} />
          </Tooltip>
        )}
        {status === 'retrying' && (
          <Tooltip title={`Retrying (${retryCount + 1}/${maxRetries})`}>
            <CircularProgress size={14} />
          </Tooltip>
        )}
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {status === 'saving' && (
        <>
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">
            Saving...
          </Typography>
        </>
      )}

      {status === 'saved' && (
        <>
          <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
          <Typography variant="caption" color="success.main">
            Saved{lastSavedAt ? ` at ${formatTime(lastSavedAt)}` : ''}
          </Typography>
        </>
      )}

      {status === 'error' && (
        <>
          <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} />
          <Typography variant="caption" color="error.main">
            Save failed
          </Typography>
          {onRetry && (
            <Tooltip title="Retry">
              <IconButton size="small" onClick={onRetry}>
                <RefreshIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </>
      )}

      {status === 'retrying' && (
        <>
          <CircularProgress size={16} />
          <Typography variant="caption" color="text.secondary">
            Retrying ({retryCount + 1}/{maxRetries})...
          </Typography>
        </>
      )}
    </Box>
  )
}
