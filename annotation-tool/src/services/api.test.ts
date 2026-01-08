import { describe, it, expect } from 'vitest'
import { transformFrontendToBackend, transformBackendToFrontend, BackendAnnotation } from './api.js'
import type { ObjectAnnotation, TypeAnnotation, BoundingBoxSequence } from '../models/types.js'

/**
 * Unit tests for API transformation functions.
 * Tests correct handling of personaId for type vs object annotations.
 */
describe('API Transformation Functions', () => {
  // Helper to create a minimal bounding box sequence
  const createBoundingBoxSequence = (): BoundingBoxSequence => ({
    boxes: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.2, frameNumber: 0 }],
    interpolationSegments: [],
    visibilityRanges: [{ startFrame: 0, endFrame: 100, visible: true }],
    totalFrames: 100,
    keyframeCount: 1,
    interpolatedFrameCount: 0
  })

  describe('transformFrontendToBackend', () => {
    it('returns null personaId for object annotations', () => {
      const objectAnnotation: ObjectAnnotation = {
        id: 'ann-1',
        videoId: 'video-1',
        annotationType: 'object',
        linkedEntityId: 'entity-1',
        boundingBoxSequence: createBoundingBoxSequence(),
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = transformFrontendToBackend(objectAnnotation)

      expect(result.personaId).toBeNull()
      expect(result.type).toBe('object')
      expect(result.label).toBe('entity-1')
      expect(result.videoId).toBe('video-1')
      expect(result.source).toBe('manual')
    })

    it('returns personaId for type annotations', () => {
      const typeAnnotation: TypeAnnotation = {
        id: 'ann-2',
        videoId: 'video-1',
        annotationType: 'type',
        personaId: 'persona-1',
        typeCategory: 'entity',
        typeId: 'entity-type-1',
        boundingBoxSequence: createBoundingBoxSequence(),
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = transformFrontendToBackend(typeAnnotation)

      expect(result.personaId).toBe('persona-1')
      expect(result.type).toBe('type')
      expect(result.label).toBe('entity-type-1')
    })

    it('uses linkedEventId as label when linkedEntityId is not present', () => {
      const objectAnnotation: ObjectAnnotation = {
        id: 'ann-3',
        videoId: 'video-1',
        annotationType: 'object',
        linkedEventId: 'event-1',
        boundingBoxSequence: createBoundingBoxSequence(),
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = transformFrontendToBackend(objectAnnotation)

      expect(result.personaId).toBeNull()
      expect(result.label).toBe('event-1')
    })

    it('uses linkedTimeId as label when other linked IDs are not present', () => {
      const objectAnnotation: ObjectAnnotation = {
        id: 'ann-4',
        videoId: 'video-1',
        annotationType: 'object',
        linkedTimeId: 'time-1',
        boundingBoxSequence: createBoundingBoxSequence(),
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = transformFrontendToBackend(objectAnnotation)

      expect(result.personaId).toBeNull()
      expect(result.label).toBe('time-1')
    })

    it('uses "unlabeled" for object annotation with no linked IDs', () => {
      const objectAnnotation: ObjectAnnotation = {
        id: 'ann-5',
        videoId: 'video-1',
        annotationType: 'object',
        boundingBoxSequence: createBoundingBoxSequence(),
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = transformFrontendToBackend(objectAnnotation)

      expect(result.label).toBe('unlabeled')
    })

    it('includes confidence when present', () => {
      const typeAnnotation: TypeAnnotation = {
        id: 'ann-6',
        videoId: 'video-1',
        annotationType: 'type',
        personaId: 'persona-1',
        typeCategory: 'entity',
        typeId: 'entity-type-1',
        boundingBoxSequence: createBoundingBoxSequence(),
        confidence: 0.95,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = transformFrontendToBackend(typeAnnotation)

      expect(result.confidence).toBe(0.95)
    })
  })

  describe('transformBackendToFrontend', () => {
    it('handles null personaId for object annotations', () => {
      const backendAnnotation: BackendAnnotation = {
        id: 'ann-1',
        videoId: 'video-1',
        personaId: null,
        type: 'object',
        label: 'entity-1',
        frames: { boxes: [], interpolationSegments: [] },
        confidence: null,
        source: 'manual',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = transformBackendToFrontend(backendAnnotation)

      expect(result.annotationType).toBe('object')
      expect('personaId' in result).toBe(false)
      expect((result as ObjectAnnotation).linkedEntityId).toBe('entity-1')
    })

    it('preserves personaId for type annotations', () => {
      const backendAnnotation: BackendAnnotation = {
        id: 'ann-2',
        videoId: 'video-1',
        personaId: 'persona-1',
        type: 'type',
        label: 'entity-type-1',
        frames: { boxes: [], interpolationSegments: [] },
        confidence: 0.95,
        source: 'manual',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = transformBackendToFrontend(backendAnnotation)

      expect(result.annotationType).toBe('type')
      expect((result as TypeAnnotation).personaId).toBe('persona-1')
      expect((result as TypeAnnotation).typeId).toBe('entity-type-1')
    })

    it('treats type annotation with null personaId as object annotation', () => {
      // Edge case: if somehow type annotation has null personaId, treat as object
      const backendAnnotation: BackendAnnotation = {
        id: 'ann-3',
        videoId: 'video-1',
        personaId: null,
        type: 'type', // Backend says type but no personaId
        label: 'some-label',
        frames: { boxes: [], interpolationSegments: [] },
        confidence: null,
        source: 'manual',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = transformBackendToFrontend(backendAnnotation)

      // Should fall through to object annotation since personaId is null
      expect(result.annotationType).toBe('object')
    })

    it('preserves confidence when present', () => {
      const backendAnnotation: BackendAnnotation = {
        id: 'ann-4',
        videoId: 'video-1',
        personaId: 'persona-1',
        type: 'type',
        label: 'entity-type-1',
        frames: { boxes: [] },
        confidence: 0.87,
        source: 'manual',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = transformBackendToFrontend(backendAnnotation)

      expect(result.confidence).toBe(0.87)
    })

    it('converts null confidence to undefined', () => {
      const backendAnnotation: BackendAnnotation = {
        id: 'ann-5',
        videoId: 'video-1',
        personaId: null,
        type: 'object',
        label: 'entity-1',
        frames: { boxes: [] },
        confidence: null,
        source: 'manual',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z'
      }

      const result = transformBackendToFrontend(backendAnnotation)

      expect(result.confidence).toBeUndefined()
    })

    it('preserves timestamps', () => {
      const backendAnnotation: BackendAnnotation = {
        id: 'ann-6',
        videoId: 'video-1',
        personaId: null,
        type: 'object',
        label: 'entity-1',
        frames: { boxes: [] },
        confidence: null,
        source: 'manual',
        createdAt: '2025-01-08T12:00:00Z',
        updatedAt: '2025-01-08T13:00:00Z'
      }

      const result = transformBackendToFrontend(backendAnnotation)

      expect(result.createdAt).toBe('2025-01-08T12:00:00Z')
      expect(result.updatedAt).toBe('2025-01-08T13:00:00Z')
    })
  })
})
