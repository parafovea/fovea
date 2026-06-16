/**
 * Visual indicator for auto-save status.
 *
 * Displays the current state of auto-save operations with appropriate
 * icons, messages, and retry controls.
 *
 * @module components/shared/SaveStatusIndicator
 */

import { Check, CircleAlert, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

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
}: SaveStatusIndicatorProps): JSX.Element {
  if (status === 'idle') {
    // Idle still renders an invisible placeholder so the
    // save-indicator data-tour-id is present in the DOM for the
    // first-annotation tour's "Saved. No submit button" step.
    // Visually identical to no indicator (height 0, no children).
    return (
      <div
        data-testid="save-status-idle"
        data-tour-id="save-indicator"
        aria-hidden="true"
        className="sr-only"
      />
    )
  }

  if (compact) {
    return (
      <div
        data-testid={`save-status-${status}`}
        data-tour-id="save-indicator"
        className="flex items-center gap-1"
      >
        {status === 'saving' && <Spinner className="size-3.5" />}
        {status === 'saved' && (
          <Check className="size-3.5 text-green-600" data-testid="CheckIcon" />
        )}
        {status === 'error' && (
          <Tooltip>
            <TooltipTrigger render={
              <span className="inline-flex">
                <CircleAlert className="size-3.5 text-destructive" data-testid="ErrorIcon" />
              </span>
            } />
            <TooltipContent>{errorMessage || 'Save failed'}</TooltipContent>
          </Tooltip>
        )}
        {status === 'retrying' && (
          <Tooltip>
            <TooltipTrigger render={
              <span className="inline-flex">
                <Spinner className="size-3.5" />
              </span>
            } />
            <TooltipContent>Retrying ({retryCount + 1}/{maxRetries})</TooltipContent>
          </Tooltip>
        )}
      </div>
    )
  }

  return (
    <div
      data-testid={`save-status-${status}`}
      data-tour-id="save-indicator"
      className="flex items-center gap-2"
    >
      {status === 'saving' && (
        <>
          <Spinner className="size-4" />
          <span className="text-xs text-muted-foreground">Saving...</span>
        </>
      )}

      {status === 'saved' && (
        <>
          <Check className="size-4 text-green-600" />
          <span className="text-xs text-green-600">
            Saved{lastSavedAt ? ` at ${formatTime(lastSavedAt)}` : ''}
          </span>
        </>
      )}

      {status === 'error' && (
        <>
          <CircleAlert className="size-4 text-destructive" />
          <span className="text-xs text-destructive">Save failed</span>
          {onRetry && (
            <Tooltip>
              <TooltipTrigger render={
                <Button variant="ghost" size="icon-xs" onClick={onRetry} aria-label="Retry">
                  <RefreshCw className="size-4" />
                </Button>
              } />
              <TooltipContent>Retry</TooltipContent>
            </Tooltip>
          )}
        </>
      )}

      {status === 'retrying' && (
        <>
          <Spinner className="size-4" />
          <span className="text-xs text-muted-foreground">
            Retrying ({retryCount + 1}/{maxRetries})...
          </span>
        </>
      )}
    </div>
  )
}
