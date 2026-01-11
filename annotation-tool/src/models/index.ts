/**
 * @module models
 * @description Central export point for all type definitions.
 * Import types from this module for convenience, or import directly
 * from domain-specific files for smaller bundle sizes.
 *
 * @example
 * ```typescript
 * // Import all types
 * import { User, Persona, Annotation, Entity } from '@models';
 *
 * // Or import from specific domains
 * import { User, Persona } from '@models/user';
 * import { Annotation } from '@models/annotation';
 * ```
 */

// User and persona types
export * from './user'

// Gloss and constraint types
export * from './gloss'

// Ontology type definitions
export * from './ontology'

// Bounding box and interpolation types
export * from './bounding-box'

// Temporal types (time, intervals, recurrence)
export * from './temporal'

// World model types (entities, events, locations, collections)
export * from './world'

// Annotation types
export * from './annotation'

// Video and summary types
export * from './video'

// Tracking types
export * from './tracking'

// Export/import types
export * from './export-import'

// Claim types
export * from './claims'
