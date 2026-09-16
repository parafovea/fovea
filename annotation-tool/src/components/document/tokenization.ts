/**
 * Adapters from the layers wire projections to the span view-model.
 *
 * The server returns tokenizations, annotations, and relations as flattened
 * JSON rows; the span library operates on `TokenizedElement`, `TextSpan`, and
 * `SpanRelation`. These functions translate one layer's rows into those
 * view-model shapes, using the tokenization's UUID as the element name so a
 * span's segment scopes to the token stream it annotates.
 *
 * @module
 */

import type { LayersAnnotationRow, TextAnnotationRelationRow } from '@store/queries'
import {
  fromAnnotation,
  type SpanLabelDetail,
  type SpanRelation,
  type SpanToken,
  type TextSpan,
  type TokenizedElement,
} from '@/lib/spans'

/** One token in a wire tokenization row (a layers `Token` projection). */
interface WireToken {
  tokenIndex: number
  text?: string
  textSpan?: {
    charStart?: number
    charEnd?: number
    byteStart?: number
    byteEnd?: number
  }
}

/** A wire tokenization row as returned inside an expression's `tokenizations`. */
export interface WireTokenization {
  id: string
  kind?: string
  isCanonical?: boolean
  tokens: WireToken[]
}

/**
 * Reads an unknown wire tokenization value into a typed {@link WireTokenization}.
 *
 * Returns `null` when the value lacks an `id` or a `tokens` array, so callers
 * can skip malformed rows rather than throw.
 *
 * @param value - the untyped tokenization projection
 * @returns the typed tokenization, or `null` when the shape is unusable
 */
export function asWireTokenization(value: unknown): WireTokenization | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !Array.isArray(row.tokens)) return null
  return row as unknown as WireTokenization
}

/**
 * Picks a document's primary tokenization from an expression's tokenizations.
 *
 * Prefers a canonical whitespace tokenization; otherwise takes the first usable
 * row. Returns `null` when none parse.
 *
 * @param tokenizations - the expression's untyped tokenization projections
 * @returns the chosen tokenization, or `null`
 */
export function pickPrimaryTokenization(tokenizations: unknown[]): WireTokenization | null {
  const parsed = tokenizations.map(asWireTokenization).filter((t): t is WireTokenization => t !== null)
  if (parsed.length === 0) return null
  const canonical = parsed.find((t) => t.isCanonical) ?? parsed.find((t) => t.kind === 'whitespace')
  return canonical ?? parsed[0]
}

/**
 * Converts a wire tokenization into a {@link TokenizedElement} view-model.
 *
 * Tokens are sorted by index and given character extents from their
 * `textSpan` (falling back to running offsets when absent). `whitespaceAfter`
 * is set when the next token starts past this token's end. The element is named
 * by the tokenization's UUID so spans over it share that element name.
 *
 * @param tokenization - the typed wire tokenization
 * @param text - the expression text, used to fill missing token surface forms
 * @returns the tokenized element
 */
export function toTokenizedElement(
  tokenization: WireTokenization,
  text?: string | null,
): TokenizedElement {
  const sorted = [...tokenization.tokens].sort((a, b) => a.tokenIndex - b.tokenIndex)

  const tokens: SpanToken[] = sorted.map((token, i) => {
    const start = token.textSpan?.charStart ?? 0
    const surface = token.text ?? (text ? text.slice(start, token.textSpan?.charEnd ?? start) : '')
    const end = token.textSpan?.charEnd ?? start + surface.length
    const next = sorted[i + 1]
    const nextStart = next?.textSpan?.charStart
    const whitespaceAfter = nextStart !== undefined ? nextStart > end : i < sorted.length - 1
    return { index: token.tokenIndex, text: surface, start, end, whitespaceAfter }
  })

  return { name: tokenization.id, tokens }
}

/**
 * The set of ontology types keyed by ref id, used to resolve span labels.
 */
