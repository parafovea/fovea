import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { ImportHandler } from '../../src/services/import-handler.js'
import { AnnotationExporter } from '../../src/services/export-handler.js'
import { DEFAULT_IMPORT_OPTIONS, ExistingData, ImportLine } from '../../src/services/import-types.js'

/**
 * Creates a base ExistingData object with empty sets.
 */
function createEmptyExistingData(): ExistingData {
  return {
    personaIds: new Set<string>(),
    entityIds: new Set<string>(),
    eventIds: new Set<string>(),
    timeIds: new Set<string>(),
    collectionIds: new Set<string>(),
    annotationIds: new Set<string>(),
    videoIds: new Set(['vid-1']),
    summaryIds: new Set<string>(),
    claimIds: new Set<string>(),
    claimRelationIds: new Set<string>(),
    ontologyPersonaIds: new Set<string>(),
    ownedPersonaIds: new Set<string>(),
    ownedAnnotationIds: new Set<string>(),
    ownedSummaryIds: new Set<string>(),
    ownedClaimIds: new Set<string>(),
    ownedClaimRelationIds: new Set<string>(),
    ownedEntityIds: new Set<string>(),
    ownedEventIds: new Set<string>(),
    ownedTimeIds: new Set<string>(),
    ownedCollectionIds: new Set<string>(),
    ownedWorldStateId: null,
  }
}

/**
 * Creates a minimal mock Prisma client for ImportHandler construction.
 */
function createMockPrisma() {
  return {
    persona: { findMany: vi.fn().mockResolvedValue([]) },
    video: { findMany: vi.fn().mockResolvedValue([]) },
    worldState: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    annotation: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
    videoSummary: { findMany: vi.fn().mockResolvedValue([]) },
    claim: { findMany: vi.fn().mockResolvedValue([]) },
    claimRelation: { findMany: vi.fn().mockResolvedValue([]) },
    ontology: { findMany: vi.fn().mockResolvedValue([]) },
    importHistory: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(createMockPrisma())),
  } as unknown as PrismaClient
}

/**
 * Creates a simple annotation import line.
 */
function createAnnotationLine(id: string, personaId: string, videoId = 'vid-1', lineNumber = 1): ImportLine {
  return {
    type: 'annotation',
    data: {
      id,
      videoId,
      personaId,
      annotationType: 'type',
      typeId: 'type-1',
      typeCategory: 'entity',
      boundingBoxSequence: {
        boxes: [{ x: 10, y: 20, width: 100, height: 50, frameNumber: 0, isKeyframe: true }],
        interpolationSegments: [],
        visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
        totalFrames: 1,
        keyframeCount: 1,
        interpolatedFrameCount: 0
      }
    },
    lineNumber,
  }
}

/**
 * Cross-user import/export tests.
 *
 * Verifies that importing another user's exported data creates copies with
 * new IDs, while re-importing your own data uses normal conflict resolution.
 */
