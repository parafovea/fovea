/**
 * Stable color assignment for spans, with striped backgrounds for overlaps.
 *
 * Ported from bead's `assignSpanColors` and `applySpanColor`: spans are assigned
 * colors from a palette, reusing one color per label so same-labeled spans match;
 * a token covered by several spans gets a striped linear-gradient so every
 * overlapping span stays visible.
 *
 * @module
 */

import type { TextSpan } from './types'

/** Default light background palette (shared with the bead span widget). */
export const DEFAULT_SPAN_PALETTE: readonly string[] = [
  '#BBDEFB',
  '#C8E6C9',
  '#FFE0B2',
  '#F8BBD0',
  '#D1C4E9',
  '#B2EBF2',
  '#DCEDC8',
  '#FFD54F',
]

const FALLBACK_COLOR = '#BBDEFB'

/**
 * Derives a stable string key from a span's opaque label for color reuse.
 *
 * A string label keys on itself; an object label with a string `label` field
 * keys on that field (matching the bead `{ label, label_id }` shape); any other
 * non-nullish label keys on its JSON serialization. A nullish label yields
 * `undefined`, so unlabeled spans never share a color by label.
 */
function labelKey(label: unknown): string | undefined {
  if (label === undefined || label === null) return undefined
  if (typeof label === 'string') return label
  if (typeof label === 'object') {
    const inner = (label as Record<string, unknown>).label
    if (typeof inner === 'string') return inner
  }
  return JSON.stringify(label)
}

/**
 * Assigns each span a color, reusing one color per label.
 *
 * Spans are walked in order. An explicit per-label override in `labelColors`
 * wins; otherwise the first span with a given label claims the next palette
 * color and every later span with the same label reuses it. Unlabeled spans
 * each take the next palette color without registering it for reuse. The
 * palette wraps modulo its length.
 *
 * @param spans - the spans to color
 * @param palette - the color palette (defaults to {@link DEFAULT_SPAN_PALETTE})
 * @param labelColors - optional per-label color overrides, keyed by label string
 * @returns a map from span id to CSS color
 *
 * @example
 * ```typescript
 * const colors = assignSpanColors([
 *   { id: 'a', segments: [], label: 'PER' },
 *   { id: 'b', segments: [], label: 'PER' },
 * ])
 * colors.get('a') === colors.get('b') // => true (same label, same color)
 * ```
 */
export function assignSpanColors(
  spans: TextSpan[],
  palette: readonly string[] = DEFAULT_SPAN_PALETTE,
  labelColors?: Record<string, string>,
): Map<string, string> {
  const colorMap = new Map<string, string>()
  const labelToColor = new Map<string, string>()
  let colorIndex = 0

  for (const span of spans) {
    const key = labelKey(span.label)

    if (key !== undefined && labelColors?.[key]) {
      colorMap.set(span.id, labelColors[key])
      continue
    }

    if (key !== undefined && labelToColor.has(key)) {
      colorMap.set(span.id, labelToColor.get(key) ?? FALLBACK_COLOR)
      continue
    }

    const color = palette[colorIndex % palette.length] ?? FALLBACK_COLOR
    colorMap.set(span.id, color)
    if (key !== undefined) labelToColor.set(key, color)
    colorIndex++
  }

  return colorMap
}

/**
 * Builds the CSS background for a token from the spans covering it.
 *
 * A token covered by one span gets that span's solid color. A token covered by
 * several spans gets a diagonal striped `linear-gradient`, one equal-width band
 * per span in coverage order, so every overlapping span remains visible. A token
 * covered by no span yields `transparent`.
 *
 * @param spanIds - the ids of the spans covering the token, in coverage order
 * @param colorMap - the span-to-color map from {@link assignSpanColors}
 * @returns a CSS color or `linear-gradient(...)` value
 *
 * @example
 * ```typescript
 * tokenBackground(['a'], colors) // => '#BBDEFB'
 * tokenBackground(['a', 'b'], colors) // => 'linear-gradient(135deg, #BBDEFB 0%, #BBDEFB 50%, #C8E6C9 50%, #C8E6C9 100%)'
 * ```
 */
export function tokenBackground(spanIds: string[], colorMap: Map<string, string>): string {
  if (spanIds.length === 0) return 'transparent'
  if (spanIds.length === 1) return colorMap.get(spanIds[0]) ?? FALLBACK_COLOR

  const colors = spanIds.map((id) => colorMap.get(id) ?? FALLBACK_COLOR)
  const stripeWidth = 100 / colors.length
  const stops = colors
    .map((color, i) => `${color} ${i * stripeWidth}%, ${color} ${(i + 1) * stripeWidth}%`)
    .join(', ')
  return `linear-gradient(135deg, ${stops})`
}
