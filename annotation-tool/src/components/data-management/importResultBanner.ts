/**
 * Predicate helpers for import-result presentation.
 *
 * Split out from `ImportResultDialog.tsx` so that file exports React
 * components only (otherwise the Vite react-refresh plugin warns and Fast
 * Refresh stops working in dev for that module).
 *
 * @module
 */

import { ImportResult } from '@models/types'

/**
 * Predicate for the orphan-skipped banner. Exported so it can be unit
 * tested without rendering the full Dialog. Returns true when the run
 * dropped one or more annotations because they referenced data not
 * present in the file, surfacing the case where a "Import Successful"
 * result would otherwise show zero annotations and no warning.
 *
 * @param result - the import result to inspect
 * @returns whether the banner should be shown
 */
export function shouldShowOrphanSkippedBanner(result: ImportResult): boolean {
  const skippedCount = result.summary.skippedItems.annotations
  const hasMissingDep = result.conflicts.some(c => c.type === 'missing-dependency')
  return skippedCount > 0 && hasMissingDep
}
