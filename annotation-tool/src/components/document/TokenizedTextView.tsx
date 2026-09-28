/**
 * Renders a tokenized element as selectable, span-highlighted text.
 *
 * Each token is drawn as its own inline chunk carrying `data-token`,
 * `data-el`, `data-idx`, and `data-key` so the selection and position hooks can
 * find it. Coverage comes from `computeTokenSpanMap`; the background is built by
 * `tokenBackground` (a solid color for one span, diagonal stripes for
 * overlaps), and the rounded-chunk sides come from `tokenClass`, so a
 * discontiguous span renders as separate rounded pills. Whitespace between
 * tokens is preserved as its own non-interactive run.
 *
 * @module
 */

import { useMemo } from 'react'

import { cn } from '@/lib/utils'
import {
  computeTokenSpanMap,
  tokenBackground,
  tokenClass,
  tokenKey,
  type SpanTokenClass,
  type TextSpan,
  type TokenizedElement,
} from '@/lib/spans'

import type { TokenSelectionHandlers } from './hooks/useTokenSelection'

/**
 * Props for {@link TokenizedTextView}.
 */
export interface TokenizedTextViewProps {
  /** The tokenized element to render. */
  element: TokenizedElement
  /** The source text, used to render inter-token whitespace faithfully. */
  text?: string | null
  /** All spans covering the element. */
  spans: TextSpan[]
  /** Span id to CSS color, from `assignSpanColors`. */
  colorMap: Map<string, string>
  /** The committed token selection, keyed by element name to its index set. */
  selection: Record<string, number[]>
  /** The active span id, outlined for emphasis. */
  activeSpanId: string | null
  /** The relation source span id while building a relation. */
  relationSourceId?: string | null
  /** The relation target span id while building a relation. */
  relationTargetId?: string | null
  /** Called with the hovered span id (or `null`) as the pointer moves over tokens. */
  onSpanHover?: (spanId: string | null) => void
  /** Pointer handlers wiring token selection onto the container. */
  selectionHandlers: TokenSelectionHandlers
  /** Ref to the positioned content wrapper (used for measurement and capture). */
  containerRef: React.RefObject<HTMLDivElement>
  /** Overlays rendered inside the positioned wrapper (arcs, label picker). */
  children?: React.ReactNode
  /** Extra classes for the content wrapper. */
  className?: string
}

/** Maps a chunk class to its border-radius utilities. */
const RADIUS_BY_CLASS: Record<SpanTokenClass, string> = {
  'span-single': 'rounded',
  'span-first': 'rounded-l',
  'span-last': 'rounded-r',
  'span-middle': 'rounded-none',
}

/**
 * Renders the tokens of one element with span highlights and selection wiring.
 *
 * @param props - the element, spans, colors, selection, and interaction wiring
 * @returns the content wrapper element
 */
export function TokenizedTextView({
  element,
  text,
  spans,
  colorMap,
  selection,
  activeSpanId,
  relationSourceId,
  relationTargetId,
  onSpanHover,
  selectionHandlers,
  containerRef,
  children,
  className,
}: TokenizedTextViewProps): JSX.Element {
  const tokenSpanMap = useMemo(() => computeTokenSpanMap(spans), [spans])
  const selectedIndexes = useMemo(
    () => new Set(selection[element.name] ?? []),
    [selection, element.name],
  )

  const tokens = element.tokens

  return (
    <div
      ref={containerRef}
      data-annotator-content=""
      data-el={element.name}
      className={cn(
        'relative select-none whitespace-pre-wrap break-words text-base leading-loose',
        className,
      )}
      onPointerDown={selectionHandlers.onPointerDown}
      onPointerMove={selectionHandlers.onPointerMove}
      onPointerUp={selectionHandlers.onPointerUp}
    >
      {tokens.map((token, i) => {
        const key = tokenKey(element.name, token.index)
        const spanIds = tokenSpanMap.get(key) ?? []
        const covered = spanIds.length > 0
        const primarySpanId = spanIds[0]
        const chunkClass: SpanTokenClass = covered
          ? tokenClass(element.name, token.index, primarySpanId, spans)
          : 'span-single'
        const background = covered ? tokenBackground(spanIds, colorMap) : undefined
        const isSelected = selectedIndexes.has(token.index)
        const isActive = activeSpanId != null && spanIds.includes(activeSpanId)
        const isSource = relationSourceId != null && spanIds.includes(relationSourceId)
        const isTarget = relationTargetId != null && spanIds.includes(relationTargetId)

        const leadingWhitespace =
          i === 0
            ? text
              ? text.slice(0, token.start)
              : ''
            : text
              ? text.slice(tokens[i - 1].end, token.start)
              : tokens[i - 1].whitespaceAfter
                ? ' '
                : ''

        return (
          <span key={key}>
            {leadingWhitespace && <span data-ws="">{leadingWhitespace}</span>}
            <span
              data-token=""
              data-el={element.name}
              data-idx={token.index}
              data-key={key}
              data-span-ids={covered ? spanIds.join(' ') : undefined}
              onMouseEnter={covered ? () => onSpanHover?.(primarySpanId) : undefined}
              onMouseLeave={covered ? () => onSpanHover?.(null) : undefined}
              style={background ? { background } : undefined}
              className={cn(
                'cursor-text px-px py-0.5',
                covered && RADIUS_BY_CLASS[chunkClass],
                covered && 'text-foreground',
                isSelected && 'bg-primary/25 outline outline-1 outline-primary',
                isActive && 'outline outline-2 outline-primary',
                isSource && 'outline outline-2 outline-info',
                isTarget && 'outline outline-2 outline-success',
              )}
            >
              {token.text}
            </span>
          </span>
        )
      })}
      {children}
    </div>
  )
}
