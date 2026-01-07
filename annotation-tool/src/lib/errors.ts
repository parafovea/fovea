/**
 * Frontend error system mirroring the server pattern.
 * Provides typed errors for consistent error handling across the app.
 *
 * Based on the server's error hierarchy in server/src/lib/errors.ts,
 * this module provides a consistent way to handle errors in the frontend.
 */

/**
 * Base error class for all frontend application errors.
 * Extends the native Error class with an error code and optional details.
 */
export class AppError extends Error {
  /**
   * Creates an application error.
   *
   * @param code - Machine-readable error code (e.g., 'DUPLICATE_IMPORT')
   * @param message - Human-readable error message
   * @param details - Optional additional error context
   */
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

/**
 * Error thrown when attempting to import a duplicate Wikidata item.
 * Use when a user tries to import a Wikidata entity that already exists
 * in the current persona's ontology or the world state.
 *
 * @example
 * ```typescript
 * throw new DuplicateImportError('Q319224', 'cargo', 'entity-type')
 * // Error: A entity type with Wikidata ID "Q319224" already exists: "cargo"
 * ```
 */
export class DuplicateImportError extends AppError {
  constructor(
    public readonly wikidataId: string,
    public readonly existingItemName: string,
    public readonly itemType: string
  ) {
    const typeLabel = itemType.replace('-', ' ')
    super(
      'DUPLICATE_IMPORT',
      `A ${typeLabel} with Wikidata ID "${wikidataId}" already exists: "${existingItemName}"`,
      { wikidataId, existingItemName, itemType }
    )
  }
}
