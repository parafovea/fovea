/**
 * Shared helpers for the layers legacy bridge.
 *
 * The bridge modules reconstruct the legacy aggregate shapes from the unified
 * layers store (reading legacy rows through only when no layers rows exist yet)
 * and materialize legacy input into the layers store. These small coercions are
 * shared across all four bridges (world, ontology, claims, annotations).
 *
 * @module
 */

import { Prisma } from '@prisma/client'

/**
 * Coerces a value to a Prisma JSON input for an optional column, omitting the
 * field for null/undefined so the column stays NULL. Round-tripping through JSON
 * also strips undefined object properties so stored JSON compares equal on read.
 *
 * @param value - the value to coerce
 * @returns the JSON input, or undefined to leave the column untouched
 */
export function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/**
 * Coerces a value for a required JSON column, falling back to Prisma.JsonNull.
 *
 * @param value - the value to coerce
 * @returns the JSON input, or Prisma.JsonNull for null/undefined
 */
export function requiredJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return toJson(value) ?? Prisma.JsonNull
}

/**
 * Coerces a JSON column to an array of records, tolerating null/non-array.
 *
 * @param value - the JSON value to read
 * @returns the array of records, or an empty array
 */
export function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}
