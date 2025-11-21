import { describe, it, expect } from 'vitest'
import { transformBackendToFrontend, transformFrontendToBackend, BackendAnnotation } from './api'
import { Annotation } from '../models/types'

describe('Annotation Transformation Functions', () => {
  describe('transformBackendToFrontend', () => {
    it('transforms type annotation from backend to frontend format', () => {
      const backendAnnotation: BackendAnnotation = {
        id: 'test-id-123',
        videoId: 'video-123',
        personaId: 'persona-123',
        type: 'type',
        label: 'entity-type-456',
        frames: {
          boxes: [{ x: 10, y: 20, width: 100, height: 200, isKeyframe: true, frameNumber: 0 }],
          totalFrames: 30,
          keyframeCount: 1,
          visibilityRanges: [{ visible: true, startFrame: 0, endFrame: 29 }],
          interpolationSegments: [],
          interpolatedFrameCount: 29
        },
        confidence: 0.95,
        source: 'manual',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      }

      const frontendAnnotation = transformBackendToFrontend(backendAnnotation)

      expect(frontendAnnotation.id).toBe('test-id-123')
      expect(frontendAnnotation.videoId).toBe('video-123')
      expect(frontendAnnotation.annotationType).toBe('type')
      expect(frontendAnnotation).toHaveProperty('personaId', 'persona-123')
      expect(frontendAnnotation).toHaveProperty('typeId', 'entity-type-456')
      expect(frontendAnnotation.boundingBoxSequence).toEqual(backendAnnotation.frames)
      expect(frontendAnnotation.confidence).toBe(0.95)
      expect(frontendAnnotation.createdAt).toBe('2025-01-01T00:00:00.000Z')
      expect(frontendAnnotation.updatedAt).toBe('2025-01-01T00:00:00.000Z')
    })

    it('transforms object annotation from backend to frontend format', () => {
      const backendAnnotation: BackendAnnotation = {
        id: 'test-id-456',
        videoId: 'video-456',
        personaId: 'video-456', // Fallback for object annotations
        type: 'object',
        label: 'entity-789',
        frames: {
          boxes: [{ x: 50, y: 60, width: 150, height: 250, isKeyframe: true, frameNumber: 0 }],
          totalFrames: 60,
          keyframeCount: 1,
          visibilityRanges: [{ visible: true, startFrame: 0, endFrame: 59 }],
          interpolationSegments: [],
          interpolatedFrameCount: 59
        },
        confidence: null,
        source: 'manual',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      }

      const frontendAnnotation = transformBackendToFrontend(backendAnnotation)

      expect(frontendAnnotation.id).toBe('test-id-456')
      expect(frontendAnnotation.videoId).toBe('video-456')
      expect(frontendAnnotation.annotationType).toBe('object')
      expect(frontendAnnotation).toHaveProperty('linkedEntityId', 'entity-789')
      expect(frontendAnnotation.boundingBoxSequence).toEqual(backendAnnotation.frames)
      expect(frontendAnnotation.confidence).toBeUndefined() // null -> undefined
    })

    it('handles null confidence correctly', () => {
      const backendAnnotation: BackendAnnotation = {
        id: 'test-id',
        videoId: 'video-id',
        personaId: 'persona-id',
        type: 'type',
        label: 'type-id',
        frames: { boxes: [], totalFrames: 0, keyframeCount: 0, visibilityRanges: [], interpolationSegments: [], interpolatedFrameCount: 0 },
        confidence: null,
        source: 'manual',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      }

      const frontendAnnotation = transformBackendToFrontend(backendAnnotation)

      expect(frontendAnnotation.confidence).toBeUndefined()
    })
  })

  describe('transformFrontendToBackend', () => {
    it('transforms type annotation from frontend to backend format', () => {
      const frontendAnnotation: Annotation = {
        id: 'test-id-123',
        videoId: 'video-123',
        annotationType: 'type',
        personaId: 'persona-123',
        typeId: 'entity-type-456',
        typeCategory: 'entity',
        boundingBoxSequence: {
          boxes: [{ x: 10, y: 20, width: 100, height: 200, isKeyframe: true, frameNumber: 0 }],
          totalFrames: 30,
          keyframeCount: 1,
          visibilityRanges: [{ visible: true, startFrame: 0, endFrame: 29 }],
          interpolationSegments: [],
          interpolatedFrameCount: 29
        },
        confidence: 0.95
      }

      const backendPayload = transformFrontendToBackend(frontendAnnotation)

      expect(backendPayload.videoId).toBe('video-123')
      expect(backendPayload.personaId).toBe('persona-123')
      expect(backendPayload.type).toBe('type')
      expect(backendPayload.label).toBe('entity-type-456')
      expect(backendPayload.frames).toEqual(frontendAnnotation.boundingBoxSequence)
      expect(backendPayload.confidence).toBe(0.95)
      expect(backendPayload.source).toBe('manual')
    })

    it('transforms object annotation from frontend to backend format', () => {
      const frontendAnnotation: Annotation = {
        id: 'test-id-456',
        videoId: 'video-456',
        annotationType: 'object',
        linkedEntityId: 'entity-789',
        boundingBoxSequence: {
          boxes: [{ x: 50, y: 60, width: 150, height: 250, isKeyframe: true, frameNumber: 0 }],
          totalFrames: 60,
          keyframeCount: 1,
          visibilityRanges: [{ visible: true, startFrame: 0, endFrame: 59 }],
          interpolationSegments: [],
          interpolatedFrameCount: 59
        }
      }

      const backendPayload = transformFrontendToBackend(frontendAnnotation)

      expect(backendPayload.videoId).toBe('video-456')
      expect(backendPayload.personaId).toBe('video-456') // Falls back to videoId for object annotations
      expect(backendPayload.type).toBe('object')
      expect(backendPayload.label).toBe('entity-789')
      expect(backendPayload.frames).toEqual(frontendAnnotation.boundingBoxSequence)
      expect(backendPayload.source).toBe('manual')
    })

    it('handles missing typeId with fallback to unlabeled', () => {
      const frontendAnnotation: Annotation = {
        id: 'test-id',
        videoId: 'video-id',
        annotationType: 'type',
        personaId: 'persona-id',
        typeCategory: 'entity',
        boundingBoxSequence: { boxes: [], totalFrames: 0, keyframeCount: 0, visibilityRanges: [], interpolationSegments: [], interpolatedFrameCount: 0 }
      }

      const backendPayload = transformFrontendToBackend(frontendAnnotation)

      expect(backendPayload.label).toBe('unlabeled')
    })

    it('handles missing linked entity/event/time with fallback to unlabeled', () => {
      const frontendAnnotation: Annotation = {
        id: 'test-id',
        videoId: 'video-id',
        annotationType: 'object',
        boundingBoxSequence: { boxes: [], totalFrames: 0, keyframeCount: 0, visibilityRanges: [], interpolationSegments: [], interpolatedFrameCount: 0 }
      }

      const backendPayload = transformFrontendToBackend(frontendAnnotation)

      expect(backendPayload.label).toBe('unlabeled')
    })

    it('prioritizes linkedEntityId over linkedEventId and linkedTimeId', () => {
      const frontendAnnotation: Annotation = {
        id: 'test-id',
        videoId: 'video-id',
        annotationType: 'object',
        linkedEntityId: 'entity-123',
        linkedEventId: 'event-456',
        linkedTimeId: 'time-789',
        boundingBoxSequence: { boxes: [], totalFrames: 0, keyframeCount: 0, visibilityRanges: [], interpolationSegments: [], interpolatedFrameCount: 0 }
      }

      const backendPayload = transformFrontendToBackend(frontendAnnotation)

      expect(backendPayload.label).toBe('entity-123')
    })
  })

  describe('round-trip transformation', () => {
    it('correctly round-trips a type annotation', () => {
      const backendAnnotation: BackendAnnotation = {
        id: 'test-id',
        videoId: 'video-id',
        personaId: 'persona-id',
        type: 'type',
        label: 'type-id',
        frames: {
          boxes: [{ x: 10, y: 20, width: 100, height: 200, isKeyframe: true, frameNumber: 0 }],
          totalFrames: 30,
          keyframeCount: 1,
          visibilityRanges: [{ visible: true, startFrame: 0, endFrame: 29 }],
          interpolationSegments: [],
          interpolatedFrameCount: 29
        },
        confidence: 0.9,
        source: 'manual',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      }

      const frontendAnnotation = transformBackendToFrontend(backendAnnotation)
      const backendPayload = transformFrontendToBackend(frontendAnnotation)

      expect(backendPayload.videoId).toBe(backendAnnotation.videoId)
      expect(backendPayload.personaId).toBe(backendAnnotation.personaId)
      expect(backendPayload.type).toBe(backendAnnotation.type)
      expect(backendPayload.label).toBe(backendAnnotation.label)
      expect(backendPayload.frames).toEqual(backendAnnotation.frames)
      expect(backendPayload.confidence).toBe(backendAnnotation.confidence)
    })
  })
})
