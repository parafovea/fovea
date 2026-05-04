import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip,
  Grid,
  Paper,
} from '@mui/material'
import {
  CheckCircle as SuccessIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
} from '@mui/icons-material'
import { ImportResult } from '@models/types'

/**
 * Predicate for the orphan-skipped banner. Exported so it can be unit
 * tested without rendering the full MUI Dialog (which has React-context
 * resolution issues under pnpm + jsdom). Returns true when the import
 * dropped one or more annotations because they referenced data not
 * present in the file — the user-visible UX cliff that previously read
 * as "Import Successful" with zero annotations and no warning.
 */
export function shouldShowOrphanSkippedBanner(result: ImportResult): boolean {
  const skippedCount = result.summary.skippedItems.annotations
  const hasMissingDep = result.conflicts.some(c => c.type === 'missing-dependency')
  return skippedCount > 0 && hasMissingDep
}

/**
 * @interface ImportResultDialogProps
 * @description Props for the ImportResultDialog component.
 * @property open - Whether the dialog is open
 * @property result - Import result data to display
 * @property onClose - Callback when dialog is closed
 */
interface ImportResultDialogProps {
  open: boolean
  result: ImportResult | null
  onClose: () => void
}

/**
 * ImportResultDialog component for displaying detailed import results.
 * Shows summary statistics, warnings, errors, and resolved conflicts.
 *
 * @param props - Component props
 * @returns Import result dialog component
 */
export default function ImportResultDialog({ open, result, onClose }: ImportResultDialogProps) {
  if (!result) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {(() => {
            const hasSkipped =
              result.summary.skippedItems.annotations > 0 ||
              result.conflicts.some(c => c.type === 'missing-dependency')
            if (!result.success) {
              return (
                <>
                  <ErrorIcon color="error" />
                  <Typography variant="h6">Import Failed</Typography>
                </>
              )
            }
            if (hasSkipped) {
              return (
                <>
                  <WarningIcon color="warning" />
                  <Typography variant="h6">Import Completed with Warnings</Typography>
                </>
              )
            }
            return (
              <>
                <SuccessIcon color="success" />
                <Typography variant="h6">Import Successful</Typography>
              </>
            )
          })()}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 1 }}>
          {/* Prominent banner when annotations were silently skipped due to
              missing references. The success icon alone is misleading in
              this case: the import "succeeded" but the user got fewer
              records than they exported, so we surface the count and the
              "what happened" explanation up front. */}
          {shouldShowOrphanSkippedBanner(result) && (
            <Alert severity="warning" icon={<WarningIcon />} data-testid="import-orphan-skipped-banner">
              <Typography variant="subtitle2" gutterBottom>
                {result.summary.skippedItems.annotations} annotation{result.summary.skippedItems.annotations === 1 ? '' : 's'} skipped: missing referenced data
              </Typography>
              <Typography variant="body2">
                These annotations link to entities, events, times, or locations
                that were not included in the imported file (and that you do
                not already own). They cannot be imported on their own. To
                recover them, re-export from the source with the referenced
                world objects included, then re-import. The skipped rows are
                listed under "Resolved Conflicts" below.
              </Typography>
            </Alert>
          )}

          {/* Summary Statistics */}
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Summary
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h4" color="success.main">
                    {result.summary.importedItems.annotations}
                  </Typography>
                  <Typography variant="caption">Annotations Imported</Typography>
                </Paper>
              </Grid>
              <Grid item xs={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h4" color="primary">
                    {result.summary.importedItems.totalKeyframes}
                  </Typography>
                  <Typography variant="caption">Total Keyframes</Typography>
                </Paper>
              </Grid>
              <Grid item xs={4}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h6">{result.summary.importedItems.personas}</Typography>
                  <Typography variant="caption">Personas</Typography>
                </Paper>
              </Grid>
              <Grid item xs={4}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h6">{result.summary.importedItems.entities}</Typography>
                  <Typography variant="caption">Entities</Typography>
                </Paper>
              </Grid>
              <Grid item xs={4}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h6">{result.summary.importedItems.events}</Typography>
                  <Typography variant="caption">Events</Typography>
                </Paper>
              </Grid>
            </Grid>

            <List dense sx={{ mt: 2 }}>
              <ListItem>
                <ListItemText
                  primary="Total Lines Processed"
                  secondary={result.summary.processedLines.toLocaleString()}
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="Single-Frame Sequences"
                  secondary={result.summary.importedItems.singleKeyframeSequences.toLocaleString()}
                />
              </ListItem>
              {result.summary.skippedItems.annotations > 0 && (
                <ListItem>
                  <ListItemText
                    primary="Annotations Skipped"
                    secondary={result.summary.skippedItems.annotations.toLocaleString()}
                  />
                </ListItem>
              )}
            </List>
          </Box>

          {/* Resolved Conflicts */}
          {result.conflicts.length > 0 && (
            <>
              <Divider />
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  Resolved Conflicts ({result.conflicts.length})
                </Typography>
                <List dense>
                  {result.conflicts.map((conflict, idx) => (
                    <ListItem key={idx}>
                      <ListItemText
                        primary={`Line ${conflict.line}: ${conflict.details}`}
                        secondary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Typography variant="caption">Resolution:</Typography>
                            <Chip
                              label={conflict.resolution}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </>
          )}

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <>
              <Divider />
              <Box>
                <Alert severity="warning" icon={<WarningIcon />}>
                  <Typography variant="subtitle2" gutterBottom>
                    Warnings ({result.warnings.length})
                  </Typography>
                  <List dense>
                    {result.warnings.map((warning, idx) => (
                      <ListItem key={idx} sx={{ py: 0 }}>
                        <ListItemText
                          primary={`Line ${warning.line}: ${warning.message}`}
                          secondary={warning.type}
                          primaryTypographyProps={{ variant: 'caption' }}
                          secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Alert>
              </Box>
            </>
          )}

          {/* Errors */}
          {result.errors.length > 0 && (
            <>
              <Divider />
              <Box>
                <Alert severity="error" icon={<ErrorIcon />}>
                  <Typography variant="subtitle2" gutterBottom>
                    Errors ({result.errors.length})
                  </Typography>
                  <List dense>
                    {result.errors.map((error, idx) => (
                      <ListItem key={idx} sx={{ py: 0 }}>
                        <ListItemText
                          primary={`Line ${error.line}: ${error.message}`}
                          secondary={error.type}
                          primaryTypographyProps={{ variant: 'caption' }}
                          secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Alert>
              </Box>
            </>
          )}

          {/* Success Message */}
          {result.success && result.errors.length === 0 && (
            <Alert severity="success" icon={<SuccessIcon />}>
              All items imported successfully with no errors.
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}
