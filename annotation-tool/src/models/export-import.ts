import type { Persona } from './user'
import type { Annotation } from './annotation'
import type { VideoMetadata, VideoSummary } from './video'
import type { Entity, Event, EntityCollection, EventCollection } from './world'
import type { Time, TimeCollection } from './temporal'
import type { EntityType, RoleType, EventType, RelationType, OntologyRelation } from './ontology'

/**
 * @interface PersonaOntology
 * @description A persona's complete ontology including types and relations.
 * Each persona has their own ontology defining their type system.
 */
export interface PersonaOntology {
  /** Unique identifier for this ontology */
  id: string
  /** ID of the persona who owns this ontology */
  personaId: string
  /** Entity types defined by this persona */
  entities: EntityType[]
  /** Role types defined by this persona */
  roles: RoleType[]
  /** Event types defined by this persona */
  events: EventType[]
  /** Relation types defined by this persona */
  relationTypes: RelationType[]
  /** Relation instances between types */
  relations: OntologyRelation[]
  /** ISO 8601 timestamp of creation */
  createdAt: string
  /** ISO 8601 timestamp of last update */
  updatedAt: string
}

/**
 * @interface WorldStateData
 * @description Complete state of the shared world model.
 * Contains all entities, events, times, collections, and relations.
 */
export interface WorldStateData {
  /** All entities in the world */
  entities: Entity[]
  /** All events in the world */
  events: Event[]
  /** All time objects in the world */
  times: Time[]
  /** All entity collections */
  entityCollections: EntityCollection[]
  /** All event collections */
  eventCollections: EventCollection[]
  /** All time collections */
  timeCollections: TimeCollection[]
  /** All relations between world objects */
  relations: OntologyRelation[]
}

/**
 * @interface Ontology
 * @description Top-level ontology container with all personas and world state.
 * This is the root data structure for export/import operations.
 */
export interface Ontology {
  /** Unique identifier for this ontology */
  id: string
  /** Schema version for compatibility checking */
  version: string
  /** All personas in this ontology */
  personas: Persona[]
  /** Each persona's individual ontology */
  personaOntologies: PersonaOntology[]
  /** Shared world state (optional) */
  world?: WorldStateData
  /** ISO 8601 timestamp of creation */
  createdAt: string
  /** ISO 8601 timestamp of last update */
  updatedAt: string
  /** Human-readable description of this ontology */
  description?: string
}

/**
 * @interface ImportRequest
 * @description Request to import types between personas.
 * Allows copying ontology elements from one persona to another.
 */
export interface ImportRequest {
  /** ID of the source persona */
  fromPersonaId: string
  /** ID of the target persona */
  toPersonaId: string
  /** Entity type IDs to import */
  entityIds?: string[]
  /** Role type IDs to import */
  roleIds?: string[]
  /** Event type IDs to import */
  eventIds?: string[]
  /** Relation type IDs to import */
  relationTypeIds?: string[]
  /** Whether to include relation instances */
  includeRelations?: boolean
}

/**
 * @interface ExportOptions
 * @description Options for exporting annotation data.
 * Controls what data is included in the export.
 */
export interface ExportOptions {
  /** Whether to include interpolated frames (vs. keyframes only) */
  includeInterpolated?: boolean
  /** Filter by specific persona IDs */
  personaIds?: string[]
  /** Filter by specific video IDs */
  videoIds?: string[]
  /** Filter by annotation type */
  annotationTypes?: ('type' | 'object')[]
}

/**
 * @interface ExportStats
 * @description Statistics about an export operation.
 * Contains counts for all data types that will be exported.
 */
export interface ExportStats {
  // Personas & Ontologies
  /** Number of personas */
  personaCount: number
  /** Number of ontologies */
  ontologyCount: number
  /** Total entity types across all ontologies */
  entityTypeCount: number
  /** Total event types across all ontologies */
  eventTypeCount: number
  /** Total role types across all ontologies */
  roleTypeCount: number
  /** Total relation types across all ontologies */
  relationTypeCount: number