describe('Cross-user import ownership', () => {
  const USER_A = 'user-a-id'
  const USER_B = 'user-b-id'

  let handlerA: ImportHandler
  let handlerB: ImportHandler

  beforeEach(() => {
    handlerA = new ImportHandler(createMockPrisma(), USER_A)
    handlerB = new ImportHandler(createMockPrisma(), USER_B)
    vi.clearAllMocks()
  })

  describe('detectConflicts - ownership tagging', () => {
    it('should tag persona conflict as owned when importing own data', async () => {
      const existingData = createEmptyExistingData()
      existingData.personaIds.add('persona-a')
      existingData.ownedPersonaIds.add('persona-a')

      const lines: ImportLine[] = [{
        type: 'persona',
        data: { id: 'persona-a', name: 'My Persona' },
        lineNumber: 1,
      }]

      const conflicts = await handlerA.detectConflicts(lines, existingData)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('duplicate-persona')
      expect(conflicts[0].ownedByImporter).toBe(true)
    })

    it('should tag persona conflict as NOT owned when importing foreign data', async () => {
      const existingData = createEmptyExistingData()
      existingData.personaIds.add('persona-a')
      // persona-a is NOT in ownedPersonaIds - it belongs to another user

      const lines: ImportLine[] = [{
        type: 'persona',
        data: { id: 'persona-a', name: 'Their Persona' },
        lineNumber: 1,
      }]

      const conflicts = await handlerB.detectConflicts(lines, existingData)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('duplicate-persona')
      expect(conflicts[0].ownedByImporter).toBe(false)
    })

    it('should tag annotation conflict as owned when importing own data', async () => {
      const existingData = createEmptyExistingData()
      existingData.annotationIds.add('ann-a')
      existingData.ownedAnnotationIds.add('ann-a')

      const lines = [createAnnotationLine('ann-a', 'persona-a')]

      const conflicts = await handlerA.detectConflicts(lines, existingData)

      const duplicateConflict = conflicts.find(c => c.type === 'duplicate-sequence')
      expect(duplicateConflict).toBeDefined()
      expect(duplicateConflict!.ownedByImporter).toBe(true)
    })

    it('should tag annotation conflict as NOT owned when importing foreign data', async () => {
      const existingData = createEmptyExistingData()
      existingData.annotationIds.add('ann-a')
      // ann-a is NOT in ownedAnnotationIds

      const lines = [createAnnotationLine('ann-a', 'persona-a')]

      const conflicts = await handlerB.detectConflicts(lines, existingData)

      const duplicateConflict = conflicts.find(c => c.type === 'duplicate-sequence')
      expect(duplicateConflict).toBeDefined()
      expect(duplicateConflict!.ownedByImporter).toBe(false)
    })

    it('should tag entity conflict as NOT owned when entity belongs to another user', async () => {
      const existingData = createEmptyExistingData()
      existingData.entityIds.add('ent-1')
      // ent-1 is NOT in ownedEntityIds

      const lines: ImportLine[] = [{
        type: 'entity',
        data: { id: 'ent-1', name: 'Person' },
        lineNumber: 1,
      }]

      const conflicts = await handlerB.detectConflicts(lines, existingData)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('duplicate-object')
      expect(conflicts[0].ownedByImporter).toBe(false)
    })

    it('should tag summary conflict as NOT owned for foreign data', async () => {
      const existingData = createEmptyExistingData()
      existingData.summaryIds.add('sum-1')
      // sum-1 is NOT in ownedSummaryIds

      const lines: ImportLine[] = [{
        type: 'summary',
        data: { id: 'sum-1', videoId: 'vid-1', personaId: 'persona-a' },
        lineNumber: 1,
      }]

      const conflicts = await handlerB.detectConflicts(lines, existingData)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('duplicate-summary')
      expect(conflicts[0].ownedByImporter).toBe(false)
    })

    it('should tag claim conflict as NOT owned for foreign data', async () => {
      const existingData = createEmptyExistingData()
      existingData.claimIds.add('claim-1')

      const lines: ImportLine[] = [{
        type: 'claim',
        data: { id: 'claim-1', summaryId: 'sum-1', text: 'A claim' },
        lineNumber: 1,
      }]

      const conflicts = await handlerB.detectConflicts(lines, existingData)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('duplicate-claim')
      expect(conflicts[0].ownedByImporter).toBe(false)
    })

    it('should tag claim_relation conflict as NOT owned for foreign data', async () => {
      const existingData = createEmptyExistingData()
      existingData.claimRelationIds.add('cr-1')

      const lines: ImportLine[] = [{
        type: 'claim_relation',
        data: { id: 'cr-1', sourceClaimId: 'claim-1', targetClaimId: 'claim-2' },
        lineNumber: 1,
      }]

      const conflicts = await handlerB.detectConflicts(lines, existingData)

      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].type).toBe('duplicate-claim-relation')
      expect(conflicts[0].ownedByImporter).toBe(false)
    })

    it('should produce no conflicts for new IDs from the same user', async () => {
      const existingData = createEmptyExistingData()

      const lines: ImportLine[] = [
        { type: 'persona', data: { id: 'new-persona', userId: USER_B }, lineNumber: 1 },
        createAnnotationLine('new-ann', 'new-persona', 'vid-1', 2),
        { type: 'entity', data: { id: 'new-ent' }, lineNumber: 3 },
        { type: 'summary', data: { id: 'new-sum', videoId: 'vid-1', personaId: 'new-persona' }, lineNumber: 4 },
      ]

      const conflicts = await handlerB.detectConflicts(lines, existingData)

      // Only missing-dependency conflicts are possible (same user, no duplicate IDs)
      const duplicateConflicts = conflicts.filter(c => !c.type.startsWith('missing'))
      expect(duplicateConflicts).toHaveLength(0)
    })

    it('should produce foreign-data conflicts for new IDs from a different user', async () => {
      const existingData = createEmptyExistingData()

      const lines: ImportLine[] = [
        { type: 'persona', data: { id: 'new-persona', userId: USER_A }, lineNumber: 1 },
        createAnnotationLine('new-ann', 'new-persona', 'vid-1', 2),
        { type: 'entity', data: { id: 'new-ent' }, lineNumber: 3 },
        { type: 'summary', data: { id: 'new-sum', videoId: 'vid-1', personaId: 'new-persona' }, lineNumber: 4 },
      ]

      const conflicts = await handlerB.detectConflicts(lines, existingData)

      // Foreign persona, annotation, entity, and summary should all have conflicts
      const foreignConflicts = conflicts.filter(c => c.ownedByImporter === false)
      expect(foreignConflicts.length).toBeGreaterThanOrEqual(4)
      for (const conflict of foreignConflicts) {
        expect(conflict.ownedByImporter).toBe(false)
      }
    })
  })

  describe('resolveConflicts - foreign data forces create-new', () => {
    it('should force create-new for foreign persona regardless of configured strategy', () => {
      const conflicts = [{
        type: 'duplicate-persona' as const,
        line: 1,
        originalId: 'persona-a',
        existingId: 'persona-a',
        details: 'Duplicate persona',
        ownedByImporter: false,
      }]

      // Configure skip strategy - should be overridden for foreign data
      const options = structuredClone(DEFAULT_IMPORT_OPTIONS)
      options.conflictResolution.personas = 'skip'

      const resolutions = handlerB.resolveConflicts(conflicts, options)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('create-new')
      expect(resolutions[0].newId).toBeDefined()
      expect(resolutions[0].newId).not.toBe('persona-a')
    })

    it('should force create-new for foreign annotation regardless of configured strategy', () => {
      const conflicts = [{
        type: 'duplicate-sequence' as const,
        line: 1,
        originalId: 'ann-a',
        existingId: 'ann-a',
        details: 'Duplicate annotation',
        ownedByImporter: false,
      }]

      const options = structuredClone(DEFAULT_IMPORT_OPTIONS)
      options.conflictResolution.sequences.duplicateSequenceIds = 'skip'

      const resolutions = handlerB.resolveConflicts(conflicts, options)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('create-new')
      expect(resolutions[0].newId).toBeDefined()
    })

    it('should force create-new for foreign entity regardless of configured strategy', () => {
      const conflicts = [{
        type: 'duplicate-object' as const,
        line: 1,
        originalId: 'ent-1',
        existingId: 'ent-1',
        details: 'Duplicate entity',
        ownedByImporter: false,
      }]

      const options = structuredClone(DEFAULT_IMPORT_OPTIONS)
      options.conflictResolution.worldObjects = 'skip'

      const resolutions = handlerB.resolveConflicts(conflicts, options)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('create-new')
      expect(resolutions[0].newId).toBeDefined()
    })

    it('should force create-new for foreign summary regardless of configured strategy', () => {
      const conflicts = [{
        type: 'duplicate-summary' as const,
        line: 1,
        originalId: 'sum-1',
        existingId: 'sum-1',
        details: 'Duplicate summary',
        ownedByImporter: false,
      }]

      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('create-new')
      expect(resolutions[0].newId).toBeDefined()
    })

    it('should force create-new for foreign claim regardless of configured strategy', () => {
      const conflicts = [{
        type: 'duplicate-claim' as const,
        line: 1,
        originalId: 'claim-1',
        existingId: 'claim-1',
        details: 'Duplicate claim',
        ownedByImporter: false,
      }]

      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('create-new')
      expect(resolutions[0].newId).toBeDefined()
    })

    it('should force create-new for foreign claim_relation', () => {
      const conflicts = [{
        type: 'duplicate-claim-relation' as const,
        line: 1,
        originalId: 'cr-1',
        existingId: 'cr-1',
        details: 'Duplicate claim relation',
        ownedByImporter: false,
      }]

      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('create-new')
      expect(resolutions[0].newId).toBeDefined()
    })
  })

  describe('resolveConflicts - owned data uses configured strategy', () => {
    it('should use skip strategy for owned persona conflict when configured', () => {
      const conflicts = [{
        type: 'duplicate-persona' as const,
        line: 1,
        originalId: 'persona-a',
        existingId: 'persona-a',
        details: 'Duplicate persona',
        ownedByImporter: true,
      }]

      const options = structuredClone(DEFAULT_IMPORT_OPTIONS)
      options.conflictResolution.personas = 'skip'

      const resolutions = handlerA.resolveConflicts(conflicts, options)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('skip')
    })

    it('should use replace strategy for owned persona conflict when configured', () => {
      const conflicts = [{
        type: 'duplicate-persona' as const,
        line: 1,
        originalId: 'persona-a',
        existingId: 'persona-a',
        details: 'Duplicate persona',
        ownedByImporter: true,
      }]

      const options = structuredClone(DEFAULT_IMPORT_OPTIONS)
      options.conflictResolution.personas = 'replace'

      const resolutions = handlerA.resolveConflicts(conflicts, options)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('replace')
    })

    it('should use skip strategy for owned annotation conflict when configured', () => {
      const conflicts = [{
        type: 'duplicate-sequence' as const,
        line: 1,
        originalId: 'ann-a',
        existingId: 'ann-a',
        details: 'Duplicate annotation',
        ownedByImporter: true,
      }]

      const options = structuredClone(DEFAULT_IMPORT_OPTIONS)
      options.conflictResolution.sequences.duplicateSequenceIds = 'skip'

      const resolutions = handlerA.resolveConflicts(conflicts, options)

      expect(resolutions).toHaveLength(1)
      expect(resolutions[0].action).toBe('skip')
    })
  })

  describe('remapIds - cross-user ID remapping', () => {
    it('should remap all IDs when foreign data gets create-new resolutions', () => {
      const lines: ImportLine[] = [
        { type: 'persona', data: { id: 'persona-a', name: 'Their Persona' }, lineNumber: 1 },
        { type: 'summary', data: { id: 'sum-1', videoId: 'vid-1', personaId: 'persona-a' }, lineNumber: 2 },
        { type: 'claim', data: { id: 'claim-1', summaryId: 'sum-1', text: 'A claim' }, lineNumber: 3 },
        { type: 'claim_relation', data: { id: 'cr-1', sourceClaimId: 'claim-1', targetClaimId: 'claim-1' }, lineNumber: 4 },
        createAnnotationLine('ann-a', 'persona-a', 'vid-1', 5),
      ]

      const resolutions = [
        { conflictType: 'duplicate-persona' as const, strategy: 'create-new', originalId: 'persona-a', newId: 'persona-b-copy', action: 'create-new' as const },
        { conflictType: 'duplicate-summary' as const, strategy: 'create-new', originalId: 'sum-1', newId: 'sum-1-copy', action: 'create-new' as const },
        { conflictType: 'duplicate-claim' as const, strategy: 'create-new', originalId: 'claim-1', newId: 'claim-1-copy', action: 'create-new' as const },
        { conflictType: 'duplicate-claim-relation' as const, strategy: 'create-new', originalId: 'cr-1', newId: 'cr-1-copy', action: 'create-new' as const },
        { conflictType: 'duplicate-sequence' as const, strategy: 'create-new', originalId: 'ann-a', newId: 'ann-b-copy', action: 'create-new' as const },
      ]

      const remapped = handlerB.remapIds(lines, resolutions)

      // Persona ID remapped
      expect(remapped[0].data.id).toBe('persona-b-copy')

      // Summary ID remapped and personaId reference updated
      expect(remapped[1].data.id).toBe('sum-1-copy')
      expect(remapped[1].data.personaId).toBe('persona-b-copy')

      // Claim ID remapped and summaryId reference updated
      expect(remapped[2].data.id).toBe('claim-1-copy')
      expect(remapped[2].data.summaryId).toBe('sum-1-copy')

      // Claim relation ID remapped and claim references updated
      expect(remapped[3].data.id).toBe('cr-1-copy')
      expect(remapped[3].data.sourceClaimId).toBe('claim-1-copy')
      expect(remapped[3].data.targetClaimId).toBe('claim-1-copy')

      // Annotation ID remapped and personaId reference updated
      expect(remapped[4].data.id).toBe('ann-b-copy')
      expect(remapped[4].data.personaId).toBe('persona-b-copy')
    })

    it('should not remap IDs for owned data with skip resolutions', () => {
      const lines: ImportLine[] = [
        { type: 'persona', data: { id: 'persona-a', name: 'My Persona' }, lineNumber: 1 },
        createAnnotationLine('ann-a', 'persona-a', 'vid-1', 2),
      ]

      const resolutions = [
        { conflictType: 'duplicate-persona' as const, strategy: 'skip', originalId: 'persona-a', action: 'skip' as const },
        { conflictType: 'duplicate-sequence' as const, strategy: 'skip', originalId: 'ann-a', action: 'skip' as const },
      ]

      const remapped = handlerA.remapIds(lines, resolutions)

      // IDs should remain unchanged
      expect(remapped[0].data.id).toBe('persona-a')
      expect(remapped[1].data.id).toBe('ann-a')
      expect(remapped[1].data.personaId).toBe('persona-a')
    })

    it('should remap entity references in annotations', () => {
      const lines: ImportLine[] = [
        { type: 'entity', data: { id: 'ent-1', name: 'Person' }, lineNumber: 1 },
        {
          type: 'annotation',
          data: {
            id: 'ann-1',
            videoId: 'vid-1',
            linkedEntityId: 'ent-1',
            boundingBoxSequence: {
              boxes: [{ x: 0, y: 0, width: 50, height: 50, frameNumber: 0, isKeyframe: true }],
              interpolationSegments: [],
              visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
              totalFrames: 1,
              keyframeCount: 1,
              interpolatedFrameCount: 0
            }
          },
          lineNumber: 2,
        },
      ]

      const resolutions = [
        { conflictType: 'duplicate-object' as const, strategy: 'create-new', originalId: 'ent-1', newId: 'ent-1-copy', action: 'create-new' as const },
        { conflictType: 'duplicate-sequence' as const, strategy: 'create-new', originalId: 'ann-1', newId: 'ann-1-copy', action: 'create-new' as const },
      ]

      const remapped = handlerB.remapIds(lines, resolutions)

      expect(remapped[0].data.id).toBe('ent-1-copy')
      expect(remapped[1].data.id).toBe('ann-1-copy')
      expect(remapped[1].data.linkedEntityId).toBe('ent-1-copy')
    })
  })

  describe('end-to-end mock: simulate cross-user export then import', () => {
    it('should produce create-new resolutions for all foreign data in a full pipeline', async () => {
      // Simulate User A's data already in the database
      const existingData = createEmptyExistingData()
      existingData.personaIds.add('persona-a')
      existingData.ownedPersonaIds.add('persona-a')  // User A owns this
      existingData.annotationIds.add('ann-a')
      existingData.ownedAnnotationIds.add('ann-a')    // User A owns this
      existingData.summaryIds.add('sum-1')
      existingData.ownedSummaryIds.add('sum-1')       // User A owns this
      existingData.claimIds.add('claim-1')
      existingData.ownedClaimIds.add('claim-1')       // User A owns this

      // Simulate exported JSONL lines (from User A's export)
      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'persona-a', userId: USER_A, name: 'Analyst' }, lineNumber: 1 },
        { type: 'summary', data: { id: 'sum-1', videoId: 'vid-1', personaId: 'persona-a' }, lineNumber: 2 },
        { type: 'claim', data: { id: 'claim-1', summaryId: 'sum-1', text: 'A claim' }, lineNumber: 3 },
        createAnnotationLine('ann-a', 'persona-a', 'vid-1', 4),
      ]

      // User B imports User A's data
      // From User B's perspective, none of the existing data is owned
      const userBExistingData = { ...existingData }
      // User B does NOT own any of User A's data
      userBExistingData.ownedPersonaIds = new Set<string>()
      userBExistingData.ownedAnnotationIds = new Set<string>()
      userBExistingData.ownedSummaryIds = new Set<string>()
      userBExistingData.ownedClaimIds = new Set<string>()

      // Step 1: Detect conflicts
      const conflicts = await handlerB.detectConflicts(exportedLines, userBExistingData)

      // All items should have conflicts (duplicate IDs)
      expect(conflicts.length).toBeGreaterThanOrEqual(4)
      // All should be tagged as NOT owned by importer
      for (const conflict of conflicts) {
        if (conflict.type !== 'missing-dependency') {
          expect(conflict.ownedByImporter).toBe(false)
        }
      }

      // Step 2: Resolve conflicts
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)

      // All non-missing-dependency conflicts should be create-new
      for (const resolution of resolutions) {
        if (resolution.conflictType !== 'missing-dependency') {
          expect(resolution.action).toBe('create-new')
          expect(resolution.newId).toBeDefined()
          expect(resolution.newId).not.toBe(resolution.originalId)
        }
      }

      // Step 3: Remap IDs
      const remapped = handlerB.remapIds(exportedLines, resolutions)

      // All IDs should be different from originals
      expect(remapped[0].data.id).not.toBe('persona-a')
      expect(remapped[1].data.id).not.toBe('sum-1')
      expect(remapped[2].data.id).not.toBe('claim-1')
      expect(remapped[3].data.id).not.toBe('ann-a')

      // References should be updated consistently
      const newPersonaId = remapped[0].data.id
      expect(remapped[1].data.personaId).toBe(newPersonaId)
      expect(remapped[3].data.personaId).toBe(newPersonaId)

      const newSummaryId = remapped[1].data.id
      expect(remapped[2].data.summaryId).toBe(newSummaryId)
    })

    it('should apply normal resolution when user re-imports their own data', async () => {
      // User A's data exists and is owned by User A
      const existingData = createEmptyExistingData()
      existingData.personaIds.add('persona-a')
      existingData.ownedPersonaIds.add('persona-a')
      existingData.annotationIds.add('ann-a')
      existingData.ownedAnnotationIds.add('ann-a')

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'persona-a', userId: USER_A, name: 'Analyst' }, lineNumber: 1 },
        createAnnotationLine('ann-a', 'persona-a', 'vid-1', 2),
      ]

      // User A re-imports their own data
      const conflicts = await handlerA.detectConflicts(exportedLines, existingData)

      // All conflicts should be owned
      for (const conflict of conflicts) {
        if (conflict.type !== 'missing-dependency') {
          expect(conflict.ownedByImporter).toBe(true)
        }
      }

      // Resolve with default options (skip strategy)
      const resolutions = handlerA.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)

      // Default is skip for both personas and sequences
      for (const resolution of resolutions) {
        if (resolution.conflictType !== 'missing-dependency') {
          expect(resolution.action).toBe('skip')
        }
      }

      // No ID remapping should occur
      const remapped = handlerA.remapIds(exportedLines, resolutions)
      expect(remapped[0].data.id).toBe('persona-a')
      expect(remapped[1].data.id).toBe('ann-a')
    })
  })

  describe('loadExistingData - ownership chain tracing', () => {
    it('should build ownership sets from database queries', async () => {
      const mockPrisma = createMockPrisma()

      // Mock User A's persona in database
      ;(mockPrisma.persona.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'persona-a', userId: USER_A },
        { id: 'persona-b', userId: USER_B },
      ])
      ;(mockPrisma.video.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'vid-1' },
      ])
      ;(mockPrisma.annotation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'ann-a', personaId: 'persona-a' },
        { id: 'ann-b', personaId: 'persona-b' },
      ])
      ;(mockPrisma.videoSummary.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'sum-a', personaId: 'persona-a' },
        { id: 'sum-b', personaId: 'persona-b' },
      ])
      ;(mockPrisma.claim.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'claim-a', summaryId: 'sum-a' },
        { id: 'claim-b', summaryId: 'sum-b' },
      ])
      ;(mockPrisma.claimRelation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'cr-a', sourceClaimId: 'claim-a' },
        { id: 'cr-b', sourceClaimId: 'claim-b' },
      ])
      ;(mockPrisma.ontology.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { personaId: 'persona-a' },
      ])
      ;(mockPrisma.worldState.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(mockPrisma.worldState.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const handler = new ImportHandler(mockPrisma, USER_A)
      const data = await handler.loadExistingData()

      // User A's persona should be owned
      expect(data.ownedPersonaIds.has('persona-a')).toBe(true)
      expect(data.ownedPersonaIds.has('persona-b')).toBe(false)

      // User A's annotation (via persona-a) should be owned
      expect(data.ownedAnnotationIds.has('ann-a')).toBe(true)
      expect(data.ownedAnnotationIds.has('ann-b')).toBe(false)

      // User A's summary (via persona-a) should be owned
      expect(data.ownedSummaryIds.has('sum-a')).toBe(true)
      expect(data.ownedSummaryIds.has('sum-b')).toBe(false)

      // User A's claims (via sum-a) should be owned
      expect(data.ownedClaimIds.has('claim-a')).toBe(true)
      expect(data.ownedClaimIds.has('claim-b')).toBe(false)

      // User A's claim relations (via claim-a) should be owned
      expect(data.ownedClaimRelationIds.has('cr-a')).toBe(true)
      expect(data.ownedClaimRelationIds.has('cr-b')).toBe(false)
    })

    it('should trace world state ownership for entities/events/times', async () => {
      const mockPrisma = createMockPrisma()

      ;(mockPrisma.persona.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(mockPrisma.video.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(mockPrisma.annotation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(mockPrisma.videoSummary.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(mockPrisma.claim.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(mockPrisma.claimRelation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(mockPrisma.ontology.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(mockPrisma.worldState.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'ws-a',
          userId: USER_A,
          entities: [{ id: 'ent-a1' }, { id: 'ent-a2' }],
          events: [{ id: 'evt-a1' }],
          times: [{ id: 'time-a1' }],
          entityCollections: [{ id: 'ec-a1' }],
          eventCollections: [],
          timeCollections: [],
        },
      ])
      ;(mockPrisma.worldState.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ws-a',
        userId: USER_A,
        entities: [{ id: 'ent-a1' }, { id: 'ent-a2' }],
        events: [{ id: 'evt-a1' }],
        times: [{ id: 'time-a1' }],
        entityCollections: [{ id: 'ec-a1' }],
        eventCollections: [],
        timeCollections: [],
      })

      const handler = new ImportHandler(mockPrisma, USER_A)
      const data = await handler.loadExistingData()

      expect(data.ownedEntityIds.has('ent-a1')).toBe(true)
      expect(data.ownedEntityIds.has('ent-a2')).toBe(true)
      expect(data.ownedEventIds.has('evt-a1')).toBe(true)
      expect(data.ownedTimeIds.has('time-a1')).toBe(true)
      expect(data.ownedCollectionIds.has('ec-a1')).toBe(true)
      expect(data.ownedWorldStateId).toBe('ws-a')
    })
  })

  describe('export includes userId on persona', () => {
    it('should include userId in exported persona JSONL', () => {
      const exporter = new AnnotationExporter()
      const persona = {
        id: 'persona-1',
        userId: USER_A,
        name: 'Test Persona',
        role: 'Analyst',
        informationNeed: 'Testing',
        details: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      }

      const jsonl = exporter.exportPersona(persona)
      const parsed = JSON.parse(jsonl)

      expect(parsed.type).toBe('persona')
      expect(parsed.data.userId).toBe(USER_A)
      expect(parsed.data.id).toBe('persona-1')
    })
  })

  describe('isCrossUserImport - metadata-driven detection', () => {
    it('should detect cross-user via metadata line with a foreign exporterUserId', () => {
      const lines: ImportLine[] = [
        { type: 'metadata', data: { exporterUserId: USER_A, exportVersion: '1.0' }, lineNumber: 1 },
        // No persona lines - only world data and object annotations
        { type: 'entity', data: { id: 'ent-1', name: 'X' }, lineNumber: 2 },
        createAnnotationLine('ann-1', 'p-unused', 'vid-1', 3),
      ]

      expect(handlerB.isCrossUserImport(lines)).toBe(true)
    })

    it('should treat same exporterUserId metadata as same-user', () => {
      const lines: ImportLine[] = [
        { type: 'metadata', data: { exporterUserId: USER_A, exportVersion: '1.0' }, lineNumber: 1 },
        { type: 'entity', data: { id: 'ent-1', name: 'X' }, lineNumber: 2 },
      ]

      expect(handlerA.isCrossUserImport(lines)).toBe(false)
    })

    it('should prefer metadata over persona signal when both are present', () => {
      // Metadata says USER_A; persona line claims USER_B — metadata wins.
      const lines: ImportLine[] = [
        { type: 'metadata', data: { exporterUserId: USER_A, exportVersion: '1.0' }, lineNumber: 1 },
        { type: 'persona', data: { id: 'p-1', userId: USER_B, name: 'B' }, lineNumber: 2 },
      ]

      expect(handlerA.isCrossUserImport(lines)).toBe(false)
      expect(handlerB.isCrossUserImport(lines)).toBe(true)
    })

    it('should detect cross-user via annotation userId when no persona or metadata', () => {
      // Legacy export that emitted userId on object annotations but no metadata line.
      const lines: ImportLine[] = [
        { type: 'entity', data: { id: 'ent-1', name: 'X' }, lineNumber: 1 },
        {
          type: 'annotation',
          data: {
            id: 'ann-1',
            videoId: 'vid-1',
            userId: USER_A,
            annotationType: 'object',
            linkedEntityId: 'ent-1',
            boundingBoxSequence: {
              boxes: [{ x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true }],
              interpolationSegments: [],
              visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
              totalFrames: 1, keyframeCount: 1, interpolatedFrameCount: 0,
            },
          },
          lineNumber: 2,
        },
      ]

      expect(handlerB.isCrossUserImport(lines)).toBe(true)
    })

    it('should ignore metadata with empty/missing exporterUserId', () => {
      const lines: ImportLine[] = [
        { type: 'metadata', data: { exportVersion: '1.0' }, lineNumber: 1 },
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A' }, lineNumber: 2 },
      ]

      // Empty metadata falls through to persona detection.
      expect(handlerB.isCrossUserImport(lines)).toBe(true)
      expect(handlerA.isCrossUserImport(lines)).toBe(false)
    })

    it('regenerates ALL IDs for a no-persona export with only world objects + annotations', async () => {
      // The catastrophic case: a user labels videos with object annotations
      // linking to world entities, never creates a persona, exports, and
      // another user imports. All IDs must be regenerated.
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'metadata', data: { exporterUserId: USER_A, exportVersion: '1.0' }, lineNumber: 1 },
        { type: 'entity', data: { id: 'ent-1', name: 'Thing' }, lineNumber: 2 },
        {
          type: 'annotation',
          data: {
            id: 'ann-1',
            videoId: 'vid-1',
            userId: USER_A,
            annotationType: 'object',
            linkedEntityId: 'ent-1',
            boundingBoxSequence: {
              boxes: [{ x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true }],
              interpolationSegments: [],
              visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
              totalFrames: 1, keyframeCount: 1, interpolatedFrameCount: 0,
            },
          },
          lineNumber: 3,
        },
      ]

      expect(handlerB.isCrossUserImport(exportedLines)).toBe(true)

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      resolutions.push(...handlerB.generateCrossUserResolutions(exportedLines, resolutions))

      const remapped = handlerB.remapIds(exportedLines, resolutions)

      const newEntId = remapped[1].data.id as string
      const newAnnId = remapped[2].data.id as string
      expect(newEntId).not.toBe('ent-1')
      expect(newAnnId).not.toBe('ann-1')
      // linkedEntityId follows the regenerated entity
      expect(remapped[2].data.linkedEntityId).toBe(newEntId)
    })
  })

  describe('export emits metadata with exporterUserId', () => {
    it('should prepend a metadata line to exportAll output', async () => {
      // Construct a Prisma stub just for exportAll's dependencies.
      const exporter = new AnnotationExporter()
      const prismaStub = {
        persona: { findMany: vi.fn().mockResolvedValue([]) },
        ontology: { findMany: vi.fn().mockResolvedValue([]) },
        worldState: { findUnique: vi.fn().mockResolvedValue(null), findFirst: vi.fn().mockResolvedValue(null) },
        videoSummary: { findMany: vi.fn().mockResolvedValue([]) },
        claim: { findMany: vi.fn().mockResolvedValue([]) },
        claimRelation: { findMany: vi.fn().mockResolvedValue([]) },
        annotation: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaClient

      const out = await exporter.exportAll(prismaStub, USER_A)
      const firstLine = out.split('\n')[0]
      const parsed = JSON.parse(firstLine)

      expect(parsed.type).toBe('metadata')
      expect(parsed.data.exporterUserId).toBe(USER_A)
      expect(typeof parsed.data.exportedAt).toBe('string')
      expect(parsed.data.exportVersion).toBe('1.0')
    })
  })

  describe('isCrossUserImport - detection logic', () => {
    it('should detect cross-user import when persona userId differs', () => {
      const lines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A' }, lineNumber: 1 },
      ]

      expect(handlerB.isCrossUserImport(lines)).toBe(true)
    })

    it('should NOT detect cross-user import for same user', () => {
      const lines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A' }, lineNumber: 1 },
      ]

      expect(handlerA.isCrossUserImport(lines)).toBe(false)
    })

    it('should NOT detect cross-user import when persona has no userId', () => {
      const lines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', name: 'A' }, lineNumber: 1 },
      ]

      expect(handlerB.isCrossUserImport(lines)).toBe(false)
    })

    it('should detect cross-user import when ANY persona has different userId', () => {
      const lines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_B, name: 'B' }, lineNumber: 1 },
        { type: 'persona', data: { id: 'p-2', userId: USER_A, name: 'A' }, lineNumber: 2 },
      ]

      // From User B's perspective, the second persona is foreign
      expect(handlerB.isCrossUserImport(lines)).toBe(true)
    })

    it('should ignore non-persona lines for cross-user detection', () => {
      const lines: ImportLine[] = [
        createAnnotationLine('ann-1', 'persona-1', 'vid-1', 1),
        { type: 'entity', data: { id: 'ent-1', name: 'Thing' }, lineNumber: 2 },
      ]

      // No persona lines at all - cannot detect cross-user
      expect(handlerB.isCrossUserImport(lines)).toBe(false)
    })
  })

  describe('generateCrossUserResolutions - new IDs for all foreign items', () => {
    it('should generate create-new resolutions for items without existing resolutions', () => {
      const lines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A' }, lineNumber: 1 },
        { type: 'entity', data: { id: 'ent-1', name: 'Person' }, lineNumber: 2 },
        createAnnotationLine('ann-1', 'p-1', 'vid-1', 3),
        { type: 'summary', data: { id: 'sum-1', videoId: 'vid-1', personaId: 'p-1' }, lineNumber: 4 },
        { type: 'claim', data: { id: 'claim-1', summaryId: 'sum-1', text: 'x' }, lineNumber: 5 },
        { type: 'claim_relation', data: { id: 'cr-1', sourceClaimId: 'claim-1', targetClaimId: 'claim-1' }, lineNumber: 6 },
      ]

      const existingResolutions: Resolution[] = []
      const additional = handlerB.generateCrossUserResolutions(lines, existingResolutions)

      expect(additional).toHaveLength(6)
      for (const res of additional) {
        expect(res.action).toBe('create-new')
        expect(res.newId).toBeDefined()
        expect(res.newId).not.toBe(res.originalId)
      }

      const resolvedOriginalIds = additional.map(r => r.originalId)
      expect(resolvedOriginalIds).toContain('p-1')
      expect(resolvedOriginalIds).toContain('ent-1')
      expect(resolvedOriginalIds).toContain('ann-1')
      expect(resolvedOriginalIds).toContain('sum-1')
      expect(resolvedOriginalIds).toContain('claim-1')
      expect(resolvedOriginalIds).toContain('cr-1')
    })

    it('should skip items that already have resolutions', () => {
      const lines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A' }, lineNumber: 1 },
        createAnnotationLine('ann-1', 'p-1', 'vid-1', 2),
      ]

      // p-1 already has a resolution from conflict detection
      const existingResolutions: Resolution[] = [{
        conflictType: 'duplicate-persona',
        strategy: 'create-new',
        originalId: 'p-1',
        newId: 'p-1-already-resolved',
        action: 'create-new',
      }]

      const additional = handlerB.generateCrossUserResolutions(lines, existingResolutions)

      // Only ann-1 should get a new resolution, p-1 already has one
      expect(additional).toHaveLength(1)
      expect(additional[0].originalId).toBe('ann-1')
    })

    it('should not generate resolutions for metadata or video lines', () => {
      const lines: ImportLine[] = [
        { type: 'metadata', data: { version: '1.0' }, lineNumber: 1 },
        { type: 'video', data: { id: 'vid-1' }, lineNumber: 2 },
      ]

      const additional = handlerB.generateCrossUserResolutions(lines, [])

      // metadata has no id, video type is skipped in the switch
      expect(additional).toHaveLength(0)
    })

    it('should handle collection types correctly', () => {
      const lines: ImportLine[] = [
        { type: 'entity_collection', data: { id: 'ec-1' }, lineNumber: 1 },
        { type: 'event_collection', data: { id: 'evc-1' }, lineNumber: 2 },
        { type: 'time_collection', data: { id: 'tc-1' }, lineNumber: 3 },
        { type: 'entityCollection', data: { id: 'ec-2' }, lineNumber: 4 },
        { type: 'eventCollection', data: { id: 'evc-2' }, lineNumber: 5 },
        { type: 'timeCollection', data: { id: 'tc-2' }, lineNumber: 6 },
        { type: 'relation', data: { id: 'rel-1' }, lineNumber: 7 },
      ]

      const additional = handlerB.generateCrossUserResolutions(lines, [])

      expect(additional).toHaveLength(7)
      for (const res of additional) {
        expect(res.action).toBe('create-new')
        expect(res.newId).toBeDefined()
      }
    })

    it('should not duplicate IDs when same ID appears in multiple lines', () => {
      const lines: ImportLine[] = [
        { type: 'entity', data: { id: 'ent-1', name: 'Person' }, lineNumber: 1 },
        { type: 'entity', data: { id: 'ent-1', name: 'Person duplicate' }, lineNumber: 2 },
      ]

      const additional = handlerB.generateCrossUserResolutions(lines, [])

      // Should only generate one resolution for ent-1
      expect(additional).toHaveLength(1)
      expect(additional[0].originalId).toBe('ent-1')
    })
  })

  describe('end-to-end: cross-user import with NO pre-existing data (the critical bug)', () => {
    it('should regenerate ALL IDs when importing foreign data into empty database', async () => {
      // User B has NO data - completely fresh account
      const emptyExistingData = createEmptyExistingData()

      // User A's exported data
      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'persona-a', userId: USER_A, name: 'Analyst', role: 'Analyst', informationNeed: 'Testing' }, lineNumber: 1 },
        { type: 'entity', data: { id: 'ent-1', name: 'Person' }, lineNumber: 2 },
        { type: 'event', data: { id: 'evt-1', name: 'Meeting' }, lineNumber: 3 },
        { type: 'time', data: { id: 'time-1', name: 'Monday' }, lineNumber: 4 },
        { type: 'summary', data: { id: 'sum-1', videoId: 'vid-1', personaId: 'persona-a' }, lineNumber: 5 },
        { type: 'claim', data: { id: 'claim-1', summaryId: 'sum-1', text: 'A claim' }, lineNumber: 6 },
        { type: 'claim_relation', data: { id: 'cr-1', sourceClaimId: 'claim-1', targetClaimId: 'claim-1', relationTypeId: 'rt-1' }, lineNumber: 7 },
        createAnnotationLine('ann-1', 'persona-a', 'vid-1', 8),
      ]

      // Step 1: No conflicts because database is empty
      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      // detectConflicts synthesizes "foreign data" conflicts for each cross-user
      // line even when the DB is empty, so resolveConflicts can issue create-new
      // resolutions. Every non-missing conflict here must be tagged foreign.
      const duplicateConflicts = conflicts.filter(c => !c.type.startsWith('missing'))
      for (const c of duplicateConflicts) {
        expect(c.ownedByImporter).toBe(false)
      }

      // Step 2: Resolve (empty - no conflicts)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)

      // Step 3: This is the critical fix - cross-user detection
      expect(handlerB.isCrossUserImport(exportedLines)).toBe(true)
      const additionalResolutions = handlerB.generateCrossUserResolutions(exportedLines, resolutions)
      resolutions.push(...additionalResolutions)

      // All items with IDs should have create-new resolutions
      const createNewResolutions = resolutions.filter(r => r.action === 'create-new')
      expect(createNewResolutions.length).toBeGreaterThanOrEqual(8)

      // Step 4: Remap IDs
      const remapped = handlerB.remapIds(exportedLines, resolutions)

      // ALL IDs should be different from originals
      expect(remapped[0].data.id).not.toBe('persona-a')
      expect(remapped[1].data.id).not.toBe('ent-1')
      expect(remapped[2].data.id).not.toBe('evt-1')
      expect(remapped[3].data.id).not.toBe('time-1')
      expect(remapped[4].data.id).not.toBe('sum-1')
      expect(remapped[5].data.id).not.toBe('claim-1')
      expect(remapped[6].data.id).not.toBe('cr-1')
      expect(remapped[7].data.id).not.toBe('ann-1')

      // All IDs should be valid UUIDs (36 chars with dashes)
      for (const line of remapped) {
        if (line.data.id && line.type !== 'metadata') {
          expect(line.data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
        }
      }

      // References should be updated consistently
      const newPersonaId = remapped[0].data.id
      const newSummaryId = remapped[4].data.id
      const newClaimId = remapped[5].data.id

      // Summary should reference new persona
      expect(remapped[4].data.personaId).toBe(newPersonaId)
      // Claim should reference new summary
      expect(remapped[5].data.summaryId).toBe(newSummaryId)
      // Claim relation should reference new claims
      expect(remapped[6].data.sourceClaimId).toBe(newClaimId)
      expect(remapped[6].data.targetClaimId).toBe(newClaimId)
      // Annotation should reference new persona
      expect(remapped[7].data.personaId).toBe(newPersonaId)
    })

    it('should preserve IDs when same user re-imports into empty database', async () => {
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'persona-a', userId: USER_A, name: 'Analyst', role: 'Analyst', informationNeed: 'Testing' }, lineNumber: 1 },
        createAnnotationLine('ann-1', 'persona-a', 'vid-1', 2),
      ]

      const conflicts = await handlerA.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerA.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)

      // Same user - should NOT be cross-user
      expect(handlerA.isCrossUserImport(exportedLines)).toBe(false)

      // No additional resolutions needed
      const remapped = handlerA.remapIds(exportedLines, resolutions)

      // IDs should be preserved
      expect(remapped[0].data.id).toBe('persona-a')
      expect(remapped[1].data.id).toBe('ann-1')
    })

    it('should regenerate IDs for cross-user import with PARTIAL overlap', async () => {
      // Some of User A's data already exists (from a prior import attempt)
      const existingData = createEmptyExistingData()
      existingData.personaIds.add('persona-a')
      // NOT owned by User B
      existingData.annotationIds.add('ann-1')
      // NOT owned by User B

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'persona-a', userId: USER_A, name: 'Analyst', role: 'Analyst', informationNeed: 'Testing' }, lineNumber: 1 },
        { type: 'summary', data: { id: 'sum-1', videoId: 'vid-1', personaId: 'persona-a' }, lineNumber: 2 },
        createAnnotationLine('ann-1', 'persona-a', 'vid-1', 3),
        createAnnotationLine('ann-2', 'persona-a', 'vid-1', 4),
      ]

      // Detect conflicts - only persona-a and ann-1 conflict
      const conflicts = await handlerB.detectConflicts(exportedLines, existingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)

      // Cross-user detection adds resolutions for sum-1 and ann-2
      const additionalResolutions = handlerB.generateCrossUserResolutions(exportedLines, resolutions)
      resolutions.push(...additionalResolutions)

      const remapped = handlerB.remapIds(exportedLines, resolutions)

      // ALL IDs should be regenerated - both conflicting and non-conflicting
      expect(remapped[0].data.id).not.toBe('persona-a')
      expect(remapped[1].data.id).not.toBe('sum-1')
      expect(remapped[2].data.id).not.toBe('ann-1')
      expect(remapped[3].data.id).not.toBe('ann-2')

      // References should be consistent
      const newPersonaId = remapped[0].data.id
      expect(remapped[1].data.personaId).toBe(newPersonaId)
      expect(remapped[2].data.personaId).toBe(newPersonaId)
      expect(remapped[3].data.personaId).toBe(newPersonaId)
    })

    it('should regenerate IDs for ontology lines linked to foreign personas', async () => {
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'persona-a', userId: USER_A, name: 'Analyst', role: 'Analyst', informationNeed: 'Testing' }, lineNumber: 1 },
        { type: 'ontology', data: { personaId: 'persona-a', entityTypes: [], eventTypes: [] }, lineNumber: 2 },
      ]

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      const additionalResolutions = handlerB.generateCrossUserResolutions(exportedLines, resolutions)
      resolutions.push(...additionalResolutions)

      const remapped = handlerB.remapIds(exportedLines, resolutions)

      // Persona ID regenerated
      expect(remapped[0].data.id).not.toBe('persona-a')
      // Ontology's personaId reference updated
      expect(remapped[1].data.personaId).toBe(remapped[0].data.id)
    })

    it('should regenerate entity/event/time references in annotations', async () => {
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A', role: 'A', informationNeed: 'A' }, lineNumber: 1 },
        { type: 'entity', data: { id: 'ent-1', name: 'Person' }, lineNumber: 2 },
        { type: 'event', data: { id: 'evt-1', name: 'Walk' }, lineNumber: 3 },
        { type: 'time', data: { id: 'time-1' }, lineNumber: 4 },
        {
          type: 'annotation',
          data: {
            id: 'ann-obj-1',
            videoId: 'vid-1',
            annotationType: 'object',
            linkedEntityId: 'ent-1',
            linkedEventId: 'evt-1',
            linkedTimeId: 'time-1',
            boundingBoxSequence: {
              boxes: [{ x: 0, y: 0, width: 50, height: 50, frameNumber: 0, isKeyframe: true }],
              interpolationSegments: [],
              visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
              totalFrames: 1, keyframeCount: 1, interpolatedFrameCount: 0
            }
          },
          lineNumber: 5,
        },
      ]

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      const additionalResolutions = handlerB.generateCrossUserResolutions(exportedLines, resolutions)
      resolutions.push(...additionalResolutions)

      const remapped = handlerB.remapIds(exportedLines, resolutions)

      const newEntId = remapped[1].data.id
      const newEvtId = remapped[2].data.id
      const newTimeId = remapped[3].data.id

      expect(remapped[4].data.linkedEntityId).toBe(newEntId)
      expect(remapped[4].data.linkedEventId).toBe(newEvtId)
      expect(remapped[4].data.linkedTimeId).toBe(newTimeId)
    })

    it('should preserve typeRef cross-references in claim gloss (fovea-export-5 structure)', async () => {
      // Mirrors fovea-export-5.jsonl: claim gloss contains a typeRef whose
      // content points to an entity type nested inside an ontology line.
      // The entity type ID is NOT a top-level line ID so it is preserved,
      // and the typeRef.content (same ID) must stay consistent with it.
      const emptyExistingData = createEmptyExistingData()

      const PERSONA_ID = '57175232-62f7-4af2-96b4-bd8fd361adab'
      const ENTITY_TYPE_ID = '5ae47153-7b93-4a5c-8a39-4ee5ff833c40'
      const SUMMARY_ID = '159c2b9e-e759-45ec-a0cd-457a9ad7c86b'
      const CLAIM_ID = 'f7fb6250-c36e-4507-9a34-aa097c90f558'
      const ENTITY_ID = '0bfcd227-c571-4608-8c81-bc1e05bcd7a2'
      const ANN_ID = '56a94afd-0e98-42b5-9a19-5a35cdd19cb4'

      const exportedLines: ImportLine[] = [
        {
          type: 'persona',
          data: { id: PERSONA_ID, userId: USER_A, name: 'Test Analyst', role: 'Test Analyst', informationNeed: 'x' },
          lineNumber: 1,
        },
        {
          type: 'ontology',
          data: {
            personaId: PERSONA_ID,
            entityTypes: [{ id: ENTITY_TYPE_ID, name: 'fire' }],
            eventTypes: [],
            roleTypes: [],
            relationTypes: [],
            relations: [],
          },
          lineNumber: 2,
        },
        { type: 'entity', data: { id: ENTITY_ID, name: 'Fred Rogers' }, lineNumber: 3 },
        {
          type: 'summary',
          data: { id: SUMMARY_ID, videoId: 'vid-1', personaId: PERSONA_ID, summary: [], keyFrames: [] },
          lineNumber: 4,
        },
        {
          type: 'claim',
          data: {
            id: CLAIM_ID,
            summaryId: SUMMARY_ID,
            summaryType: 'video',
            text: 'claim about type',
            gloss: [
              { type: 'text', content: 'claim about ' },
              { type: 'typeRef', content: ENTITY_TYPE_ID, refType: 'entity', refPersonaId: PERSONA_ID },
            ],
          },
          lineNumber: 5,
        },
        {
          type: 'annotation',
          data: {
            id: ANN_ID,
            videoId: 'vid-1',
            annotationType: 'object',
            linkedEntityId: ENTITY_ID,
            boundingBoxSequence: {
              boxes: [{ x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true }],
              interpolationSegments: [],
              visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
              totalFrames: 1, keyframeCount: 1, interpolatedFrameCount: 0,
            },
          },
          lineNumber: 6,
        },
      ]

      expect(handlerB.isCrossUserImport(exportedLines)).toBe(true)

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      resolutions.push(...handlerB.generateCrossUserResolutions(exportedLines, resolutions))

      const remapped = handlerB.remapIds(exportedLines, resolutions)

      const newPersonaId = remapped[0].data.id as string
      const newEntityId = remapped[2].data.id as string
      const newSummaryId = remapped[3].data.id as string

      // Top-level IDs regenerated
      expect(newPersonaId).not.toBe(PERSONA_ID)
      expect(newEntityId).not.toBe(ENTITY_ID)
      expect(newSummaryId).not.toBe(SUMMARY_ID)
      expect(remapped[4].data.id).not.toBe(CLAIM_ID)
      expect(remapped[5].data.id).not.toBe(ANN_ID)

      // Ontology's personaId updated to new persona
      expect(remapped[1].data.personaId).toBe(newPersonaId)

      // Nested entity-type ID inside ontology is PRESERVED (not a top-level line ID)
      const entityTypes = (remapped[1].data as { entityTypes: Array<{ id: string }> }).entityTypes
      expect(entityTypes[0].id).toBe(ENTITY_TYPE_ID)

      // Summary/claim references updated
      expect(remapped[3].data.personaId).toBe(newPersonaId)
      expect(remapped[4].data.summaryId).toBe(newSummaryId)

      // Claim gloss: typeRef.refPersonaId remapped to new persona;
      // typeRef.content (the entity-type ID) preserved to stay in sync with ontology
      const gloss = (remapped[4].data as { gloss: Array<{ type: string; content: string; refPersonaId?: string }> }).gloss
      const typeRef = gloss.find(g => g.type === 'typeRef')!
      expect(typeRef.content).toBe(ENTITY_TYPE_ID)
      expect(typeRef.refPersonaId).toBe(newPersonaId)

      // Annotation's linkedEntityId follows the regenerated entity
      expect(remapped[5].data.linkedEntityId).toBe(newEntityId)
    })

    it('should remap string array reference fields like entityIds on collections', async () => {
      // EntityCollection.entityIds is a string[] — the generic remapper
      // must walk array elements, not only remap scalar *Id fields.
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A', role: 'A', informationNeed: 'A' }, lineNumber: 1 },
        { type: 'entity', data: { id: 'ent-1', name: 'A' }, lineNumber: 2 },
        { type: 'entity', data: { id: 'ent-2', name: 'B' }, lineNumber: 3 },
        {
          type: 'entity_collection',
          data: { id: 'ec-1', name: 'pair', entityIds: ['ent-1', 'ent-2'], collectionType: 'group' },
          lineNumber: 4,
        },
      ]

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      resolutions.push(...handlerB.generateCrossUserResolutions(exportedLines, resolutions))
      const remapped = handlerB.remapIds(exportedLines, resolutions)

      const newEnt1 = remapped[1].data.id as string
      const newEnt2 = remapped[2].data.id as string
      const newEntityIds = (remapped[3].data as { entityIds: string[] }).entityIds

      expect(newEnt1).not.toBe('ent-1')
      expect(newEnt2).not.toBe('ent-2')
      expect(newEntityIds).toEqual([newEnt1, newEnt2])
    })

    it('should remap eventIds string array on event collections', async () => {
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A', role: 'A', informationNeed: 'A' }, lineNumber: 1 },
        { type: 'event', data: { id: 'evt-1', name: 'A' }, lineNumber: 2 },
        { type: 'event', data: { id: 'evt-2', name: 'B' }, lineNumber: 3 },
        {
          type: 'event_collection',
          data: { id: 'evc-1', name: 'seq', eventIds: ['evt-1', 'evt-2'], collectionType: 'sequence' },
          lineNumber: 4,
        },
      ]

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      resolutions.push(...handlerB.generateCrossUserResolutions(exportedLines, resolutions))
      const remapped = handlerB.remapIds(exportedLines, resolutions)

      const newEvt1 = remapped[1].data.id as string
      const newEvt2 = remapped[2].data.id as string
      const newEventIds = (remapped[3].data as { eventIds: string[] }).eventIds

      expect(newEventIds).toEqual([newEvt1, newEvt2])
    })

    it('should remap GlossItem content when the ref points to a regenerated object', async () => {
      // objectRef/annotationRef/claimRef GlossItems store an ID in `content`
      // (not a *Id-suffixed key). For cross-user imports these IDs must still
      // be rewritten or claims/annotations will reference foreign originals.
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A', role: 'A', informationNeed: 'A' }, lineNumber: 1 },
        { type: 'entity', data: { id: 'ent-1', name: 'Person' }, lineNumber: 2 },
        { type: 'summary', data: { id: 'sum-1', videoId: 'vid-1', personaId: 'p-1' }, lineNumber: 3 },
        {
          type: 'claim',
          data: {
            id: 'claim-1',
            summaryId: 'sum-1',
            summaryType: 'video',
            text: 'about a person',
            gloss: [
              { type: 'text', content: 'about ' },
              { type: 'objectRef', content: 'ent-1', refType: 'entity-object' },
            ],
          },
          lineNumber: 4,
        },
      ]

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      resolutions.push(...handlerB.generateCrossUserResolutions(exportedLines, resolutions))
      const remapped = handlerB.remapIds(exportedLines, resolutions)

      const newEntId = remapped[1].data.id as string
      const gloss = (remapped[3].data as { gloss: Array<{ type: string; content: string }> }).gloss
      const objectRef = gloss.find(g => g.type === 'objectRef')!

      expect(newEntId).not.toBe('ent-1')
      expect(objectRef.content).toBe(newEntId)
    })

    it('should remap GlossItem annotationRef content pointing to a regenerated annotation', async () => {
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A', role: 'A', informationNeed: 'A' }, lineNumber: 1 },
        createAnnotationLine('ann-1', 'p-1', 'vid-1', 2),
        { type: 'summary', data: { id: 'sum-1', videoId: 'vid-1', personaId: 'p-1' }, lineNumber: 3 },
        {
          type: 'claim',
          data: {
            id: 'claim-1',
            summaryId: 'sum-1',
            summaryType: 'video',
            text: 'cf annotation',
            gloss: [
              { type: 'annotationRef', content: 'ann-1', refType: 'annotation' },
            ],
          },
          lineNumber: 4,
        },
      ]

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      resolutions.push(...handlerB.generateCrossUserResolutions(exportedLines, resolutions))
      const remapped = handlerB.remapIds(exportedLines, resolutions)

      const newAnnId = remapped[1].data.id as string
      const gloss = (remapped[3].data as { gloss: Array<{ type: string; content: string }> }).gloss
      const annRef = gloss.find(g => g.type === 'annotationRef')!

      expect(annRef.content).toBe(newAnnId)
    })

    it('should leave typeRef content pointing to ontology types unchanged', async () => {
      // Entity/role/event/relation TYPES are nested inside ontology lines
      // (no top-level line ID), so they are preserved across cross-user
      // imports and their typeRef.content must stay unchanged.
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A', role: 'A', informationNeed: 'A' }, lineNumber: 1 },
        {
          type: 'ontology',
          data: {
            personaId: 'p-1',
            entityTypes: [{ id: 'etype-1', name: 'fire' }],
            eventTypes: [], roleTypes: [], relationTypes: [], relations: [],
          },
          lineNumber: 2,
        },
        { type: 'summary', data: { id: 'sum-1', videoId: 'vid-1', personaId: 'p-1' }, lineNumber: 3 },
        {
          type: 'claim',
          data: {
            id: 'claim-1',
            summaryId: 'sum-1',
            gloss: [{ type: 'typeRef', content: 'etype-1', refType: 'entity', refPersonaId: 'p-1' }],
          },
          lineNumber: 4,
        },
      ]

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      resolutions.push(...handlerB.generateCrossUserResolutions(exportedLines, resolutions))
      const remapped = handlerB.remapIds(exportedLines, resolutions)

      const gloss = (remapped[3].data as { gloss: Array<{ type: string; content: string; refPersonaId?: string }> }).gloss
      const typeRef = gloss[0]

      expect(typeRef.content).toBe('etype-1')
      expect(typeRef.refPersonaId).toBe(remapped[0].data.id)
    })

    it('should remap typeAssignments arrays with nested personaId refs', async () => {
      // Entities and events carry typeAssignments: [{ personaId, entityTypeId }].
      // personaId must follow the regenerated persona; entityTypeId stays
      // unchanged (it points to a nested ontology type).
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A', role: 'A', informationNeed: 'A' }, lineNumber: 1 },
        {
          type: 'entity',
          data: {
            id: 'ent-1',
            name: 'X',
            typeAssignments: [{ personaId: 'p-1', entityTypeId: 'etype-nested', confidence: 0.9 }],
          },
          lineNumber: 2,
        },
      ]

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      resolutions.push(...handlerB.generateCrossUserResolutions(exportedLines, resolutions))
      const remapped = handlerB.remapIds(exportedLines, resolutions)

      const newPersonaId = remapped[0].data.id as string
      const assignments = (remapped[1].data as { typeAssignments: Array<{ personaId: string; entityTypeId: string }> }).typeAssignments

      expect(assignments[0].personaId).toBe(newPersonaId)
      expect(assignments[0].entityTypeId).toBe('etype-nested')
    })

    it('should not detect cross-user when persona userId is null or undefined', () => {
      // Legacy exports may not carry userId; we should not incorrectly flag them.
      const withNull: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: null, name: 'A' }, lineNumber: 1 },
      ]
      const withUndef: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', name: 'A' }, lineNumber: 1 },
      ]

      expect(handlerB.isCrossUserImport(withNull)).toBe(false)
      expect(handlerB.isCrossUserImport(withUndef)).toBe(false)
    })

    it('should prefer create-new over a skip resolution when both exist for same originalId', async () => {
      // Regression: missing-dependency conflicts resolve to skip and were
      // previously blocking cross-user ID regeneration for annotations
      // referencing not-yet-imported entities.
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-1', userId: USER_A, name: 'A', role: 'A', informationNeed: 'A' }, lineNumber: 1 },
        { type: 'entity', data: { id: 'ent-1', name: 'E' }, lineNumber: 2 },
        {
          type: 'annotation',
          data: {
            id: 'ann-1',
            videoId: 'vid-1',
            personaId: 'p-1',
            annotationType: 'object',
            linkedEntityId: 'ent-1',
            boundingBoxSequence: {
              boxes: [{ x: 0, y: 0, width: 10, height: 10, frameNumber: 0, isKeyframe: true }],
              interpolationSegments: [],
              visibilityRanges: [{ startFrame: 0, endFrame: 0, visible: true }],
              totalFrames: 1, keyframeCount: 1, interpolatedFrameCount: 0,
            },
          },
          lineNumber: 3,
        },
      ]

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      // Missing-dependency conflict is expected since ent-1 is not in DB yet.
      expect(conflicts.some(c => c.type === 'missing-dependency')).toBe(true)

      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      resolutions.push(...handlerB.generateCrossUserResolutions(exportedLines, resolutions))

      // Two resolutions exist for ann-1 (skip from missing-dep, create-new from cross-user).
      const annResolutions = resolutions.filter(r => r.originalId === 'ann-1')
      expect(annResolutions.length).toBe(2)
      expect(annResolutions.some(r => r.action === 'create-new')).toBe(true)

      const remapped = handlerB.remapIds(exportedLines, resolutions)
      // The annotation ID IS regenerated (create-new wins in idMap build).
      expect(remapped[2].data.id).not.toBe('ann-1')
      expect(remapped[2].data.linkedEntityId).toBe(remapped[1].data.id)
    })

    it('should handle multiple personas from different users', async () => {
      const emptyExistingData = createEmptyExistingData()

      const exportedLines: ImportLine[] = [
        { type: 'persona', data: { id: 'p-a', userId: USER_A, name: 'A', role: 'A', informationNeed: 'A' }, lineNumber: 1 },
        { type: 'persona', data: { id: 'p-b', userId: USER_B, name: 'B', role: 'B', informationNeed: 'B' }, lineNumber: 2 },
        createAnnotationLine('ann-a', 'p-a', 'vid-1', 3),
        createAnnotationLine('ann-b', 'p-b', 'vid-1', 4),
      ]

      // Import into User B's account - p-a is foreign, p-b is own
      // But isCrossUserImport sees p-a as foreign, triggers full regen
      expect(handlerB.isCrossUserImport(exportedLines)).toBe(true)

      const conflicts = await handlerB.detectConflicts(exportedLines, emptyExistingData)
      const resolutions = handlerB.resolveConflicts(conflicts, DEFAULT_IMPORT_OPTIONS)
      const additionalResolutions = handlerB.generateCrossUserResolutions(exportedLines, resolutions)
      resolutions.push(...additionalResolutions)

      const remapped = handlerB.remapIds(exportedLines, resolutions)

      // Both personas should get new IDs (conservative approach for consistency)
      expect(remapped[0].data.id).not.toBe('p-a')
      expect(remapped[1].data.id).not.toBe('p-b')

      // Annotations should reference the new persona IDs
      expect(remapped[2].data.personaId).toBe(remapped[0].data.id)
      expect(remapped[3].data.personaId).toBe(remapped[1].data.id)
    })
  })
})
