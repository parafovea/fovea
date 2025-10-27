export interface User {
  id: string
  username: string
  email?: string
  displayName: string
  isAdmin: boolean
  createdAt: string
  updatedAt: string
}

export interface Persona {
  id: string
  name: string
  role: string
  informationNeed: string
  details: string
  userId?: string
  createdAt: string
  updatedAt: string
}

export interface GlossItem {
  type: 'text' | 'typeRef' | 'objectRef' | 'annotationRef'
  content: string
  refType?: 'entity' | 'role' | 'event' | 'relation' | 'entity-object' | 'event-object' | 'time-object' | 'location-object' | 'annotation'
  refPersonaId?: string | null
}

export interface TypeConstraint {
  type: 'allowedTypes' | 'requiredProperties' | 'valueRange'
  value: any
}

export interface EntityType {
  id: string
  name: string
  gloss: GlossItem[]
  wikidataId?: string  // Q-identifier from Wikidata
  wikidataUrl?: string // Full URL to Wikidata entry
  importedFrom?: 'wikidata' | 'persona' // Track import source
  importedAt?: string  // ISO timestamp of import
  constraints?: TypeConstraint[]
  examples?: string[]
  createdAt: string
  updatedAt: string
}

export interface RoleType {
  id: string
  name: string
  gloss: GlossItem[]
  wikidataId?: string  // Q-identifier from Wikidata
  wikidataUrl?: string // Full URL to Wikidata entry
  importedFrom?: 'wikidata' | 'persona' // Track import source
  importedAt?: string  // ISO timestamp of import
  allowedFillerTypes: ('entity' | 'event')[]
  constraints?: TypeConstraint[]
  examples?: string[]
  createdAt: string
  updatedAt: string
}

export interface EventRole {
  roleTypeId: string
  optional: boolean
  excludes?: string[]
  minOccurrences?: number
  maxOccurrences?: number
}

export interface EventType {
  id: string
  name: string
  gloss: GlossItem[]
  wikidataId?: string  // Q-identifier from Wikidata
  wikidataUrl?: string // Full URL to Wikidata entry
  importedFrom?: 'wikidata' | 'persona' // Track import source
  importedAt?: string  // ISO timestamp of import
  roles: EventRole[]
  parentEventId?: string
  examples?: string[]
  createdAt: string
  updatedAt: string
}

export interface RelationType {
  id: string
  name: string
  gloss: GlossItem[]
  wikidataId?: string  // Q-identifier from Wikidata
  wikidataUrl?: string // Full URL to Wikidata entry
  importedFrom?: 'wikidata' | 'persona' // Track import source
  importedAt?: string  // ISO timestamp of import
  sourceTypes: ('entity' | 'role' | 'event' | 'time')[]
  targetTypes: ('entity' | 'role' | 'event' | 'time')[]
  constraints?: TypeConstraint[]
  symmetric?: boolean
  transitive?: boolean
  examples?: string[]
  createdAt: string
  updatedAt: string
}

export interface OntologyRelation {
  id: string
  relationTypeId: string
  sourceType: 'entity' | 'role' | 'event' | 'time'
  sourceId: string
  targetType: 'entity' | 'role' | 'event' | 'time'
  targetId: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

/**
 * @interface BoundingBox
 * @description Represents a spatial bounding box at a specific video frame.
 * All bounding boxes must have a frame number for sequence support.
 */
export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  frameNumber: number  // Required for all bounding boxes (sequences with 1+ keyframes)
  confidence?: number  // For model-generated boxes
  isKeyframe?: boolean // User-set keyframe vs. interpolated frame
  metadata?: Record<string, any>
}

/**
 * @type InterpolationType
 * @description Supported interpolation modes for bounding box sequences.
 */
export type InterpolationType =
  | 'linear'
  | 'bezier'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'hold'
  | 'parametric'

/**
 * @interface BezierControlPoint
 * @description Control point for cubic Bezier curve interpolation.
 */
export interface BezierControlPoint {
  x: number  // Temporal (0-1, position between keyframes)
  y: number  // Spatial (0-1, value interpolation)
}

/**
 * @interface ParametricFunction
 * @description Configuration for parametric motion functions.
 */
