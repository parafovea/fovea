import { describe, it, expect, beforeEach } from 'vitest'
import { AnnotationExporter } from '../../src/services/export-handler.js'
import type { Annotation, Persona, Ontology, VideoSummary, Claim, ClaimRelation } from '@prisma/client'

/**
 * Creates a test annotation with the given overrides.
 */
function createTestAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'ann-1',
    videoId: 'vid-1',
    personaId: 'persona-1',
    type: 'type',
    label: 'entity-type-1',
    frames: {
      boxes: [{ x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }],
      interpolationSegments: [],
      visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
      totalFrames: 1,
      keyframeCount: 1,
      interpolatedFrameCount: 0
    },
    confidence: 0.95,
    source: 'manual',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides
  }
}

/**
 * Creates a test persona with the given overrides.
 */
function createTestPersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'persona-1',
    userId: 'user-1',
    name: 'Test Persona',
    role: 'Analyst',
    informationNeed: 'Testing export functionality',
    details: 'Additional details',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides
  }
}

/**
 * Creates a test ontology with the given overrides.
 */
function createTestOntology(overrides: Partial<Ontology> = {}): Ontology {
  return {
    id: 'ont-1',
    personaId: 'persona-1',
    entityTypes: [{ id: 'entity-type-1', name: 'Person' }],
    eventTypes: [{ id: 'event-type-1', name: 'Meeting' }],
    roleTypes: [{ id: 'role-type-1', name: 'Participant' }],
    relationTypes: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides
  }
}

/**
 * Creates a test video summary with the given overrides.
 */
function createTestSummary(overrides: Partial<VideoSummary> = {}): VideoSummary {
  return {
    id: 'summary-1',
    videoId: 'vid-1',
    personaId: 'persona-1',
    summary: [{ type: 'text', content: 'Test summary' }],
    visualAnalysis: 'Visual analysis text',
    audioTranscript: 'Audio transcript',
    keyFrames: null,
    confidence: 0.95,
    transcriptJson: null,
    audioLanguage: 'en',
    speakerCount: 2,
    audioModelUsed: 'whisper',
    visualModelUsed: 'gpt-4-vision',
    fusionStrategy: 'early',
    createdBy: 'user-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides
  }
}

/**
 * Creates a test claim with the given overrides.
 */
function createTestClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    id: 'claim-1',
    summaryId: 'summary-1',
    summaryType: 'video',
    text: 'This is a test claim',
    gloss: [{ type: 'text', content: 'test claim' }],
    parentClaimId: null,
    textSpans: null,
    claimerType: 'annotator',
    claimerGloss: null,
    claimRelation: null,
    claimEventId: null,
    claimTimeId: null,
    claimLocationId: null,
    confidence: 0.9,
    modelUsed: 'gpt-4',
    extractionStrategy: 'automatic',
    createdBy: 'user-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides
  }
}

/**
 * Creates a test claim relation with the given overrides.
 */
function createTestClaimRelation(overrides: Partial<ClaimRelation> = {}): ClaimRelation {
  return {
    id: 'rel-1',
    sourceClaimId: 'claim-1',
    targetClaimId: 'claim-2',
    relationTypeId: 'supports',
    sourceSpans: null,
    targetSpans: null,
    confidence: 0.85,
    notes: 'Test relation',
    createdBy: 'user-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    ...overrides
  }
}

/**
 * Unit tests for AnnotationExporter.
 * Tests export functionality for all data types.
 */
