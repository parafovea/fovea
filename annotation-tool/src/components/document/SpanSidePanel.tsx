/**
 * Side panel listing a document's spans.
 *
 * Each row shows the span's color swatch, its resolved label, its kind badge,
 * and a delete control; clicking a row makes the span active. A header button
 * starts the relation builder and reflects its current phase.
 *
 * @module
 */

import { GitBranch, Trash2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { TextSpan } from '@/lib/spans'
import type { RelationPhase } from '@store/zustand/createSpanAnnotatorStore'

/**
 * Props for {@link SpanSidePanel}.
 */
export interface SpanSidePanelProps {
  /** The spans to list. */
  spans: TextSpan[]
  /** Span id to CSS color, from `assignSpanColors`. */
  colorMap: Map<string, string>
  /** The active span id. */
  activeSpanId: string | null
  /** Called when a span row is clicked. */
  onSelectSpan: (spanId: string) => void
  /** Called when a span's delete control is clicked. */
  onDeleteSpan: (spanId: string) => void
  /** Called to begin building a relation. */
  onStartRelation: () => void
  /** The relation builder's current phase, reflected on the start button. */
  relationPhase: RelationPhase
}

/** The prompt shown on the relation button for each builder phase. */
const RELATION_PROMPT: Record<RelationPhase, string> = {
  IDLE: 'Start relation',
  WAITING_SOURCE: 'Pick a source span',
  WAITING_TARGET: 'Pick a target span',
  WAITING_LABEL: 'Choose a relation type',
}

/** Reads a span's display label, falling back to a shortened id. */
function labelOf(span: TextSpan): string {
  if (typeof span.label === 'string' && span.label.length > 0) return span.label
  return span.id.slice(0, 8)
}

/**
 * Renders the span list panel.
 *
 * @param props - the spans, colors, active id, and handlers
 * @returns the panel element
 */
export function SpanSidePanel({
  spans,
  colorMap,
  activeSpanId,
  onSelectSpan,
  onDeleteSpan,
  onStartRelation,
  relationPhase,
}: SpanSidePanelProps): JSX.Element {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Spans ({spans.length})</h3>
        <Button
          variant={relationPhase === 'IDLE' ? 'outline' : 'secondary'}
          size="sm"
          onClick={onStartRelation}
          disabled={relationPhase !== 'IDLE'}
          data-testid="start-relation-button"
        >
          <GitBranch className="mr-1.5 h-4 w-4" />
          {RELATION_PROMPT[relationPhase]}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {spans.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No spans yet. Select tokens in the text to label them.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 pr-2">
            {spans.map((span) => (
              <li key={span.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectSpan(span.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelectSpan(span.id)
                  }}
                  data-span-row={span.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:bg-accent',
                    activeSpanId === span.id && 'border-primary bg-primary/5',
                  )}
                >
                  <span
                    className="size-3 shrink-0 rounded-sm ring-1 ring-foreground/10"
                    style={{ background: colorMap.get(span.id) ?? 'transparent' }}
                  />
                  <span className="flex-1 truncate text-sm">{labelOf(span)}</span>
                  {span.spanType && (
                    <Badge variant="outline" className="text-[0.7rem]">
                      {span.spanType}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Delete span"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteSpan(span.id)
                    }}
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
