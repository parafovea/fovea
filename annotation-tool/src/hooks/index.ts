/**
 * Centralized hook exports for the annotation tool.
 * Import hooks from this module for convenience, or from specific
 * domain modules for tree-shaking optimization.
 *
 * @module hooks
 *
 * @example
 * ```typescript
 * // Import from root (convenient)
 * import { useAuth, usePreferences, useCommands } from '@hooks'
 *
 * // Import from specific domain (tree-shakeable)
 * import { useAuth } from '@hooks/auth'
 * import { usePreferences } from '@hooks/preferences'
 * ```
 */

// Authentication
export * from './auth'

// Annotation workflows
export * from './annotation'

// Command system
export * from './commands'

// Application configuration
export * from './config'

// Data persistence
export * from './data'

// User preferences
export * from './preferences'

// Wikidata integration
export * from './wikidata'
