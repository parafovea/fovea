export interface Persona {
  id: string
  name: string
  role: string
  informationNeed: string
  details: string
  createdAt: string
  updatedAt: string
}

export interface GlossItem {
  type: 'text' | 'typeRef' | 'objectRef' | 'annotationRef'
  content: string
  refType?: 'entity' | 'role' | 'event' | 'relation' | 'entity-object' | 'event-object' | 'time-object' | 'location-object' | 'annotation'
  refPersonaId?: string
}

export interface TypeConstraint {
  type: 'allowedTypes' | 'requiredProperties' | 'valueRange'
  value: string[] | Record<string, unknown> | { min?: number; max?: number }
}

export interface EntityType {
  id: string
  name: string
  gloss: GlossItem[]
  constraints?: TypeConstraint[]
  examples?: string[]
  createdAt: string
  updatedAt: string
}

export interface RoleType {
  id: string
  name: string
  gloss: GlossItem[]
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
  roles: EventRole[]
  parentEventId?: string
  examples?: string[]
  createdAt: string
  updatedAt: string
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  frameNumber?: number
}

// Temporal Model
export interface Time {
  id: string
  type: 'instant' | 'interval'
  
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
  metadata?: Record<string, unknown>
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
    type: 'event' | 'timeOfDay' | 'season' | 'cultural'
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
  
  metadata?: Record<string, unknown>
}

// Legacy TimeSpan for backward compatibility
export interface TimeSpan {
  startTime: number
  endTime: number
  startFrame?: number
  endFrame?: number
}

export interface RelationType {
  id: string
  name: string
  gloss: GlossItem[]
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
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

// World Objects
export interface Entity {
  id: string
  name: string
  description: GlossItem[]
  typeAssignments: EntityTypeAssignment[]
  metadata: {
    alternateNames?: string[]
    externalIds?: Record<string, string>
    properties?: Record<string, unknown>
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
  personaInterpretations: EventInterpretation[]
  time?: Time
  location?: Location
  metadata: {
    certainty?: number
    properties?: Record<string, unknown>
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
  metadata?: Record<string, unknown>
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
  metadata?: Record<string, unknown>
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

// Base Annotation interface with common fields
interface BaseAnnotation {
  id: string
  videoId: string
  
  // Spatial
  boundingBox?: BoundingBox
  boundingBoxSequence?: BoundingBox[]
  
  // Temporal
  time?: Time
  timeSpan?: TimeSpan  // Deprecated, for backward compatibility
  
  // Common metadata
  confidence?: number
  notes?: string
  metadata?: Record<string, unknown>
  createdBy?: string
  createdAt: string
  updatedAt: string
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
  uploadDate?: string
  tags?: string[]
  thumbnail?: string
  filePath: string
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

export interface Ontology {
  id: string
  version: string
  personas: Persona[]
  personaOntologies: PersonaOntology[]
  createdAt: string
  updatedAt: string
  description?: string
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