export interface ParametricFunction {
  type: 'linear' | 'quadratic' | 'sinusoidal' | 'custom'
  parameters: Record<string, number>
  expression?: string  // For custom functions
}

/**
 * @interface InterpolationSegment
 * @description Defines interpolation behavior between two keyframes.
 */
export interface InterpolationSegment {
  startFrame: number
  endFrame: number
  type: InterpolationType

  // For bezier interpolation
  controlPoints?: {
    x?: BezierControlPoint[]
    y?: BezierControlPoint[]
    width?: BezierControlPoint[]
    height?: BezierControlPoint[]
  }

  // For parametric functions
  parametric?: {
    x?: ParametricFunction
    y?: ParametricFunction
    width?: ParametricFunction
    height?: ParametricFunction
  }
}

/**
 * @interface BoundingBoxSequence
 * @description Complete sequence of bounding boxes with interpolation configuration.
 * ALL annotations use sequences. Single-frame annotations are sequences with 1 keyframe.
 */
export interface BoundingBoxSequence {
  boxes: BoundingBox[]  // Keyframes only (interpolated frames generated on demand)
  interpolationSegments: InterpolationSegment[]

  // Discontiguous support
  visibilityRanges: Array<{
    startFrame: number
    endFrame: number
    visible: boolean
  }>

  // Tracking integration
  trackId?: string | number  // Links to automated tracking result
  trackingSource?: 'manual' | 'samurai' | 'sam2long' | 'sam2' | 'yolo11seg'
  trackingConfidence?: number  // Overall confidence for tracked sequence

  // Metadata
  totalFrames: number
  keyframeCount: number
  interpolatedFrameCount: number
}

/**
 * @constant INTERPOLATION_PRESETS
 * @description Preset configurations for common interpolation modes.
 */
export const INTERPOLATION_PRESETS = {
  linear: {
    name: 'Linear',
    description: 'Constant velocity',
    icon: '—',
    default: true
  },
  easeInOut: {
    name: 'Ease In-Out',
    description: 'Smooth start and end',
    icon: '~',
    controlPoints: {
      default: { x: [{ x: 0.42, y: 0 }, { x: 0.58, y: 1 }] }
    }
  },
  easeIn: {
    name: 'Ease In',
    description: 'Gradual acceleration',
    icon: '/',
    controlPoints: {
      default: { x: [{ x: 0.42, y: 0 }, { x: 1, y: 1 }] }
    }
  },
  easeOut: {
    name: 'Ease Out',
    description: 'Gradual deceleration',
    icon: '\\',
    controlPoints: {
      default: { x: [{ x: 0, y: 0 }, { x: 0.58, y: 1 }] }
    }
  },
  hold: {
    name: 'Hold',
    description: 'No interpolation',
    icon: '⊏',
  },
  parametricGravity: {
    name: 'Gravity',
    description: 'Falling object physics',
    icon: '↓',
    parametric: {
      y: { type: 'quadratic', parameters: { a: 9.8 } }
    }
  }
} as const

// Temporal Model
export interface Time {
  id: string
  label?: string  // Human-readable label for display
  type: 'instant' | 'interval'
  wikidataId?: string  // Q-identifier from Wikidata
  wikidataUrl?: string // Full URL to Wikidata entry
  importedFrom?: 'wikidata' | 'persona' // Track import source
  importedAt?: string  // ISO timestamp of import

  // Multiple videos can represent the same time
  videoReferences?: Array<{
    videoId: string
    frameNumber?: number
    frameRange?: [number, number]
    milliseconds?: number
    millisecondRange?: [number, number]
  }>

  // Vagueness handling
  vagueness?: {
    type: 'approximate' | 'bounded' | 'fuzzy'
    description?: string
    bounds?: {
      earliest?: string
      latest?: string
      typical?: string
    }
    granularity?: 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'
  }

  // Deictic reference
  deictic?: {
    anchorType: 'annotation_time' | 'video_time' | 'reference_time'
    anchorTime?: string
    expression?: string
  }

  certainty?: number
  metadata?: Record<string, any>
}

export interface TimeInstant extends Time {
  type: 'instant'
  timestamp: string
}

export interface TimeInterval extends Time {
  type: 'interval'
  startTime?: string
  endTime?: string
}

