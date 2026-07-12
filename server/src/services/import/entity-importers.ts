/**
 * Stateful per-type entity importers for the import pipeline.
 *
 * EntityImporter writes parsed import lines into the layers store within the
 * transaction owned by ImportHandler.importLines. Ontologies, world objects,
 * claims, claim relations, and annotations are materialized into the unified
 * layers store via the layers bridge; personas and video summaries remain their
 * own models. Each importer enforces the CASL create check via canCreate, scopes
 * new rows to the importing user and active project, and records counts on the
 * shared ImportResult. The transaction client is passed per call so the same
 * instance works for both atomic and non-atomic imports.
 *
 * @module
 */

import { PrismaClient, Prisma } from '@prisma/client'
import { subject } from '@casl/ability'
import { NotFoundError, ValidationError } from '../../lib/errors.js'
import type { AppAbility } from '../../lib/abilities.js'
import { ImportLine, ImportOptions, ImportResult, Resolution } from '../import-types.js'
import { SequenceValidator } from '../import-validator.js'
import { validateLine } from './line-parser.js'
import { AnnotationData } from './types.js'
import type { WorldStateAggregate } from '../world-layers-mapper.js'
import { writeOntologyAggregate } from '../layers-bridge/ontology-bridge.js'
import { writeClaim, writeClaimRelation, type ClaimSummaryContext } from '../layers-bridge/claim-bridge.js'
import { writeVideoAnnotation } from '../layers-bridge/annotation-bridge.js'
import { nodeToClaim } from '../claim-layers-mapper.js'
import type {
  VideoAnnotationInput,
  VideoAnnotationLinkType,
} from '../video-annotation-mapper.js'
import type { BoundingBoxSequence } from '../layers-conversion-service.js'

/**
 * Accumulator of ids imported so far, used for dependency resolution
 * between the per-type import passes.
 */
export interface ImportedIds {
  personas: Set<string>
  summaries: Set<string>
  claims: Set<string>
}

/** The world-object item kinds that merge into the world aggregate. */
type WorldItemType =
  | 'entity'
  | 'event'
  | 'time'
  | 'entityCollection'
  | 'eventCollection'
  | 'timeCollection'
  | 'relation'

/** Maps a world-item kind to the aggregate bucket it merges into. */
const WORLD_BUCKET: Record<WorldItemType, keyof WorldStateAggregate> = {
  entity: 'entities',
  event: 'events',
  time: 'times',
  entityCollection: 'entityCollections',
  eventCollection: 'eventCollections',
  timeCollection: 'timeCollections',
  relation: 'relations',
}

