import { describe, it, expect } from 'vitest'
import {
  BoundingBoxSchema,
  BoundingBoxSequenceSchema,
  PersonaSchema,
  OntologySchema,
  AnnotationDataSchema,
  VideoSummarySchema,
  ClaimSchema,
  ClaimRelationSchema,
  ExportLineSchema,
  parseExportLine
} from '../../src/services/export-schemas.js'

/**
 * Unit tests for Zod export schemas.
 * Tests schema validation for all exportable data types.
 */
describe('Export Schemas', () => {
  describe('BoundingBoxSchema', () => {
    it('validates a valid bounding box', () => {
      const box = {
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        frameNumber: 0,
        isKeyframe: true,
        confidence: 0.95
      }

      const result = BoundingBoxSchema.safeParse(box)
      expect(result.success).toBe(true)
    })

    it('validates bounding box without optional fields', () => {
      const box = {
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        frameNumber: 0
      }

      const result = BoundingBoxSchema.safeParse(box)
      expect(result.success).toBe(true)
    })

    it('allows negative coordinates (valid for relative positioning)', () => {
      const box = {
        x: -10,
        y: -20,
        width: 100,
        height: 50,
        frameNumber: 0
      }

      // Schema allows any number for x/y (for flexibility with coordinate systems)
      const result = BoundingBoxSchema.safeParse(box)
      expect(result.success).toBe(true)
    })

    it('allows zero dimensions (for edge cases)', () => {
      const box = {
        x: 10,
        y: 20,
        width: 0,
        height: 0,
        frameNumber: 0
      }

      // Schema allows any number for dimensions
      const result = BoundingBoxSchema.safeParse(box)
      expect(result.success).toBe(true)
    })

    it('rejects negative frame number', () => {
      const box = {
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        frameNumber: -1
      }

      const result = BoundingBoxSchema.safeParse(box)
      expect(result.success).toBe(false)
    })

    it('rejects confidence out of range', () => {
      const box = {
        x: 10,
        y: 20,
        width: 100,
        height: 50,
        frameNumber: 0,
        confidence: 1.5
      }

      const result = BoundingBoxSchema.safeParse(box)
      expect(result.success).toBe(false)
    })
  })

  describe('BoundingBoxSequenceSchema', () => {
    it('validates a complete sequence', () => {
      const sequence = {
        boxes: [
          { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
          { x: 50, y: 60, width: 100, height: 50, frameNumber: 100, isKeyframe: true }
        ],
        interpolationSegments: [
          { startFrame: 0, endFrame: 100, type: 'linear' }
        ],
        visibilityRanges: [
          { startFrame: 0, endFrame: 100, visible: true }
        ],
        totalFrames: 101,
        keyframeCount: 2,
        interpolatedFrameCount: 99
      }

      const result = BoundingBoxSequenceSchema.safeParse(sequence)
      expect(result.success).toBe(true)
    })

    it('validates an empty sequence', () => {
      const sequence = {
        boxes: [],
        interpolationSegments: [],
        visibilityRanges: [],
        totalFrames: 0,
        keyframeCount: 0,
        interpolatedFrameCount: 0
      }

      const result = BoundingBoxSequenceSchema.safeParse(sequence)
      expect(result.success).toBe(true)
    })

    it('validates sequence with tracking info', () => {
      const sequence = {
        boxes: [{ x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
        trackId: 'track-1',
        trackingSource: 'sam2',
        trackingConfidence: 0.95,
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0
      }

      const result = BoundingBoxSequenceSchema.safeParse(sequence)
      expect(result.success).toBe(true)
    })
  })

  describe('PersonaSchema', () => {
    it('validates a valid persona', () => {
      const persona = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        name: 'Test Persona',
        role: 'Analyst',
        informationNeed: 'Testing persona validation',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = PersonaSchema.safeParse(persona)
      expect(result.success).toBe(true)
    })

    it('validates persona with optional details', () => {
      const persona = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        name: 'Test Persona',
        role: 'Analyst',
        informationNeed: 'Testing persona validation',
        details: 'Additional details about the persona',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = PersonaSchema.safeParse(persona)
      expect(result.success).toBe(true)
    })

    it('rejects persona with empty name', () => {
      const persona = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        name: '',
        role: 'Analyst',
        informationNeed: 'Testing',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = PersonaSchema.safeParse(persona)
      expect(result.success).toBe(false)
    })
  })

  describe('OntologySchema', () => {
    it('validates a valid ontology', () => {
      const ontology = {
        personaId: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        entityTypes: [{
          id: 'entity-1',
          name: 'Person',
          gloss: [{ type: 'text', content: 'A person entity' }],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }],
        eventTypes: [],
        roleTypes: [],
        relationTypes: []
      }

      const result = OntologySchema.safeParse(ontology)
      expect(result.success).toBe(true)
    })

    it('validates ontology with all type arrays', () => {
      const ontology = {
        personaId: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        entityTypes: [{
          id: 'entity-1',
          name: 'Person',
          gloss: [{ type: 'text', content: 'A person entity' }],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }],
        eventTypes: [{
          id: 'event-1',
          name: 'Meeting',
          gloss: [{ type: 'text', content: 'A meeting event' }],
          roles: [],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }],
        roleTypes: [{
          id: 'role-1',
          name: 'Participant',
          gloss: [{ type: 'text', content: 'A participant role' }],
          allowedFillerTypes: ['entity'],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }],
        relationTypes: [{
          id: 'rel-1',
          name: 'knows',
          gloss: [{ type: 'text', content: 'A knows relation' }],
          sourceTypes: ['entity'],
          targetTypes: ['entity'],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z'
        }]
      }

      const result = OntologySchema.safeParse(ontology)
      expect(result.success).toBe(true)
    })

    it('rejects ontology with invalid entity type (missing required fields)', () => {
      const ontology = {
        personaId: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        entityTypes: [{ id: 'entity-1', name: 'Person' }], // Missing gloss, createdAt, updatedAt
        eventTypes: [],
        roleTypes: [],
        relationTypes: []
      }

      const result = OntologySchema.safeParse(ontology)
      expect(result.success).toBe(false)
    })
  })

  describe('AnnotationDataSchema', () => {
    it('validates a type annotation', () => {
      const annotation = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        videoId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        annotationType: 'type',
        personaId: 'e68d9c0a-6c1b-4e7f-0h4f-3c4d5e6f7g8h',
        typeId: 'entity-type-1',
        typeCategory: 'entity',
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
      }

      const result = AnnotationDataSchema.safeParse(annotation)
      expect(result.success).toBe(true)
    })

    it('validates an object annotation', () => {
      const annotation = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        videoId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        annotationType: 'object',
        linkedEntityId: 'e68d9c0a-6c1b-4e7f-0h4f-3c4d5e6f7g8h',
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

      const result = AnnotationDataSchema.safeParse(annotation)
      expect(result.success).toBe(true)
    })

    it('rejects invalid annotation type', () => {
      const annotation = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        videoId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        annotationType: 'invalid',
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

      const result = AnnotationDataSchema.safeParse(annotation)
      expect(result.success).toBe(false)
    })
  })

  describe('VideoSummarySchema', () => {
    it('validates a valid summary', () => {
      const summary = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        videoId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        personaId: 'e68d9c0a-6c1b-4e7f-0h4f-3c4d5e6f7g8h',
        summary: [{ type: 'text', content: 'Test summary' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = VideoSummarySchema.safeParse(summary)
      expect(result.success).toBe(true)
    })

    it('validates summary with all optional fields', () => {
      const summary = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        videoId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        personaId: 'e68d9c0a-6c1b-4e7f-0h4f-3c4d5e6f7g8h',
        summary: [{ type: 'text', content: 'Test summary' }],
        visualAnalysis: 'Visual analysis content',
        audioTranscript: 'Audio transcript content',
        confidence: 0.95,
        audioLanguage: 'en',
        speakerCount: 2,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = VideoSummarySchema.safeParse(summary)
      expect(result.success).toBe(true)
    })
  })

  describe('ClaimSchema', () => {
    it('validates a valid claim', () => {
      const claim = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        summaryId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        summaryType: 'video',
        text: 'This is a test claim',
        gloss: [{ type: 'text', content: 'This is a test claim' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = ClaimSchema.safeParse(claim)
      expect(result.success).toBe(true)
    })

    it('validates claim with all optional fields', () => {
      const claim = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        summaryId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        summaryType: 'video',
        text: 'This is a test claim',
        gloss: [{ type: 'text', content: 'test' }],
        parentClaimId: 'parent-claim-id',
        confidence: 0.9,
        claimType: 'factual',
        source: 'visual',
        notes: 'Some notes',
        createdBy: 'user-1',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = ClaimSchema.safeParse(claim)
      expect(result.success).toBe(true)
    })

    it('validates claim with modality metadata fields', () => {
      const claim = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        summaryId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        summaryType: 'video',
        text: 'This is a test claim',
        gloss: [{ type: 'text', content: 'test' }],
        audio: ['speech'],
        video: ['text'],
        metadata: ['text'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = ClaimSchema.safeParse(claim)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.audio).toEqual(['speech'])
        expect(result.data.video).toEqual(['text'])
        expect(result.data.metadata).toEqual(['text'])
      }
    })

    it('validates claim with null modality metadata fields', () => {
      const claim = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        summaryId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        summaryType: 'video',
        text: 'This is a test claim',
        gloss: [{ type: 'text', content: 'test' }],
        audio: null,
        video: null,
        metadata: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = ClaimSchema.safeParse(claim)
      expect(result.success).toBe(true)
    })

    it('validates claim without modality metadata fields (backward compatibility)', () => {
      const claim = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        summaryId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        summaryType: 'video',
        text: 'This is a test claim',
        gloss: [{ type: 'text', content: 'test' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = ClaimSchema.safeParse(claim)
      expect(result.success).toBe(true)
    })

    it('rejects claim with invalid audio enum value in array', () => {
      const claim = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        summaryId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        summaryType: 'video',
        text: 'This is a test claim',
        gloss: [{ type: 'text', content: 'test' }],
        audio: ['invalid-value'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = ClaimSchema.safeParse(claim)
      expect(result.success).toBe(false)
    })

    it('rejects claim with invalid video enum value in array', () => {
      const claim = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        summaryId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        summaryType: 'video',
        text: 'This is a test claim',
        gloss: [{ type: 'text', content: 'test' }],
        video: ['invalid-value'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = ClaimSchema.safeParse(claim)
      expect(result.success).toBe(false)
    })

    it('validates claim with multiple modality values', () => {
      const claim = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        summaryId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        summaryType: 'video',
        text: 'This is a test claim',
        gloss: [{ type: 'text', content: 'test' }],
        audio: ['speech', 'non-speech'],
        video: ['text', 'non-text'],
        metadata: ['text', 'non-text'],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = ClaimSchema.safeParse(claim)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.audio).toEqual(['speech', 'non-speech'])
        expect(result.data.video).toEqual(['text', 'non-text'])
        expect(result.data.metadata).toEqual(['text', 'non-text'])
      }
    })

    it('validates claim with collection summaryType', () => {
      const claim = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        summaryId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        summaryType: 'collection',
        text: 'This is a collection claim',
        gloss: [{ type: 'text', content: 'This is a collection claim' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = ClaimSchema.safeParse(claim)
      expect(result.success).toBe(true)
    })

    it('rejects claim missing required summaryType', () => {
      const claim = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        summaryId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        text: 'This is a test claim',
        gloss: [{ type: 'text', content: 'This is a test claim' }],
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = ClaimSchema.safeParse(claim)
      expect(result.success).toBe(false)
    })
  })

  describe('ClaimRelationSchema', () => {
    it('validates a valid claim relation', () => {
      const relation = {
        id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
        sourceClaimId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
        targetClaimId: 'e68d9c0a-6c1b-4e7f-0h4f-3c4d5e6f7g8h',
        relationTypeId: 'supports',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }

      const result = ClaimRelationSchema.safeParse(relation)
      expect(result.success).toBe(true)
    })
  })

  describe('ExportLineSchema', () => {
    it('validates persona export line', () => {
      const line = {
        type: 'persona',
        data: {
          id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
          name: 'Test Persona',
          role: 'Analyst',
          informationNeed: 'Testing',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z'
        }
      }

      const result = ExportLineSchema.safeParse(line)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe('persona')
      }
    })

    it('validates annotation export line', () => {
      const line = {
        type: 'annotation',
        data: {
          id: 'c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f',
          videoId: 'd57c8b9f-5b0a-4d6e-9g3e-2b3c4d5e6f7g',
          annotationType: 'type',
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
      }

      const result = ExportLineSchema.safeParse(line)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.type).toBe('annotation')
      }
    })

    it('rejects invalid type', () => {
      const line = {
        type: 'invalid',
        data: { id: 'test' }
      }

      const result = ExportLineSchema.safeParse(line)
      expect(result.success).toBe(false)
    })
  })

  describe('parseExportLine', () => {
    it('parses valid JSON line', () => {
      const line = '{"type":"persona","data":{"id":"c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f","name":"Test","role":"Analyst","informationNeed":"Testing","createdAt":"2024-01-01T00:00:00.000Z","updatedAt":"2024-01-02T00:00:00.000Z"}}'

      const result = parseExportLine(line, 1)

      expect(result.valid).toBe(true)
      expect(result.lineNumber).toBe(1)
      if (result.valid) {
        expect(result.data.type).toBe('persona')
      }
    })

    it('returns errors for invalid JSON', () => {
      const line = '{invalid json}'

      const result = parseExportLine(line, 1)

      expect(result.valid).toBe(false)
      if (!result.valid) {
        // Error format is "Invalid JSON: <parse error message>"
        expect(result.errors?.some(e => e.startsWith('Invalid JSON:'))).toBe(true)
      }
    })

    it('returns detailed errors for schema violations', () => {
      const line = '{"type":"persona","data":{"id":"test","name":"","role":"Analyst","informationNeed":"Testing","createdAt":"2024-01-01T00:00:00.000Z","updatedAt":"2024-01-02T00:00:00.000Z"}}'

      const result = parseExportLine(line, 1)

      expect(result.valid).toBe(false)
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(0)
      }
    })

    it('returns line number in result', () => {
      const line = '{"type":"persona","data":{"id":"c47b7a8e-4a9f-4c5e-8f2d-1a2b3c4d5e6f","name":"Test","role":"Analyst","informationNeed":"Testing","createdAt":"2024-01-01T00:00:00.000Z","updatedAt":"2024-01-02T00:00:00.000Z"}}'

      const result = parseExportLine(line, 42)

      expect(result.lineNumber).toBe(42)
    })
  })
})
