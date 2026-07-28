/**
 * Oracle-parity assertion for the FOVEA<->layers lens rebuild.
 *
 * Each surface's new lens+adapter path is verified against the committed
 * hand-rolled forward mapper — the ORACLE — by projecting a corpus of FOVEA
 * view-models through both paths and asserting the two produce the same layers
 * rows. This module is the shared, database-free comparator that every surface's
 * parity test imports: {@link assertOracleParity} compares two arrays of layers
 * rows for equality up to object-key ordering and array ordering, so a row's
 * fields may be emitted in any order and the rows themselves in any order.
 *
 * The comparison is structural: two rows are equal when their canonical forms —
 * objects with keys sorted recursively — are deep-equal. Arrays keep their
 * element identity (a keyframe list is order-significant) but the top-level row
 * arrays are compared as multisets, since the oracle and the lens path may emit
 * an annotation's rows in a different order.
 *
 * @module
 */

/** A layers row: any JSON-shaped object the oracle or the lens path emits. */
export type LayersRow = Record<string, unknown>

/**
 * Rewrites a value into a canonical form whose serialization is independent of
 * object-key insertion order: every object's keys are sorted, recursively, while
 * arrays keep their order (element order within a row is significant). Scalars
 * pass through unchanged.
 *
 * @param value - the value to canonicalize
 * @returns the value with all nested object keys sorted
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => [key, canonicalize(val)] as const)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(entries)
  }
  return value
}

/** The canonical JSON string of a row, stable under key reordering. */
function canonicalKey(row: unknown): string {
  return JSON.stringify(canonicalize(row))
}

/**
 * Counts each canonical row so two row arrays compare as multisets: a row that
 * appears twice must appear twice on both sides.
 */
function multiset(rows: readonly LayersRow[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = canonicalKey(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/** The outcome of a parity comparison: the rows present on only one side. */
export interface ParityResult {
  /** True when the two row arrays are equal as multisets of canonical rows. */
  equal: boolean
  /** Canonical rows the oracle emitted that the lens path did not (with counts). */
  missingFromLens: string[]
  /** Canonical rows the lens path emitted that the oracle did not (with counts). */
  extraFromLens: string[]
}

/**
 * Compares the oracle's rows against the lens path's rows as multisets of
 * canonical (key-sorted) rows, returning the difference either way. Pure: it
 * reads no database and mutates nothing.
 *
 * @param oracleRows - the rows the committed hand-rolled mapper produced
 * @param lensRows - the rows the new lens+adapter path produced
 * @returns whether the two are equal and, if not, the one-sided rows
 */
export function diffOracleParity(
  oracleRows: readonly LayersRow[],
  lensRows: readonly LayersRow[],
): ParityResult {
  const oracle = multiset(oracleRows)
  const lens = multiset(lensRows)

  const missingFromLens: string[] = []
  for (const [key, count] of oracle) {
    const have = lens.get(key) ?? 0
    if (have < count) missingFromLens.push(`${key} (oracle ${count}, lens ${have})`)
  }

  const extraFromLens: string[] = []
  for (const [key, count] of lens) {
    const have = oracle.get(key) ?? 0
    if (have < count) extraFromLens.push(`${key} (lens ${count}, oracle ${have})`)
  }

  return {
    equal: missingFromLens.length === 0 && extraFromLens.length === 0,
    missingFromLens,
    extraFromLens,
  }
}

/**
 * Asserts the lens path reproduces the oracle's rows exactly, throwing an Error
 * whose message names the diverging rows when they differ. Sibling surfaces call
 * this in their parity tests after building both row arrays over a shared corpus.
 *
 * @param oracleRows - the rows the committed hand-rolled mapper produced
 * @param lensRows - the rows the new lens+adapter path produced
 * @throws when the two row arrays differ as multisets of canonical rows
 */
export function assertOracleParity(
  oracleRows: readonly LayersRow[],
  lensRows: readonly LayersRow[],
): void {
  const result = diffOracleParity(oracleRows, lensRows)
  if (result.equal) return

  const lines: string[] = ['Oracle parity failed.']
  if (result.missingFromLens.length > 0) {
    lines.push('Rows the oracle emitted but the lens path did not:')
    for (const row of result.missingFromLens) lines.push(`  - ${row}`)
  }
  if (result.extraFromLens.length > 0) {
    lines.push('Rows the lens path emitted but the oracle did not:')
    for (const row of result.extraFromLens) lines.push(`  + ${row}`)
  }
  throw new Error(lines.join('\n'))
}

/**
 * Asserts the lens-path reconstruction reproduces the oracle's reconstructed
 * FOVEA view-model exactly, throwing an Error whose message names the divergence
 * when the two differ. Where {@link assertOracleParity} compares the forward rows,
 * this compares one backward view-model — the reconstructed annotation — up to
 * object-key ordering (arrays, such as a keyframe or box sequence, stay
 * order-significant). Surfaces call this after reconstructing the same stored rows
 * through both the oracle backward mapper and the backward lens.
 *
 * @param oracleViewModel - the view-model the committed backward mapper produced
 * @param lensViewModel - the view-model the backward lens path produced
 * @throws when the two view-models differ as canonical (key-sorted) values
 */
export function assertBackwardParity(oracleViewModel: unknown, lensViewModel: unknown): void {
  const oracle = canonicalKey(oracleViewModel)
  const lens = canonicalKey(lensViewModel)
  if (oracle === lens) return
  throw new Error(
    ['Backward parity failed.', `  oracle: ${oracle}`, `  lens:   ${lens}`].join('\n'),
  )
}
