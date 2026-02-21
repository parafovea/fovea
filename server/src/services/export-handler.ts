import {
  Annotation as PrismaAnnotation,
  Persona as PrismaPersona,
  Ontology as PrismaOntology,
  WorldState as PrismaWorldState,
  VideoSummary as PrismaVideoSummary,
  Claim as PrismaClaim,
  ClaimRelation as PrismaClaimRelation,
  PrismaClient
} from '@prisma/client'

/**
 * @interface BoundingBox
 * @description Represents a spatial bounding box at a specific video frame.
 */
interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  frameNumber: number
  confidence?: number
  isKeyframe?: boolean
  metadata?: Record<string, unknown>
}

/**
 * @interface InterpolationSegment
 * @description Defines interpolation behavior between two keyframes.
 */
interface InterpolationSegment {
  startFrame: number
  endFrame: number
  type: 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold' | 'parametric'
  controlPoints?: unknown
  parametric?: unknown
}

/**
 * @interface BoundingBoxSequence
 * @description Complete sequence of bounding boxes with interpolation configuration.
 */
interface BoundingBoxSequence {
  boxes: BoundingBox[]
  interpolationSegments: InterpolationSegment[]
  visibilityRanges: Array<{
    startFrame: number
    endFrame: number
    visible: boolean
  }>
  trackId?: string | number
  trackingSource?: 'manual' | 'samurai' | 'sam2long' | 'sam2' | 'yolo11seg'
  trackingConfidence?: number
  totalFrames: number
  keyframeCount: number
  interpolatedFrameCount: number
}

/**
 * @interface Annotation
 * @description Annotation with bounding box sequence.
 */
interface Annotation {
  id: string
  videoId: string
  annotationType: 'type' | 'object'
  personaId?: string
  typeCategory?: 'entity' | 'role' | 'event'
  typeId?: string
  linkedEntityId?: string
  linkedEventId?: string
  linkedTimeId?: string
  linkedLocationId?: string
  linkedCollectionId?: string
  linkedCollectionType?: 'entity' | 'event' | 'time'
  boundingBoxSequence: BoundingBoxSequence
  confidence?: number
  notes?: string
  metadata?: Record<string, unknown>
  createdBy?: string
  createdAt: string
  updatedAt: string
}

/**
 * @interface ExportOptions
 * @description Options for exporting annotations.
 */
interface ExportOptions {
  includeInterpolated?: boolean
  personaIds?: string[]
  videoIds?: string[]
  annotationTypes?: ('type' | 'object')[]
}

/**
 * @interface ExportStats
 * @description Statistics about exported data.
 */
interface ExportStats {
  totalSize: number
  annotationCount: number
  sequenceCount: number
  keyframeCount: number
  interpolatedFrameCount: number
}

/**
 * @interface SequenceValidationResult
 * @description Result of sequence validation.
 */
interface SequenceValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * @class AnnotationExporter
 * @description Handles exporting annotations with bounding box sequences.
 */
