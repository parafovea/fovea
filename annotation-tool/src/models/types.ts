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
  type: 'text' | 'typeRef' | 'objectRef'
  content: string
  refType?: 'entity' | 'role' | 'event' | 'relation' | 'entity-object' | 'event-object' | 'time-object' | 'location-object'
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
  metadata?: Record<string, any>
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

export interface TimeCollection {
  id: string
  name: string
  description: string
  times: Time[]
  collectionType: 'periodic' | 'cyclical' | 'calendar' | 'irregular' | 'anchored'
  
  pattern?: {
    period?: {
      unit: 'milliseconds' | 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'
      value: number
      variance?: number
    }
    cycle?: {
      phases: string[]
      durations?: number[]
      unit?: string
    }
    calendarRule?: string
    anchorEvents?: string[]
  }
  
  habituality?: {
    frequency?: 'always' | 'usually' | 'often' | 'sometimes' | 'rarely' | 'never'
    exceptions?: Time[]
    typicality?: number
  }
  
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
  metadata?: Record<string, any>
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

export interface Ontology {
  id: string
  version: string
  personas: Persona[]
  personaOntologies: PersonaOntology[]
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

export interface OntologyExport {
  ontology: Ontology
  annotations: Annotation[]
  videos: VideoMetadata[]
  exportDate: string
  exportVersion: string
}