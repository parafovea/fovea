/**
 * Internal data-shape interfaces for the import pipeline.
 *
 * These describe the parsed JSONL payloads handled by the import modules.
 * The public import contracts (ImportLine, Conflict, Resolution, etc.) live
 * in `../import-types.js`; these are the structural views the parser,
 * dependency graph, conflict math, and entity importers cast `line.data`
 * into while processing it.
 *
 * @module
 */

/**
 * Parsed bounding box at a single frame within an annotation sequence.
 */
export interface BoundingBoxData {
  x: number
  y: number
  width: number
  height: number
  frameNumber: number
  isKeyframe?: boolean
  confidence?: number
  metadata?: Record<string, unknown>
}

/**
 * Bounding box sequence payload carried by an annotation line.
 */
export interface BoundingBoxSequenceData {
  boxes: BoundingBoxData[]
  [key: string]: unknown
}

/**
 * Annotation line payload with bounding box and link fields.
 */
export interface AnnotationData {
  id: string
  videoId: string
  personaId?: string
  annotationType?: string
  typeCategory?: string
  typeId?: string
  linkedEntityId?: string
  linkedEventId?: string
  linkedTimeId?: string
  linkedLocationId?: string
  linkedCollectionId?: string
  confidence?: number
  boundingBoxSequence: BoundingBoxSequenceData
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

/**
 * Persona line payload.
 */
export interface PersonaData {
  id: string
  userId?: string
  [key: string]: unknown
}

/**
 * Ontology line payload.
 */
export interface OntologyData {
  id: string
  personaId: string
  [key: string]: unknown
}

/**
 * Entity line payload with optional per-persona type assignments.
 */
export interface EntityData {
  id: string
  typeAssignments?: Array<{ personaId: string }>
  [key: string]: unknown
}

/**
 * Event line payload with optional per-persona interpretations.
 */
export interface EventData {
  id: string
  personaInterpretations?: Array<{
    personaId: string
    participants?: Array<{ entityId: string }>
  }>
  [key: string]: unknown
}

/**
 * Time line payload.
 */
export interface TimeData {
  id: string
  [key: string]: unknown
}

/**
 * Collection line payload.
 */
export interface CollectionData {
  id: string
  [key: string]: unknown
}
