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
  type: 'text' | 'typeRef'
  content: string
  refType?: 'entity' | 'role' | 'event' | 'relation'
  refPersonaId?: string
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

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  frameNumber?: number
}

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
  sourceTypes: ('entity' | 'role' | 'event')[]
  targetTypes: ('entity' | 'role' | 'event')[]
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
  sourceType: 'entity' | 'role' | 'event'
  sourceId: string
  targetType: 'entity' | 'role' | 'event'
  targetId: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface Annotation {
  id: string
  videoId: string
  personaId: string
  boundingBox: BoundingBox
  timeSpan: TimeSpan
  typeCategory: 'entity' | 'role' | 'event'
  typeId: string
  confidence?: number
  notes?: string
  metadata?: Record<string, any>
  createdBy?: string
  createdAt: string
  updatedAt: string
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

export interface OntologyExport {
  ontology: Ontology
  annotations: Annotation[]
  videos: VideoMetadata[]
  exportDate: string
  exportVersion: string
}