// Recurrence types based on iCalendar RFC 5545
export type RecurrenceFrequency = 'YEARLY' | 'MONTHLY' | 'WEEKLY' | 'DAILY' | 'HOURLY' | 'MINUTELY' | 'SECONDLY'
export type DayOfWeek = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'
export type HabitualFrequency = 'always' | 'usually' | 'often' | 'sometimes' | 'rarely' | 'never'

export interface RecurrenceByDay {
  day: DayOfWeek
  nth?: number  // e.g., 2 for "2nd Monday", -1 for "last Friday"
}

export interface RecurrenceRule {
  frequency: RecurrenceFrequency
  interval?: number  // e.g., every 2 weeks
  
  // End conditions
  endCondition?: {
    type: 'count' | 'until' | 'never'
    count?: number  // Number of occurrences
    until?: string  // ISO 8601 date
  }
  
  // BY rules for fine control
  byRules?: {
    byDay?: RecurrenceByDay[]
    byMonthDay?: number[]  // 1-31, -1 for last day
    byMonth?: number[]  // 1-12
    byHour?: number[]  // 0-23
    byMinute?: number[]  // 0-59
    bySetPos?: number[]  // Position in set (1st, 2nd, -1 for last)
  }
  
  weekStart?: DayOfWeek
  
  // Exceptions and modifications
  exceptions?: string[]  // ISO 8601 dates to exclude
  modifications?: Array<{
    date: string  // ISO 8601
    newTime?: string  // Rescheduled time
    cancelled?: boolean
  }>
}

export interface HabitualPattern {
  frequency: HabitualFrequency
  typicality: number  // 0-1 scale
  
  // Natural language pattern description
  naturalLanguage?: {
    expression: string  // "every morning", "on weekends", "during lunch"
    culturalContext?: string
    vagueness?: 'precise' | 'approximate' | 'fuzzy'
  }
  
  // Contextual anchors
  anchors?: Array<{
    type: 'event' | 'time_of_day' | 'season' | 'cultural'
    reference: string
    offset?: string  // ISO 8601 duration
  }>
}

export interface CyclicalPattern {
  phases: Array<{
    name: string
    duration?: string  // ISO 8601 duration
    description?: string
  }>
  currentPhase?: number
  startTime?: string
}

export interface TimeCollection {
  id: string
  name: string
  description: string
  times: Time[]  // Concrete instances (can be empty for pure patterns)
  collectionType: 'periodic' | 'calendar' | 'irregular' | 'anchored' | 'habitual'
  
  // Enhanced recurrence pattern based on iCalendar RRULE
  recurrence?: RecurrenceRule
  
  // Linguistic/habitual patterns (for annotation research)
  habituality?: HabitualPattern
  
  // For cyclical/phase-based patterns
  cycle?: CyclicalPattern
  
  metadata?: Record<string, any>
}

// Legacy TimeSpan for backward compatibility
export interface TimeSpan {
  startTime: number
  endTime: number
  startFrame?: number
  endFrame?: number
}

// World Objects
export interface Entity {
  id: string
  name: string
  description: GlossItem[]
  wikidataId?: string  // Q-identifier from Wikidata
  wikidataUrl?: string // Full URL to Wikidata entry
  importedFrom?: 'wikidata' | 'persona' // Track import source
  importedAt?: string  // ISO timestamp of import
  typeAssignments: EntityTypeAssignment[]
  metadata: {
    alternateNames?: string[]
    externalIds?: Record<string, string>
    properties?: Record<string, any>
  }
  createdAt: string
  updatedAt: string
}

export interface EntityTypeAssignment {
  personaId: string
  entityTypeId: string
  confidence?: number
  justification?: string
}

export interface Event {
  id: string
  name: string
  description: GlossItem[]
  wikidataId?: string  // Q-identifier from Wikidata
  wikidataUrl?: string // Full URL to Wikidata entry
  importedFrom?: 'wikidata' | 'persona' // Track import source
  importedAt?: string  // ISO timestamp of import
  personaInterpretations: EventInterpretation[]
  time?: Time
  location?: Location
  metadata: {
    certainty?: number
    properties?: Record<string, any>
  }
  createdAt: string
  updatedAt: string
}

export interface EventInterpretation {
  personaId: string
  eventTypeId: string
  participants: Array<{
    entityId: string
    roleTypeId: string
  }>
  confidence?: number
  justification?: string
}

