/**
 * @file import-types.ts
 * @description Type definitions for import system with sequence validation.
 */

/**
 * @interface ImportLine
 * @description Represents a parsed line from JSON Lines import file.
 */
export interface ImportLine {
  type: 'ontology' | 'entity' | 'event' | 'time' | 'entityCollection' |
        'eventCollection' | 'timeCollection' | 'relation' | 'annotation' | 'video' | 'metadata'
  data: {
    id?: string
    videoId?: string
    personaId?: string
    annotationType?: string
    typeCategory?: string
    typeId?: string
    linkedEntityId?: string
    linkedEventId?: string
    linkedTimeId?: string
    linkedLocationId?: string
    linkedCollectionId?: string
    boundingBoxSequence?: unknown
    personas?: unknown[]
    personaOntologies?: unknown[]
    name?: string
    typeAssignments?: unknown[]
    personaInterpretations?: unknown[]
    [key: string]: unknown
  }
  lineNumber: number
}

/**
 * @interface ValidationResult
 * @description Result of validation with errors and warnings.
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * @interface Conflict
 * @description Represents a conflict detected during import.
 */
export interface Conflict {
  type: 'duplicate-persona' | 'duplicate-object' | 'missing-dependency' | 'id-conflict' |
        'duplicate-sequence' | 'overlapping-frames' | 'interpolation-conflict'
  line: number
  originalId: string
  existingId?: string
  details: string
  frameRange?: { start: number; end: number }
  interpolationType?: string
}

/**
 * @interface Resolution
 * @description Resolution strategy for a detected conflict.
 */
export interface Resolution {
  conflictType: Conflict['type']
  strategy: string
  originalId: string
  newId?: string
  action: 'skip' | 'replace' | 'merge' | 'rename' | 'create-new' | 'fail'
}

/**
 * @interface ImportOptions
 * @description Options for import with conflict resolution strategies.
 */
export interface ImportOptions {
  conflictResolution: {
    personas: 'skip' | 'replace' | 'merge' | 'rename'
    worldObjects: 'skip' | 'replace' | 'merge-assignments'
    missingDependencies: 'skip-item' | 'create-placeholder' | 'fail-import'
    duplicateIds: 'preserve-id' | 'regenerate-id'
    sequences: {
      duplicateSequenceIds: 'skip' | 'replace' | 'merge-keyframes' | 'create-new'
      overlappingFrameRanges: 'split-ranges' | 'extend-range' | 'replace-overlap' | 'fail-import'
      interpolationConflicts: 'use-imported' | 'use-existing' | 'fail-import'
    }
  }
  scope: {
    includePersonas: boolean
    includeWorldState: boolean
    includeAnnotations: boolean
    specificPersonaIds?: string[]
    specificObjectTypes?: ('entity' | 'event' | 'time' | 'collection')[]
  }
  validation: {
    strictMode: boolean
    validateReferences: boolean
    validateSequenceIntegrity: boolean
    validateInterpolationTypes: boolean
    validateBoundingBoxRanges: boolean
    recomputeInterpolation: boolean
  }
  transaction: {
    atomic: boolean
  }
}

/**
 * @interface ImportResult
 * @description Result of import operation with detailed statistics.
 */
export interface ImportResult {
  success: boolean
  summary: {
    totalLines: number
    processedLines: number
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
    skippedItems: {
      personas: number
      worldObjects: number
      annotations: number
      sequenceAnnotations: number
    }
  }
  warnings: Array<{
    line: number
    type: string
    message: string
    data?: unknown
  }>
  errors: Array<{
    line: number
    type: string
    message: string
    data?: unknown
  }>
  conflicts: Array<Conflict & { resolution: string }>
}

/**
 * @interface ImportPreview
 * @description Preview of import without database changes.
 */
export interface ImportPreview {
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
  conflicts: Conflict[]
  warnings: string[]
}

/**
 * @interface DependencyGraph
 * @description Tracks dependencies between imported items.
 */
export interface DependencyGraph {
  personas: Set<string>
  ontologies: Map<string, string>  // ontologyId -> personaId
  entities: Set<string>
  events: Set<string>
  times: Set<string>
  collections: Set<string>
  annotations: Map<string, string[]>  // annotationId -> [dependencies]
  references: Map<string, Set<string>>  // id -> Set of ids that reference it
}

/**
 * @interface ExistingData
 * @description Existing data in database for conflict detection.
 */
export interface ExistingData {
  personaIds: Set<string>
  entityIds: Set<string>
  eventIds: Set<string>
  timeIds: Set<string>
  collectionIds: Set<string>
  annotationIds: Set<string>
  videoIds: Set<string>
}

/**
 * Default import options with recommended settings.
 */
export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  conflictResolution: {
    personas: 'skip',
    worldObjects: 'skip',
    missingDependencies: 'skip-item',
    duplicateIds: 'preserve-id',
    sequences: {
      duplicateSequenceIds: 'skip',
      overlappingFrameRanges: 'fail-import',
      interpolationConflicts: 'use-existing'
    }
  },
  scope: {
    includePersonas: true,
    includeWorldState: true,
    includeAnnotations: true
  },
  validation: {
    strictMode: false,
    validateReferences: true,
    validateSequenceIntegrity: true,
    validateInterpolationTypes: true,
    validateBoundingBoxRanges: true,
    recomputeInterpolation: false
  },
  transaction: {
    atomic: true
  }
}