export class AnnotationExporter {
  /**
   * Export keyframes-only (recommended for most use cases).
   * Exports only boxes where isKeyframe: true along with interpolation configuration.
   * This preserves author intent and allows re-interpolation on import.
   * Supports annotations without bounding boxes (exports with empty sequence).
   *
   * @param annotation - Annotation to export
   * @returns JSON string with keyframes-only
   */
  exportKeyframesOnly(annotation: Annotation): string {
    const sequence = annotation.boundingBoxSequence

    // Handle annotations without bounding boxes (empty sequences are valid)
    const boxes = sequence?.boxes || []
    const interpolationSegments = sequence?.interpolationSegments || []
    const visibilityRanges = sequence?.visibilityRanges || []

    // Extract only keyframes
    const keyframes = boxes.filter(box => box.isKeyframe)

    // Create export-ready sequence
    const exportSequence: BoundingBoxSequence = {
      boxes: keyframes,
      interpolationSegments,
      visibilityRanges,
      trackId: sequence?.trackId,
      trackingSource: sequence?.trackingSource,
      trackingConfidence: sequence?.trackingConfidence,
      totalFrames: sequence?.totalFrames || 0,
      keyframeCount: keyframes.length,
      interpolatedFrameCount: boxes.length - keyframes.length
    }

    // Create export data
    interface ExportData {
      type: string
      data: {
        id: string
        videoId: string
        annotationType: string
        boundingBoxSequence: BoundingBoxSequence
        createdAt: string
        updatedAt: string
        personaId?: string
        typeCategory?: string
        typeId?: string
        linkedEntityId?: string
        linkedEventId?: string
        linkedTimeId?: string
        linkedLocationId?: string
        linkedCollectionId?: string
        linkedCollectionType?: string
        confidence?: number
        notes?: string
        metadata?: Record<string, unknown>
        createdBy?: string
      }
    }

    const exportData: ExportData = {
      type: 'annotation',
      data: {
        id: annotation.id,
        videoId: annotation.videoId,
        annotationType: annotation.annotationType,
        boundingBoxSequence: exportSequence,
        createdAt: annotation.createdAt,
        updatedAt: annotation.updatedAt
      }
    }

    // Add type-specific fields
    if (annotation.annotationType === 'type') {
      exportData.data.personaId = annotation.personaId
      exportData.data.typeCategory = annotation.typeCategory
      exportData.data.typeId = annotation.typeId
    } else if (annotation.annotationType === 'object') {
      if (annotation.linkedEntityId) exportData.data.linkedEntityId = annotation.linkedEntityId
      if (annotation.linkedEventId) exportData.data.linkedEventId = annotation.linkedEventId
      if (annotation.linkedTimeId) exportData.data.linkedTimeId = annotation.linkedTimeId
      if (annotation.linkedLocationId) exportData.data.linkedLocationId = annotation.linkedLocationId
      if (annotation.linkedCollectionId) {
        exportData.data.linkedCollectionId = annotation.linkedCollectionId
        exportData.data.linkedCollectionType = annotation.linkedCollectionType
      }
    }

    // Add optional fields
    if (annotation.confidence !== undefined) exportData.data.confidence = annotation.confidence
    if (annotation.notes) exportData.data.notes = annotation.notes
    if (annotation.metadata) exportData.data.metadata = annotation.metadata
    if (annotation.createdBy) exportData.data.createdBy = annotation.createdBy

    return JSON.stringify(exportData)
  }

