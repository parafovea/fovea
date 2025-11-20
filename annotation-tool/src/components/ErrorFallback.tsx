/**
 * ErrorFallback component displays a user-friendly error message
 * when an error boundary catches an error.
 */

import { Box, Button, Typography, Paper, Collapse, IconButton } from '@mui/material'
import { ExpandMore, BugReport, Refresh } from '@mui/icons-material'
import { useState } from 'react'

interface ErrorFallbackProps {
  /**
   * The error that was caught
   */
  error: Error

  /**
   * Callback to reset the error boundary and retry
   */
  resetError: () => void
}

/**
 * ErrorFallback component renders a friendly error UI with retry and reporting options.
 *
 * @param props - Component props
 * @returns Error fallback UI
 */
export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const [showDetails, setShowDetails] = useState(false)

  const handleReportIssue = () => {
    const title = encodeURIComponent(`Error: ${error.message}`)
    const body = encodeURIComponent(
      `## Error Description\n\n` +
        `**Message:** ${error.message}\n\n` +
        `**Stack Trace:**\n\`\`\`\n${error.stack || 'No stack trace available'}\n\`\`\`\n\n` +
        `## Steps to Reproduce\n\n` +
        `1. \n` +
        `2. \n` +
        `3. \n\n` +
        `## Expected Behavior\n\n` +
        `## Actual Behavior\n\n`
    )
    window.open(
      `https://github.com/parafovea/fovea/issues/new?title=${title}&body=${body}`,
      '_blank'
    )
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        padding: 4,
      }}
    >
      <Paper
        elevation={3}
        sx={{
          maxWidth: 600,
          width: '100%',
          padding: 4,
          textAlign: 'center',
        }}
      >
        <BugReport
          sx={{
            fontSize: 64,
            color: 'error.main',
            marginBottom: 2,
          }}
        />

        <Typography variant="h4" gutterBottom color="error">
          Something went wrong
        </Typography>

        <Typography variant="body1" color="text.secondary" paragraph>
          We apologize for the inconvenience. The application encountered an unexpected error and
          could not continue.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 3 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Refresh />}
            onClick={resetError}
          >
            Try Again
          </Button>

          <Button variant="outlined" color="secondary" onClick={handleReportIssue}>
            Report Issue
          </Button>
        </Box>

        <Box sx={{ marginTop: 3 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setShowDetails(!showDetails)}
          >
            <Typography variant="body2" color="text.secondary">
              Error details
            </Typography>
            <IconButton
              size="small"
              sx={{
                transform: showDetails ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s',
              }}
            >
              <ExpandMore />
            </IconButton>
          </Box>

          <Collapse in={showDetails}>
            <Paper
              variant="outlined"
              sx={{
                marginTop: 2,
                padding: 2,
                textAlign: 'left',
                backgroundColor: 'grey.50',
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              <Typography
                variant="body2"
                component="pre"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  margin: 0,
                }}
              >
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </Typography>
            </Paper>
          </Collapse>
        </Box>
      </Paper>
    </Box>
  )
}