describe('AnnotationExporter', () => {
  let exporter: AnnotationExporter

  beforeEach(() => {
    exporter = new AnnotationExporter()
  })

  describe('convertPrismaAnnotation', () => {
    it('correctly reads annotation type from type column', () => {
      const prismaAnnotation = createTestAnnotation()

      const result = exporter.convertPrismaAnnotation(prismaAnnotation)

      expect(result).not.toBeNull()
      expect(result!.annotationType).toBe('type')
      expect(result!.personaId).toBe('persona-1')
    })

    it('correctly reads object annotation type', () => {
      const prismaAnnotation = createTestAnnotation({
        id: 'ann-2',
        personaId: null,
        type: 'object',
        label: 'entity-1',
        frames: {
          boxes: [],
          interpolationSegments: [],
          visibilityRanges: [],
          totalFrames: 0,
          keyframeCount: 0,
          interpolatedFrameCount: 0
        },
        confidence: null
      })

      const result = exporter.convertPrismaAnnotation(prismaAnnotation)

      expect(result).not.toBeNull()
      expect(result!.annotationType).toBe('object')
      expect(result!.linkedEntityId).toBe('entity-1')
    })

    it('uses frames directly as boundingBoxSequence', () => {
      const prismaAnnotation = createTestAnnotation({
        id: 'ann-3',
        frames: {
          boxes: [
            { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
            { x: 50, y: 60, width: 100, height: 50, frameNumber: 100, isKeyframe: true }
          ],
          interpolationSegments: [{ startFrame: 0, endFrame: 100, type: 'linear' }],
          visibilityRanges: [{ startFrame: 0, endFrame: 100, visible: true }],
          totalFrames: 101,
          keyframeCount: 2,
          interpolatedFrameCount: 99,
          trackingSource: 'manual'
        },
        confidence: null
      })

      const result = exporter.convertPrismaAnnotation(prismaAnnotation)

      expect(result).not.toBeNull()
      expect(result!.boundingBoxSequence.boxes).toHaveLength(2)
      expect(result!.boundingBoxSequence.interpolationSegments).toHaveLength(1)
      expect(result!.boundingBoxSequence.trackingSource).toBe('manual')
    })

    it('handles annotations without bounding boxes gracefully', () => {
      const prismaAnnotation = createTestAnnotation({
        id: 'ann-4',
        frames: {}, // Empty frames - valid for ontology-only annotations
        confidence: null
      })

      const result = exporter.convertPrismaAnnotation(prismaAnnotation)

      expect(result).not.toBeNull()
      expect(result!.boundingBoxSequence.boxes).toHaveLength(0)
      expect(result!.boundingBoxSequence.totalFrames).toBe(0)
    })

    it('handles null frames gracefully', () => {
      const prismaAnnotation = createTestAnnotation({
        id: 'ann-5',
        frames: null,
        confidence: null
      })

      const result = exporter.convertPrismaAnnotation(prismaAnnotation)

      expect(result).not.toBeNull()
      expect(result!.boundingBoxSequence.boxes).toHaveLength(0)
    })
  })

  describe('exportKeyframesOnly', () => {
    it('exports only keyframes from sequence', () => {
      const annotation = {
        id: 'ann-1',
        videoId: 'vid-1',
        annotationType: 'type' as const,
        personaId: 'persona-1',
        typeCategory: 'entity' as const,
        typeId: 'entity-type-1',
        boundingBoxSequence: {
          boxes: [
            { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
            { x: 30, y: 40, width: 100, height: 50, frameNumber: 50, isKeyframe: false },
            { x: 50, y: 60, width: 100, height: 50, frameNumber: 100, isKeyframe: true }
          ],
          interpolationSegments: [{ startFrame: 0, endFrame: 100, type: 'linear' as const }],
          visibilityRanges: [{ startFrame: 0, endFrame: 100, visible: true }],
          totalFrames: 101,
          keyframeCount: 2,
          interpolatedFrameCount: 1
        },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = exporter.exportKeyframesOnly(annotation)
      const parsed = JSON.parse(result)

      expect(parsed.type).toBe('annotation')
      expect(parsed.data.boundingBoxSequence.boxes).toHaveLength(2)
      expect(parsed.data.boundingBoxSequence.boxes.every((b: { isKeyframe?: boolean }) => b.isKeyframe)).toBe(true)
    })

    it('handles annotations without bounding boxes', () => {
      const annotation = {
        id: 'ann-2',
        videoId: 'vid-1',
        annotationType: 'type' as const,
        personaId: 'persona-1',
        typeCategory: 'entity' as const,
        typeId: 'entity-type-1',
        boundingBoxSequence: {
          boxes: [],
          interpolationSegments: [],
          visibilityRanges: [],
          totalFrames: 0,
          keyframeCount: 0,
          interpolatedFrameCount: 0
        },
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = exporter.exportKeyframesOnly(annotation)
      const parsed = JSON.parse(result)

      expect(parsed.type).toBe('annotation')
      expect(parsed.data.boundingBoxSequence.boxes).toHaveLength(0)
    })
  })

  describe('validateSequence', () => {
    it('validates a valid sequence', () => {
      const sequence = {
        boxes: [
          { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
          { x: 50, y: 60, width: 100, height: 50, frameNumber: 100, isKeyframe: true }
        ],
        interpolationSegments: [{ startFrame: 0, endFrame: 100, type: 'linear' as const }],
        visibilityRanges: [{ startFrame: 0, endFrame: 100, visible: true }],
        totalFrames: 101,
        keyframeCount: 2,
        interpolatedFrameCount: 99
      }

      const result = exporter.validateSequence(sequence)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('treats empty sequences as valid', () => {
      const sequence = {
        boxes: [],
        interpolationSegments: [],
        visibilityRanges: [],
        totalFrames: 0,
        keyframeCount: 0,
        interpolatedFrameCount: 0
      }

      const result = exporter.validateSequence(sequence)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('treats null/undefined sequences as valid', () => {
      const result1 = exporter.validateSequence(null)
      const result2 = exporter.validateSequence(undefined)

      expect(result1.valid).toBe(true)
      expect(result2.valid).toBe(true)
    })

    it('rejects sequence with no keyframes (when boxes exist)', () => {
      const sequence = {
        boxes: [{ x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: false }],
        interpolationSegments: [],
        visibilityRanges: [],
        totalFrames: 1,
        keyframeCount: 0,
        interpolatedFrameCount: 1
      }

      const result = exporter.validateSequence(sequence)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Sequence must have at least 1 keyframe')
    })

    it('allows interpolation gap when gap falls in a non-visible range', () => {
      // Object appears frames 0-50, disappears 51-149, reappears 150-200
      const sequence = {
        boxes: [
          { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
          { x: 20, y: 30, width: 100, height: 50, frameNumber: 50, isKeyframe: true },
          { x: 30, y: 40, width: 100, height: 50, frameNumber: 150, isKeyframe: true },
          { x: 40, y: 50, width: 100, height: 50, frameNumber: 200, isKeyframe: true }
        ],
        interpolationSegments: [
          { startFrame: 0, endFrame: 50, type: 'linear' as const },
          { startFrame: 150, endFrame: 200, type: 'linear' as const }
        ],
        visibilityRanges: [
          { startFrame: 0, endFrame: 50, visible: true },
          { startFrame: 51, endFrame: 149, visible: false },
          { startFrame: 150, endFrame: 200, visible: true }
        ],
        totalFrames: 201,
        keyframeCount: 4,
        interpolatedFrameCount: 197
      }

      const result = exporter.validateSequence(sequence)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('rejects interpolation gap when gap overlaps a visible range', () => {
      const sequence = {
        boxes: [
          { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
          { x: 20, y: 30, width: 100, height: 50, frameNumber: 50, isKeyframe: true },
          { x: 30, y: 40, width: 100, height: 50, frameNumber: 150, isKeyframe: true },
          { x: 40, y: 50, width: 100, height: 50, frameNumber: 200, isKeyframe: true }
        ],
        interpolationSegments: [
          { startFrame: 0, endFrame: 50, type: 'linear' as const },
          { startFrame: 150, endFrame: 200, type: 'linear' as const }
        ],
        visibilityRanges: [
          { startFrame: 0, endFrame: 200, visible: true }
        ],
        totalFrames: 201,
        keyframeCount: 4,
        interpolatedFrameCount: 197
      }

      const result = exporter.validateSequence(sequence)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Gap between interpolation segments'))).toBe(true)
    })
  })

  describe('getExportStats', () => {
    it('calculates correct stats for annotations', () => {
      const annotations = [
        {
          id: 'ann-1',
          videoId: 'vid-1',
          annotationType: 'type' as const,
          boundingBoxSequence: {
            boxes: [
              { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
              { x: 50, y: 60, width: 100, height: 50, frameNumber: 100, isKeyframe: true }
            ],
            interpolationSegments: [],
            visibilityRanges: [],
            totalFrames: 101,
            keyframeCount: 2,
            interpolatedFrameCount: 0
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z'
        },
        {
          id: 'ann-2',
          videoId: 'vid-1',
          annotationType: 'type' as const,
          boundingBoxSequence: {
            boxes: [{ x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z'
        }
      ]

      const stats = exporter.getExportStats(annotations, false)

      expect(stats.annotationCount).toBe(2)
      expect(stats.sequenceCount).toBe(2)
      expect(stats.keyframeCount).toBe(3)
    })

    it('handles annotations without bounding boxes', () => {
      const annotations = [
        {
          id: 'ann-1',
          videoId: 'vid-1',
          annotationType: 'type' as const,
          boundingBoxSequence: {
            boxes: [],
            interpolationSegments: [],
            visibilityRanges: [],
            totalFrames: 0,
            keyframeCount: 0,
            interpolatedFrameCount: 0
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z'
        }
      ]

      const stats = exporter.getExportStats(annotations, false)

      expect(stats.annotationCount).toBe(1)
      expect(stats.sequenceCount).toBe(1)
      expect(stats.keyframeCount).toBe(0)
    })
  })

  describe('exportPersona', () => {
    it('exports persona with correct format', () => {
      const persona = createTestPersona()

      const result = exporter.exportPersona(persona)
      const parsed = JSON.parse(result)

      expect(parsed.type).toBe('persona')
      expect(parsed.data.id).toBe('persona-1')
      expect(parsed.data.name).toBe('Test Persona')
      expect(parsed.data.role).toBe('Analyst')
      expect(parsed.data.informationNeed).toBe('Testing export functionality')
    })
  })

  describe('exportOntology', () => {
    it('exports ontology with correct format', () => {
      const ontology = createTestOntology()

      const result = exporter.exportOntology(ontology)
      const parsed = JSON.parse(result)

      expect(parsed.type).toBe('ontology')
      expect(parsed.data.personaId).toBe('persona-1')
      expect(parsed.data.entityTypes).toHaveLength(1)
      expect(parsed.data.eventTypes).toHaveLength(1)
      expect(parsed.data.roleTypes).toHaveLength(1)
    })
  })

  describe('exportSummary', () => {
    it('exports summary with correct format', () => {
      const summary = createTestSummary()

      const result = exporter.exportSummary(summary)
      const parsed = JSON.parse(result)

      expect(parsed.type).toBe('summary')
      expect(parsed.data.id).toBe('summary-1')
      expect(parsed.data.videoId).toBe('vid-1')
      expect(parsed.data.personaId).toBe('persona-1')
      expect(parsed.data.confidence).toBe(0.95)
    })
  })

  describe('exportClaim', () => {
    it('exports claim with correct format', () => {
      const claim = createTestClaim()

      const result = exporter.exportClaim(claim)
      const parsed = JSON.parse(result)

      expect(parsed.type).toBe('claim')
      expect(parsed.data.id).toBe('claim-1')
      expect(parsed.data.text).toBe('This is a test claim')
      expect(parsed.data.summaryId).toBe('summary-1')
    })
  })

  describe('exportClaimRelation', () => {
    it('exports claim relation with correct format', () => {
      const relation = createTestClaimRelation()

      const result = exporter.exportClaimRelation(relation)
      const parsed = JSON.parse(result)

      expect(parsed.type).toBe('claim_relation')
      expect(parsed.data.id).toBe('rel-1')
      expect(parsed.data.sourceClaimId).toBe('claim-1')
      expect(parsed.data.targetClaimId).toBe('claim-2')
      expect(parsed.data.relationTypeId).toBe('supports')
    })
  })

  describe('exportAnnotations', () => {
    it('exports multiple annotations in JSONL format', () => {
      const annotations = [
        {
          id: 'ann-1',
          videoId: 'vid-1',
          annotationType: 'type' as const,
          personaId: 'persona-1',
          typeCategory: 'entity' as const,
          typeId: 'entity-type-1',
          boundingBoxSequence: {
            boxes: [{ x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z'
        },
        {
          id: 'ann-2',
          videoId: 'vid-1',
          annotationType: 'object' as const,
          linkedEntityId: 'entity-1',
          boundingBoxSequence: {
            boxes: [{ x: 50, y: 60, width: 80, height: 40, frameNumber: 0, isKeyframe: true }],
            interpolationSegments: [],
            visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z'
        }
      ]

      const result = exporter.exportAnnotations(annotations)
      const lines = result.split('\n').filter(Boolean)

      expect(lines).toHaveLength(2)

      const parsed1 = JSON.parse(lines[0])
      expect(parsed1.type).toBe('annotation')
      expect(parsed1.data.id).toBe('ann-1')

      const parsed2 = JSON.parse(lines[1])
      expect(parsed2.type).toBe('annotation')
      expect(parsed2.data.id).toBe('ann-2')
    })
  })
})