/** Reads a string field off a raw import payload, or undefined. */
function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * Writes import lines into the layers store, one entity type per method.
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
   * Import an ontology, materialized into the layers store (LayersOntology +
   * TypeDefs) keyed by the persona.
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
    if (!personaId || typeof personaId !== 'string') {
      result.errors.push({
        line: line.lineNumber,
        type: 'validation',
        message: 'Ontology missing required personaId field'
      })
      return
    }

    try {
      const persona = await tx.persona.findUnique({ where: { id: personaId } })
      if (!persona) {
        throw new NotFoundError('Persona', personaId)
      }

      const aggregate = {
        entityTypes: Array.isArray(line.data.entityTypes) ? line.data.entityTypes : [],
        eventTypes: Array.isArray(line.data.eventTypes) ? line.data.eventTypes : [],
        roleTypes: Array.isArray(line.data.roleTypes) ? line.data.roleTypes : [],
        relationTypes: Array.isArray(line.data.relationTypes) ? line.data.relationTypes : [],
      }

      await writeOntologyAggregate(
        tx,
        personaId,
        aggregate,
        {
          name: `${persona.name} ontology`,
          description: persona.informationNeed,
          domain: persona.domain,
        },
        { projectId: this.projectId, createdByUserId: this.userId },
      )

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
   * Merge a world-state item (entity, event, time, collection, relation) into
   * the in-memory world aggregate. The aggregate is materialized into the layers
   * store once, after every world line is merged (see ImportHandler.importLines).
   */
  mergeWorldStateItem(
    line: ImportLine,
    itemType: WorldItemType,
    aggregate: WorldStateAggregate,
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
  ): void {
    const itemId = line.data.id
    if (!itemId || typeof itemId !== 'string') {
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

    const bucketKey = WORLD_BUCKET[itemType]
    const items = aggregate[bucketKey] as Array<Record<string, unknown>>
    const existingIndex = items.findIndex(
      (item) => item && typeof item === 'object' && 'id' in item && item.id === itemId,
    )
    if (existingIndex >= 0) {
      if (resolution?.action === 'replace') {
        items[existingIndex] = line.data
      }
    } else {
      items.push(line.data)
    }

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
   * Import a claim, materialized into the layers store as a claim GraphNode with
   * its text-span LayersAnnotations under the summary's claim-span layer.
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
    if (!claimId || typeof claimId !== 'string') {
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

      const summaryId = line.data.summaryId as string
      const summary = await tx.videoSummary.findUnique({ where: { id: summaryId } })
      if (!summary) {
        throw new NotFoundError('Summary', summaryId)
      }

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

      const now = new Date().toISOString()
      const claim = {
        id: claimId,
        summaryId,
        summaryType: (line.data.summaryType as string) || 'video',
        text: line.data.text as string,
        gloss: line.data.gloss ?? [],
        parentClaimId: (line.data.parentClaimId as string) ?? null,
        textSpans: line.data.textSpans ?? null,
        timeSpans: line.data.timeSpans ?? null,
        claimerType: (line.data.claimerType as string) ?? null,
        claimerGloss: line.data.claimerGloss ?? null,
        claimRelation: line.data.claimRelation ?? null,
        claimEventId: (line.data.claimEventId as string) ?? null,
        claimTimeId: (line.data.claimTimeId as string) ?? null,
        claimLocationId: (line.data.claimLocationId as string) ?? null,
        confidence: (line.data.confidence as number) ?? null,
        modelUsed: (line.data.modelUsed as string) ?? null,
        extractionStrategy: (line.data.extractionStrategy as string) ?? null,
        audio: line.data.audio ?? null,
        video: line.data.video ?? null,
        metadata: line.data.metadata ?? null,
        comment: (line.data.comment as string) ?? null,
        createdBy: this.userId,
        projectId: this.projectId,
        createdAt: line.data.createdAt ? new Date(line.data.createdAt as string).toISOString() : now,
        updatedAt: now,
      }

      const summaryCtx: ClaimSummaryContext = {
        id: summary.id,
        videoId: summary.videoId,
        projectId: summary.projectId,
        createdBy: summary.createdBy,
      }

      const existing = await tx.graphNode.count({ where: { id: claimId, nodeType: 'claim' } })
      if (existing > 0) {
        if (resolution?.action === 'replace') {
          await tx.layersAnnotation.deleteMany({ where: { denotesNodeId: claimId } })
          await tx.graphNode.delete({ where: { id: claimId } })
          await writeClaim(tx, summaryCtx, claim)
        }
      } else {
        await writeClaim(tx, summaryCtx, claim)
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
   * Import a claim relation, materialized into the layers store as a GraphEdge
   * between the two claim nodes.
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
    if (!relationId || typeof relationId !== 'string') {
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

      const sourceClaimId = line.data.sourceClaimId as string
      const now = new Date().toISOString()
      const relation = {
        id: relationId,
        sourceClaimId,
        targetClaimId: line.data.targetClaimId as string,
        relationTypeId: line.data.relationTypeId as string,
        sourceSpans: line.data.sourceSpans ?? null,
        targetSpans: line.data.targetSpans ?? null,
        confidence: (line.data.confidence as number) ?? null,
        notes: (line.data.notes as string) ?? null,
        createdBy: this.userId,
        createdAt: line.data.createdAt ? new Date(line.data.createdAt as string).toISOString() : now,
        updatedAt: now,
      }

      // Resolve the source claim's summary and project scope for edge denormalization.
      const sourceNode = await tx.graphNode.findUnique({ where: { id: sourceClaimId } })
      const sourceClaim = sourceNode ? nodeToClaim(sourceNode) : null
      const summaryId = sourceClaim?.summaryId ?? ''
      const projectId = sourceClaim?.projectId ?? this.projectId

      const existing = await tx.graphEdge.count({ where: { id: relationId } })
      if (existing > 0) {
        if (resolution?.action === 'replace') {
          await tx.graphEdge.delete({ where: { id: relationId } })
          await writeClaimRelation(tx, relation, summaryId, projectId)
        }
      } else {
        await writeClaimRelation(tx, relation, summaryId, projectId)
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
   * Import an annotation, materialized into the layers store as a LayersAnnotation
   * under its per-(video, persona) grouping AnnotationLayer.
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

      // Pick `label` and `linkType` from whichever `linked*Id` field the export
      // carries, so event/time/location-linked object annotations round-trip.
      const annotationType = annotation.annotationType ?? 'type'
      let label: string
      let linkType: VideoAnnotationLinkType | null = null
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
        label = str(annotation.typeId) ?? ''
      }

      const input: VideoAnnotationInput = {
        id: annotation.id,
        videoId: annotation.videoId,
        personaId: annotation.personaId ?? null,
        type: annotationType,
        label,
        linkType: annotationType === 'object' ? linkType : null,
        frames: annotation.boundingBoxSequence as unknown as BoundingBoxSequence,
        confidence: annotation.confidence ?? null,
        source: 'import',
      }

      // Forces ownership + project scope to the importer; the payload's values
      // are never honoured. The write upserts by id, so a `replace` resolution
      // overwrites the existing layers row in place.
      await writeVideoAnnotation(tx, input, { userId: this.userId, projectId: this.projectId })

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
