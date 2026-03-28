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
})