  /**
   * Export full sequence with all interpolated frames.
   * Useful for debugging or external tools that don't support interpolation.
   * WARNING: File size can be 100x larger than keyframes-only export.
   * Supports annotations without bounding boxes (exports with empty sequence).
   *
   * @param annotation - Annotation to export
   * @returns JSON string with all interpolated frames
   */
  exportFullSequence(annotation: Annotation): string {
    const sequence = annotation.boundingBoxSequence

    // Handle annotations without bounding boxes (empty sequences are valid)
    const allBoxes = sequence?.boxes || []
    const interpolationSegments = sequence?.interpolationSegments || []
    const visibilityRanges = sequence?.visibilityRanges || []

    // Create export-ready sequence with all frames
    const exportSequence: BoundingBoxSequence = {
      boxes: allBoxes,
      interpolationSegments,
      visibilityRanges,
      trackId: sequence?.trackId,
      trackingSource: sequence?.trackingSource,
      trackingConfidence: sequence?.trackingConfidence,
      totalFrames: sequence?.totalFrames || 0,
      keyframeCount: allBoxes.filter(b => b.isKeyframe).length,
      interpolatedFrameCount: allBoxes.filter(b => !b.isKeyframe).length
    }

    // Create export data (same structure as keyframes-only)
    interface ExportData {
      type: string
      data: {
        id: string
        videoId: string
        annotationType: string
        boundingBoxSequence: BoundingBoxSequence
        createdAt: string
        updatedAt: string
        personaId?: string
        typeCategory?: string
        typeId?: string
        linkedEntityId?: string
        linkedEventId?: string
        linkedTimeId?: string
        linkedLocationId?: string
        linkedCollectionId?: string
        linkedCollectionType?: string
        confidence?: number
        notes?: string
        metadata?: Record<string, unknown>
        createdBy?: string
      }
    }

    const exportData: ExportData = {
      type: 'annotation',
      data: {
        id: annotation.id,
        videoId: annotation.videoId,
        annotationType: annotation.annotationType,
        boundingBoxSequence: exportSequence,
        createdAt: annotation.createdAt,
        updatedAt: annotation.updatedAt
      }
    }

    // Add type-specific fields
    if (annotation.annotationType === 'type') {
      exportData.data.personaId = annotation.personaId
      exportData.data.typeCategory = annotation.typeCategory
      exportData.data.typeId = annotation.typeId
    } else if (annotation.annotationType === 'object') {
      if (annotation.linkedEntityId) exportData.data.linkedEntityId = annotation.linkedEntityId
      if (annotation.linkedEventId) exportData.data.linkedEventId = annotation.linkedEventId
      if (annotation.linkedTimeId) exportData.data.linkedTimeId = annotation.linkedTimeId
      if (annotation.linkedLocationId) exportData.data.linkedLocationId = annotation.linkedLocationId
      if (annotation.linkedCollectionId) {
        exportData.data.linkedCollectionId = annotation.linkedCollectionId
        exportData.data.linkedCollectionType = annotation.linkedCollectionType
      }
    }

    // Add optional fields
    if (annotation.confidence !== undefined) exportData.data.confidence = annotation.confidence
    if (annotation.notes) exportData.data.notes = annotation.notes
    if (annotation.metadata) exportData.data.metadata = annotation.metadata
    if (annotation.createdBy) exportData.data.createdBy = annotation.createdBy

    return JSON.stringify(exportData)
  }

  /**
   * Export annotations to JSON Lines format.
   *
   * @param annotations - Array of annotations to export
   * @param options - Export options
   * @returns JSON Lines string (one JSON object per line)
   */
  exportAnnotations(annotations: Annotation[], options: ExportOptions = {}): string {
    const lines: string[] = []

    for (const annotation of annotations) {
      if (options.includeInterpolated) {
        lines.push(this.exportFullSequence(annotation))
      } else {
        lines.push(this.exportKeyframesOnly(annotation))
      }
    }

    return lines.join('\n')
  }

  /**
   * Get export statistics for annotations.
   *
   * @param annotations - Array of annotations
   * @param includeInterpolated - Whether interpolated frames are included
   * @returns Export statistics
   */
  getExportStats(annotations: Annotation[], includeInterpolated: boolean = false): ExportStats {
    let keyframeCount = 0
    let interpolatedFrameCount = 0
    let sequenceCount = 0

    for (const annotation of annotations) {
      const sequence = annotation.boundingBoxSequence

      // Handle annotations without bounding boxes (empty sequences are valid)
      if (!sequence || !sequence.boxes || !Array.isArray(sequence.boxes)) {
        sequenceCount++
        continue
      }

      sequenceCount++

      const keyframes = sequence.boxes.filter(b => b.isKeyframe).length
      const interpolated = sequence.boxes.length - keyframes

      keyframeCount += keyframes
      interpolatedFrameCount += interpolated
    }

    // Estimate size (rough approximation)
    // Each keyframe: ~200 bytes
    // Each interpolated frame: ~150 bytes
    // Metadata overhead: ~300 bytes per annotation
    const keyframeSize = keyframeCount * 200
    const interpolatedSize = includeInterpolated ? interpolatedFrameCount * 150 : 0
    const metadataSize = annotations.length * 300
    const totalSize = keyframeSize + interpolatedSize + metadataSize

    return {
      totalSize,
      annotationCount: annotations.length,
      sequenceCount,
      keyframeCount,
      interpolatedFrameCount: includeInterpolated ? interpolatedFrameCount : 0
    }
  }