export interface SpanLabelResolvers {
  /** Resolves an ontology type ref id to a display name. */
  typeName?: (ontologyTypeRefId: string) => string | undefined
  /** Resolves a world graph-node id to a display name. */
  objectName?: (denotesNodeId: string) => string | undefined
}

/**
 * Builds a display label and kind for one annotation row.
 *
 * Prefers the row's explicit `label`; otherwise resolves an ontology type or a
 * world object by ref, falling back to a shortened id. The kind is `'object'`
 * when the row denotes a world node, else `'type'`.
 */
function spanLabelFor(
  row: LayersAnnotationRow,
  resolvers: SpanLabelResolvers,
): { label: string; kind: 'type' | 'object' } {
  if (row.denotesNodeId) {
    const name = resolvers.objectName?.(row.denotesNodeId)
    return { label: row.label ?? name ?? row.denotesNodeId.slice(0, 8), kind: 'object' }
  }
  if (row.ontologyTypeRefId) {
    const name = resolvers.typeName?.(row.ontologyTypeRefId)
    return { label: row.label ?? name ?? row.ontologyTypeRefId.slice(0, 8), kind: 'type' }
  }
  // An unlabeled span carries no type or object ref and no text label; leave the
  // label empty so the UI can show its covered text and an "unlabeled" hint
  // rather than a meaningless id fragment.
  return { label: row.label ?? '', kind: 'type' }
}

/**
 * Converts a layer's annotation rows into view-model spans.
 *
 * Each row's `anchor.tokenRefSequence` becomes one segment scoped to
 * `tokenizationId`; the row's resolved label and kind ride along on the span
 * for coloring and display. Rows without a token-ref anchor still produce a
 * span with an empty segment (so they can be listed and deleted).
 *
 * @param rows - the layer's annotation rows
 * @param tokenizationId - the tokenization UUID used as the segment element name
 * @param resolvers - optional label resolvers for typed and world-object spans
 * @returns one span per row
 */
export function rowsToSpans(
  rows: LayersAnnotationRow[],
  tokenizationId: string,
  resolvers: SpanLabelResolvers = {},
): TextSpan[] {
  return rows.map((row) => {
    const base = fromAnnotation(
      {
        uuid: { value: row.id },
        anchor: row.anchor ?? undefined,
        label: row.label ?? undefined,
      },
      tokenizationId,
    )
    const { label, kind } = spanLabelFor(row, resolvers)
    const span: TextSpan = { ...base, label, spanType: kind }
    return span
  })
}

/** A span layer's annotation rows tagged with the layer's persona scope. */
export interface TaggedSpanLayer {
  /** The layer's persona id, or `null` for a persona-free (object) layer. */
  personaId: string | null
  /** The layer's annotation rows. */
  rows: LayersAnnotationRow[]
}

/** Keys an annotation by its anchor token range, so co-located rows collapse. */
function anchorKey(row: LayersAnnotationRow): string {
  const indexes = row.anchor?.tokenRefSequence?.tokenIndexes
  if (!Array.isArray(indexes) || indexes.length === 0) return `id:${row.id}`
  return [...indexes].sort((a, b) => a - b).join(',')
}

/** Resolves one annotation row to a span label detail, or `null` if unlabeled. */
function labelDetailFor(
  row: LayersAnnotationRow,
  layerPersonaId: string | null,
  resolvers: SpanLabelResolvers,
): SpanLabelDetail | null {
  if (row.denotesNodeId) {
    return {
      annotationId: row.id,
      kind: 'object',
      refId: row.denotesNodeId,
      name: resolvers.objectName?.(row.denotesNodeId) ?? row.label ?? row.denotesNodeId.slice(0, 8),
      personaId: null,
    }
  }
  if (row.ontologyTypeRefId) {
    return {
      annotationId: row.id,
      kind: 'type',
      refId: row.ontologyTypeRefId,
      name:
        resolvers.typeName?.(row.ontologyTypeRefId) ?? row.label ?? row.ontologyTypeRefId.slice(0, 8),
      personaId: layerPersonaId,
    }
  }
  return null
}

