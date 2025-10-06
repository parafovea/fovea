import { Annotation as PrismaAnnotation } from '@prisma/client'

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
  metadata?: Record<string, any>
}

/**
 * @interface InterpolationSegment
 * @description Defines interpolation behavior between two keyframes.
 */
interface InterpolationSegment {
  startFrame: number
  endFrame: number
  type: 'linear' | 'bezier' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold' | 'parametric'
  controlPoints?: any
  parametric?: any
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
  metadata?: Record<string, any>
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
   *
   * @param annotation - Annotation to export
   * @returns JSON string with keyframes-only
   */
  exportKeyframesOnly(annotation: Annotation): string {
    const sequence = annotation.boundingBoxSequence

    // Extract only keyframes
    const keyframes = sequence.boxes.filter(box => box.isKeyframe)

    // Create export-ready sequence
    const exportSequence: BoundingBoxSequence = {
      boxes: keyframes,
      interpolationSegments: sequence.interpolationSegments,
      visibilityRanges: sequence.visibilityRanges,
      trackId: sequence.trackId,
      trackingSource: sequence.trackingSource,
      trackingConfidence: sequence.trackingConfidence,
      totalFrames: sequence.totalFrames,
      keyframeCount: keyframes.length,
      interpolatedFrameCount: sequence.boxes.length - keyframes.length
    }

    // Create export data
    const exportData: any = {
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
   *
   * @param annotation - Annotation to export
   * @returns JSON string with all interpolated frames
   */
  exportFullSequence(annotation: Annotation): string {
    const sequence = annotation.boundingBoxSequence

    // All boxes (keyframes + interpolated)
    const allBoxes = sequence.boxes

    // Create export-ready sequence with all frames
    const exportSequence: BoundingBoxSequence = {
      boxes: allBoxes,
      interpolationSegments: sequence.interpolationSegments,
      visibilityRanges: sequence.visibilityRanges,
      trackId: sequence.trackId,
      trackingSource: sequence.trackingSource,
      trackingConfidence: sequence.trackingConfidence,
      totalFrames: sequence.totalFrames,
      keyframeCount: allBoxes.filter(b => b.isKeyframe).length,
      interpolatedFrameCount: allBoxes.filter(b => !b.isKeyframe).length
    }

    // Create export data (same structure as keyframes-only)
    const exportData: any = {
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
   *
   * @param sequence - Bounding box sequence to validate
   * @param videoWidth - Video width in pixels (optional, for boundary validation)
   * @param videoHeight - Video height in pixels (optional, for boundary validation)
   * @returns Validation result
   */
  validateSequence(
    sequence: BoundingBoxSequence,
    videoWidth?: number,
    videoHeight?: number
  ): SequenceValidationResult {
    const errors: string[] = []

    // Validate minimum keyframes (at least 1)
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
   * @param prismaAnnotation - Annotation from Prisma
   * @returns Typed annotation
   */
  convertPrismaAnnotation(prismaAnnotation: PrismaAnnotation): Annotation {
    const frames = prismaAnnotation.frames as any

    // Parse annotation type from frames data
    const annotationType = frames.annotationType || 'type'

    // Build the annotation object
    const annotation: Annotation = {
      id: prismaAnnotation.id,
      videoId: prismaAnnotation.videoId,
      annotationType,
      boundingBoxSequence: frames.boundingBoxSequence,
      createdAt: prismaAnnotation.createdAt.toISOString(),
      updatedAt: prismaAnnotation.updatedAt.toISOString()
    }

    // Add type-specific fields
    if (annotationType === 'type') {
      annotation.personaId = prismaAnnotation.personaId
      annotation.typeCategory = frames.typeCategory
      annotation.typeId = frames.typeId
    } else {
      annotation.linkedEntityId = frames.linkedEntityId
      annotation.linkedEventId = frames.linkedEventId
      annotation.linkedTimeId = frames.linkedTimeId
      annotation.linkedLocationId = frames.linkedLocationId
      annotation.linkedCollectionId = frames.linkedCollectionId
      annotation.linkedCollectionType = frames.linkedCollectionType
    }

    // Add optional fields
    if (prismaAnnotation.confidence !== null) {
      annotation.confidence = prismaAnnotation.confidence
    }
    if (frames.notes) annotation.notes = frames.notes
    if (frames.metadata) annotation.metadata = frames.metadata
    if (frames.createdBy) annotation.createdBy = frames.createdBy

    return annotation
  }
}