  /**
   * Validate a bounding box sequence before export.
   * Empty sequences are valid (for ontology-only annotations).
   *
   * @param sequence - Bounding box sequence to validate
   * @param videoWidth - Video width in pixels (optional, for boundary validation)
   * @param videoHeight - Video height in pixels (optional, for boundary validation)
   * @returns Validation result
   */
  validateSequence(
    sequence: BoundingBoxSequence | null | undefined,
    videoWidth?: number,
    videoHeight?: number
  ): SequenceValidationResult {
    const errors: string[] = []

    // Empty sequences are valid (for ontology-only annotations)
    if (!sequence || !sequence.boxes || sequence.boxes.length === 0) {
      return { valid: true, errors: [] }
    }

    // Validate minimum keyframes (at least 1 if there are boxes)
    const keyframes = sequence.boxes.filter(b => b.isKeyframe)
    if (keyframes.length === 0) {
      errors.push('Sequence must have at least 1 keyframe')
    }

    // Validate keyframes are sorted by frameNumber
    for (let i = 1; i < keyframes.length; i++) {
      if (keyframes[i].frameNumber <= keyframes[i - 1].frameNumber) {
        errors.push(`Keyframes not sorted: frame ${keyframes[i - 1].frameNumber} >= ${keyframes[i].frameNumber}`)
      }
    }

    // Validate no duplicate frame numbers among keyframes
    const frameNumbers = new Set<number>()
    for (const keyframe of keyframes) {
      if (frameNumbers.has(keyframe.frameNumber)) {
        errors.push(`Duplicate keyframe at frame ${keyframe.frameNumber}`)
      }
      frameNumbers.add(keyframe.frameNumber)
    }

    // Validate interpolation segments
    if (keyframes.length > 1) {
      // Check segments cover range
      const firstFrame = keyframes[0].frameNumber
      const lastFrame = keyframes[keyframes.length - 1].frameNumber

      // Sort segments by startFrame
      const sortedSegments = [...sequence.interpolationSegments].sort(
        (a, b) => a.startFrame - b.startFrame
      )

      // Check for gaps and overlaps
      for (let i = 0; i < sortedSegments.length; i++) {
        const segment = sortedSegments[i]

        // Validate segment covers a keyframe transition
        if (segment.startFrame < firstFrame || segment.endFrame > lastFrame) {
          errors.push(
            `Interpolation segment [${segment.startFrame}, ${segment.endFrame}] outside keyframe range [${firstFrame}, ${lastFrame}]`
          )
        }

        // Check for gaps with next segment
        if (i < sortedSegments.length - 1) {
          const nextSegment = sortedSegments[i + 1]
          if (segment.endFrame < nextSegment.startFrame - 1) {
            errors.push(
              `Gap between interpolation segments: [${segment.endFrame}, ${nextSegment.startFrame}]`
            )
          }
          if (segment.endFrame >= nextSegment.startFrame) {
            errors.push(
              `Overlapping interpolation segments: [${segment.startFrame}, ${segment.endFrame}] and [${nextSegment.startFrame}, ${nextSegment.endFrame}]`
            )
          }
        }
      }
    }

    // Validate visibility ranges
    const sortedRanges = [...sequence.visibilityRanges].sort(
      (a, b) => a.startFrame - b.startFrame
    )

    for (let i = 0; i < sortedRanges.length; i++) {
      const range = sortedRanges[i]

      // Check for overlaps
      if (i < sortedRanges.length - 1) {
        const nextRange = sortedRanges[i + 1]
        if (range.endFrame >= nextRange.startFrame) {
          errors.push(
            `Overlapping visibility ranges: [${range.startFrame}, ${range.endFrame}] and [${nextRange.startFrame}, ${nextRange.endFrame}]`
          )
        }
      }
    }

    // Validate all keyframes are in visible ranges
    for (const keyframe of keyframes) {
      const inVisibleRange = sequence.visibilityRanges.some(
        range => range.visible &&
                 keyframe.frameNumber >= range.startFrame &&
                 keyframe.frameNumber <= range.endFrame
      )
      if (!inVisibleRange) {
        errors.push(`Keyframe at frame ${keyframe.frameNumber} is not in a visible range`)
      }
    }

    // Validate bounding box values
    for (const box of sequence.boxes) {
      if (box.frameNumber < 0) {
        errors.push(`Invalid frame number: ${box.frameNumber} (must be >= 0)`)
      }
      if (box.width <= 0 || box.height <= 0) {
        errors.push(`Invalid box dimensions at frame ${box.frameNumber}: width=${box.width}, height=${box.height}`)
      }
      if (box.x < 0 || box.y < 0) {
        errors.push(`Invalid box position at frame ${box.frameNumber}: x=${box.x}, y=${box.y}`)
      }

      // Validate against video dimensions if provided
      if (videoWidth !== undefined && videoHeight !== undefined) {
        if (box.x + box.width > videoWidth) {
          errors.push(
            `Box at frame ${box.frameNumber} exceeds video width: x=${box.x}, width=${box.width}, videoWidth=${videoWidth}`
          )
        }
        if (box.y + box.height > videoHeight) {
          errors.push(
            `Box at frame ${box.frameNumber} exceeds video height: y=${box.y}, height=${box.height}, videoHeight=${videoHeight}`
          )
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  /**
   * Convert Prisma annotation to export format.
   * This handles the conversion from database format to the typed Annotation interface.
   *
   * Database storage format:
   * - `type` column: 'type' | 'object' (annotation type)
   * - `label` column: typeId (for type annotations) or linkedEntityId (for object annotations)
   * - `frames` column: BoundingBoxSequence directly (NOT nested as frames.boundingBoxSequence)
   * - `personaId` column: persona ID for type annotations
   * - `confidence` column: confidence score
   *
   * @param prismaAnnotation - Annotation from Prisma
   * @returns Typed annotation, or null if annotation has invalid data
   */
  convertPrismaAnnotation(prismaAnnotation: PrismaAnnotation): Annotation | null {
    // The frames field IS the BoundingBoxSequence directly (not nested)
    const frames = prismaAnnotation.frames as BoundingBoxSequence | Record<string, unknown> | null

    // Create a default empty sequence for annotations without bounding boxes
    // This supports ontology-only annotations (summaries, claims without spatial data)
    const emptySequence: BoundingBoxSequence = {
      boxes: [],
      interpolationSegments: [],
      visibilityRanges: [],
      totalFrames: 0,
      keyframeCount: 0,
      interpolatedFrameCount: 0
    }

    // Determine if frames contains a valid bounding box sequence
    let boundingBoxSequence: BoundingBoxSequence
    if (frames && typeof frames === 'object' && 'boxes' in frames && Array.isArray(frames.boxes)) {
      // Valid sequence structure
      boundingBoxSequence = {
        boxes: frames.boxes || [],
        interpolationSegments: (frames as BoundingBoxSequence).interpolationSegments || [],
        visibilityRanges: (frames as BoundingBoxSequence).visibilityRanges || [],
        trackId: (frames as BoundingBoxSequence).trackId,
        trackingSource: (frames as BoundingBoxSequence).trackingSource,
        trackingConfidence: (frames as BoundingBoxSequence).trackingConfidence,
        totalFrames: (frames as BoundingBoxSequence).totalFrames || 0,
        keyframeCount: (frames as BoundingBoxSequence).keyframeCount || 0,
        interpolatedFrameCount: (frames as BoundingBoxSequence).interpolatedFrameCount || 0
      }
    } else {
      // No bounding box data - use empty sequence (valid for ontology-only exports)
      boundingBoxSequence = emptySequence
    }

    // Annotation type is stored in the 'type' column, NOT inside frames
    const annotationType = (prismaAnnotation.type === 'type' || prismaAnnotation.type === 'object')
      ? prismaAnnotation.type as 'type' | 'object'
      : 'type'

    // Build the annotation object
    const annotation: Annotation = {
      id: prismaAnnotation.id,
      videoId: prismaAnnotation.videoId,
      annotationType,
      boundingBoxSequence,
      createdAt: prismaAnnotation.createdAt.toISOString(),
      updatedAt: prismaAnnotation.updatedAt.toISOString()
    }

    // Type-specific fields - read from database columns, not frames
    if (annotationType === 'type') {
      annotation.personaId = prismaAnnotation.personaId ?? undefined
      // For type annotations, label contains the typeId
      annotation.typeId = prismaAnnotation.label
      // Default typeCategory since it's not stored separately
      annotation.typeCategory = 'entity'
    } else {
      // For object annotations, label contains the linked entity/event/time ID
      // We store it as linkedEntityId by default; could be enhanced to detect type
      annotation.linkedEntityId = prismaAnnotation.label
    }

    // Add confidence from database column
    if (prismaAnnotation.confidence !== null) {
      annotation.confidence = prismaAnnotation.confidence
    }

    return annotation
  }

  // =============================================================================
  // PERSONA AND ONTOLOGY EXPORT
  // =============================================================================

  /**
   * Export a persona to JSONL format.
   */
  exportPersona(persona: PrismaPersona): string {
    const exportData = {
      type: 'persona',
      data: {
        id: persona.id,
        name: persona.name,
        role: persona.role,
        informationNeed: persona.informationNeed,
        details: persona.details || undefined,
        createdAt: persona.createdAt.toISOString(),
        updatedAt: persona.updatedAt.toISOString(),
      }
    }
    return JSON.stringify(exportData)
  }

  /**
   * Export an ontology to JSONL format.
   */
  exportOntology(ontology: PrismaOntology): string {
    const exportData = {
      type: 'ontology',
      data: {
        personaId: ontology.personaId,
        entityTypes: ontology.entityTypes || [],
        eventTypes: ontology.eventTypes || [],
        roleTypes: ontology.roleTypes || [],
        relationTypes: ontology.relationTypes || [],
        relations: [], // Relations are stored in WorldState, not Ontology
      }
    }
    return JSON.stringify(exportData)
  }

  /**
   * Export personas with their ontologies.
   */
  exportPersonasWithOntologies(
    personas: PrismaPersona[],
    ontologies: PrismaOntology[]
  ): string {
    const lines: string[] = []

    // Create a map of ontologies by personaId
    const ontologyMap = new Map<string, PrismaOntology>()
    for (const ontology of ontologies) {
      ontologyMap.set(ontology.personaId, ontology)
    }

    // Export each persona followed by its ontology
    for (const persona of personas) {
      lines.push(this.exportPersona(persona))
      const ontology = ontologyMap.get(persona.id)
      if (ontology) {
        lines.push(this.exportOntology(ontology))
      }
    }

    return lines.join('\n')
  }

  // =============================================================================
  // WORLD STATE EXPORT
  // =============================================================================

  /**
   * Export world state objects to JSONL format.
   * Exports entities, events, times, collections, and relations.
   */
  exportWorldState(worldState: PrismaWorldState): string {
    const lines: string[] = []

    // Export entities
    const entities = worldState.entities as Array<Record<string, unknown>> || []
    for (const entity of entities) {
      lines.push(JSON.stringify({
        type: 'entity',
        data: {
          ...entity,
          createdAt: entity.createdAt || new Date().toISOString(),
          updatedAt: entity.updatedAt || new Date().toISOString(),
        }
      }))
    }

    // Export events
    const events = worldState.events as Array<Record<string, unknown>> || []
    for (const event of events) {
      lines.push(JSON.stringify({
        type: 'event',
        data: {
          ...event,
          createdAt: event.createdAt || new Date().toISOString(),
          updatedAt: event.updatedAt || new Date().toISOString(),
        }
      }))
    }

    // Export times
    const times = worldState.times as Array<Record<string, unknown>> || []
    for (const time of times) {
      lines.push(JSON.stringify({
        type: 'time',
        data: time
      }))
    }

    // Export entity collections
    const entityCollections = worldState.entityCollections as Array<Record<string, unknown>> || []
    for (const collection of entityCollections) {
      lines.push(JSON.stringify({
        type: 'entity_collection',
        data: {
          ...collection,
          createdAt: collection.createdAt || new Date().toISOString(),
          updatedAt: collection.updatedAt || new Date().toISOString(),
        }
      }))
    }

    // Export event collections
    const eventCollections = worldState.eventCollections as Array<Record<string, unknown>> || []
    for (const collection of eventCollections) {
      lines.push(JSON.stringify({
        type: 'event_collection',
        data: {
          ...collection,
          createdAt: collection.createdAt || new Date().toISOString(),
          updatedAt: collection.updatedAt || new Date().toISOString(),
        }
      }))
    }

    // Export time collections
    const timeCollections = worldState.timeCollections as Array<Record<string, unknown>> || []
    for (const collection of timeCollections) {
      lines.push(JSON.stringify({
        type: 'time_collection',
        data: collection
      }))
    }

    // Export relations
    const relations = worldState.relations as Array<Record<string, unknown>> || []
    for (const relation of relations) {
      lines.push(JSON.stringify({
        type: 'relation',
        data: {
          ...relation,
          createdAt: relation.createdAt || new Date().toISOString(),
          updatedAt: relation.updatedAt || new Date().toISOString(),
        }
      }))
    }

    return lines.join('\n')
  }

  // =============================================================================
  // SUMMARY AND CLAIM EXPORT
  // =============================================================================

  /**
   * Export a video summary to JSONL format.
   */
  exportSummary(summary: PrismaVideoSummary): string {
    const exportData = {
      type: 'summary',
      data: {
        id: summary.id,
        videoId: summary.videoId,
        personaId: summary.personaId,
        summary: summary.summary || [],
        visualAnalysis: summary.visualAnalysis || undefined,
        audioTranscript: summary.audioTranscript || undefined,
        keyFrames: summary.keyFrames || undefined,
        confidence: summary.confidence || undefined,
        transcriptJson: summary.transcriptJson || undefined,
        audioLanguage: summary.audioLanguage || undefined,
        speakerCount: summary.speakerCount || undefined,
        audioModelUsed: summary.audioModelUsed || undefined,
        visualModelUsed: summary.visualModelUsed || undefined,
        fusionStrategy: summary.fusionStrategy || undefined,
        comment: summary.comment || undefined,
        createdAt: summary.createdAt.toISOString(),
        updatedAt: summary.updatedAt.toISOString(),
        createdBy: summary.createdBy || undefined,
      }
    }
    return JSON.stringify(exportData)
  }

  /**
   * Export a claim to JSONL format.
   */
  exportClaim(claim: PrismaClaim): string {
    const exportData = {
      type: 'claim',
      data: {
        id: claim.id,
        summaryId: claim.summaryId,
        summaryType: claim.summaryType,
        text: claim.text,
        gloss: claim.gloss || [],
        parentClaimId: claim.parentClaimId || undefined,
        textSpans: claim.textSpans || undefined,
        claimerType: claim.claimerType || undefined,
        claimerGloss: claim.claimerGloss || undefined,
        claimRelation: claim.claimRelation || undefined,
        claimEventId: claim.claimEventId || undefined,
        claimTimeId: claim.claimTimeId || undefined,
        claimLocationId: claim.claimLocationId || undefined,
        confidence: claim.confidence || undefined,
        modelUsed: claim.modelUsed || undefined,
        extractionStrategy: claim.extractionStrategy || undefined,
        audio: claim.audio || undefined,
        video: claim.video || undefined,
        metadata: claim.metadata ?? undefined,
        comment: claim.comment || undefined,
        createdBy: claim.createdBy || undefined,
        createdAt: claim.createdAt.toISOString(),
        updatedAt: claim.updatedAt.toISOString(),
      }
    }
    return JSON.stringify(exportData)
  }

  /**
   * Export a claim relation to JSONL format.
   */
  exportClaimRelation(relation: PrismaClaimRelation): string {
    const exportData = {
      type: 'claim_relation',
      data: {
        id: relation.id,
        sourceClaimId: relation.sourceClaimId,
        targetClaimId: relation.targetClaimId,
        relationTypeId: relation.relationTypeId,
        sourceSpans: relation.sourceSpans || undefined,
        targetSpans: relation.targetSpans || undefined,
        confidence: relation.confidence || undefined,
        notes: relation.notes || undefined,
        createdBy: relation.createdBy || undefined,
        createdAt: relation.createdAt.toISOString(),
        updatedAt: relation.updatedAt.toISOString(),
      }
    }
    return JSON.stringify(exportData)
  }

  /**
   * Export summaries with their claims and claim relations.
   */
  exportSummariesWithClaims(
    summaries: PrismaVideoSummary[],
    claims: PrismaClaim[],
    claimRelations: PrismaClaimRelation[]
  ): string {
    const lines: string[] = []

    // Create maps for efficient lookup
    const claimsBySummary = new Map<string, PrismaClaim[]>()
    for (const claim of claims) {
      const summaryId = claim.summaryId
      if (!claimsBySummary.has(summaryId)) {
        claimsBySummary.set(summaryId, [])
      }
      claimsBySummary.get(summaryId)!.push(claim)
    }

    // Export each summary followed by its claims
    for (const summary of summaries) {
      lines.push(this.exportSummary(summary))

      const summaryClaims = claimsBySummary.get(summary.id) || []
      // Sort claims to ensure parents come before children
      summaryClaims.sort((a, b) => {
        if (a.parentClaimId === null && b.parentClaimId !== null) return -1
        if (a.parentClaimId !== null && b.parentClaimId === null) return 1
        return 0
      })

      for (const claim of summaryClaims) {
        lines.push(this.exportClaim(claim))
      }
    }

    // Export claim relations at the end
    for (const relation of claimRelations) {
      lines.push(this.exportClaimRelation(relation))
    }

    return lines.join('\n')
  }

  // =============================================================================
  // FULL EXPORT
  // =============================================================================

  /**
   * Export all data for a user.
   * Order: personas -> ontologies -> world state -> summaries -> claims -> annotations
   * This order ensures dependencies are exported before dependents.
   */
  async exportAll(prisma: PrismaClient, userId: string): Promise<string> {
    const lines: string[] = []

    // 1. Export personas with ontologies
    const personas = await prisma.persona.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    })
    const ontologies = await prisma.ontology.findMany({
      where: { persona: { userId } },
      orderBy: { createdAt: 'asc' }
    })
    if (personas.length > 0) {
      lines.push(this.exportPersonasWithOntologies(personas, ontologies))
    }

    // 2. Export world state
    const worldState = await prisma.worldState.findUnique({
      where: { userId }
    })
    if (worldState) {
      const worldLines = this.exportWorldState(worldState)
      if (worldLines) {
        lines.push(worldLines)
      }
    }

    // 3. Export summaries with claims
    const summaries = await prisma.videoSummary.findMany({
      where: { persona: { userId } },
      orderBy: { createdAt: 'asc' }
    })
    const summaryIds = summaries.map(s => s.id)
    const claims = await prisma.claim.findMany({
      where: { summaryId: { in: summaryIds } },
      orderBy: { createdAt: 'asc' }
    })
    const claimIds = claims.map(c => c.id)
    const claimRelations = await prisma.claimRelation.findMany({
      where: {
        OR: [
          { sourceClaimId: { in: claimIds } },
          { targetClaimId: { in: claimIds } }
        ]
      },
      orderBy: { createdAt: 'asc' }
    })
    if (summaries.length > 0 || claims.length > 0) {
      lines.push(this.exportSummariesWithClaims(summaries, claims, claimRelations))
    }

    // 4. Export annotations
    const annotations = await prisma.annotation.findMany({
      where: {
        OR: [
          { personaId: { in: personas.map(p => p.id) } },
          { personaId: null } // Object annotations
        ]
      },
      orderBy: { createdAt: 'asc' }
    })
    const convertedAnnotations = annotations
      .map(a => this.convertPrismaAnnotation(a))
      .filter((a): a is NonNullable<typeof a> => a !== null)
    if (convertedAnnotations.length > 0) {
      lines.push(this.exportAnnotations(convertedAnnotations))
    }

    return lines.filter(Boolean).join('\n')
  }
}
