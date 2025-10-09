import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ImportHandler } from '../../src/services/import-handler.js'
import { SequenceValidator } from '../../src/services/import-validator.js'
import { DEFAULT_IMPORT_OPTIONS } from '../../src/services/import-types.js'

/**
 * Mock Prisma client for testing.
 */
const mockPrismaClient = {
  persona: {
    findMany: vi.fn().mockResolvedValue([])
  },
  video: {
    findMany: vi.fn().mockResolvedValue([])
  },
  worldState: {
    findFirst: vi.fn().mockResolvedValue(null)
  },
  annotation: {
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({})
  },
  importHistory: {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0)
  },
  $transaction: vi.fn((callback) => callback(mockPrismaClient))
} as unknown as ImportHandler['prisma']

describe('ImportHandler', () => {
  let handler: ImportHandler

  beforeEach(() => {
    handler = new ImportHandler(mockPrismaClient)
    vi.clearAllMocks()
  })

  describe('parseLine', () => {
    it('should parse valid JSON line', () => {
      const line = '{"type":"annotation","data":{"id":"ann-1","videoId":"vid-1"}}'
      const result = handler.parseLine(line, 1)

      expect(result.type).toBe('annotation')
      expect(result.data.id).toBe('ann-1')
      expect(result.lineNumber).toBe(1)
    })

    it('should throw error for invalid JSON', () => {
      const line = '{invalid json}'
      expect(() => handler.parseLine(line, 1)).toThrow()
    })

    it('should throw error for missing type field', () => {
      const line = '{"data":{"id":"ann-1"}}'
      expect(() => handler.parseLine(line, 1)).toThrow('must have "type" and "data" fields')
    })

    it('should throw error for missing data field', () => {
      const line = '{"type":"annotation"}'
      expect(() => handler.parseLine(line, 1)).toThrow('must have "type" and "data" fields')
    })
  })

  describe('validateLine - Annotations', () => {
    it('should validate single-keyframe sequence successfully', () => {
      const line = {
        type: 'annotation' as const,
        data: {
          id: 'ann-1',
          videoId: 'vid-1',
          annotationType: 'type',
          personaId: 'persona-1',
          typeId: 'type-1',
          typeCategory: 'entity',
          boundingBoxSequence: {
            boxes: [
              { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }
            ],
            interpolationSegments: [],
            visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
            totalFrames: 1,
            keyframeCount: 1,
            interpolatedFrameCount: 0
          }
        },
        lineNumber: 1
      }

      const result = handler.validateLine(line)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate multi-keyframe sequence with linear interpolation', () => {
      const line = {
        type: 'annotation' as const,
        data: {
          id: 'ann-2',
          videoId: 'vid-1',
          annotationType: 'type',
          personaId: 'persona-1',
          typeId: 'type-1',
          typeCategory: 'entity',
          boundingBoxSequence: {
            boxes: [
              { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
              { x: 50, y: 60, width: 100, height: 50, frameNumber: 100, isKeyframe: true }
            ],
            interpolationSegments: [
              { startFrame: 0, endFrame: 100, type: 'linear' }
            ],
            visibilityRanges: [{ startFrame: 0, endFrame: 100, visible: true }],
            totalFrames: 101,
            keyframeCount: 2,
            interpolatedFrameCount: 99
          }
        },
        lineNumber: 1
      }

      const result = handler.validateLine(line)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject sequence with no keyframes', () => {
      const line = {
        type: 'annotation' as const,
        data: {
          id: 'ann-3',
          videoId: 'vid-1',
          annotationType: 'type',
          personaId: 'persona-1',
          typeId: 'type-1',
          typeCategory: 'entity',
          boundingBoxSequence: {
            boxes: [
              { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: false }
            ],
            interpolationSegments: [],
            visibilityRanges: [],
            totalFrames: 1,
            keyframeCount: 0,
            interpolatedFrameCount: 1
          }
        },
        lineNumber: 1
      }

      const result = handler.validateLine(line)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Sequence must have at least 1 keyframe')
    })

    it('should reject sequence with unsorted keyframes', () => {
      const line = {
        type: 'annotation' as const,
        data: {
          id: 'ann-4',
          videoId: 'vid-1',
          annotationType: 'type',
          personaId: 'persona-1',
          typeId: 'type-1',
          typeCategory: 'entity',
          boundingBoxSequence: {
            boxes: [
              { x: 10, y: 20, width: 100, height: 50, frameNumber: 100, isKeyframe: true },
              { x: 50, y: 60, width: 100, height: 50, frameNumber: 0, isKeyframe: true }
            ],
            interpolationSegments: [],
            visibilityRanges: [],
            totalFrames: 101,
            keyframeCount: 2,
            interpolatedFrameCount: 0
          }
        },
        lineNumber: 1
      }

      const result = handler.validateLine(line)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('not sorted'))).toBe(true)
    })

    it('should reject sequence with duplicate frame numbers', () => {
      const line = {
        type: 'annotation' as const,
        data: {
          id: 'ann-5',
          videoId: 'vid-1',
          annotationType: 'type',
          personaId: 'persona-1',
          typeId: 'type-1',
          typeCategory: 'entity',
          boundingBoxSequence: {
            boxes: [
              { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
              { x: 50, y: 60, width: 100, height: 50, frameNumber: 0, isKeyframe: true }
            ],
            interpolationSegments: [],
            visibilityRanges: [],
            totalFrames: 1,
            keyframeCount: 2,
            interpolatedFrameCount: 0
          }
        },
        lineNumber: 1
      }

      const result = handler.validateLine(line)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Duplicate keyframe'))).toBe(true)
    })

    it('should reject annotation missing required fields', () => {
      const line = {
        type: 'annotation' as const,
        data: {
          id: 'ann-6'
          // Missing videoId and boundingBoxSequence
        },
        lineNumber: 1
      }

      const result = handler.validateLine(line)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Annotation missing required field: videoId')
      expect(result.errors).toContain('Annotation missing required field: boundingBoxSequence')
    })
  })

  describe('buildDependencyGraph', () => {
    it('should track annotation dependencies', () => {
      const lines = [
        {
          type: 'annotation' as const,
          data: {
            id: 'ann-1',
            videoId: 'vid-1',
            personaId: 'persona-1',
            linkedEntityId: 'ent-1'
          },
          lineNumber: 1
        }
      ]

      const graph = handler.buildDependencyGraph(lines)

      expect(graph.annotations.has('ann-1')).toBe(true)
      expect(graph.annotations.get('ann-1')).toEqual(['vid-1', 'persona-1', 'ent-1'])
    })
  })

  describe('detectConflicts', () => {
    it('should detect duplicate annotation ID', async () => {
      const lines = [
        {
          type: 'annotation' as const,
          data: {
            id: 'ann-1',
            videoId: 'vid-1',
            boundingBoxSequence: {
              boxes: [{ x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }],
              interpolationSegments: [],
              visibilityRanges: [],
              totalFrames: 1,
              keyframeCount: 1,
              interpolatedFrameCount: 0
            }
          },
          lineNumber: 1
        }
      ]

      const existingData = {
        personaIds: new Set<string>(),
        entityIds: new Set<string>(),
        eventIds: new Set<string>(),
        timeIds: new Set<string>(),
        collectionIds: new Set<string>(),
        annotationIds: new Set(['ann-1']),
        videoIds: new Set(['vid-1'])
      }

      const conflicts = await handler.detectConflicts(lines, existingData)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('duplicate-sequence')
      expect(conflicts[0].originalId).toBe('ann-1')
    })

    it('should detect missing video dependency', async () => {
      const lines = [
        {
          type: 'annotation' as const,
          data: {
            id: 'ann-2',
            videoId: 'vid-missing',
            boundingBoxSequence: {
              boxes: [{ x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }],
              interpolationSegments: [],
              visibilityRanges: [],
              totalFrames: 1,
              keyframeCount: 1,
              interpolatedFrameCount: 0
            }
          },
          lineNumber: 1
        }
      ]

      const existingData = {
        personaIds: new Set<string>(),
        entityIds: new Set<string>(),
        eventIds: new Set<string>(),
        timeIds: new Set<string>(),
        collectionIds: new Set<string>(),
        annotationIds: new Set<string>(),
        videoIds: new Set<string>()
      }

      const conflicts = await handler.detectConflicts(lines, existingData)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('missing-dependency')
      expect(conflicts[0].details).toContain('vid-missing')
    })
  })

  describe('resolveConflicts', () => {
    it('should resolve duplicate sequence with skip strategy', () => {
      const conflicts = [
        {
          type: 'duplicate-sequence' as const,
          line: 1,
          originalId: 'ann-1',
          existingId: 'ann-1',
          details: 'Duplicate annotation',
          frameRange: { start: 0, end: 100 }
        }
      ]

      const options = { ...DEFAULT_IMPORT_OPTIONS }
      options.conflictResolution.sequences.duplicateSequenceIds = 'skip'

      const resolutions = handler.resolveConflicts(conflicts, options)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('skip')
    })

    it('should resolve duplicate sequence with replace strategy', () => {
      const conflicts = [
        {
          type: 'duplicate-sequence' as const,
          line: 1,
          originalId: 'ann-1',
          existingId: 'ann-1',
          details: 'Duplicate annotation'
        }
      ]

      const options = { ...DEFAULT_IMPORT_OPTIONS }
      options.conflictResolution.sequences.duplicateSequenceIds = 'replace'

      const resolutions = handler.resolveConflicts(conflicts, options)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('replace')
    })

    it('should resolve duplicate sequence with create-new strategy', () => {
      const conflicts = [
        {
          type: 'duplicate-sequence' as const,
          line: 1,
          originalId: 'ann-1',
          existingId: 'ann-1',
          details: 'Duplicate annotation'
        }
      ]

      const options = { ...DEFAULT_IMPORT_OPTIONS }
      options.conflictResolution.sequences.duplicateSequenceIds = 'create-new'

      const resolutions = handler.resolveConflicts(conflicts, options)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('create-new')
      expect(resolutions[0].newId).toBeDefined()
    })
  })

  describe('remapIds', () => {
    it('should remap annotation ID when create-new resolution', () => {
      const lines = [
        {
          type: 'annotation' as const,
          data: {
            id: 'ann-1',
            videoId: 'vid-1'
          },
          lineNumber: 1
        }
      ]

      const resolutions = [
        {
          conflictType: 'duplicate-sequence' as const,
          strategy: 'create-new',
          originalId: 'ann-1',
          newId: 'ann-new',
          action: 'create-new' as const
        }
      ]

      const remapped = handler.remapIds(lines, resolutions)

      expect(remapped[0].data.id).toBe('ann-new')
    })

    it('should not remap IDs when no resolutions', () => {
      const lines = [
        {
          type: 'annotation' as const,
          data: {
            id: 'ann-1',
            videoId: 'vid-1'
          },
          lineNumber: 1
        }
      ]

      const remapped = handler.remapIds(lines, [])

      expect(remapped[0].data.id).toBe('ann-1')
    })
  })
})

