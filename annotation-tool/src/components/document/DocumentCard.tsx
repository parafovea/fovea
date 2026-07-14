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
import { useTourAnchor } from '@/tours/engine/anchorRegistry'

import { documentTitle } from './documentTitle'

/**
 * Props for {@link DocumentCard}.
 */
export interface DocumentCardProps {
  /** The document row to render. */
  document: LayersDocumentRow
  /** Whether this card is selected for keyboard navigation. */
  selected?: boolean
  /** The card's position in the grid; the first card carries the tour anchor. */
  index?: number
  /** Called when the card is clicked. */
  onOpen: (documentId: string) => void
}

/**
 * Renders one document card.
 *
 * @param props - the document, selection state, and open handler
 * @returns the card element
 */
export function DocumentCard({ document, selected, index, onOpen }: DocumentCardProps): JSX.Element {
  const preview = (document.text ?? '').trim()
  const firstCardAnchorRef = useTourAnchor('document-card-first')

  return (
    <Card
      // The first card carries the first-card anchor so a tour can spotlight a
      // tangible document without depending on which document renders first.
      ref={index === 0 ? firstCardAnchorRef : undefined}
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
