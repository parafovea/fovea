/**
 * ErrorFallback component displays a user-friendly error message
 * when an error boundary catches an error.
 */

import { useState } from 'react'

import { Bug, ChevronDown, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

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
export function ErrorFallback({ error, resetError }: ErrorFallbackProps): JSX.Element {
  const [showDetails, setShowDetails] = useState(false)

  const handleReportIssue = (): void => {
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
    <div className="flex min-h-[400px] flex-col items-center justify-center p-8">
      <Card className="w-full max-w-[600px] text-center">
        <CardContent className="space-y-4">
          <Bug className="mx-auto size-16 text-destructive" />

          <h2 className="text-2xl font-bold text-destructive">
            Something went wrong
          </h2>

          <p className="text-muted-foreground">
            We apologize for the inconvenience. The application encountered an unexpected error and
            could not continue.
          </p>

          <div className="flex justify-center gap-2 pt-3">
            <Button onClick={resetError}>
              <RefreshCw className="size-4" />
              Try Again
            </Button>

            <Button variant="outline" onClick={handleReportIssue}>
              Report Issue
            </Button>
          </div>

          <Collapsible open={showDetails} onOpenChange={setShowDetails}>
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className="mx-auto flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                />
              }
            >
              Error details
              <ChevronDown
                className={cn(
                  'size-4 transition-transform duration-300',
                  showDetails && 'rotate-180'
                )}
              />
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="mt-2 max-h-[200px] overflow-auto rounded-md border bg-muted/50 p-4 text-left">
                <pre className="m-0 break-words whitespace-pre-wrap font-mono text-xs">
                  {error.message}
                  {error.stack && `\n\n${error.stack}`}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  )
}