describe('SequenceValidator', () => {
  let validator: SequenceValidator

  beforeEach(() => {
    validator = new SequenceValidator()
  })

  describe('validateSequence', () => {
    it('should validate sequence with bezier interpolation', () => {
      const sequence = {
        boxes: [
          { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
          { x: 50, y: 60, width: 100, height: 50, frameNumber: 100, isKeyframe: true }
        ],
        interpolationSegments: [
          {
            startFrame: 0,
            endFrame: 100,
            type: 'bezier' as const,
            controlPoints: {
              x: [{ x: 0.42, y: 0 }, { x: 0.58, y: 1 }]
            }
          }
        ],
        visibilityRanges: [{ startFrame: 0, endFrame: 100, visible: true }],
        totalFrames: 101,
        keyframeCount: 2,
        interpolatedFrameCount: 99
      }

      const result = validator.validateSequence(sequence)
      expect(result.valid).toBe(true)
    })

    it('should reject sequence with invalid bezier control points', () => {
      const sequence = {
        boxes: [
          { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
          { x: 50, y: 60, width: 100, height: 50, frameNumber: 100, isKeyframe: true }
        ],
        interpolationSegments: [
          {
            startFrame: 0,
            endFrame: 100,
            type: 'bezier' as const,
            controlPoints: {
              x: [{ x: 1.5, y: 0 }]  // x > 1 is invalid
            }
          }
        ],
        visibilityRanges: [{ startFrame: 0, endFrame: 100, visible: true }],
        totalFrames: 101,
        keyframeCount: 2,
        interpolatedFrameCount: 99
      }

      const result = validator.validateSequence(sequence)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('control point out of range'))).toBe(true)
    })

    it('should reject sequence with unsupported interpolation type', () => {
      const sequence = {
        boxes: [
          { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true },
          { x: 50, y: 60, width: 100, height: 50, frameNumber: 100, isKeyframe: true }
        ],
        interpolationSegments: [
          {
            startFrame: 0,
            endFrame: 100,
            type: 'invalid-type' as 'linear'
          }
        ],
        visibilityRanges: [{ startFrame: 0, endFrame: 100, visible: true }],
        totalFrames: 101,
        keyframeCount: 2,
        interpolatedFrameCount: 99
      }

      const result = validator.validateSequence(sequence)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Unsupported interpolation type'))).toBe(true)
    })

    it('should reject sequence with overlapping visibility ranges', () => {
      const sequence = {
        boxes: [
          { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }
        ],
        interpolationSegments: [],
        visibilityRanges: [
          { startFrame: 0, endFrame: 50, visible: true },
          { startFrame: 40, endFrame: 100, visible: true }  // Overlaps with previous
        ],
        totalFrames: 101,
        keyframeCount: 1,
        interpolatedFrameCount: 0
      }

      const result = validator.validateSequence(sequence)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Overlapping visibility ranges'))).toBe(true)
    })

    it('should reject sequence with keyframe outside visible range', () => {
      const sequence = {
        boxes: [
          { x: 10, y: 20, width: 100, height: 50, frameNumber: 50, isKeyframe: true }
        ],
        interpolationSegments: [],
        visibilityRanges: [
          { startFrame: 0, endFrame: 40, visible: true }  // Keyframe at 50 is outside
        ],
        totalFrames: 101,
        keyframeCount: 1,
        interpolatedFrameCount: 0
      }

      const result = validator.validateSequence(sequence)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('not in a visible range'))).toBe(true)
    })

    it('should reject sequence with bounding box exceeding video dimensions', () => {
      const sequence = {
        boxes: [
          { x: 1800, y: 20, width: 300, height: 50, frameNumber: 0, isKeyframe: true }
        ],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0
      }

      const videoMeta = { width: 1920, height: 1080 }
      const result = validator.validateSequence(sequence, videoMeta)

      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('exceeds video width'))).toBe(true)
    })

    it('should reject sequence with invalid tracking source', () => {
      const sequence = {
        boxes: [
          { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }
        ],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
        trackingSource: 'invalid-source' as 'manual',
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0
      }

      const result = validator.validateSequence(sequence)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Invalid trackingSource'))).toBe(true)
    })

    it('should reject sequence with invalid tracking confidence', () => {
      const sequence = {
        boxes: [
          { x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }
        ],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
        trackingConfidence: 1.5,  // Must be in [0, 1]
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0
      }

      const result = validator.validateSequence(sequence)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.includes('Invalid trackingConfidence'))).toBe(true)
    })
  })
})
