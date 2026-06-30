/**
 * Stateful per-type entity importers for the import pipeline.
 *
 * EntityImporter writes parsed import lines into the database within the
 * transaction owned by ImportHandler.importLines. Each importer enforces the
 * CASL create check via canCreate, scopes new rows to the importing user and
 * active project, and records counts on the shared ImportResult. The
 * transaction client is passed per call so the same instance works for both
 * atomic and non-atomic imports.
 *
 * @module
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { subject } from '@casl/ability'
import { NotFoundError, ValidationError, ForbiddenError } from '../../lib/errors.js'
import type { AppAbility } from '../../lib/abilities.js'
import { ImportLine, ImportOptions, ImportResult, Resolution } from '../import-types.js'
import { SequenceValidator } from '../import-validator.js'
import { validateLine } from './line-parser.js'
import { AnnotationData } from './types.js'

/**
 * Accumulator of ids imported so far, used for dependency resolution
 * between the per-type import passes.
 */
export interface ImportedIds {
  personas: Set<string>
  summaries: Set<string>
  claims: Set<string>
}

/**
 * Writes import lines into the database, one entity type per method.
 */
export class EntityImporter {
  private validator: SequenceValidator
  private userId: string
  private ability: AppAbility | null
  private projectId: string | null

  constructor(userId: string, ability: AppAbility | null, projectId: string | null) {
    this.validator = new SequenceValidator()
    this.userId = userId
    this.ability = ability
    this.projectId = projectId
  }

  /**
   * Check CASL create permission for a resource in the target scope. Returns
   * true when no ability is configured (unit-test path) so legacy tests that
   * construct the handler without an ability keep their existing behaviour.
   */
  canCreate(
    subjectName: 'Annotation' | 'VideoSummary' | 'Claim' | 'Persona' | 'WorldState',
    candidate: Record<string, unknown>
  ): boolean {
    if (!this.ability) return true
    return this.ability.can('create', subject(subjectName, candidate))
  }