  // World State
  /** Number of entities in world state */
  entityCount: number
  /** Number of events in world state */
  eventCount: number
  /** Number of times in world state */
  timeCount: number
  /** Number of entity collections */
  entityCollectionCount: number
  /** Number of event collections */
  eventCollectionCount: number
  /** Number of time collections */
  timeCollectionCount: number
  /** Number of world state relations */
  worldRelationCount: number

  // Summaries & Claims
  /** Number of video summaries */
  summaryCount: number
  /** Number of claims */
  claimCount: number
  /** Number of claim relations */
  claimRelationCount: number

  // Annotations
  /** Number of annotations exported */
  annotationCount: number
  /** Number of bounding box sequences exported */
  sequenceCount: number
  /** Total number of keyframes exported */
  keyframeCount: number
  /** Total number of interpolated frames exported */
  interpolatedFrameCount: number

  // Total
  /** Total estimated size in bytes */
  totalSize: number
  /** Total size formatted as MB */
  totalSizeMB: string
  /** Optional warning message */
  warning?: string
}

/**
 * @interface ImportOptions
 * @description Configuration for importing annotations from JSON Lines files.
 * Controls conflict resolution, scope, validation, and transaction handling.
 *
 * @remarks
 * Import operations can be complex when the imported data conflicts with
 * existing data. This interface provides fine-grained control over how
 * conflicts are resolved for different types of entities.
 */
export interface ImportOptions {
  /**
   * How to handle conflicts during import.
   */
  conflictResolution: {
    /** How to handle duplicate personas */
    personas: 'skip' | 'replace' | 'merge' | 'rename'
    /** How to handle duplicate world objects */
    worldObjects: 'skip' | 'replace' | 'merge-assignments'
    /** How to handle missing dependencies (referenced objects that don't exist) */
    missingDependencies: 'skip-item' | 'create-placeholder' | 'fail-import'
    /** How to handle duplicate IDs */
    duplicateIds: 'preserve-id' | 'regenerate-id'
    /** Sequence-specific conflict resolution */
    sequences: {
      /** How to handle duplicate sequence IDs */
      duplicateSequenceIds: 'skip' | 'replace' | 'merge-keyframes' | 'create-new'
      /** How to handle overlapping frame ranges */
      overlappingFrameRanges: 'split-ranges' | 'extend-range' | 'replace-overlap' | 'fail-import'
      /** How to handle interpolation type conflicts */
      interpolationConflicts: 'use-imported' | 'use-existing' | 'fail-import'
    }
  }
  /**
   * What data to include in the import.
   */
  scope: {
    /** Whether to import persona definitions */
    includePersonas: boolean
    /** Whether to import world state */
    includeWorldState: boolean
    /** Whether to import annotations */
    includeAnnotations: boolean
    /** Limit to specific persona IDs */
    specificPersonaIds?: string[]
    /** Limit to specific object types */
    specificObjectTypes?: ('entity' | 'event' | 'time' | 'collection')[]
  }
  /**
   * Validation settings for imported data.
   */
  validation: {
    /** Enable strict validation (fail on any issue) */
    strictMode: boolean
    /** Validate all ID references exist */
    validateReferences: boolean
    /** Validate bounding box sequence integrity */
    validateSequenceIntegrity: boolean
    /** Validate interpolation type values */
    validateInterpolationTypes: boolean
    /** Validate bounding box coordinates are within bounds */
    validateBoundingBoxRanges: boolean
    /** Recompute interpolated frames after import */
    recomputeInterpolation: boolean
  }
  /**
   * Transaction settings for the import.
   */
  transaction: {
    /** Whether to roll back on any error (atomic import) */
    atomic: boolean
  }
}