/**
 * Aggregates annotation rows from several span layers into grouped spans.
 *
 * Rows sharing a token range collapse to one {@link TextSpan}: its `labels`
 * carries every denotation on that range — ontology types (each tagged with its
 * persona) and any world object — while a persona-free base row supplies the
 * span's identity when present. Objects sort ahead of types so the primary label
 * favors a concrete world entity. A range with no denotation yields an unlabeled
 * span so the user can still see and label it.
 *
 * @param layers - the span layers to merge, each tagged with its persona scope
 * @param tokenizationId - the tokenization UUID used as the segment element name
 * @param resolvers - optional label resolvers for typed and world-object spans
 * @returns one span per distinct token range, ordered by first appearance
 */
export function rowsToSpanGroups(
  layers: TaggedSpanLayer[],
  tokenizationId: string,
  resolvers: SpanLabelResolvers = {},
): TextSpan[] {
  const groups = new Map<string, { rows: Array<{ row: LayersAnnotationRow; personaId: string | null }> }>()
  for (const { personaId, rows } of layers) {
    for (const row of rows) {
      const key = anchorKey(row)
      let group = groups.get(key)
      if (!group) {
        group = { rows: [] }
        groups.set(key, group)
      }
      group.rows.push({ row, personaId })
    }
  }

  const spans: TextSpan[] = []
  for (const group of groups.values()) {
    // The representative fixes the span's stable id and segments: prefer a
    // persona-free base row (created on token release, no denotation), else the
    // lexicographically smallest id so the choice does not shift between renders.
    const base =
      group.rows.find(({ row }) => !row.denotesNodeId && !row.ontologyTypeRefId) ??
      [...group.rows].sort((a, b) => (a.row.id < b.row.id ? -1 : 1))[0]
    const segmentSpan = fromAnnotation(
      { uuid: { value: base.row.id }, anchor: base.row.anchor ?? undefined },
      tokenizationId,
    )
    const labels = group.rows
      .map(({ row, personaId }) => labelDetailFor(row, personaId, resolvers))
      .filter((detail): detail is SpanLabelDetail => detail !== null)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'object' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    const primary = labels[0]
    spans.push({
      ...segmentSpan,
      label: primary?.name ?? '',
      spanType: primary?.kind,
      labels,
    })
  }
  return spans
}

/** Reads a relation-type ref id out of a wire relation's `relationTypeRef`. */
function relationTypeRefId(ref: unknown): string | undefined {
  if (!ref || typeof ref !== 'object') return undefined
  const value = ref as Record<string, unknown>
  if (typeof value.id === 'string') return value.id
  if (typeof value.value === 'string') return value.value
  return undefined
}

/**
 * Converts a layer's relation rows into view-model relations.
 *
 * Directedness is a property of the relation TYPE: a symmetric ontology relation
 * type is undirected, so its edges render without an arrowhead. This derives each
 * edge's `directed` flag from `symmetricByTypeId`, keyed by the relation-type ref
 * id: an edge is undirected when its type is symmetric, and directed when the
 * type is asymmetric or cannot be resolved (the safe default). The relation-type
 * ref id (when present) also rides along for label resolution.
 *
 * @param rows - the layer's relation rows
 * @param symmetricByTypeId - relation-type id to whether that type is symmetric;
 *   an unresolved id yields a directed edge
 * @returns one {@link SpanRelation} per row
 */
export function rowsToRelations(
  rows: TextAnnotationRelationRow[],
  symmetricByTypeId?: Map<string, boolean>,
): SpanRelation[] {
  return rows.map((row) => {
    const relationTypeId = relationTypeRefId(row.relationTypeRef)
    const symmetric =
      relationTypeId !== undefined ? symmetricByTypeId?.get(relationTypeId) === true : false
    return {
      id: row.id,
      sourceSpanId: row.sourceAnnotationId,
      targetSpanId: row.targetAnnotationId,
      relationTypeId,
      directed: !symmetric,
    }
  })
}
