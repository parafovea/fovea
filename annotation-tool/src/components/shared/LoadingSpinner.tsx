/**
 * Loading spinner component for Suspense fallback.
 * Displays a centered circular progress indicator with optional message.
 */
import { Box, CircularProgress, Typography } from '@mui/material'

interface LoadingSpinnerProps {
  /**
   * Optional message to display below the spinner
   * @default 'Loading...'
   */
  message?: string
  /**
   * Size of the spinner in pixels
   * @default 60
   */
  size?: number
}

/**
 * LoadingSpinner component.
 * Used as fallback for lazy-loaded route components.
 *
 * @example
 * ```tsx
 * <Suspense fallback={<LoadingSpinner />}>
 *   <LazyComponent />
 * </Suspense>
 * ```
 */
export function LoadingSpinner({ message = 'Loading...', size = 60 }: LoadingSpinnerProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        gap: 2,
      }}
      data-testid="loading-spinner"
    >
      <CircularProgress size={size} />
      {message && (
        <Typography variant="h6" color="text.secondary">
          {message}
        </Typography>
      )}
    </Box>
  )
}