// Location entities (special type of Entity)
export interface Location extends Entity {
  locationType: 'point' | 'extent'
  coordinateSystem?: 'GPS' | 'cartesian' | 'relative'
}

export interface LocationPoint extends Location {
  locationType: 'point'
  coordinates: {
    latitude?: number
    longitude?: number
    altitude?: number
    x?: number
    y?: number
    z?: number
  }
}

export interface LocationExtent extends Location {
  locationType: 'extent'
  boundary: Array<{
    latitude?: number
    longitude?: number
    altitude?: number
    x?: number
    y?: number
    z?: number
  }>
  boundingBox?: {
    minLatitude?: number
    maxLatitude?: number
    minLongitude?: number
    maxLongitude?: number
    minAltitude?: number
    maxAltitude?: number
  }
}

// Collections
export interface EntityCollection {
  id: string
  name: string
  description: GlossItem[]
  entityIds: string[]
  collectionType: 'group' | 'kind' | 'functional' | 'stage' | 'portion' | 'variant'
  typeAssignments: EntityTypeAssignment[]
  aggregateProperties?: {
    homogeneous?: boolean
    ordered?: boolean
    mereological?: 'mass' | 'count' | 'mixed'
  }
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface EventCollection {
  id: string
  name: string
  description: GlossItem[]
  eventIds: string[]
  collectionType: 'sequence' | 'iteration' | 'complex' | 'alternative' | 'group'
  typeAssignments: Array<{
    personaId: string
    eventTypeId: string
    confidence?: number
    justification?: string
  }>
  timeCollectionId?: string
  structure?: EventStructureNode
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface EventStructureNode {
  eventId?: string
  children?: EventStructureNode[]
  relationTypeId?: string
  label?: string
  optional?: boolean
}

/**
 * @interface BaseAnnotation
 * @description Base interface for all annotation types with common fields.
 * ALL annotations now use bounding box sequences (no legacy single-frame mode).
 */
interface BaseAnnotation {
  id: string
  videoId: string

  // Spatial (ALL annotations use sequences)
  boundingBoxSequence: BoundingBoxSequence  // Required for all annotations

  // Temporal
  time?: Time
  timeSpan?: TimeSpan  // Deprecated, for backward compatibility

  // Common metadata
  confidence?: number
  notes?: string
  metadata?: Record<string, any>
  createdBy?: string
  createdAt: string
  updatedAt: string

  // UI state (ephemeral, not persisted)
  _ui?: {
    selectedKeyframes?: number[]  // Frame numbers
    showMotionPath?: boolean
    timelineExpanded?: boolean
  }
}

// Annotation linking to world objects (entities, events, times)
export interface ObjectAnnotation extends BaseAnnotation {
  annotationType: 'object'
  
  // Link to world object (exactly one should be present)
  linkedEntityId?: string
  linkedEventId?: string
  linkedTimeId?: string
  linkedLocationId?: string  // Location is a special type of Entity
  
  // Or link to collection
  linkedCollectionId?: string
  linkedCollectionType?: 'entity' | 'event' | 'time'
}

// Annotation assigning types from a persona's ontology
export interface TypeAnnotation extends BaseAnnotation {
  annotationType: 'type'
  personaId: string  // Required for type annotations
  
  typeCategory: 'entity' | 'role' | 'event'
  typeId: string
}

// Union type for all annotations
export type Annotation = ObjectAnnotation | TypeAnnotation

export interface VideoFormat {
  url: string
  format_id: string
  format_note?: string
  width?: number
  height?: number
  ext?: string
  protocol?: string
  resolution?: string
  tbr?: number
}

export interface VideoMetadata {
  id: string
  title: string
  description: string
  duration: number
  width: number
  height: number
  fps?: number
  format?: string
  uploader?: string
  uploader_id?: string
  uploader_url?: string
  uploadDate?: string
  upload_date?: string
  timestamp?: number
  tags?: string[]
  thumbnail?: string
  thumbnails?: { url: string; width: number; height: number }[]
  filePath: string
  formats?: VideoFormat[]
  webpage_url?: string
  channel_id?: string
  like_count?: number
  repost_count?: number
  comment_count?: number
}

export interface PersonaOntology {
  id: string
  personaId: string
  entities: EntityType[]
  roles: RoleType[]
  events: EventType[]
  relationTypes: RelationType[]
  relations: OntologyRelation[]
  createdAt: string
  updatedAt: string
}

export interface WorldStateData {
  entities: Entity[]
  events: Event[]
  times: Time[]
  entityCollections: EntityCollection[]
  eventCollections: EventCollection[]
  timeCollections: TimeCollection[]
  relations: OntologyRelation[]
}

export interface Ontology {
  id: string
  version: string
  personas: Persona[]
  personaOntologies: PersonaOntology[]
  world?: WorldStateData
  createdAt: string
  updatedAt: string
  description?: string
}

export interface ImportRequest {
  fromPersonaId: string
  toPersonaId: string
  entityIds?: string[]
  roleIds?: string[]
  eventIds?: string[]
  relationTypeIds?: string[]
  includeRelations?: boolean
}

/**
 * @interface ExportOptions
 * @description Options for exporting annotations with bounding box sequences.
 */
export interface ExportOptions {
  includeInterpolated?: boolean  // Export all interpolated frames vs. keyframes-only
  personaIds?: string[]  // Filter by personas
  videoIds?: string[]  // Filter by videos
  annotationTypes?: ('type' | 'object')[]  // Filter by annotation type
}

/**
 * @interface ExportStats
 * @description Statistics about exported data.
 */
export interface ExportStats {
  totalSize: number  // bytes
  annotationCount: number
  sequenceCount: number
  keyframeCount: number
  interpolatedFrameCount: number
}

// Import Types

/**
 * @interface ImportOptions
 * @description Configuration for importing annotations from JSON Lines files.
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
 * @interface Conflict
 * @description Represents a conflict detected during import preview.
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
 * @interface ImportResult
 * @description Result of an import operation with statistics and errors.
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
    data?: any
  }>
  errors: Array<{
    line: number
    type: string
    message: string
    data?: any
  }>
  conflicts: Array<Conflict & { resolution: string }>
}

/**
 * @interface ImportPreview
 * @description Preview of import contents before committing.
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
 * @interface ImportHistoryItem
 * @description Record of a past import operation.
 */
export interface ImportHistoryItem {
  id: string
  filename: string
  success: boolean
  itemsImported: number
  itemsSkipped: number
  createdAt: string
}

// Video Summary
export interface VideoSummary {
  id: string
  videoId: string
  personaId: string
  summary: GlossItem[]
  createdAt: string
  updatedAt: string
  createdBy?: string
}

export interface OntologyExport {
  ontology: Ontology
  annotations: Annotation[]
  videos: VideoMetadata[]
  videoSummaries?: VideoSummary[]
  exportDate: string
  exportVersion: string
}

// Tracking Integration

/**
 * @interface TrackFrame
 * @description Single frame in a tracking result with bounding box or mask.
 * @property frameNumber - Frame number in video sequence
 * @property box - Bounding box coordinates (x, y, width, height)
 * @property mask - Optional segmentation mask as 2D array
 * @property confidence - Model confidence score for this frame (0-1)
 * @property occluded - Whether object is occluded in this frame
 */
export interface TrackFrame {
  frameNumber: number
  box: { x: number; y: number; width: number; height: number }
  mask?: number[][]
  confidence: number
  occluded: boolean
}

/**
 * @interface TrackingResult
 * @description Result from automated tracking model for a single tracked object.
 * @property trackId - Unique identifier for this track
 * @property label - Object class label (e.g., "person", "car")
 * @property confidence - Overall tracking confidence (0-1)
 * @property model - Name of tracking model used (e.g., "samurai", "sam2")
 * @property frames - Array of tracked frames with bounding boxes
 */
export interface TrackingResult {
  trackId: string | number
  label: string
  confidence: number
  model: string
  frames: TrackFrame[]
}

/**
 * @interface TrackingResponse
 * @description Response from tracking API endpoint.
 * @property success - Whether tracking operation succeeded
 * @property tracks - Array of tracking results for detected objects
 * @property processingTimeMs - Time taken to process tracking request
 */
export interface TrackingResponse {
  success: boolean
  tracks: TrackingResult[]
  processingTimeMs: number
}