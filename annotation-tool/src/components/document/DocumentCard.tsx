/**
 * Card for one document in the document browser grid.
 *
 * Shows a derived title, a text preview, and the source kind, and invokes a
 * click handler to open the document for annotation.
 *
 * @module
 */

import { FileText } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import type { LayersDocumentRow } from '@store/queries'

/**
 * Props for {@link DocumentCard}.
 */
export interface DocumentCardProps {
  /** The document row to render. */
  document: LayersDocumentRow
  /** Whether this card is selected for keyboard navigation. */
  selected?: boolean
  /** Called when the card is clicked. */
  onOpen: (documentId: string) => void
}

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

/**
 * Renders one document card.
 *
 * @param props - the document, selection state, and open handler
 * @returns the card element
 */
export function DocumentCard({ document, selected, onOpen }: DocumentCardProps): JSX.Element {
  const preview = (document.text ?? '').trim()

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(document.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen(document.id)
      }}
      className={cn(
        'flex h-full cursor-pointer flex-col transition-shadow hover:shadow-md',
        selected && 'outline outline-2 outline-primary',
      )}
    >
      <CardContent className="flex-1 p-4">
        <div className="mb-2 flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <h3 className="truncate font-medium">{documentTitle(document)}</h3>
        </div>
        <p className="line-clamp-4 text-sm text-muted-foreground">
          {preview || 'No text'}
        </p>
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-2 px-4 pb-4">
        <Badge variant="outline" className="text-xs">
          {document.sourceKind || document.kind}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {new Date(document.createdAt).toLocaleDateString()}
        </span>
      </CardFooter>
    </Card>
  )
}
