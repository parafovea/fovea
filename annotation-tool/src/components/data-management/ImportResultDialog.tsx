import {
  CheckCircle,
  CircleAlert,
  AlertTriangle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ImportResult } from '@models/types'

/**
 * Predicate for the orphan-skipped banner. Exported so it can be unit
 * tested without rendering the full Dialog. Returns true when the
 * import dropped one or more annotations because they referenced data
 * not present in the file — the user-visible UX cliff that previously
 * read as "Import Successful" with zero annotations and no warning.
 *
 * @param result - Import result to inspect
 * @returns Whether the banner should be shown
 */
export function shouldShowOrphanSkippedBanner(result: ImportResult): boolean {
  const skippedCount = result.summary.skippedItems.annotations
  const hasMissingDep = result.conflicts.some(c => c.type === 'missing-dependency')
  return skippedCount > 0 && hasMissingDep
}

/**
 * Props for the ImportResultDialog component.
 *
 * @param open - Whether the dialog is open
 * @param result - Import result data to display
 * @param onClose - Callback when dialog is closed
 */
interface ImportResultDialogProps {
  open: boolean
  result: ImportResult | null
  onClose: () => void
}

/**
 * Displays detailed import results including summary statistics,
 * warnings, errors, and resolved conflicts.
 *
 * @param props - Component props
 * @returns Import result dialog component
 */
export function ImportResultDialog({ open, result, onClose }: ImportResultDialogProps): JSX.Element | null {
  if (!result) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose() }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <span className="flex items-center gap-2">
              {!result.success ? (
                <>
                  <CircleAlert className="size-5 text-destructive" />
                  Import Failed
                </>
              ) : shouldShowOrphanSkippedBanner(result) ? (
                <>
                  <AlertTriangle className="size-5 text-yellow-600" />
                  Completed with Warnings
                </>
              ) : (
                <>
                  <CheckCircle className="size-5 text-green-600" />
                  Import Successful
                </>
              )}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-6 pt-2">
          {shouldShowOrphanSkippedBanner(result) && (
            <Alert variant="default" className="border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-100">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                {result.summary.skippedItems.annotations} annotation
                {result.summary.skippedItems.annotations === 1 ? ' was' : 's were'}{' '}
                skipped because the export referenced world objects that
                were not in the file. To recover, re-export from the
                source instance with referenced entities, events, times,
                or locations included.
              </AlertDescription>
            </Alert>
          )}

          {/* Summary Statistics */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Summary</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-2xl font-bold text-green-600">
                  {result.summary.importedItems.annotations}
                </p>
                <p className="text-xs text-muted-foreground">Annotations Imported</p>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-2xl font-bold text-primary">
                  {result.summary.importedItems.totalKeyframes}
                </p>
                <p className="text-xs text-muted-foreground">Total Keyframes</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-card p-3 text-center">
                <p className="text-lg font-semibold">{result.summary.importedItems.personas}</p>
                <p className="text-xs text-muted-foreground">Personas</p>
              </div>
              <div className="rounded-lg border bg-card p-3 text-center">
                <p className="text-lg font-semibold">{result.summary.importedItems.entities}</p>
                <p className="text-xs text-muted-foreground">Entities</p>
              </div>
              <div className="rounded-lg border bg-card p-3 text-center">
                <p className="text-lg font-semibold">{result.summary.importedItems.events}</p>
                <p className="text-xs text-muted-foreground">Events</p>
              </div>
            </div>

            <div className="mt-4 space-y-1">
              <div className="flex justify-between py-1 text-sm">
                <span>Total Lines Processed</span>
                <span className="text-muted-foreground">{result.summary.processedLines.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 text-sm">
                <span>Single-Frame Sequences</span>
                <span className="text-muted-foreground">{result.summary.importedItems.singleKeyframeSequences.toLocaleString()}</span>
              </div>
              {result.summary.skippedItems.annotations > 0 && (
                <div className="flex justify-between py-1 text-sm">
                  <span>Annotations Skipped</span>
                  <span className="text-muted-foreground">{result.summary.skippedItems.annotations.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Resolved Conflicts */}
          {result.conflicts.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="mb-3 text-sm font-medium">
                  Resolved Conflicts ({result.conflicts.length})
                </h3>
                <div className="space-y-2">
                  {result.conflicts.map((conflict, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 py-1 text-sm">
                      <span>Line {conflict.line}: {conflict.details}</span>
                      <Badge variant="outline">{conflict.resolution}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <>
              <Separator />
              <Alert>
                <AlertTriangle className="size-4" />
                <AlertDescription>
                  <h4 className="mb-2 text-sm font-medium">Warnings ({result.warnings.length})</h4>
                  <div className="space-y-1">
                    {result.warnings.map((warning, idx) => (
                      <div key={idx} className="text-xs">
                        <span>Line {warning.line}: {warning.message}</span>
                        <span className="ml-2 text-muted-foreground">{warning.type}</span>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <>
              <Separator />
              <Alert variant="destructive">
                <CircleAlert className="size-4" />
                <AlertDescription>
                  <h4 className="mb-2 text-sm font-medium">Errors ({result.errors.length})</h4>
                  <div className="space-y-1">
                    {result.errors.map((error, idx) => (
                      <div key={idx} className="text-xs">
                        <span>Line {error.line}: {error.message}</span>
                        <span className="ml-2 text-muted-foreground">{error.type}</span>
                      </div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            </>
          )}

          {/* Success Message */}
          {result.success && result.errors.length === 0 && (
            <Alert>
              <CheckCircle className="size-4" />
              <AlertDescription>
                All items imported successfully with no errors.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
