/**
 * Derives a display title from a Layers document row.
 *
 * Split out from `DocumentCard.tsx` so that file exports React components
 * only (otherwise the Vite react-refresh plugin warns and Fast Refresh
 * stops working in dev for that module).
 *
 * @module
 */

import type { LayersDocumentRow } from '@store/queries'

/** Derives a display title from a document's metadata or its leading text. */
export function documentTitle(document: LayersDocumentRow): string {
  const metadata = document.metadata
  if (metadata && typeof metadata === 'object') {
    const title = (metadata as Record<string, unknown>).title
    if (typeof title === 'string' && title.trim().length > 0) return title.trim()
  }
  const firstLine = (document.text ?? '').split('\n', 1)[0].trim()
  if (firstLine.length > 0) return firstLine.slice(0, 80)
  return 'Untitled document'
}
