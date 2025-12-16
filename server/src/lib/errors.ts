/**
 * Centralized error handling for the Fastify backend.
 *
 * This module provides a type-safe error hierarchy for consistent error handling
 * across all routes. All errors extend the base AppError class and map to
 * appropriate HTTP status codes.
 *
 * @example
 * ```typescript
 * // In a route handler:
 * const video = await prisma.video.findUnique({ where: { id } })
 * if (!video) {
 *   throw new NotFoundError('Video', id)
 * }
 * ```
 */

import { Type, Static } from '@sinclair/typebox'

/**
 * Standard error response schema for OpenAPI documentation.
 * All error responses follow this format for consistency.
 *
 * Based on industry standards:
 * - RFC 7807 (Problem Details for HTTP APIs)
 * - Google API Design Guide
 * - OpenAPI best practices
 */
export const ErrorResponseSchema = Type.Object({
  error: Type.String({ description: 'Machine-readable error code' }),
  message: Type.String({ description: 'Human-readable error message' }),
  details: Type.Optional(Type.Unknown({ description: 'Additional error context' }))
})

export type ErrorResponse = Static<typeof ErrorResponseSchema>

/**
 * Base error class for all application errors.
 * Extends the native Error class with HTTP status code and error code.
 */
export class AppError extends Error {
  /**
   * Creates an application error.
   *
   * @param statusCode - HTTP status code (e.g., 404, 400, 500)
   * @param code - Machine-readable error code (e.g., 'NOT_FOUND', 'VALIDATION_ERROR')
   * @param message - Human-readable error message
   * @param details - Optional additional error context
   */
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }

  /**
   * Serializes the error to a JSON-safe format for HTTP responses.
   * Does not include stack traces to prevent information leakage.
   */
  toJSON(): { error: string; message: string; details?: unknown } {
    const json: { error: string; message: string; details?: unknown } = {
      error: this.code,
      message: this.message
    }
    if (this.details !== undefined) {
      json.details = this.details
    }
    return json
  }
}

/**
 * 404 Not Found error.
 * Use when a requested resource does not exist.
 *
 * @example
 * ```typescript
 * throw new NotFoundError('Video', videoId)
 * // Returns: 404 { error: 'NOT_FOUND', message: 'Video abc123 not found' }
 * ```
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'NOT_FOUND', `${resource} ${id} not found`)
  }
}

/**
 * 400 Bad Request - Validation Error.
 * Use when request data fails validation.
 *
 * @example
 * ```typescript
 * throw new ValidationError('Invalid email format', { field: 'email' })
 * // Returns: 400 { error: 'VALIDATION_ERROR', message: 'Invalid email format', details: { field: 'email' } }
 * ```
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details)
  }
}

/**
 * 401 Unauthorized error.
 * Use when authentication is required but missing or invalid.
 *
 * @example
 * ```typescript
 * throw new UnauthorizedError('Invalid credentials')
 * // Returns: 401 { error: 'UNAUTHORIZED', message: 'Invalid credentials' }
 * ```
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message)
  }
}

/**
 * 403 Forbidden error.
 * Use when user is authenticated but lacks permission.
 *
 * @example
 * ```typescript
 * throw new ForbiddenError('Admin access required')
 * // Returns: 403 { error: 'FORBIDDEN', message: 'Admin access required' }
 * ```
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(403, 'FORBIDDEN', message)
  }
}

/**
 * 409 Conflict error.
 * Use when a request conflicts with current state (e.g., duplicate resource).
 *
 * @example
 * ```typescript
 * throw new ConflictError('Username already exists')
 * // Returns: 409 { error: 'CONFLICT', message: 'Username already exists' }
 * ```
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, 'CONFLICT', message, details)
  }
}

/**
 * 500 Internal Server Error.
 * Use when an unexpected error occurs during processing.
 *
 * @example
 * ```typescript
 * throw new InternalError('Failed to process video', { cause: error })
 * // Returns: 500 { error: 'INTERNAL_ERROR', message: 'Failed to process video' }
 * ```
 */
export class InternalError extends AppError {
  constructor(message: string = 'An unexpected error occurred', details?: unknown) {
    super(500, 'INTERNAL_ERROR', message, details)
  }
}
