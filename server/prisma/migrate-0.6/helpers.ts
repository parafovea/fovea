/**
 * Shared helpers for the layers backfill: JSON coercion for Prisma columns,
 * scale conversions re-exported from the conversion service, and the legacy
 * JSON-column shapes the source modules read.
 *
 * @module
 */

import { Prisma } from '@prisma/client'

/**
 * Coerces a typed value to `Prisma.InputJsonValue` for an optional JSON column.
 * Prisma JSON columns accept any serializable value at runtime; this bridges the
 * TypeScript gap without an unsafe cast and normalizes `undefined`/`null` to
 * "leave the column NULL". Round-tripping through `JSON.stringify` also strips
 * `undefined` object properties so stored JSON compares equal to itself on read.
 *
 * @param value - the value to store, or undefined/null to store NULL
 * @returns the JSON input value, or undefined to omit the field
 */
export function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/**
 * Coerces a value for a required (non-null) JSON column, falling back to
 * `Prisma.JsonNull` so the write always supplies a value.
 *
 * @param value - the value to store
 * @returns the JSON input value, or `Prisma.JsonNull` when absent
 */
export function requiredJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return toJson(value) ?? Prisma.JsonNull
}

/** A per-source tally the runner aggregates and prints. */
export interface StepStats {
  created: number
  updated: number
}

/** Adds one tally into another in place. */
export function addStats(into: StepStats, add: StepStats): void {
  into.created += add.created
  into.updated += add.updated
}

// --- Legacy JSON-column shapes -------------------------------------------
// Slim structural types for the JSON the source modules read. They intentionally
// capture only the fields the backfill consumes; unknown extras pass through.

/** One inline rich-text/reference segment (legacy GlossItem). */
export interface LegacyGlossItem {
  type: string
  content: string
  refType?: string
  refPersonaId?: string | null
  refClaimId?: string
}

/**
 * Flattens a legacy gloss (rich-text/reference segments) to plain text by
 * concatenating each segment's content. Returns null for an empty/absent gloss.
 *
 * @param gloss - the gloss segments
 * @returns the concatenated text, or null when empty
 */
export function glossToText(gloss: LegacyGlossItem[] | undefined): string | null {
  if (!gloss || gloss.length === 0) return null
  const text = gloss.map((item) => item.content).join('')
  return text.length > 0 ? text : null
}

/** An ontology type as stored in Ontology.entityTypes/eventTypes/roleTypes/relationTypes. */
export interface LegacyOntologyType {
  id: string
  name: string
  gloss?: LegacyGlossItem[]
  wikidataId?: string
  wikidataUrl?: string
}

/** A world object as stored in WorldState.entities/events/times. */
export interface LegacyWorldObject {
  id: string
  name?: string
  description?: LegacyGlossItem[]
  wikidataId?: string
  typeAssignments?: Array<{ personaId: string; entityTypeId: string; confidence?: number }>
  metadata?: Record<string, unknown>
}

/** A relation instance as stored in WorldState.relations. */
export interface LegacyWorldRelation {
  id: string
  relationTypeId: string
  sourceType: string
  sourceId: string
  targetType: string
  targetId: string
  metadata?: Record<string, unknown>
}

/** One ASR segment inside VideoSummary.transcriptJson.segments. */
export interface LegacyTranscriptSegment {
  start: number
  end: number
  text: string
  speaker?: string
  confidence?: number
  sentiment?: string
}

/** The structured transcript stored in VideoSummary.transcriptJson. */
export interface LegacyTranscript {
  segments: LegacyTranscriptSegment[]
  speakers?: string[]
  language?: string
}

/** One (possibly discontiguous) text span stored in Claim.textSpans. */
export interface LegacyTextSpan {
  sentenceIndex?: number
  charStart: number
  charEnd: number
}

/** One token in a Tokenization.tokens JSON array (layers Token shape). */
export interface BackfillToken {
  tokenIndex: number
  text: string
  textSpan: { byteStart: number; byteEnd: number; charStart: number; charEnd: number }
  temporalSpan?: { start: number; ending: number }
}

/**
 * Splits text into whitespace-delimited tokens, computing exact UTF-8 byte and
 * character offsets for each. Runs of whitespace are skipped; the returned
 * offsets index into the original string so a consumer can reconstruct spans.
 *
 * @param text - the source text
 * @returns the ordered tokens with their byte/char spans
 */
export function whitespaceTokens(text: string): BackfillToken[] {
  const tokens: BackfillToken[] = []
  const matcher = /\S+/g
  let match: RegExpExecArray | null
  let tokenIndex = 0
  while ((match = matcher.exec(text)) !== null) {
    const charStart = match.index
    const charEnd = charStart + match[0].length
    const byteStart = Buffer.byteLength(text.slice(0, charStart), 'utf8')
    const byteEnd = byteStart + Buffer.byteLength(match[0], 'utf8')
    tokens.push({
      tokenIndex,
      text: match[0],
      textSpan: { byteStart, byteEnd, charStart, charEnd },
    })
    tokenIndex += 1
  }
  return tokens
}
