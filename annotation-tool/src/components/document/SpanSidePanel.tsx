/**
 * Side panel listing a document's spans.
 *
 * Each row shows the span's color swatch, the text it covers, and a chip per
 * denotation on its token range — one per ontology type (across personas) plus
 * any world object — each chip removable on its own. A header toggle switches
 * between the active persona's type labels and every persona's. Clicking a row
 * makes the span active; a header button starts the relation builder. While the
 * builder awaits a source or target, every span row acts as an endpoint picker,
 * so an overlapping span can be chosen even though the text only surfaces its
 * primary span on a token click.
 *
 * @module
 */

import { GitBranch, Tag, Trash2, Users, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { SpanLabelDetail, TextSpan } from '@/lib/spans'
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
  /**
   * Called when a span row is clicked. During a relation phase the host routes
   * this to the relation machine's source/target pick for that span id, so any
   * overlapping span can be an endpoint.
   */
  onSelectSpan: (spanId: string) => void
  /** Resolves a span's covered text, shown as the row's primary line. */
  spanText?: (span: TextSpan) => string
  /** Called to (re)open the label picker to add a denotation to a span. */
  onEditSpan?: (spanId: string) => void
  /** Called when a span's delete control is clicked (removes the whole span). */
  onDeleteSpan: (spanId: string) => void
  /** Called to remove a single denotation by its backing annotation id. */
  onDeleteLabel?: (annotationId: string) => void
  /** Called to begin building a relation. */
  onStartRelation: () => void
  /** The relation builder's current phase, reflected on the start button. */
  relationPhase: RelationPhase
  /** The span already chosen as the relation source, or `null`. */
  relationSourceId?: string | null
  /** Whether every persona's type labels are shown (vs the active persona's). */
  showAllPersonas?: boolean
  /** Toggles whether every persona's type labels are shown. */
  onToggleAllPersonas?: (next: boolean) => void
  /**
   * When `true`, hides the delete controls and the start-relation button, so a
   * read-only viewer cannot mutate spans or draw relations. Defaults to `false`.
   */
  readOnly?: boolean
}

/** The prompt shown on the relation button for each builder phase. */
const RELATION_PROMPT: Record<RelationPhase, string> = {
  IDLE: 'Start relation',
  WAITING_SOURCE: 'Pick a source span',
  WAITING_TARGET: 'Pick a target span',
  WAITING_LABEL: 'Choose a relation type',
}

/**
 * A span's covered text and whether it carries any denotation yet. The text it
 * covers is always the row's primary line so the span is recognizable; its
 * denotations render as chips beneath.
 */
function spanDisplay(
  span: TextSpan,
  spanText?: (span: TextSpan) => string,
): { text: string; unlabeled: boolean } {
  const text = spanText?.(span)?.trim()
  return {
    text: text && text.length > 0 ? text : 'Unlabeled span',
    unlabeled: !(span.labels && span.labels.length > 0),
  }
}

/** Renders one removable denotation chip on a span row. */
function LabelChip({
  label,
  readOnly,
  onDelete,
}: {
  label: SpanLabelDetail
  readOnly: boolean
  onDelete?: (annotationId: string) => void
}): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[0.7rem]',
        label.kind === 'object'
          ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
          : 'bg-muted text-foreground ring-1 ring-border',
      )}
      title={`${label.name} (${label.kind})`}
    >
      <span className="truncate">{label.name}</span>
      {!readOnly && onDelete && (
        <button
          type="button"
          aria-label={`Remove ${label.name}`}
          className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            onDelete(label.annotationId)
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
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
  spanText,
  onEditSpan,
  onDeleteSpan,
  onDeleteLabel,
  onStartRelation,
  relationPhase,
  relationSourceId = null,
  showAllPersonas = false,
  onToggleAllPersonas,
  readOnly = false,
}: SpanSidePanelProps): JSX.Element {
  const picking = relationPhase === 'WAITING_SOURCE' || relationPhase === 'WAITING_TARGET'
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Spans ({spans.length})</h3>
        {!readOnly && (
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
        )}
      </div>

      {onToggleAllPersonas && (
        <Button
          variant={showAllPersonas ? 'secondary' : 'ghost'}
          size="sm"
          className="w-fit"
          onClick={() => onToggleAllPersonas(!showAllPersonas)}
          data-testid="toggle-all-personas"
          aria-pressed={showAllPersonas}
        >
          <Users className="mr-1.5 h-3.5 w-3.5" />
          {showAllPersonas ? 'All personas' : 'This persona'}
        </Button>
      )}

      <ScrollArea className="flex-1">
        {spans.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No spans yet. Select tokens in the text to label them.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 pr-2">
            {spans.map((span) => {
              const isSource = picking && span.id === relationSourceId
              const isEndpointTarget = picking && !isSource
              const pickHint = isSource
                ? 'Source'
                : relationPhase === 'WAITING_SOURCE'
                  ? 'Click to set as source'
                  : 'Click to set as target'
              const display = spanDisplay(span, spanText)
              const labels = span.labels ?? []
              return (
                <li key={span.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectSpan(span.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') onSelectSpan(span.id)
                    }}
                    data-span-row={span.id}
                    aria-label={picking ? `${display.text}: ${pickHint}` : undefined}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 rounded-md border border-transparent px-2 py-1.5 transition-colors hover:bg-accent',
                      activeSpanId === span.id && 'border-primary bg-primary/5',
                      isSource && 'border-primary bg-primary/10',
                      isEndpointTarget && 'hover:border-primary',
                    )}
                  >
                    <span
                      className="mt-0.5 size-3 shrink-0 rounded-sm ring-1 ring-foreground/10"
                      style={{ background: colorMap.get(span.id) ?? 'transparent' }}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span
                        className={cn(
                          'truncate text-sm',
                          display.unlabeled && 'italic text-muted-foreground',
                        )}
                      >
                        {display.text}
                      </span>
                      {!picking && labels.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {labels.map((label) => (
                            <LabelChip
                              key={label.annotationId}
                              label={label}
                              readOnly={readOnly}
                              onDelete={onDeleteLabel}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    {picking ? (
                      <span
                        className={cn(
                          'mt-0.5 shrink-0 text-[0.7rem]',
                          isSource ? 'font-medium text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {pickHint}
                      </span>
                    ) : (
                      <>
                        {!readOnly && onEditSpan && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0"
                            aria-label={display.unlabeled ? 'Label span' : 'Add label'}
                            title={display.unlabeled ? 'Label span' : 'Add label'}
                            onClick={(event) => {
                              event.stopPropagation()
                              onEditSpan(span.id)
                            }}
                          >
                            <Tag className="h-4 w-4" />
                          </Button>
                        )}
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="shrink-0"
                            aria-label="Delete span"
                            onClick={(event) => {
                              event.stopPropagation()
                              onDeleteSpan(span.id)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
