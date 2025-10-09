import { PrismaClient, Prisma } from '@prisma/client'
import { randomUUID } from 'crypto'
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

  constructor(prisma: PrismaClient) {
    this.validator = new SequenceValidator()
    this.prisma = prisma
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
        throw new Error('Line must have "type" and "data" fields')
      }

      return {
        type: parsed.type,
        data: parsed.data,
        lineNumber
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to parse line ${lineNumber}: ${errorMessage}`)
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

      case 'ontology':
        // Validate ontology structure
        if (!line.data.personas || !Array.isArray(line.data.personas)) {
          errors.push('Ontology missing required field: personas (array)')
        }
        if (!line.data.personaOntologies || !Array.isArray(line.data.personaOntologies)) {
          errors.push('Ontology missing required field: personaOntologies (array)')
        }
        break

      case 'video':
        if (!line.data.id) {
          errors.push('Video missing required field: id')
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
  async detectConflicts(lines: ImportLine[], existingData: ExistingData): Promise<Conflict[]> {
    const conflicts: Conflict[] = []

    for (const line of lines) {
      switch (line.type) {
        case 'annotation': {
          const annotationData = line.data as AnnotationData
          // Check for duplicate annotation ID
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
              interpolationType: (sequence.interpolationSegments as Array<{ type?: string }>)[0]?.type
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
              details: `Entity with ID ${entityData.id} already exists`
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
              details: `Event with ID ${eventData.id} already exists`
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
      for (const [key, value] of Object.entries(obj)) {
        // Remap ID fields
        if (key === 'id' && typeof value === 'string' && idMap.has(value)) {
          remapped[key] = idMap.get(value)
        }
        // Remap reference fields
        else if ((key.endsWith('Id') || key.endsWith('Ids')) && typeof value === 'string' && idMap.has(value)) {
          remapped[key] = idMap.get(value)
        }
        // Recurse into nested objects
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
    const [personas, videos, worldState] = await Promise.all([
      this.prisma.persona.findMany({ select: { id: true } }),
      this.prisma.video.findMany({ select: { id: true } }),
      this.prisma.worldState.findFirst()
    ])

    const existingData: ExistingData = {
      personaIds: new Set(personas.map(p => p.id)),
      entityIds: new Set(),
      eventIds: new Set(),
      timeIds: new Set(),
      collectionIds: new Set(),
      annotationIds: new Set(),
      videoIds: new Set(videos.map(v => v.id))
    }

    if (worldState) {
      const ws = worldState as unknown as {
        entities?: Prisma.JsonValue
        events?: Prisma.JsonValue
        times?: Prisma.JsonValue
        entityCollections?: Prisma.JsonValue
        eventCollections?: Prisma.JsonValue
        timeCollections?: Prisma.JsonValue
      }

      // Extract entity IDs
      if (Array.isArray(ws.entities)) {
        for (const entity of ws.entities) {
          if (entity && typeof entity === 'object' && 'id' in entity) {
            existingData.entityIds.add(entity.id as string)
          }
        }
      }

      // Extract event IDs
      if (Array.isArray(ws.events)) {
        for (const event of ws.events) {
          if (event && typeof event === 'object' && 'id' in event) {
            existingData.eventIds.add(event.id as string)
          }
        }
      }

      // Extract time IDs
      if (Array.isArray(ws.times)) {
        for (const time of ws.times) {
          if (time && typeof time === 'object' && 'id' in time) {
            existingData.timeIds.add(time.id as string)
          }
        }
      }

      // Extract collection IDs
      if (Array.isArray(ws.entityCollections)) {
        for (const collection of ws.entityCollections) {
          if (collection && typeof collection === 'object' && 'id' in collection) {
            existingData.collectionIds.add(collection.id as string)
          }
        }
      }
      if (Array.isArray(ws.eventCollections)) {
        for (const collection of ws.eventCollections) {
          if (collection && typeof collection === 'object' && 'id' in collection) {
            existingData.collectionIds.add(collection.id as string)
          }
        }
      }
      if (Array.isArray(ws.timeCollections)) {
        for (const collection of ws.timeCollections) {
          if (collection && typeof collection === 'object' && 'id' in collection) {
            existingData.collectionIds.add(collection.id as string)
          }
        }
      }
    }

    // Extract annotation IDs
    const annotations = await this.prisma.annotation.findMany({ select: { id: true } })
    for (const annotation of annotations) {
      existingData.annotationIds.add(annotation.id)
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
          annotations: 0,
          totalKeyframes: 0,
          totalInterpolatedFrames: 0,
          singleKeyframeSequences: 0
        },
        skippedItems: {
          personas: 0,
          worldObjects: 0,
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
   */
  private async importLines(
    lines: ImportLine[],
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient
  ): Promise<void> {
    // Group lines by type
    const annotationLines = lines.filter(l => l.type === 'annotation')

    // Import annotations
    for (const line of annotationLines) {
      const annotationId = line.data.id
      if (!annotationId) {
        result.errors.push({
          line: line.lineNumber,
          type: 'validation',
          message: 'Annotation missing required id field'
        })
        continue
      }

      const resolution = resolutionMap.get(annotationId)

      // Skip if resolution says to skip
      if (resolution && resolution.action === 'skip') {
        result.summary.skippedItems.annotations++
        continue
      }

      try {
        // Validate line
        const validation = this.validateLine(line)
        if (!validation.valid) {
          if (options.validation.strictMode) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`)
          } else {
            result.warnings.push({
              line: line.lineNumber,
              type: 'validation',
              message: validation.errors.join(', ')
            })
            result.summary.skippedItems.annotations++
            continue
          }
        }

        // Add warnings
        for (const warning of validation.warnings) {
          result.warnings.push({
            line: line.lineNumber,
            type: 'validation',
            message: warning
          })
        }

        // Import annotation
        const annotation = line.data as AnnotationData
        const sequence = annotation.boundingBoxSequence

        // Count keyframes
        const keyframes = sequence.boxes.filter((b) => b.isKeyframe ?? false)
        result.summary.importedItems.totalKeyframes += keyframes.length

        if (keyframes.length === 1) {
          result.summary.importedItems.singleKeyframeSequences++
        }

        // Create or update annotation
        if (resolution && resolution.action === 'replace') {
          // Delete existing annotation
          await tx.annotation.delete({
            where: { id: annotation.id }
          })
        }

        // Insert annotation
        await tx.annotation.create({
          data: {
            id: annotation.id,
            videoId: annotation.videoId,
            personaId: annotation.personaId ?? '',
            type: annotation.annotationType ?? 'type',
            label: annotation.typeId ?? annotation.linkedEntityId ?? '',
            frames: annotation as unknown as Prisma.InputJsonValue,
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

        if (options.transaction.atomic) {
          throw error
        }
      }
    }
  }
}
