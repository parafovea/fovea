import { PrismaClient } from '@prisma/client'
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
    } catch (error: any) {
      throw new Error(`Failed to parse line ${lineNumber}: ${error.message}`)
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
          // Validate sequence
          const seqValidation = this.validator.validateSequence(line.data.boundingBoxSequence)
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
        case 'ontology':
          // Track personas
          for (const persona of line.data.personas || []) {
            graph.personas.add(persona.id)
          }
          // Track ontologies
          for (const ontology of line.data.personaOntologies || []) {
            graph.ontologies.set(ontology.id, ontology.personaId)
          }
          break

        case 'entity':
          graph.entities.add(line.data.id)
          // Track persona references
          for (const assignment of line.data.typeAssignments || []) {
            this.addReference(graph, assignment.personaId, line.data.id)
          }
          break

        case 'event':
          graph.events.add(line.data.id)
          // Track persona references
          for (const interpretation of line.data.personaInterpretations || []) {
            this.addReference(graph, interpretation.personaId, line.data.id)
            // Track entity references (participants)
            for (const participant of interpretation.participants || []) {
              this.addReference(graph, participant.entityId, line.data.id)
            }
          }
          break

        case 'time':
          graph.times.add(line.data.id)
          break

        case 'entityCollection':
        case 'eventCollection':
        case 'timeCollection':
          graph.collections.add(line.data.id)
          break

        case 'annotation': {
          const deps: string[] = []

          // Add video dependency
          deps.push(line.data.videoId)

          // Add persona dependency (for type annotations)
          if (line.data.personaId) {
            deps.push(line.data.personaId)
          }

          // Add linked object dependencies
          if (line.data.linkedEntityId) deps.push(line.data.linkedEntityId)
          if (line.data.linkedEventId) deps.push(line.data.linkedEventId)
          if (line.data.linkedTimeId) deps.push(line.data.linkedTimeId)
          if (line.data.linkedLocationId) deps.push(line.data.linkedLocationId)
          if (line.data.linkedCollectionId) deps.push(line.data.linkedCollectionId)

          graph.annotations.set(line.data.id, deps)
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
        case 'annotation':
          // Check for duplicate annotation ID
          if (existingData.annotationIds.has(line.data.id)) {
            const sequence = line.data.boundingBoxSequence
            const keyframes = sequence.boxes.filter((b: any) => b.isKeyframe)
            const frameRange = keyframes.length > 0 ? {
              start: keyframes[0].frameNumber,
              end: keyframes[keyframes.length - 1].frameNumber
            } : undefined

            conflicts.push({
              type: 'duplicate-sequence',
              line: line.lineNumber,
              originalId: line.data.id,
              existingId: line.data.id,
              details: `Annotation with ID ${line.data.id} already exists`,
              frameRange,
              interpolationType: sequence.interpolationSegments[0]?.type
            })
          }

          // Check for missing dependencies
          if (line.data.videoId && !existingData.videoIds.has(line.data.videoId)) {
            conflicts.push({
              type: 'missing-dependency',
              line: line.lineNumber,
              originalId: line.data.id,
              details: `Video ${line.data.videoId} does not exist`
            })
          }

          if (line.data.linkedEntityId && !existingData.entityIds.has(line.data.linkedEntityId)) {
            conflicts.push({
              type: 'missing-dependency',
              line: line.lineNumber,
              originalId: line.data.id,
              details: `Entity ${line.data.linkedEntityId} does not exist`
            })
          }
          break

        case 'entity':
          if (existingData.entityIds.has(line.data.id)) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: line.data.id,
              existingId: line.data.id,
              details: `Entity with ID ${line.data.id} already exists`
            })
          }
          break

        case 'event':
          if (existingData.eventIds.has(line.data.id)) {
            conflicts.push({
              type: 'duplicate-object',
              line: line.lineNumber,
              originalId: line.data.id,
              existingId: line.data.id,
              details: `Event with ID ${line.data.id} already exists`
            })
          }
          break
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
  private remapObjectIds(obj: any, idMap: Map<string, string>): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.remapObjectIds(item, idMap))
    } else if (obj && typeof obj === 'object') {
      const remapped: any = {}
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
    return obj
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
      const ws = worldState as any

      // Extract entity IDs
      if (Array.isArray(ws.entities)) {
        for (const entity of ws.entities) {
          existingData.entityIds.add(entity.id)
        }
      }

      // Extract event IDs
      if (Array.isArray(ws.events)) {
        for (const event of ws.events) {
          existingData.eventIds.add(event.id)
        }
      }

      // Extract time IDs
      if (Array.isArray(ws.times)) {
        for (const time of ws.times) {
          existingData.timeIds.add(time.id)
        }
      }

      // Extract collection IDs
      if (Array.isArray(ws.entityCollections)) {
        for (const collection of ws.entityCollections) {
          existingData.collectionIds.add(collection.id)
        }
      }
      if (Array.isArray(ws.eventCollections)) {
        for (const collection of ws.eventCollections) {
          existingData.collectionIds.add(collection.id)
        }
      }
      if (Array.isArray(ws.timeCollections)) {
        for (const collection of ws.timeCollections) {
          existingData.collectionIds.add(collection.id)
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
    } catch (error: any) {
      result.errors.push({
        line: 0,
        type: 'execution',
        message: `Import execution failed: ${error.message}`,
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
      const resolution = resolutionMap.get(line.data.id)

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
        const annotation = line.data
        const sequence = annotation.boundingBoxSequence

        // Count keyframes
        const keyframes = sequence.boxes.filter((b: any) => b.isKeyframe)
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
            personaId: annotation.personaId || '',
            type: annotation.annotationType || 'type',
            label: annotation.typeId || annotation.linkedEntityId || '',
            frames: annotation,
            confidence: annotation.confidence,
            source: 'import',
            createdAt: annotation.createdAt ? new Date(annotation.createdAt) : new Date(),
            updatedAt: annotation.updatedAt ? new Date(annotation.updatedAt) : new Date()
          }
        })

        result.summary.importedItems.annotations++
        result.summary.processedLines++
      } catch (error: any) {
        result.errors.push({
          line: line.lineNumber,
          type: 'import',
          message: `Failed to import annotation: ${error.message}`,
          data: line.data
        })

        if (options.transaction.atomic) {
          throw error
        }
      }
    }
  }
}
