import { PrismaClient, Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
import { NotFoundError, ValidationError } from '../lib/errors.js'
import {
  ImportLine,
  ValidationResult,
  Conflict,
  Resolution,
  ImportOptions,
  ImportResult,
  DependencyGraph,
  ExistingData
} from './import-types.js'
import { SequenceValidator } from './import-validator.js'

/**
 * Interface for parsed annotation data with bounding box fields.
 */
interface BoundingBoxData {
  x: number
  y: number
  width: number
  height: number
  frameNumber: number
  isKeyframe?: boolean
  confidence?: number
  metadata?: Record<string, unknown>
}

interface BoundingBoxSequenceData {
  boxes: BoundingBoxData[]
  [key: string]: unknown
}

interface AnnotationData {
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

interface PersonaData {
  id: string
  userId?: string
  [key: string]: unknown
}

interface OntologyData {
  id: string
  personaId: string
  [key: string]: unknown
}


interface EntityData {
  id: string
  typeAssignments?: Array<{ personaId: string }>
  [key: string]: unknown
}

interface EventData {
  id: string
  personaInterpretations?: Array<{
    personaId: string
    participants?: Array<{ entityId: string }>
  }>
  [key: string]: unknown
}

interface TimeData {
  id: string
  [key: string]: unknown
}

interface CollectionData {
  id: string
  [key: string]: unknown
}

/**
 * @class ImportHandler
 * @description Handles parsing, validation, and execution of imports.
 */
export class ImportHandler {
  private validator: SequenceValidator
  private prisma: PrismaClient
  private userId: string

  constructor(prisma: PrismaClient, userId: string) {
    this.validator = new SequenceValidator()
    this.prisma = prisma
    this.userId = userId
  }

  /**
   * Parse a single line from JSON Lines file.
   *
   * @param line - Raw line string
   * @param lineNumber - Line number in file
   * @returns Parsed import line
   */
  parseLine(line: string, lineNumber: number): ImportLine {
    try {
      const parsed = JSON.parse(line)

      if (!parsed.type || !parsed.data) {
        throw new ValidationError('Line must have "type" and "data" fields')
      }

      return {
        type: parsed.type,
        data: parsed.data,
        lineNumber
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new ValidationError(`Failed to parse line ${lineNumber}: ${errorMessage}`)
    }
  }

  /**
   * Validate a parsed import line.
   *
   * @param line - Import line to validate
   * @returns Validation result
   */
  validateLine(line: ImportLine): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Validate based on line type
    switch (line.type) {
      case 'annotation':
        // Validate annotation structure
        if (!line.data.id) {
          errors.push('Annotation missing required field: id')
        }
        if (!line.data.videoId) {
          errors.push('Annotation missing required field: videoId')
        }
        if (!line.data.boundingBoxSequence) {
          errors.push('Annotation missing required field: boundingBoxSequence')
        } else {
          // Validate sequence - safely cast to the type expected by validator
          const seqValidation = this.validator.validateSequence(line.data.boundingBoxSequence as BoundingBoxSequenceData)
          errors.push(...seqValidation.errors)
          warnings.push(...seqValidation.warnings)
        }

        // Validate annotation type
        if (line.data.annotationType === 'type') {
          if (!line.data.personaId) {
            errors.push('Type annotation missing required field: personaId')
          }
          if (!line.data.typeId) {
            errors.push('Type annotation missing required field: typeId')
          }
          if (!line.data.typeCategory) {
            errors.push('Type annotation missing required field: typeCategory')
          }
        } else if (line.data.annotationType === 'object') {
          // Object annotation should have at least one linked field
          const hasLink = line.data.linkedEntityId ||
                         line.data.linkedEventId ||
                         line.data.linkedTimeId ||
                         line.data.linkedLocationId ||
                         line.data.linkedCollectionId
          if (!hasLink) {
            warnings.push('Object annotation has no linked object')
          }
        }
        break

      case 'entity':
      case 'event':
      case 'time':
        if (!line.data.id) {
          errors.push(`${line.type} missing required field: id`)
        }
        if (!line.data.name && line.type !== 'time') {
          errors.push(`${line.type} missing required field: name`)
        }
        break

      case 'persona':
        // Validate persona structure
        if (!line.data.id) {
          errors.push('Persona missing required field: id')
        }
        if (!line.data.name) {
          errors.push('Persona missing required field: name')
        }
        if (!line.data.role) {
          errors.push('Persona missing required field: role')
        }
        if (!line.data.informationNeed) {
          errors.push('Persona missing required field: informationNeed')
        }
        break

      case 'ontology':
        // Validate ontology structure - new format uses personaId
        if (!line.data.personaId) {
          // Check for legacy format with personas array
          if (!line.data.personas || !Array.isArray(line.data.personas)) {
            errors.push('Ontology missing required field: personaId')
          }
        }
        break

      case 'summary':
        // Validate summary structure
        if (!line.data.id) {
          errors.push('Summary missing required field: id')
        }
        if (!line.data.videoId) {
          errors.push('Summary missing required field: videoId')
        }
        if (!line.data.personaId) {
          errors.push('Summary missing required field: personaId')
        }
        break

      case 'claim':
        // Validate claim structure
        if (!line.data.id) {
          errors.push('Claim missing required field: id')
        }
        if (!line.data.summaryId) {
          errors.push('Claim missing required field: summaryId')
        }
        if (!line.data.text) {
          errors.push('Claim missing required field: text')
        }
        break

      case 'claim_relation':
        // Validate claim relation structure
        if (!line.data.id) {
          errors.push('ClaimRelation missing required field: id')
        }
        if (!line.data.sourceClaimId) {
          errors.push('ClaimRelation missing required field: sourceClaimId')
        }
        if (!line.data.targetClaimId) {
          errors.push('ClaimRelation missing required field: targetClaimId')
        }
        if (!line.data.relationTypeId) {
          errors.push('ClaimRelation missing required field: relationTypeId')
        }
        break

      case 'video':
        if (!line.data.id) {
          errors.push('Video missing required field: id')
        }
        break

      case 'relation':
        if (!line.data.id) {
          errors.push('Relation missing required field: id')
        }
        break

      case 'entity_collection':
      case 'event_collection':
      case 'time_collection':
        if (!line.data.id) {
          errors.push(`Collection missing required field: id`)
        }
        break

      case 'metadata':
        // Metadata lines are informational only
        break

      default:
        warnings.push(`Unknown line type: ${line.type}`)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Build dependency graph from import lines.
   *
   * @param lines - Array of import lines
   * @returns Dependency graph
   */
  buildDependencyGraph(lines: ImportLine[]): DependencyGraph {
    const graph: DependencyGraph = {
      personas: new Set(),
      ontologies: new Map(),
      entities: new Set(),
      events: new Set(),
      times: new Set(),
      collections: new Set(),
      annotations: new Map(),
      references: new Map()
    }

    for (const line of lines) {
      switch (line.type) {
        case 'ontology': {
          const ontologyData = line.data as { personas?: PersonaData[]; personaOntologies?: OntologyData[] }
          // Track personas
          for (const persona of ontologyData.personas || []) {
            graph.personas.add(persona.id)
          }
          // Track ontologies
          for (const ontology of ontologyData.personaOntologies || []) {
            graph.ontologies.set(ontology.id, ontology.personaId)
          }
          break
        }

        case 'entity': {
          const entityData = line.data as EntityData
          graph.entities.add(entityData.id)
          // Track persona references
          for (const assignment of entityData.typeAssignments || []) {
            this.addReference(graph, assignment.personaId, entityData.id)
          }
          break
        }

        case 'event': {
          const eventData = line.data as EventData
          graph.events.add(eventData.id)
          // Track persona references
          for (const interpretation of eventData.personaInterpretations || []) {
            this.addReference(graph, interpretation.personaId, eventData.id)
            // Track entity references (participants)
            for (const participant of interpretation.participants || []) {
              this.addReference(graph, participant.entityId, eventData.id)
            }
          }
          break
        }

        case 'time': {
          const timeData = line.data as TimeData
          graph.times.add(timeData.id)
          break
        }

        case 'entityCollection':
        case 'eventCollection':
        case 'timeCollection': {
          const collectionData = line.data as CollectionData
          graph.collections.add(collectionData.id)
          break
        }

        case 'annotation': {
          const annotationData = line.data as AnnotationData
          const deps: string[] = []

          // Add video dependency
          deps.push(annotationData.videoId)

          // Add persona dependency (for type annotations)
          if (annotationData.personaId) {
            deps.push(annotationData.personaId)
          }

          // Add linked object dependencies
          if (annotationData.linkedEntityId) deps.push(annotationData.linkedEntityId)
          if (annotationData.linkedEventId) deps.push(annotationData.linkedEventId)
          if (annotationData.linkedTimeId) deps.push(annotationData.linkedTimeId)
          if (annotationData.linkedLocationId) deps.push(annotationData.linkedLocationId)
          if (annotationData.linkedCollectionId) deps.push(annotationData.linkedCollectionId)

          graph.annotations.set(annotationData.id, deps)
          break
        }
      }
    }

    return graph
  }

  /**
   * Add reference to dependency graph.
   */
  private addReference(graph: DependencyGraph, refId: string, dependentId: string): void {
    if (!graph.references.has(refId)) {
      graph.references.set(refId, new Set())
    }
    graph.references.get(refId)!.add(dependentId)
  }

  /**
   * Detect conflicts between import data and existing database data.
   *
   * @param lines - Import lines
   * @param existingData - Existing data in database
   * @returns Array of conflicts
   */
  private isOwnedByImporter(id: string, type: string, existingData: ExistingData): boolean {
    switch (type) {
      case 'persona': return existingData.ownedPersonaIds.has(id)
      case 'annotation': return existingData.ownedAnnotationIds.has(id)
      case 'summary': return existingData.ownedSummaryIds.has(id)
      case 'claim': return existingData.ownedClaimIds.has(id)
      case 'claim_relation': return existingData.ownedClaimRelationIds.has(id)
      case 'entity': return existingData.ownedEntityIds.has(id)
      case 'event': return existingData.ownedEventIds.has(id)
      case 'time': return existingData.ownedTimeIds.has(id)
      case 'entity_collection': case 'entityCollection':
      case 'event_collection': case 'eventCollection':
      case 'time_collection': case 'timeCollection':
        return existingData.ownedCollectionIds.has(id)
      case 'relation': return existingData.ownedWorldStateId !== null
      default: return false
    }
  }

  async detectConflicts(lines: ImportLine[], existingData: ExistingData): Promise<Conflict[]> {
    const conflicts: Conflict[] = []

    // Identify foreign persona IDs from import data: personas whose userId
    // differs from the importing user. These need new UUIDs even if their IDs
    // don't already exist in the database.
    const foreignPersonaIds = new Set<string>()
    for (const line of lines) {
      if (line.type === 'persona') {
        const personaData = line.data as PersonaData
        if (personaData.userId && personaData.userId !== this.userId) {
          foreignPersonaIds.add(personaData.id)
        }
      }
    }

    for (const line of lines) {
      switch (line.type) {
        case 'persona': {
          const personaData = line.data as PersonaData
          if (existingData.personaIds.has(personaData.id)) {
            conflicts.push({
              type: 'duplicate-persona',
              line: line.lineNumber,
              originalId: personaData.id,
              existingId: personaData.id,
              details: `Persona with ID ${personaData.id} already exists`,
              ownedByImporter: this.isOwnedByImporter(personaData.id, 'persona', existingData)
            })
          } else if (foreignPersonaIds.has(personaData.id)) {
            conflicts.push({
              type: 'duplicate-persona',
              line: line.lineNumber,
              originalId: personaData.id,
              details: `Persona from a different user requires new ID`,
              ownedByImporter: false
            })
          }
          break
        }

        case 'annotation': {
          const annotationData = line.data as AnnotationData
          if (existingData.annotationIds.has(annotationData.id)) {
            const sequence = annotationData.boundingBoxSequence
            const keyframes = sequence.boxes.filter((b) => b.isKeyframe)
            const frameRange = keyframes.length > 0 ? {
              start: keyframes[0].frameNumber,
              end: keyframes[keyframes.length - 1].frameNumber
            } : undefined

            conflicts.push({
              type: 'duplicate-sequence',
              line: line.lineNumber,
              originalId: annotationData.id,
              existingId: annotationData.id,
              details: `Annotation with ID ${annotationData.id} already exists`,
              frameRange,
              interpolationType: (sequence.interpolationSegments as Array<{ type?: string }>)[0]?.type,
              ownedByImporter: this.isOwnedByImporter(annotationData.id, 'annotation', existingData)
            })
          } else if (annotationData.personaId && foreignPersonaIds.has(annotationData.personaId)) {
            conflicts.push({
              type: 'duplicate-sequence',
              line: line.lineNumber,
              originalId: annotationData.id,
              details: `Annotation from a different user requires new ID`,
              ownedByImporter: false
            })
          }

          // Check for missing dependencies
          if (annotationData.videoId && !existingData.videoIds.has(annotationData.videoId)) {
            conflicts.push({
              type: 'missing-dependency',
              line: line.lineNumber,
              originalId: annotationData.id,
              details: `Video ${annotationData.videoId} does not exist`
            })
          }

          if (annotationData.linkedEntityId && !existingData.entityIds.has(annotationData.linkedEntityId)) {
            conflicts.push({
              type: 'missing-dependency',
              line: line.lineNumber,
              originalId: annotationData.id,
              details: `Entity ${annotationData.linkedEntityId} does not exist`
            })
          }
          break
        }

        case 'entity': {
          const entityData = line.data as EntityData
          if (existingData.entityIds.has(entityData.id)) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: entityData.id,
              existingId: entityData.id,
              details: `Entity with ID ${entityData.id} already exists`,
              ownedByImporter: this.isOwnedByImporter(entityData.id, 'entity', existingData)
            })
          } else if (foreignPersonaIds.size > 0) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: entityData.id,
              details: `Entity from a different user requires new ID`,
              ownedByImporter: false
            })
          }
          break
        }

        case 'event': {
          const eventData = line.data as EventData
          if (existingData.eventIds.has(eventData.id)) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: eventData.id,
              existingId: eventData.id,
              details: `Event with ID ${eventData.id} already exists`,
              ownedByImporter: this.isOwnedByImporter(eventData.id, 'event', existingData)
            })
          } else if (foreignPersonaIds.size > 0) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: eventData.id,
              details: `Event from a different user requires new ID`,
              ownedByImporter: false
            })
          }
          break
        }

        case 'time': {
          const timeData = line.data as TimeData
          if (existingData.timeIds.has(timeData.id)) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: timeData.id,
              existingId: timeData.id,
              details: `Time with ID ${timeData.id} already exists`,
              ownedByImporter: this.isOwnedByImporter(timeData.id, 'time', existingData)
            })
          } else if (foreignPersonaIds.size > 0) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: timeData.id,
              details: `Time from a different user requires new ID`,
              ownedByImporter: false
            })
          }
          break
        }

        case 'entity_collection':
        case 'entityCollection':
        case 'event_collection':
        case 'eventCollection':
        case 'time_collection':
        case 'timeCollection': {
          const collectionData = line.data as CollectionData
          if (existingData.collectionIds.has(collectionData.id)) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: collectionData.id,
              existingId: collectionData.id,
              details: `Collection with ID ${collectionData.id} already exists`,
              ownedByImporter: this.isOwnedByImporter(collectionData.id, line.type, existingData)
            })
          } else if (foreignPersonaIds.size > 0) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: collectionData.id,
              details: `Collection from a different user requires new ID`,
              ownedByImporter: false
            })
          }
          break
        }

        case 'relation': {
          const relationData = line.data as { id: string; [key: string]: unknown }
          if (relationData.id && existingData.collectionIds.has(relationData.id)) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: relationData.id,
              existingId: relationData.id,
              details: `Relation with ID ${relationData.id} already exists`,
              ownedByImporter: this.isOwnedByImporter(relationData.id, 'relation', existingData)
            })
          } else if (relationData.id && foreignPersonaIds.size > 0) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: relationData.id,
              details: `Relation from a different user requires new ID`,
              ownedByImporter: false
            })
          }
          break
        }

        case 'summary': {
          const summaryData = line.data as { id: string; personaId?: string; [key: string]: unknown }
          if (summaryData.id && existingData.summaryIds.has(summaryData.id)) {
            conflicts.push({
              type: 'duplicate-summary',
              line: line.lineNumber,
              originalId: summaryData.id,
              existingId: summaryData.id,
              details: `Summary with ID ${summaryData.id} already exists`,
              ownedByImporter: this.isOwnedByImporter(summaryData.id, 'summary', existingData)
            })
          } else if (summaryData.id && summaryData.personaId && foreignPersonaIds.has(summaryData.personaId)) {
            conflicts.push({
              type: 'duplicate-summary',
              line: line.lineNumber,
              originalId: summaryData.id,
              details: `Summary from a different user requires new ID`,
              ownedByImporter: false
            })
          }
          break
        }

        case 'claim': {
          const claimData = line.data as { id: string; [key: string]: unknown }
          if (claimData.id && existingData.claimIds.has(claimData.id)) {
            conflicts.push({
              type: 'duplicate-claim',
              line: line.lineNumber,
              originalId: claimData.id,
              existingId: claimData.id,
              details: `Claim with ID ${claimData.id} already exists`,
              ownedByImporter: this.isOwnedByImporter(claimData.id, 'claim', existingData)
            })
          } else if (claimData.id && foreignPersonaIds.size > 0) {
            conflicts.push({
              type: 'duplicate-claim',
              line: line.lineNumber,
              originalId: claimData.id,
              details: `Claim from a different user requires new ID`,
              ownedByImporter: false
            })
          }
          break
        }

        case 'claim_relation': {
          const relationData = line.data as { id: string; [key: string]: unknown }
          if (relationData.id && existingData.claimRelationIds.has(relationData.id)) {
            conflicts.push({
              type: 'duplicate-claim-relation',
              line: line.lineNumber,
              originalId: relationData.id,
              existingId: relationData.id,
              details: `Claim relation with ID ${relationData.id} already exists`,
              ownedByImporter: this.isOwnedByImporter(relationData.id, 'claim_relation', existingData)
            })
          } else if (relationData.id && foreignPersonaIds.size > 0) {
            conflicts.push({
              type: 'duplicate-claim-relation',
              line: line.lineNumber,
              originalId: relationData.id,
              details: `Claim relation from a different user requires new ID`,
              ownedByImporter: false
            })
          }
          break
        }
      }
    }

    return conflicts
  }

  /**
   * Resolve conflicts based on import options.
   *
   * @param conflicts - Detected conflicts
   * @param options - Import options with resolution strategies
   * @returns Array of resolutions
   */
  resolveConflicts(conflicts: Conflict[], options: ImportOptions): Resolution[] {
    const resolutions: Resolution[] = []

    for (const conflict of conflicts) {
      // Foreign data (not owned by importing user) is always copied with new IDs
      if (conflict.ownedByImporter === false) {
        resolutions.push({
          conflictType: conflict.type,
          strategy: 'create-new',
          originalId: conflict.originalId,
          newId: randomUUID(),
          action: 'create-new'
        })
        continue
      }

      let resolution: Resolution

      switch (conflict.type) {
        case 'duplicate-sequence': {
          const strategy = options.conflictResolution.sequences.duplicateSequenceIds
          resolution = {
            conflictType: conflict.type,
            strategy,
            originalId: conflict.originalId,
            action: strategy === 'skip' ? 'skip' :
                    strategy === 'replace' ? 'replace' :
                    strategy === 'merge-keyframes' ? 'merge' :
                    strategy === 'create-new' ? 'create-new' : 'skip'
          }

          if (strategy === 'create-new') {
            resolution.newId = randomUUID()
          }
          break
        }

        case 'duplicate-persona': {
          const personaStrategy = options.conflictResolution.personas
          resolution = {
            conflictType: conflict.type,
            strategy: personaStrategy,
            originalId: conflict.originalId,
            action: personaStrategy === 'skip' ? 'skip' :
                    personaStrategy === 'replace' ? 'replace' :
                    personaStrategy === 'merge' ? 'merge' :
                    personaStrategy === 'rename' ? 'rename' : 'skip'
          }
          break
        }

        case 'duplicate-object': {
          const objStrategy = options.conflictResolution.worldObjects
          resolution = {
            conflictType: conflict.type,
            strategy: objStrategy,
            originalId: conflict.originalId,
            action: objStrategy === 'skip' ? 'skip' :
                    objStrategy === 'replace' ? 'replace' :
                    objStrategy === 'merge-assignments' ? 'merge' : 'skip'
          }
          break
        }

        case 'duplicate-summary':
        case 'duplicate-claim':
        case 'duplicate-claim-relation': {
          resolution = {
            conflictType: conflict.type,
            strategy: 'skip',
            originalId: conflict.originalId,
            action: 'skip'
          }
          break
        }

        case 'missing-dependency': {
          const depStrategy = options.conflictResolution.missingDependencies
          resolution = {
            conflictType: conflict.type,
            strategy: depStrategy,
            originalId: conflict.originalId,
            action: depStrategy === 'skip-item' ? 'skip' :
                    depStrategy === 'create-placeholder' ? 'create-new' :
                    'fail'
          }
          break
        }

        case 'overlapping-frames': {
          const frameStrategy = options.conflictResolution.sequences.overlappingFrameRanges
          resolution = {
            conflictType: conflict.type,
            strategy: frameStrategy,
            originalId: conflict.originalId,
            action: frameStrategy === 'fail-import' ? 'fail' : 'skip'
          }
          break
        }

        case 'interpolation-conflict': {
          const interpStrategy = options.conflictResolution.sequences.interpolationConflicts
          resolution = {
            conflictType: conflict.type,
            strategy: interpStrategy,
            originalId: conflict.originalId,
            action: interpStrategy === 'fail-import' ? 'fail' :
                    interpStrategy === 'use-imported' ? 'replace' : 'skip'
          }
          break
        }

        default:
          resolution = {
            conflictType: conflict.type,
            strategy: 'skip',
            originalId: conflict.originalId,
            action: 'skip'
          }
      }

      resolutions.push(resolution)
    }

    return resolutions
  }

  /**
   * Remap IDs based on conflict resolutions.
   *
   * @param lines - Import lines
   * @param resolutions - Conflict resolutions
   * @returns Updated import lines with remapped IDs
   */
  remapIds(lines: ImportLine[], resolutions: Resolution[]): ImportLine[] {
    // Build ID mapping
    const idMap = new Map<string, string>()
    for (const resolution of resolutions) {
      if (resolution.newId && resolution.action === 'create-new') {
        idMap.set(resolution.originalId, resolution.newId)
      }
    }

    if (idMap.size === 0) {
      return lines
    }

    // Remap IDs in all lines
    return lines.map(line => {
      const remappedLine = { ...line }
      remappedLine.data = this.remapObjectIds(line.data, idMap)
      return remappedLine
    })
  }

  /**
   * Recursively remap IDs in an object.
   */
  private remapObjectIds(obj: unknown, idMap: Map<string, string>): ImportLine['data'] {
    if (Array.isArray(obj)) {
      return obj.map(item => this.remapObjectIds(item, idMap)) as unknown as ImportLine['data']
    } else if (obj && typeof obj === 'object') {
      const remapped: ImportLine['data'] = {}
      // GlossItem references store the target ID in `content` rather than a
      // *Id-suffixed key; detect these so the content is rewritten too.
      const glossType = (obj as Record<string, unknown>).type
      const glossRefType = (obj as Record<string, unknown>).refType
      const isObjectRef = glossType === 'objectRef' || glossType === 'annotationRef' || glossType === 'claimRef'
      const isInstanceTypeRef = glossType === 'typeRef' && typeof glossRefType === 'string' &&
        (glossRefType === 'entity-object' || glossRefType === 'event-object' ||
         glossRefType === 'time-object' || glossRefType === 'location-object' ||
         glossRefType === 'annotation' || glossRefType === 'claim')

      for (const [key, value] of Object.entries(obj)) {
        // Scalar id field
        if (key === 'id' && typeof value === 'string' && idMap.has(value)) {
          remapped[key] = idMap.get(value)
        }
        // Scalar *Id reference field
        else if (key.endsWith('Id') && typeof value === 'string' && idMap.has(value)) {
          remapped[key] = idMap.get(value)
        }
        // Array of IDs (e.g. entityIds: string[], eventIds: string[])
        else if (key.endsWith('Ids') && Array.isArray(value) && value.every(v => typeof v === 'string')) {
          remapped[key] = (value as string[]).map(v => idMap.get(v) ?? v)
        }
        // Scalar *Ids stored as a single string (defensive)
        else if (key.endsWith('Ids') && typeof value === 'string' && idMap.has(value)) {
          remapped[key] = idMap.get(value)
        }
        // GlossItem content carrying a referenced ID
        else if (key === 'content' && typeof value === 'string' && (isObjectRef || isInstanceTypeRef) && idMap.has(value)) {
          remapped[key] = idMap.get(value)
        }
        // Recurse into nested objects and arrays
        else if (typeof value === 'object' && value !== null) {
          remapped[key] = this.remapObjectIds(value, idMap)
        }
        else {
          remapped[key] = value
        }
      }
      return remapped
    }
    return obj as ImportLine['data']
  }

  /**
   * Load existing data from database for conflict detection.
   *
   * @returns Existing data
   */
  async loadExistingData(): Promise<ExistingData> {
    const [personas, videos, allWorldStates, userWorldState, annotations, summaries, claims, claimRelations, ontologies] = await Promise.all([
      this.prisma.persona.findMany({ select: { id: true, userId: true } }),
      this.prisma.video.findMany({ select: { id: true } }),
      this.prisma.worldState.findMany(),
      this.prisma.worldState.findFirst({ where: { userId: this.userId } }),
      this.prisma.annotation.findMany({ select: { id: true, personaId: true } }),
      this.prisma.videoSummary.findMany({ select: { id: true, personaId: true } }),
      this.prisma.claim.findMany({ select: { id: true, summaryId: true } }),
      this.prisma.claimRelation.findMany({ select: { id: true, sourceClaimId: true } }),
      this.prisma.ontology.findMany({ select: { personaId: true } })
    ])

    // Build ownership sets
    const ownedPersonaIds = new Set(
      personas.filter(p => p.userId === this.userId).map(p => p.id)
    )
    const ownedSummaryIds = new Set(
      summaries.filter(s => ownedPersonaIds.has(s.personaId)).map(s => s.id)
    )
    const ownedClaimIds = new Set(
      claims.filter(c => ownedSummaryIds.has(c.summaryId)).map(c => c.id)
    )
    const ownedClaimRelationIds = new Set(
      claimRelations.filter(r => ownedClaimIds.has(r.sourceClaimId)).map(r => r.id)
    )
    const ownedAnnotationIds = new Set(
      annotations
        .filter(a => a.personaId ? ownedPersonaIds.has(a.personaId) : false)
        .map(a => a.id)
    )

    // Extract owned world state object IDs
    const ownedEntityIds = new Set<string>()
    const ownedEventIds = new Set<string>()
    const ownedTimeIds = new Set<string>()
    const ownedCollectionIds = new Set<string>()
    if (userWorldState) {
      const uws = userWorldState as unknown as {
        entities?: Prisma.JsonValue; events?: Prisma.JsonValue; times?: Prisma.JsonValue
        entityCollections?: Prisma.JsonValue; eventCollections?: Prisma.JsonValue; timeCollections?: Prisma.JsonValue
      }
      for (const entity of (Array.isArray(uws.entities) ? uws.entities : [])) {
        if (entity && typeof entity === 'object' && 'id' in entity) ownedEntityIds.add(entity.id as string)
      }
      for (const event of (Array.isArray(uws.events) ? uws.events : [])) {
        if (event && typeof event === 'object' && 'id' in event) ownedEventIds.add(event.id as string)
      }
      for (const time of (Array.isArray(uws.times) ? uws.times : [])) {
        if (time && typeof time === 'object' && 'id' in time) ownedTimeIds.add(time.id as string)
      }
      for (const arr of [uws.entityCollections, uws.eventCollections, uws.timeCollections]) {
        if (Array.isArray(arr)) {
          for (const col of arr) {
            if (col && typeof col === 'object' && 'id' in col) ownedCollectionIds.add(col.id as string)
          }
        }
      }
    }

    const existingData: ExistingData = {
      personaIds: new Set(personas.map(p => p.id)),
      entityIds: new Set<string>(),
      eventIds: new Set<string>(),
      timeIds: new Set<string>(),
      collectionIds: new Set<string>(),
      annotationIds: new Set(annotations.map(a => a.id)),
      videoIds: new Set(videos.map(v => v.id)),
      summaryIds: new Set(summaries.map(s => s.id)),
      claimIds: new Set(claims.map(c => c.id)),
      claimRelationIds: new Set(claimRelations.map(r => r.id)),
      ontologyPersonaIds: new Set(ontologies.map(o => o.personaId)),
      ownedPersonaIds,
      ownedAnnotationIds,
      ownedSummaryIds,
      ownedClaimIds,
      ownedClaimRelationIds,
      ownedEntityIds,
      ownedEventIds,
      ownedTimeIds,
      ownedCollectionIds,
      ownedWorldStateId: userWorldState?.id ?? null,
    }

    // Extract IDs from ALL world states for global conflict detection
    for (const worldState of allWorldStates) {
      const ws = worldState as unknown as {
        entities?: Prisma.JsonValue
        events?: Prisma.JsonValue
        times?: Prisma.JsonValue
        entityCollections?: Prisma.JsonValue
        eventCollections?: Prisma.JsonValue
        timeCollections?: Prisma.JsonValue
      }

      if (Array.isArray(ws.entities)) {
        for (const entity of ws.entities) {
          if (entity && typeof entity === 'object' && 'id' in entity) {
            existingData.entityIds.add(entity.id as string)
          }
        }
      }
      if (Array.isArray(ws.events)) {
        for (const event of ws.events) {
          if (event && typeof event === 'object' && 'id' in event) {
            existingData.eventIds.add(event.id as string)
          }
        }
      }
      if (Array.isArray(ws.times)) {
        for (const time of ws.times) {
          if (time && typeof time === 'object' && 'id' in time) {
            existingData.timeIds.add(time.id as string)
          }
        }
      }
      for (const collectionArray of [ws.entityCollections, ws.eventCollections, ws.timeCollections]) {
        if (Array.isArray(collectionArray)) {
          for (const collection of collectionArray) {
            if (collection && typeof collection === 'object' && 'id' in collection) {
              existingData.collectionIds.add(collection.id as string)
            }
          }
        }
      }
    }

    return existingData
  }

  /**
   * Execute import with all lines and options.
   *
   * @param lines - Import lines
   * @param options - Import options
   * @returns Import result
   */
  /**
   * Detect whether the import contains data from a different user.
   *
   * Priority order:
   *   1. Provenance `metadata` line with `exporterUserId` (definitive,
   *      present on exports from this version onward).
   *   2. Any `persona` line whose `userId` differs from the importer
   *      (legacy fallback for older exports).
   *   3. Any annotation carrying a `userId` that differs (covers exports
   *      containing only object annotations with no persona).
   *
   * Returning `true` forces regeneration of every ID in the batch. When
   * the batch has no persona lines AND no metadata AND no userId-bearing
   * annotations (i.e. a legacy export), we return `false` to preserve
   * the existing same-user re-import UX.
   */
  isCrossUserImport(lines: ImportLine[]): boolean {
    for (const line of lines) {
      if (line.type === 'metadata') {
        const exporterUserId = (line.data as { exporterUserId?: unknown }).exporterUserId
        if (typeof exporterUserId === 'string' && exporterUserId.length > 0) {
          return exporterUserId !== this.userId
        }
      }
    }
    for (const line of lines) {
      if (line.type === 'persona' && typeof line.data.userId === 'string') {
        if (line.data.userId !== this.userId) return true
      }
    }
    for (const line of lines) {
      if (line.type === 'annotation') {
        const annUserId = (line.data as { userId?: unknown }).userId
        if (typeof annUserId === 'string' && annUserId !== this.userId) return true
      }
    }
    return false
  }

  /**
   * Generate create-new resolutions for all items that don't already have
   * a conflict resolution. Used for cross-user imports where ALL IDs must
   * be regenerated regardless of whether they collide with existing data.
   */
  generateCrossUserResolutions(lines: ImportLine[], existingResolutions: Resolution[]): Resolution[] {
    // Only treat items with an existing create-new resolution as already resolved.
    // Skip/replace/merge resolutions from non-ID conflicts (e.g. missing-dependency)
    // must not block ID regeneration for cross-user imports.
    const resolvedIds = new Set(
      existingResolutions.filter(r => r.action === 'create-new').map(r => r.originalId)
    )
    const additionalResolutions: Resolution[] = []

    for (const line of lines) {
      const id = line.data.id as string | undefined
      if (!id || resolvedIds.has(id)) continue

      let conflictType: Resolution['conflictType']
      switch (line.type) {
        case 'persona':
          conflictType = 'duplicate-persona'
          break
        case 'annotation':
          conflictType = 'duplicate-sequence'
          break
        case 'entity':
        case 'event':
        case 'time':
        case 'entity_collection':
        case 'entityCollection':
        case 'event_collection':
        case 'eventCollection':
        case 'time_collection':
        case 'timeCollection':
        case 'relation':
          conflictType = 'duplicate-object'
          break
        case 'summary':
          conflictType = 'duplicate-summary'
          break
        case 'claim':
          conflictType = 'duplicate-claim'
          break
        case 'claim_relation':
          conflictType = 'duplicate-claim-relation'
          break
        default:
          continue
      }

      additionalResolutions.push({
        conflictType,
        strategy: 'create-new',
        originalId: id,
        newId: randomUUID(),
        action: 'create-new'
      })
      resolvedIds.add(id)
    }

    return additionalResolutions
  }

  async executeImport(lines: ImportLine[], options: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      summary: {
        totalLines: lines.length,
        processedLines: 0,
        importedItems: {
          personas: 0,
          ontologies: 0,
          entities: 0,
          events: 0,
          times: 0,
          entityCollections: 0,
          eventCollections: 0,
          timeCollections: 0,
          relations: 0,
          summaries: 0,
          claims: 0,
          claimRelations: 0,
          annotations: 0,
          totalKeyframes: 0,
          totalInterpolatedFrames: 0,
          singleKeyframeSequences: 0
        },
        skippedItems: {
          personas: 0,
          worldObjects: 0,
          summaries: 0,
          claims: 0,
          annotations: 0,
          sequenceAnnotations: 0
        }
      },
      warnings: [],
      errors: [],
      conflicts: []
    }

    // Load existing data
    const existingData = await this.loadExistingData()

    // Detect conflicts
    const conflicts = await this.detectConflicts(lines, existingData)
    const resolutions = this.resolveConflicts(conflicts, options)

    // For cross-user imports, regenerate ALL IDs (not just conflicting ones)
    const crossUser = this.isCrossUserImport(lines)
    if (crossUser) {
      const additionalResolutions = this.generateCrossUserResolutions(lines, resolutions)
      resolutions.push(...additionalResolutions)
    }

    // Check for fail actions
    const failResolutions = resolutions.filter(r => r.action === 'fail')
    if (failResolutions.length > 0 && options.validation.strictMode) {
      result.errors.push({
        line: 0,
        type: 'conflict',
        message: `Import failed due to ${failResolutions.length} unresolvable conflicts`,
        data: failResolutions
      })
      return result
    }

    // Remap IDs
    const remappedLines = this.remapIds(lines, resolutions)

    // Build resolution map for quick lookup
    const resolutionMap = new Map<string, Resolution>()
    for (const resolution of resolutions) {
      resolutionMap.set(resolution.originalId, resolution)
    }

    // Store conflicts with resolutions
    result.conflicts = conflicts.map(c => ({
      ...c,
      resolution: resolutionMap.get(c.originalId)?.strategy || 'none'
    }))

    // Execute import in dependency order
    try {
      if (options.transaction.atomic) {
        await this.prisma.$transaction(async (tx) => {
          await this.importLines(remappedLines, resolutionMap, result, options, tx as PrismaClient)
        })
      } else {
        await this.importLines(remappedLines, resolutionMap, result, options, this.prisma)
      }

      result.success = true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push({
        line: 0,
        type: 'execution',
        message: `Import execution failed: ${errorMessage}`,
        data: error
      })
      result.success = false
    }

    return result
  }

  /**
   * Import lines in dependency order.
   * Order: personas -> ontologies -> world state -> summaries -> claims -> claim relations -> annotations
   */
  private async importLines(
    lines: ImportLine[],
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient
  ): Promise<void> {
    // Group lines by type for dependency ordering
    const personaLines = lines.filter(l => l.type === 'persona')
    const ontologyLines = lines.filter(l => l.type === 'ontology')
    const entityLines = lines.filter(l => l.type === 'entity')
    const eventLines = lines.filter(l => l.type === 'event')
    const timeLines = lines.filter(l => l.type === 'time')
    const entityCollectionLines = lines.filter(l => l.type === 'entity_collection' || l.type === 'entityCollection')
    const eventCollectionLines = lines.filter(l => l.type === 'event_collection' || l.type === 'eventCollection')
    const timeCollectionLines = lines.filter(l => l.type === 'time_collection' || l.type === 'timeCollection')
    const relationLines = lines.filter(l => l.type === 'relation')
    const summaryLines = lines.filter(l => l.type === 'summary')
    const claimLines = lines.filter(l => l.type === 'claim')
    const claimRelationLines = lines.filter(l => l.type === 'claim_relation')
    const annotationLines = lines.filter(l => l.type === 'annotation')

    // Track imported IDs for dependency resolution
    const importedIds = {
      personas: new Set<string>(),
      summaries: new Set<string>(),
      claims: new Set<string>()
    }

    // 1. Import personas (no dependencies)
    for (const line of personaLines) {
      await this.importPersona(line, resolutionMap, result, options, tx, importedIds)
    }

    // 2. Import ontologies (depend on personas)
    for (const line of ontologyLines) {
      await this.importOntology(line, resolutionMap, result, options, tx, importedIds)
    }

    // 3. Import world state objects
    // Get or create world state for the importing user
    let worldState = await tx.worldState.findFirst({ where: { userId: this.userId } })
    if (!worldState) {
      worldState = await tx.worldState.create({
        data: {
          userId: this.userId,
          entities: [],
          events: [],
          times: [],
          entityCollections: [],
          eventCollections: [],
          timeCollections: [],
          relations: []
        }
      })
    }

    // Import entities
    for (const line of entityLines) {
      await this.importWorldStateItem(line, 'entity', worldState.id, resolutionMap, result, options, tx)
    }

    // Import events
    for (const line of eventLines) {
      await this.importWorldStateItem(line, 'event', worldState.id, resolutionMap, result, options, tx)
    }

    // Import times
    for (const line of timeLines) {
      await this.importWorldStateItem(line, 'time', worldState.id, resolutionMap, result, options, tx)
    }

    // Import collections
    for (const line of entityCollectionLines) {
      await this.importWorldStateItem(line, 'entityCollection', worldState.id, resolutionMap, result, options, tx)
    }
    for (const line of eventCollectionLines) {
      await this.importWorldStateItem(line, 'eventCollection', worldState.id, resolutionMap, result, options, tx)
    }
    for (const line of timeCollectionLines) {
      await this.importWorldStateItem(line, 'timeCollection', worldState.id, resolutionMap, result, options, tx)
    }

    // Import relations
    for (const line of relationLines) {
      await this.importWorldStateItem(line, 'relation', worldState.id, resolutionMap, result, options, tx)
    }

    // 4. Import summaries (depend on videos and personas)
    for (const line of summaryLines) {
      await this.importSummary(line, resolutionMap, result, options, tx, importedIds)
    }

    // 5. Import claims (depend on summaries)
    for (const line of claimLines) {
      await this.importClaim(line, resolutionMap, result, options, tx, importedIds)
    }

    // 6. Import claim relations (depend on claims)
    for (const line of claimRelationLines) {
      await this.importClaimRelation(line, resolutionMap, result, options, tx, importedIds)
    }

    // 7. Import annotations (depend on videos, personas)
    for (const line of annotationLines) {
      await this.importAnnotation(line, resolutionMap, result, options, tx)
    }
  }

  /**
   * Import a persona.
   */
  private async importPersona(
    line: ImportLine,
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient,
    importedIds: { personas: Set<string>; summaries: Set<string>; claims: Set<string> }
  ): Promise<void> {
    const personaId = line.data.id
    if (!personaId) {
      result.errors.push({
        line: line.lineNumber,
        type: 'validation',
        message: 'Persona missing required id field'
      })
      return
    }

    const resolution = resolutionMap.get(personaId)
    if (resolution && resolution.action === 'skip') {
      result.summary.skippedItems.personas++
      return
    }

    try {
      const validation = this.validateLine(line)
      if (!validation.valid) {
        if (options.validation.strictMode) {
          throw new ValidationError(`Validation failed: ${validation.errors.join(', ')}`, { errors: validation.errors })
        }
        result.warnings.push({
          line: line.lineNumber,
          type: 'validation',
          message: validation.errors.join(', ')
        })
        result.summary.skippedItems.personas++
        return
      }

      // Check if persona already exists
      const existingPersona = await tx.persona.findUnique({ where: { id: personaId } })

      if (existingPersona && resolution?.action === 'replace') {
        await tx.persona.update({
          where: { id: personaId },
          data: {
            name: line.data.name as string,
            role: line.data.role as string,
            informationNeed: line.data.informationNeed as string,
            details: (line.data.details as string) || '',
            updatedAt: new Date()
          }
        })
      } else if (!existingPersona) {
        await tx.persona.create({
          data: {
            id: personaId,
            userId: this.userId,
            name: line.data.name as string,
            role: line.data.role as string,
            informationNeed: line.data.informationNeed as string,
            details: (line.data.details as string) || '',
            createdAt: line.data.createdAt ? new Date(line.data.createdAt as string) : new Date(),
            updatedAt: line.data.updatedAt ? new Date(line.data.updatedAt as string) : new Date()
          }
        })
      }

      importedIds.personas.add(personaId)
      result.summary.importedItems.personas++
      result.summary.processedLines++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push({
        line: line.lineNumber,
        type: 'import',
        message: `Failed to import persona: ${errorMessage}`,
        data: line.data
      })
      if (options.transaction.atomic) throw error
    }
  }

  /**
   * Import an ontology.
   */
  private async importOntology(
    line: ImportLine,
    _resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient,
    _importedIds: { personas: Set<string>; summaries: Set<string>; claims: Set<string> }
  ): Promise<void> {
    const personaId = line.data.personaId
    if (!personaId) {
      result.errors.push({
        line: line.lineNumber,
        type: 'validation',
        message: 'Ontology missing required personaId field'
      })
      return
    }

    try {
      // Check if ontology already exists for this persona
      const existingOntology = await tx.ontology.findUnique({ where: { personaId } })

      const ontologyData = {
        entityTypes: (line.data.entityTypes as Prisma.InputJsonValue) || [],
        eventTypes: (line.data.eventTypes as Prisma.InputJsonValue) || [],
        roleTypes: (line.data.roleTypes as Prisma.InputJsonValue) || [],
        relationTypes: (line.data.relationTypes as Prisma.InputJsonValue) || [],
        updatedAt: new Date()
      }

      if (existingOntology) {
        // Merge or replace based on strategy
        await tx.ontology.update({
          where: { personaId },
          data: ontologyData
        })
      } else {
        await tx.ontology.create({
          data: {
            personaId,
            ...ontologyData,
            createdAt: new Date()
          }
        })
      }

      result.summary.importedItems.ontologies++
      result.summary.processedLines++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push({
        line: line.lineNumber,
        type: 'import',
        message: `Failed to import ontology: ${errorMessage}`,
        data: line.data
      })
      if (options.transaction.atomic) throw error
    }
  }

  /**
   * Import a world state item (entity, event, time, collection, relation).
   */
  private async importWorldStateItem(
    line: ImportLine,
    itemType: 'entity' | 'event' | 'time' | 'entityCollection' | 'eventCollection' | 'timeCollection' | 'relation',
    worldStateId: string,
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient
  ): Promise<void> {
    const itemId = line.data.id
    if (!itemId) {
      result.errors.push({
        line: line.lineNumber,
        type: 'validation',
        message: `${itemType} missing required id field`
      })
      return
    }

    const resolution = resolutionMap.get(itemId)
    if (resolution && resolution.action === 'skip') {
      result.summary.skippedItems.worldObjects++
      return
    }

    try {
      // Get current world state
      const worldState = await tx.worldState.findUnique({ where: { id: worldStateId } })
      if (!worldState) {
        throw new NotFoundError('World state', worldStateId)
      }

      // Determine which array to update
      const fieldMap: Record<string, string> = {
        'entity': 'entities',
        'event': 'events',
        'time': 'times',
        'entityCollection': 'entityCollections',
        'eventCollection': 'eventCollections',
        'timeCollection': 'timeCollections',
        'relation': 'relations'
      }
      const fieldName = fieldMap[itemType]

      // Get current array
      const currentArray = (worldState[fieldName as keyof typeof worldState] as Prisma.JsonValue) || []
      const items = Array.isArray(currentArray) ? [...currentArray] : []

      // Check if item already exists
      const existingIndex = items.findIndex(
        (item) => item && typeof item === 'object' && 'id' in item && item.id === itemId
      )

      if (existingIndex >= 0) {
        if (resolution?.action === 'replace') {
          items[existingIndex] = line.data as Prisma.JsonValue
        }
        // Otherwise skip (already exists)
      } else {
        items.push(line.data as Prisma.JsonValue)
      }

      // Update world state
      await tx.worldState.update({
        where: { id: worldStateId },
        data: {
          [fieldName]: items as Prisma.InputJsonValue,
          updatedAt: new Date()
        }
      })

      // Update result counts
      switch (itemType) {
        case 'entity':
          result.summary.importedItems.entities++
          break
        case 'event':
          result.summary.importedItems.events++
          break
        case 'time':
          result.summary.importedItems.times++
          break
        case 'entityCollection':
          result.summary.importedItems.entityCollections++
          break
        case 'eventCollection':
          result.summary.importedItems.eventCollections++
          break
        case 'timeCollection':
          result.summary.importedItems.timeCollections++
          break
        case 'relation':
          result.summary.importedItems.relations++
          break
      }
      result.summary.processedLines++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push({
        line: line.lineNumber,
        type: 'import',
        message: `Failed to import ${itemType}: ${errorMessage}`,
        data: line.data
      })
      if (options.transaction.atomic) throw error
    }
  }

  /**
   * Import a video summary.
   */
  private async importSummary(
    line: ImportLine,
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient,
    importedIds: { personas: Set<string>; summaries: Set<string>; claims: Set<string> }
  ): Promise<void> {
    const summaryId = line.data.id
    if (!summaryId) {
      result.errors.push({
        line: line.lineNumber,
        type: 'validation',
        message: 'Summary missing required id field'
      })
      return
    }

    const resolution = resolutionMap.get(summaryId)
    if (resolution && resolution.action === 'skip') {
      result.summary.skippedItems.summaries++
      return
    }

    try {
      const validation = this.validateLine(line)
      if (!validation.valid) {
        if (options.validation.strictMode) {
          throw new ValidationError(`Validation failed: ${validation.errors.join(', ')}`, { errors: validation.errors })
        }
        result.warnings.push({
          line: line.lineNumber,
          type: 'validation',
          message: validation.errors.join(', ')
        })
        result.summary.skippedItems.summaries++
        return
      }

      // Check if summary already exists
      const existingSummary = await tx.videoSummary.findUnique({ where: { id: summaryId } })

      const summaryData: Prisma.VideoSummaryUncheckedUpdateInput = {
        videoId: line.data.videoId as string,
        personaId: line.data.personaId as string,
        summary: (line.data.summary as Prisma.InputJsonValue) || [],
        visualAnalysis: (line.data.visualAnalysis as string) || undefined,
        audioTranscript: (line.data.audioTranscript as string) || undefined,
        keyFrames: line.data.keyFrames ? (line.data.keyFrames as Prisma.InputJsonValue) : Prisma.JsonNull,
        confidence: (line.data.confidence as number) || undefined,
        transcriptJson: line.data.transcriptJson ? (line.data.transcriptJson as Prisma.InputJsonValue) : Prisma.JsonNull,
        audioLanguage: (line.data.audioLanguage as string) || undefined,
        speakerCount: (line.data.speakerCount as number) || undefined,
        audioModelUsed: (line.data.audioModelUsed as string) || undefined,
        visualModelUsed: (line.data.visualModelUsed as string) || undefined,
        fusionStrategy: (line.data.fusionStrategy as string) || undefined,
        comment: (line.data.comment as string) || undefined,
        createdBy: (line.data.createdBy as string) || undefined,
        updatedAt: new Date()
      }

      if (existingSummary && resolution?.action === 'replace') {
        await tx.videoSummary.update({
          where: { id: summaryId },
          data: summaryData
        })
      } else if (!existingSummary) {
        await tx.videoSummary.create({
          data: {
            id: summaryId,
            videoId: line.data.videoId as string,
            personaId: line.data.personaId as string,
            summary: (line.data.summary as Prisma.InputJsonValue) || [],
            visualAnalysis: (line.data.visualAnalysis as string) || undefined,
            audioTranscript: (line.data.audioTranscript as string) || undefined,
            keyFrames: line.data.keyFrames ? (line.data.keyFrames as Prisma.InputJsonValue) : Prisma.JsonNull,
            confidence: (line.data.confidence as number) || undefined,
            transcriptJson: line.data.transcriptJson ? (line.data.transcriptJson as Prisma.InputJsonValue) : Prisma.JsonNull,
            audioLanguage: (line.data.audioLanguage as string) || undefined,
            speakerCount: (line.data.speakerCount as number) || undefined,
            audioModelUsed: (line.data.audioModelUsed as string) || undefined,
            visualModelUsed: (line.data.visualModelUsed as string) || undefined,
            fusionStrategy: (line.data.fusionStrategy as string) || undefined,
            comment: (line.data.comment as string) || undefined,
            createdBy: (line.data.createdBy as string) || undefined,
            createdAt: line.data.createdAt ? new Date(line.data.createdAt as string) : new Date()
          }
        })
      }

      importedIds.summaries.add(summaryId)
      result.summary.importedItems.summaries++
      result.summary.processedLines++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push({
        line: line.lineNumber,
        type: 'import',
        message: `Failed to import summary: ${errorMessage}`,
        data: line.data
      })
      if (options.transaction.atomic) throw error
    }
  }

  /**
   * Import a claim.
   */
  private async importClaim(
    line: ImportLine,
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient,
    importedIds: { personas: Set<string>; summaries: Set<string>; claims: Set<string> }
  ): Promise<void> {
    const claimId = line.data.id
    if (!claimId) {
      result.errors.push({
        line: line.lineNumber,
        type: 'validation',
        message: 'Claim missing required id field'
      })
      return
    }

    const resolution = resolutionMap.get(claimId)
    if (resolution && resolution.action === 'skip') {
      result.summary.skippedItems.claims++
      return
    }

    try {
      const validation = this.validateLine(line)
      if (!validation.valid) {
        if (options.validation.strictMode) {
          throw new ValidationError(`Validation failed: ${validation.errors.join(', ')}`, { errors: validation.errors })
        }
        result.warnings.push({
          line: line.lineNumber,
          type: 'validation',
          message: validation.errors.join(', ')
        })
        result.summary.skippedItems.claims++
        return
      }

      // Check if claim already exists
      const existingClaim = await tx.claim.findUnique({ where: { id: claimId } })

      const claimData: Prisma.ClaimUncheckedUpdateInput = {
        summaryId: line.data.summaryId as string,
        summaryType: (line.data.summaryType as string) || 'video',
        text: line.data.text as string,
        gloss: (line.data.gloss as Prisma.InputJsonValue) || [],
        parentClaimId: (line.data.parentClaimId as string) || undefined,
        textSpans: line.data.textSpans ? (line.data.textSpans as Prisma.InputJsonValue) : Prisma.JsonNull,
        claimerType: (line.data.claimerType as string) || undefined,
        claimerGloss: line.data.claimerGloss ? (line.data.claimerGloss as Prisma.InputJsonValue) : Prisma.JsonNull,
        claimRelation: (line.data.claimRelation as string) || undefined,
        claimEventId: (line.data.claimEventId as string) || undefined,
        claimTimeId: (line.data.claimTimeId as string) || undefined,
        claimLocationId: (line.data.claimLocationId as string) || undefined,
        confidence: (line.data.confidence as number) || undefined,
        modelUsed: (line.data.modelUsed as string) || undefined,
        extractionStrategy: (line.data.extractionStrategy as string) || undefined,
        audio: line.data.audio !== undefined && line.data.audio !== null 
          ? (Array.isArray(line.data.audio) ? line.data.audio as Prisma.InputJsonValue : Prisma.JsonNull)
          : Prisma.JsonNull,
        video: line.data.video !== undefined && line.data.video !== null
          ? (Array.isArray(line.data.video) ? line.data.video as Prisma.InputJsonValue : Prisma.JsonNull)
          : Prisma.JsonNull,
        metadata: line.data.metadata !== undefined && line.data.metadata !== null
          ? (Array.isArray(line.data.metadata) ? line.data.metadata as Prisma.InputJsonValue : Prisma.JsonNull)
          : Prisma.JsonNull,
        comment: (line.data.comment as string) || undefined,
        createdBy: (line.data.createdBy as string) || undefined,
        updatedAt: new Date()
      }

      if (existingClaim && resolution?.action === 'replace') {
        await tx.claim.update({
          where: { id: claimId },
          data: claimData
        })
      } else if (!existingClaim) {
        await tx.claim.create({
          data: {
            id: claimId,
            summaryId: line.data.summaryId as string,
            summaryType: (line.data.summaryType as string) || 'video',
            text: line.data.text as string,
            gloss: (line.data.gloss as Prisma.InputJsonValue) || [],
            parentClaimId: (line.data.parentClaimId as string) || undefined,
            textSpans: line.data.textSpans ? (line.data.textSpans as Prisma.InputJsonValue) : Prisma.JsonNull,
            claimerType: (line.data.claimerType as string) || undefined,
            claimerGloss: line.data.claimerGloss ? (line.data.claimerGloss as Prisma.InputJsonValue) : Prisma.JsonNull,
            claimRelation: (line.data.claimRelation as string) || undefined,
            claimEventId: (line.data.claimEventId as string) || undefined,
            claimTimeId: (line.data.claimTimeId as string) || undefined,
            claimLocationId: (line.data.claimLocationId as string) || undefined,
            confidence: (line.data.confidence as number) || undefined,
            modelUsed: (line.data.modelUsed as string) || undefined,
            extractionStrategy: (line.data.extractionStrategy as string) || undefined,
            audio: line.data.audio !== undefined && line.data.audio !== null 
              ? (Array.isArray(line.data.audio) ? line.data.audio as Prisma.InputJsonValue : Prisma.JsonNull)
              : Prisma.JsonNull,
            video: line.data.video !== undefined && line.data.video !== null
              ? (Array.isArray(line.data.video) ? line.data.video as Prisma.InputJsonValue : Prisma.JsonNull)
              : Prisma.JsonNull,
            metadata: line.data.metadata !== undefined && line.data.metadata !== null
              ? (Array.isArray(line.data.metadata) ? line.data.metadata as Prisma.InputJsonValue : Prisma.JsonNull)
              : Prisma.JsonNull,
            comment: (line.data.comment as string) || undefined,
            createdBy: (line.data.createdBy as string) || undefined,
            createdAt: line.data.createdAt ? new Date(line.data.createdAt as string) : new Date()
          }
        })
      }

      importedIds.claims.add(claimId)
      result.summary.importedItems.claims++
      result.summary.processedLines++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push({
        line: line.lineNumber,
        type: 'import',
        message: `Failed to import claim: ${errorMessage}`,
        data: line.data
      })
      if (options.transaction.atomic) throw error
    }
  }

  /**
   * Import a claim relation.
   */
  private async importClaimRelation(
    line: ImportLine,
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient,
    _importedIds: { personas: Set<string>; summaries: Set<string>; claims: Set<string> }
  ): Promise<void> {
    const relationId = line.data.id
    if (!relationId) {
      result.errors.push({
        line: line.lineNumber,
        type: 'validation',
        message: 'ClaimRelation missing required id field'
      })
      return
    }

    const resolution = resolutionMap.get(relationId)
    if (resolution && resolution.action === 'skip') {
      result.summary.skippedItems.claims++
      return
    }

    try {
      const validation = this.validateLine(line)
      if (!validation.valid) {
        if (options.validation.strictMode) {
          throw new ValidationError(`Validation failed: ${validation.errors.join(', ')}`, { errors: validation.errors })
        }
        result.warnings.push({
          line: line.lineNumber,
          type: 'validation',
          message: validation.errors.join(', ')
        })
        return
      }

      // Check if claim relation already exists
      const existingRelation = await tx.claimRelation.findUnique({ where: { id: relationId } })

      const relationData: Prisma.ClaimRelationUncheckedUpdateInput = {
        sourceClaimId: line.data.sourceClaimId as string,
        targetClaimId: line.data.targetClaimId as string,
        relationTypeId: line.data.relationTypeId as string,
        sourceSpans: line.data.sourceSpans ? (line.data.sourceSpans as Prisma.InputJsonValue) : Prisma.JsonNull,
        targetSpans: line.data.targetSpans ? (line.data.targetSpans as Prisma.InputJsonValue) : Prisma.JsonNull,
        confidence: (line.data.confidence as number) || undefined,
        notes: (line.data.notes as string) || undefined,
        createdBy: (line.data.createdBy as string) || undefined,
        updatedAt: new Date()
      }

      if (existingRelation && resolution?.action === 'replace') {
        await tx.claimRelation.update({
          where: { id: relationId },
          data: relationData
        })
      } else if (!existingRelation) {
        await tx.claimRelation.create({
          data: {
            id: relationId,
            sourceClaimId: line.data.sourceClaimId as string,
            targetClaimId: line.data.targetClaimId as string,
            relationTypeId: line.data.relationTypeId as string,
            sourceSpans: line.data.sourceSpans ? (line.data.sourceSpans as Prisma.InputJsonValue) : Prisma.JsonNull,
            targetSpans: line.data.targetSpans ? (line.data.targetSpans as Prisma.InputJsonValue) : Prisma.JsonNull,
            confidence: (line.data.confidence as number) || undefined,
            notes: (line.data.notes as string) || undefined,
            createdBy: (line.data.createdBy as string) || undefined,
            createdAt: line.data.createdAt ? new Date(line.data.createdAt as string) : new Date()
          }
        })
      }

      result.summary.importedItems.claimRelations++
      result.summary.processedLines++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push({
        line: line.lineNumber,
        type: 'import',
        message: `Failed to import claim relation: ${errorMessage}`,
        data: line.data
      })
      if (options.transaction.atomic) throw error
    }
  }

  /**
   * Import an annotation.
   */
  private async importAnnotation(
    line: ImportLine,
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient
  ): Promise<void> {
    const annotationId = line.data.id
    if (!annotationId) {
      result.errors.push({
        line: line.lineNumber,
        type: 'validation',
        message: 'Annotation missing required id field'
      })
      return
    }

    const resolution = resolutionMap.get(annotationId)
    if (resolution && resolution.action === 'skip') {
      result.summary.skippedItems.annotations++
      return
    }

    try {
      const validation = this.validateLine(line)
      if (!validation.valid) {
        if (options.validation.strictMode) {
          throw new ValidationError(`Validation failed: ${validation.errors.join(', ')}`, { errors: validation.errors })
        }
        result.warnings.push({
          line: line.lineNumber,
          type: 'validation',
          message: validation.errors.join(', ')
        })
        result.summary.skippedItems.annotations++
        return
      }

      for (const warning of validation.warnings) {
        result.warnings.push({
          line: line.lineNumber,
          type: 'validation',
          message: warning
        })
      }

      const annotation = line.data as AnnotationData
      const sequence = annotation.boundingBoxSequence

      // Count keyframes
      const keyframes = sequence?.boxes?.filter((b) => b.isKeyframe ?? false) || []
      result.summary.importedItems.totalKeyframes += keyframes.length

      if (keyframes.length === 1) {
        result.summary.importedItems.singleKeyframeSequences++
      }

      // Create or update annotation
      if (resolution && resolution.action === 'replace') {
        await tx.annotation.delete({
          where: { id: annotation.id }
        })
      }

      // Store the boundingBoxSequence in the frames field. The userId field
      // is always populated with the importing user so that listing endpoints
      // (which scope object annotations by userId) can return the row;
      // otherwise an imported object annotation has personaId=null AND
      // userId=null and disappears from the importer's All Annotations tab.
      //
      // Picks `label` and `linkType` from whichever `linked*Id` the export
      // line carries, so event/time/location-linked object annotations
      // round-trip correctly. Previously only `linkedEntityId` was honoured,
      // which silently flattened every object annotation into an
      // entity-linked row.
      const annotationType = annotation.annotationType ?? 'type'
      let label: string
      let linkType: string | null = null
      if (annotationType === 'object') {
        if (annotation.linkedEntityId) {
          label = annotation.linkedEntityId
          linkType = 'entity'
        } else if (annotation.linkedEventId) {
          label = annotation.linkedEventId
          linkType = 'event'
        } else if (annotation.linkedTimeId) {
          label = annotation.linkedTimeId
          linkType = 'time'
        } else if (annotation.linkedLocationId) {
          label = annotation.linkedLocationId
          linkType = 'location'
        } else {
          label = ''
        }
      } else {
        label = annotation.typeId ?? ''
      }

      await tx.annotation.create({
        data: {
          id: annotation.id,
          videoId: annotation.videoId,
          personaId: annotation.personaId || null,
          userId: this.userId,
          type: annotationType,
          label,
          linkType,
          frames: annotation.boundingBoxSequence as Prisma.InputJsonValue,
          confidence: annotation.confidence,
          source: 'import',
          createdAt: annotation.createdAt ? new Date(annotation.createdAt) : new Date(),
          updatedAt: annotation.updatedAt ? new Date(annotation.updatedAt) : new Date()
        }
      })

      result.summary.importedItems.annotations++
      result.summary.processedLines++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push({
        line: line.lineNumber,
        type: 'import',
        message: `Failed to import annotation: ${errorMessage}`,
        data: line.data
      })
      if (options.transaction.atomic) throw error
    }
  }
}