/**
 * @interface Conflict
 * @description Represents a conflict detected during import preview.
 * Describes what conflicted and provides details for resolution.
 */
export interface Conflict {
  /** Type of conflict */
  type: 'duplicate-persona' | 'duplicate-object' | 'missing-dependency' | 'id-conflict' |
        'duplicate-sequence' | 'overlapping-frames' | 'interpolation-conflict'
  /** Line number in the import file */
  line: number
  /** ID of the object being imported */
  originalId: string
  /** ID of the existing conflicting object */
  existingId?: string
  /** Human-readable description of the conflict */
  details: string
  /** Frame range involved in the conflict (for sequence conflicts) */
  frameRange?: { start: number; end: number }
  /** Interpolation type involved (for interpolation conflicts) */
  interpolationType?: string
}

/**
 * @interface ImportResult
 * @description Result of an import operation.
 * Contains summary statistics, warnings, errors, and conflict resolutions.
 */
export interface ImportResult {
  /** Whether the import completed successfully */
  success: boolean
  /** Summary of what was imported */
  summary: {
    /** Total lines processed from the import file */
    totalLines: number
    /** Lines that were successfully processed */
    processedLines: number
    /** Counts of imported items by type */
    importedItems: {
      personas: number
      ontologies: number
      entities: number
      events: number
      times: number
      entityCollections: number
      eventCollections: number
      timeCollections: number
      relations: number
      annotations: number
      totalKeyframes: number
      totalInterpolatedFrames: number
      singleKeyframeSequences: number
    }
    /** Counts of skipped items by type */
    skippedItems: {
      personas: number
      worldObjects: number
      annotations: number
      sequenceAnnotations: number
    }
  }
  /** Non-fatal warnings encountered during import */
  warnings: Array<{
    /** Line number in import file */
    line: number
    /** Warning type */
    type: string
    /** Warning message */
    message: string
    /** Additional data about the warning */
    data?: Record<string, unknown>
  }>
  /** Errors encountered during import */
  errors: Array<{
    /** Line number in import file */
    line: number
    /** Error type */
    type: string
    /** Error message */
    message: string
    /** Additional data about the error */
    data?: Record<string, unknown>
  }>
  /** Conflicts that were resolved */
  conflicts: Array<Conflict & { resolution: string }>
}

/**
 * @interface ImportPreview
 * @description Preview of import contents before committing.
 * Allows users to review what will be imported and see conflicts.
 */
export interface ImportPreview {
  /** Counts of items that will be imported */
  counts: {
    personas: number
    ontologies: number
    entities: number
    events: number
    times: number
    entityCollections: number
    eventCollections: number
    timeCollections: number
    relations: number
    annotations: number
    totalKeyframes: number
    singleKeyframeSequences: number
  }
  /** Conflicts detected that need resolution */
  conflicts: Conflict[]
  /** Warning messages */
  warnings: string[]
}

/**
 * @interface ImportHistoryItem
 * @description Record of a past import operation.
 * Used for tracking and auditing imports.
 */
export interface ImportHistoryItem {
  /** Unique identifier for this history item */
  id: string
  /** Name of the imported file */
  filename: string
  /** Whether the import was successful */
  success: boolean
  /** Number of items that were imported */
  itemsImported: number
  /** Number of items that were skipped */
  itemsSkipped: number
  /** ISO 8601 timestamp of the import */
  createdAt: string
}

/**
 * @interface OntologyExport
 * @description Complete export package including ontology, annotations, and videos.
 * This is the top-level structure for full system exports.
 */
export interface OntologyExport {
  /** Complete ontology data */
  ontology: Ontology
  /** All annotations */
  annotations: Annotation[]
  /** All video metadata */
  videos: VideoMetadata[]
  /** All video summaries (optional) */
  videoSummaries?: VideoSummary[]
  /** ISO 8601 timestamp of when the export was created */
  exportDate: string
  /** Version of the export format */
  exportVersion: string
}
