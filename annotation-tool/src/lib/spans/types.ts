/**
 * View-model types for the token span-annotation UI.
 *
 * These are the local, React-agnostic shapes the span library operates on. They
 * are deliberately decoupled from the wire `@fovea/layers-schema` records: the
 * adapters in `adapters.ts` translate between this view-model and the layers
 * `Annotation` / `TokenRefSequence` records at the edges. A span's token set is
 * carried as one `SpanSegment` per tokenized element, each holding an arbitrary
 * (possibly non-contiguous) set of token indexes.
 *
 * @module
 */

/**
 * A single token in a tokenized element, with its character extent into the
 * source text and whether a space follows it in reading order.
 */
export interface SpanToken {
  /** 0-based index of the token within its element. */
  index: number
  /** The surface form of the token. */
  text: string
  /** Inclusive start character offset into the source text. */
  start: number
  /** Exclusive end character offset into the source text. */
  end: number
  /** Whether whitespace follows this token in reading order. */
  whitespaceAfter: boolean
}

/**
 * A named block of tokenized text (for example a metadata field or a transcript
 * segment). Elements are the unit a selection and a span segment are scoped to.
 */
export interface TokenizedElement {
  /** Stable identifier for the element (used to key tokens and spans). */
  name: string
  /** The ordered tokens of the element. */
  tokens: SpanToken[]
}

/**
 * The portion of a span that falls in one element: an arbitrary, possibly
 * non-contiguous set of token indexes within that element.
 */
export interface SpanSegment {
  /** The element these indexes belong to. */
  elementName: string
  /** 0-based token indexes, arbitrary and possibly non-contiguous. */
  tokenIndexes: number[]
}

/**
 * A labeled span over one or more elements. The union of all segments' indexes
 * is the span's token set; discontiguity (gaps within a segment or coverage
 * across multiple elements) is expected and preserved.
 */
export interface TextSpan {
  /** Stable identifier for the span. */
  id: string
  /** One segment per element the span touches. */
  segments: SpanSegment[]
  /** Optional head/anchor token index within the span. */
  headIndex?: number
  /** Optional label; opaque to the geometry and mapping helpers. */
  label?: unknown
  /** Optional span-type slug (entity, event, etc.). */
  spanType?: string
}

/**
 * A labeled edge between two spans.
 */
export interface SpanRelation {
  /** Stable identifier for the relation. */
  id: string
  /** Id of the source span. */
  sourceSpanId: string
  /** Id of the target span. */
  targetSpanId: string
  /** Optional relation-type identifier. */
  relationTypeId?: string
  /** Whether the relation is directed (source to target) or symmetric. */
  directed: boolean
}

/**
 * A single token pick in a flat selection: an element plus a token index.
 */
export interface TokenSelection {
  /** The element the picked token belongs to. */
  elementName: string
  /** 0-based token index within the element. */
  tokenIndex: number
}

/**
 * An axis-aligned rectangle. Mirrors the fields of a DOM `DOMRect` that the
 * geometry helpers read; `left`/`top`/`right`/`bottom` are derived from these.
 */
export interface Rect {
  /** Left edge (x of the top-left corner). */
  x: number
  /** Top edge (y of the top-left corner). */
  y: number
  /** Width in pixels. */
  width: number
  /** Height in pixels. */
  height: number
}

/**
 * A lookup from a `"element:index"` key to that token's measured rectangle.
 * Produced by the renderer from each token element's bounding box.
 */
export type TokenRectMap = Map<string, Rect>

/**
 * The rounded-chunk position class of a token within one span, describing which
 * side neighbors the same span covers so a discontiguous span renders as
 * separate rounded chunks.
 */
export type SpanTokenClass = 'span-first' | 'span-middle' | 'span-last' | 'span-single'