  /**
   * Import a persona.
   */
  async importPersona(
    line: ImportLine,
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient,
    importedIds: ImportedIds
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
      const validation = validateLine(line, this.validator)
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
        if (!this.canCreate('Persona', { userId: this.userId, projectId: this.projectId })) {
          result.errors.push({
            line: line.lineNumber,
            type: 'authorization',
            message: 'Cannot create Persona in this scope',
            data: line.data
          })
          if (options.transaction.atomic) throw new ValidationError('Cannot create Persona in this scope')
          return
        }
        await tx.persona.create({
          data: {
            id: personaId,
            userId: this.userId,
            projectId: this.projectId,
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
  async importOntology(
    line: ImportLine,
    _resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient,
    _importedIds: ImportedIds
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

    // Authorize against the OWNING persona: importing an ontology overwrites that
    // persona's types, so the caller must be allowed to update it. Without this,
    // an import line carrying another user's personaId would clobber their
    // ontology (IDOR). Checked before the write so the denial propagates cleanly
    // rather than being swallowed by the generic import-error catch below.
    const owningPersona = await tx.persona.findUnique({ where: { id: personaId } })
    if (!owningPersona) {
      result.errors.push({
        line: line.lineNumber,
        type: 'validation',
        message: `Persona ${personaId} not found for ontology import`
      })
      return
    }
    if (this.ability && !this.ability.can('update', subject('Persona', owningPersona))) {
      result.errors.push({
        line: line.lineNumber,
        type: 'authorization',
        message: `Not authorized to import an ontology for persona ${personaId}`
      })
      if (options.transaction.atomic) {
        throw new ForbiddenError(`Not authorized to import an ontology for persona ${personaId}`)
      }
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
  async importWorldStateItem(
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
  async importSummary(
    line: ImportLine,
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient,
    importedIds: ImportedIds
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
      const validation = validateLine(line, this.validator)
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
        if (!this.canCreate('VideoSummary', { createdBy: this.userId, projectId: this.projectId })) {
          result.errors.push({
            line: line.lineNumber,
            type: 'authorization',
            message: 'Cannot create VideoSummary in this scope',
            data: line.data
          })
          if (options.transaction.atomic) throw new ValidationError('Cannot create VideoSummary in this scope')
          return
        }
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
            createdBy: this.userId,
            projectId: this.projectId,
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
  async importClaim(
    line: ImportLine,
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient,
    importedIds: ImportedIds
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
      const validation = validateLine(line, this.validator)
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
        timeSpans: line.data.timeSpans ? (line.data.timeSpans as Prisma.InputJsonValue) : Prisma.JsonNull,
        claimerType: (line.data.claimerType as string) || undefined,
        claimerGloss: line.data.claimerGloss ? (line.data.claimerGloss as Prisma.InputJsonValue) : Prisma.JsonNull,
        claimRelation: (line.data.claimRelation as string) || undefined,
        claimEventId: (line.data.claimEventId as string) || undefined,
        claimTimeId: (line.data.claimTimeId as string) || undefined,
        claimLocationId: (line.data.claimLocationId as string) || undefined,
        confidence: (line.data.confidence as number) || undefined,
        modelUsed: (line.data.modelUsed as string) || undefined,
        extractionStrategy: (line.data.extractionStrategy as string) || undefined,
        // Preserve any JSON-valued audio/video/metadata payload — array,
        // object, string, number, boolean. The previous `Array.isArray`
        // guard wiped object-shaped payloads to JsonNull, a fidelity bug
        // surfaced by import-export-fidelity.test.ts. Columns are typed
        // `Json?` and accept any shape.
        audio: line.data.audio !== undefined && line.data.audio !== null
          ? (line.data.audio as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        video: line.data.video !== undefined && line.data.video !== null
          ? (line.data.video as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        metadata: line.data.metadata !== undefined && line.data.metadata !== null
          ? (line.data.metadata as Prisma.InputJsonValue)
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
        if (!this.canCreate('Claim', { createdBy: this.userId, projectId: this.projectId })) {
          result.errors.push({
            line: line.lineNumber,
            type: 'authorization',
            message: 'Cannot create Claim in this scope',
            data: line.data
          })
          if (options.transaction.atomic) throw new ValidationError('Cannot create Claim in this scope')
          return
        }
        await tx.claim.create({
          data: {
            id: claimId,
            summaryId: line.data.summaryId as string,
            summaryType: (line.data.summaryType as string) || 'video',
            text: line.data.text as string,
            gloss: (line.data.gloss as Prisma.InputJsonValue) || [],
            parentClaimId: (line.data.parentClaimId as string) || undefined,
            textSpans: line.data.textSpans ? (line.data.textSpans as Prisma.InputJsonValue) : Prisma.JsonNull,
            timeSpans: line.data.timeSpans ? (line.data.timeSpans as Prisma.InputJsonValue) : Prisma.JsonNull,
            claimerType: (line.data.claimerType as string) || undefined,
            claimerGloss: line.data.claimerGloss ? (line.data.claimerGloss as Prisma.InputJsonValue) : Prisma.JsonNull,
            claimRelation: (line.data.claimRelation as string) || undefined,
            claimEventId: (line.data.claimEventId as string) || undefined,
            claimTimeId: (line.data.claimTimeId as string) || undefined,
            claimLocationId: (line.data.claimLocationId as string) || undefined,
            confidence: (line.data.confidence as number) || undefined,
            modelUsed: (line.data.modelUsed as string) || undefined,
            extractionStrategy: (line.data.extractionStrategy as string) || undefined,
            // See note above: preserve any JSON value, not just arrays.
            audio: line.data.audio !== undefined && line.data.audio !== null
              ? (line.data.audio as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            video: line.data.video !== undefined && line.data.video !== null
              ? (line.data.video as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            metadata: line.data.metadata !== undefined && line.data.metadata !== null
              ? (line.data.metadata as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            comment: (line.data.comment as string) || undefined,
            createdBy: this.userId,
            projectId: this.projectId,
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
  async importClaimRelation(
    line: ImportLine,
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient,
    _importedIds: ImportedIds
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
      const validation = validateLine(line, this.validator)
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
            createdBy: this.userId,
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
  async importAnnotation(
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
      const validation = validateLine(line, this.validator)
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

      if (!this.canCreate('Annotation', { createdByUserId: this.userId, projectId: this.projectId })) {
        result.errors.push({
          line: line.lineNumber,
          type: 'authorization',
          message: 'Cannot create Annotation in this scope',
          data: line.data
        })
        if (options.transaction.atomic) throw new ValidationError('Cannot create Annotation in this scope')
        return
      }

      // Store the boundingBoxSequence in the frames field. Force ownership
      // and project scope to the importer; never honour the payload's values.
      //
      // Picks `label` and `linkType` from whichever `linked*Id` field the
      // export carries, so event/time/location-linked object annotations
      // round-trip correctly. Previously only `linkedEntityId` was honoured,
      // which silently flattened every object annotation into entity-linked.
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
          createdByUserId: this.userId,
          projectId: this.projectId,
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
