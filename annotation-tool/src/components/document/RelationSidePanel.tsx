/**
 * Side panel listing a document's span relations.
 *
 * Each row shows the source span label, an arrow, the target span label, the
 * relation type, and a delete control. Hovering a row reports the relation id so
 * the arc overlay can emphasize the matching arc.
 *
 * @module
 */

import { ArrowRight, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SpanRelation, TextSpan } from '@/lib/spans'

/**
 * Props for {@link RelationSidePanel}.
 */
export interface RelationSidePanelProps {
  /** The relations to list. */
  relations: SpanRelation[]
  /** All spans, used to resolve source and target labels. */
  spans: TextSpan[]
  /** Resolves a relation's display label. */
  resolveLabel: (relation: SpanRelation) => string
  /** The hovered relation id. */
  hoveredRelationId?: string | null
  /** Called with a relation id (or `null`) as rows are hovered. */
  onHoverRelation?: (relationId: string | null) => void
  /** Called when a relation's delete control is clicked. */
  onDeleteRelation: (relationId: string) => void
}

/** Reads a span's display label by id, falling back to a shortened id. */
function spanLabel(spans: TextSpan[], spanId: string): string {
  const span = spans.find((s) => s.id === spanId)
  if (span && typeof span.label === 'string' && span.label.length > 0) return span.label
  return spanId.slice(0, 8)
}

/**
 * Renders the relation list panel.
 *
 * @param props - the relations, spans, label resolver, and handlers
 * @returns the panel element
 */
export function RelationSidePanel({
  relations,
  spans,
  resolveLabel,
  hoveredRelationId,
  onHoverRelation,
  onDeleteRelation,
}: RelationSidePanelProps): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Relations ({relations.length})</h3>
      <ScrollArea className="max-h-64">
        {relations.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No relations yet. Use "Start relation" to connect two spans.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 pr-2">
            {relations.map((relation) => (
              <li key={relation.id}>
                <div
                  data-relation-row={relation.id}
                  onMouseEnter={() => onHoverRelation?.(relation.id)}
                  onMouseLeave={() => onHoverRelation?.(null)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-sm transition-colors',
                    hoveredRelationId === relation.id && 'border-primary bg-primary/5',
                  )}
                >
                  <span className="truncate">{spanLabel(spans, relation.sourceSpanId)}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{spanLabel(spans, relation.targetSpanId)}</span>
                  <Badge variant="outline" className="ml-auto text-[0.7rem]">
                    {resolveLabel(relation)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Delete relation"
                    onClick={() => onDeleteRelation(relation.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
