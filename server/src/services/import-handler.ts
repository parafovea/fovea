/**
 * Import orchestrator: parses, validates, resolves conflicts, and executes
 * JSONL imports inside a transaction.
 *
 * ImportHandler is a thin facade over the modules in `./import/`. The pure
 * parsing, dependency-graph, and conflict math live in `import/line-parser`,
 * `import/dependency-graph`, and `import/conflict-resolver`; the stateful
 * per-type database writers live in `import/entity-importers`. This class
 * loads existing data, drives the conflict pipeline, and runs the per-type
 * importers in dependency order inside the import transaction.
 *
 * @module
 */

import { PrismaClient } from '@prisma/client'
import { ValidationError } from '../lib/errors.js'
import type { AppAbility } from '../lib/abilities.js'
import {
  ImportLine,
  ValidationResult,
  Conflict,
  Resolution,
  ImportOptions,
  ImportResult,
  DependencyGraph,
  ExistingData
} from './import-types.js'
import { SequenceValidator } from './import-validator.js'
import { parseLine, validateLine } from './import/line-parser.js'
import { buildDependencyGraph } from './import/dependency-graph.js'
import {
  detectConflicts,
  generateCrossUserResolutions,
  isCrossUserImport,
  remapIds,
  resolveConflicts
} from './import/conflict-resolver.js'
import { EntityImporter, ImportedIds } from './import/entity-importers.js'
import { readAllAnnotationRefs } from './layers-bridge/annotation-bridge.js'
import { readAllClaimRefs, readAllClaimRelationRefs } from './layers-bridge/claim-bridge.js'
import { readAllOntologyPersonaIds } from './layers-bridge/ontology-bridge.js'
import { readAllWorldObjectIds, readWorldAggregate, writeWorldAggregate } from './layers-bridge/world-bridge.js'
import { personalWorldStateId } from './world-layers-mapper.js'

/**
 * Handles parsing, validation, and execution of imports.
 */
export class ImportHandler {
  private validator: SequenceValidator
  private prisma: PrismaClient
  private userId: string
  private projectId: string | null
  private importer: EntityImporter

  constructor(prisma: PrismaClient, userId: string, ability: AppAbility | null = null, projectId: string | null = null) {
    this.validator = new SequenceValidator()
    this.prisma = prisma
    this.userId = userId
    this.projectId = projectId
    this.importer = new EntityImporter(userId, ability, projectId)
  }

  /**
   * Parse a single line from JSON Lines file.
   *
   * @param line - raw line string
   * @param lineNumber - line number in file
   * @returns parsed import line
   */
  parseLine(line: string, lineNumber: number): ImportLine {
    return parseLine(line, lineNumber)
  }

  /**
   * Validate a parsed import line.
   *
   * @param line - the import line to validate
   * @returns the validation result
   */
  validateLine(line: ImportLine): ValidationResult {
    return validateLine(line, this.validator)
  }

  /**
   * Build dependency graph from import lines.
   *
   * @param lines - array of import lines
   * @returns dependency graph
   */
  buildDependencyGraph(lines: ImportLine[]): DependencyGraph {
    return buildDependencyGraph(lines)
  }

  /**
   * Detect conflicts between import data and existing database data.
   *
   * @param lines - the import lines
   * @param existingData - existing data in database
   * @returns array of conflicts
   */
  async detectConflicts(lines: ImportLine[], existingData: ExistingData): Promise<Conflict[]> {
    return detectConflicts(lines, existingData, this.userId)
  }

  /**
   * Resolve conflicts based on import options.
   *
   * @param conflicts - detected conflicts
   * @param options - the import options with resolution strategies
   * @returns array of resolutions
   */
  resolveConflicts(conflicts: Conflict[], options: ImportOptions): Resolution[] {
    return resolveConflicts(conflicts, options)
  }

  /**
   * Remap IDs based on conflict resolutions.
   *
   * @param lines - the import lines
   * @param resolutions - conflict resolutions
   * @returns updated import lines with remapped IDs
   */
  remapIds(lines: ImportLine[], resolutions: Resolution[]): ImportLine[] {
    return remapIds(lines, resolutions)
  }

  /**
   * Detect whether the import contains data from a different user.
   *
   * @param lines - the import lines
   * @returns true when the import originated from a different user
   */
  isCrossUserImport(lines: ImportLine[]): boolean {
    return isCrossUserImport(lines, this.userId)
  }

  /**
   * Generate create-new resolutions for all items that don't already have
   * a conflict resolution. Used for cross-user imports where ALL IDs must
   * be regenerated regardless of whether they collide with existing data.
   *
   * @param lines - the import lines
   * @param existingResolutions - resolutions already produced for this batch
   * @returns additional create-new resolutions for unresolved id-bearing lines
   */
  generateCrossUserResolutions(lines: ImportLine[], existingResolutions: Resolution[]): Resolution[] {
    return generateCrossUserResolutions(lines, existingResolutions)
  }

  /**
   * Load existing data from database for conflict detection.
   *
   * @returns existing data
   */
  async loadExistingData(): Promise<ExistingData> {
    // Personas, videos, and summaries remain their own models; annotations,
    // claims, claim relations, ontologies, and world objects are read across the
    // layers store and any not-yet-materialized legacy rows via the bridge, so
    // conflict detection sees an id regardless of which store holds it.
    const [
      personas,
      videos,
      summaries,
      annotationRefs,
      claimRefs,
      claimRelationRefs,
      ontologyPersonaIds,
      allWorldIds,
      ownWorld,
    ] = await Promise.all([
      this.prisma.persona.findMany({ select: { id: true, userId: true } }),
      this.prisma.video.findMany({ select: { id: true } }),
      this.prisma.videoSummary.findMany({ select: { id: true, personaId: true } }),
      readAllAnnotationRefs(this.prisma),
      readAllClaimRefs(this.prisma),
      readAllClaimRelationRefs(this.prisma),
      readAllOntologyPersonaIds(this.prisma),
      readAllWorldObjectIds(this.prisma),
      readWorldAggregate(this.prisma, { userId: this.userId, projectId: null }),
    ])

    // Build ownership sets
    const ownedPersonaIds = new Set(
      personas.filter(p => p.userId === this.userId).map(p => p.id)
    )
    const ownedSummaryIds = new Set(
      summaries.filter(s => ownedPersonaIds.has(s.personaId)).map(s => s.id)
    )
    const ownedClaimIds = new Set(
      claimRefs.filter(c => ownedSummaryIds.has(c.summaryId)).map(c => c.id)
    )
    const ownedClaimRelationIds = new Set(
      claimRelationRefs.filter(r => ownedClaimIds.has(r.sourceClaimId)).map(r => r.id)
    )
    const ownedAnnotationIds = new Set(
      annotationRefs
        .filter(a => a.personaId ? ownedPersonaIds.has(a.personaId) : false)
        .map(a => a.id)
    )

    // Extract owned world object IDs from the caller's reconstructed world
    const ownedEntityIds = new Set<string>()
    const ownedEventIds = new Set<string>()
    const ownedTimeIds = new Set<string>()
    const ownedCollectionIds = new Set<string>()
    const addOwnedId = (bucket: Set<string>, object: unknown): void => {
      if (object && typeof object === 'object' && 'id' in object) {
        const id = (object as { id: unknown }).id
        if (typeof id === 'string') bucket.add(id)
      }
    }
    for (const object of ownWorld.aggregate.entities) addOwnedId(ownedEntityIds, object)
    for (const object of ownWorld.aggregate.events) addOwnedId(ownedEventIds, object)
    for (const object of ownWorld.aggregate.times) addOwnedId(ownedTimeIds, object)
    for (const object of ownWorld.aggregate.entityCollections) addOwnedId(ownedCollectionIds, object)
    for (const object of ownWorld.aggregate.eventCollections) addOwnedId(ownedCollectionIds, object)
    for (const object of ownWorld.aggregate.timeCollections) addOwnedId(ownedCollectionIds, object)

    const existingData: ExistingData = {
      personaIds: new Set(personas.map(p => p.id)),
      entityIds: allWorldIds.entityIds,
      eventIds: allWorldIds.eventIds,
      timeIds: allWorldIds.timeIds,
      collectionIds: allWorldIds.collectionIds,
      annotationIds: new Set(annotationRefs.map(a => a.id)),
      videoIds: new Set(videos.map(v => v.id)),
      summaryIds: new Set(summaries.map(s => s.id)),
      claimIds: new Set(claimRefs.map(c => c.id)),
      claimRelationIds: new Set(claimRelationRefs.map(r => r.id)),
      ontologyPersonaIds,
      ownedPersonaIds,
      ownedAnnotationIds,
      ownedSummaryIds,
      ownedClaimIds,
      ownedClaimRelationIds,
      ownedEntityIds,
      ownedEventIds,
      ownedTimeIds,
      ownedCollectionIds,
      ownedWorldStateId: ownWorld.exists ? personalWorldStateId(this.userId) : null,
    }

    return existingData
  }

  /**
   * Execute import with all lines and options.
   *
   * @param lines - the import lines
   * @param options - the import options
   * @returns the import result
   */
  async executeImport(lines: ImportLine[], options: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      summary: {
        totalLines: lines.length,
        processedLines: 0,
        importedItems: {
          personas: 0,
          ontologies: 0,
          entities: 0,
          events: 0,
          times: 0,
          entityCollections: 0,
          eventCollections: 0,
          timeCollections: 0,
          relations: 0,
          summaries: 0,
          claims: 0,
          claimRelations: 0,
          annotations: 0,
          totalKeyframes: 0,
          totalInterpolatedFrames: 0,
          singleKeyframeSequences: 0
        },
        skippedItems: {
          personas: 0,
          worldObjects: 0,
          summaries: 0,
          claims: 0,
          annotations: 0,
          sequenceAnnotations: 0
        }
      },
      warnings: [],
      errors: [],
      conflicts: []
    }

    // Load existing data
    const existingData = await this.loadExistingData()

    // Detect conflicts
    const conflicts = await this.detectConflicts(lines, existingData)
    const resolutions = this.resolveConflicts(conflicts, options)

    // For cross-user imports, regenerate ALL IDs (not just conflicting ones)
    const crossUser = this.isCrossUserImport(lines)
    if (crossUser) {
      const additionalResolutions = this.generateCrossUserResolutions(lines, resolutions)
      resolutions.push(...additionalResolutions)
    }

    // Check for fail actions
    const failResolutions = resolutions.filter(r => r.action === 'fail')
    if (failResolutions.length > 0 && options.validation.strictMode) {
      result.errors.push({
        line: 0,
        type: 'conflict',
        message: `Import failed due to ${failResolutions.length} unresolvable conflicts`,
        data: failResolutions
      })
      return result
    }

    // Remap IDs
    const remappedLines = this.remapIds(lines, resolutions)

    // Build resolution map for quick lookup
    const resolutionMap = new Map<string, Resolution>()
    for (const resolution of resolutions) {
      resolutionMap.set(resolution.originalId, resolution)
    }

    // Store conflicts with resolutions
    result.conflicts = conflicts.map(c => ({
      ...c,
      resolution: resolutionMap.get(c.originalId)?.strategy || 'none'
    }))

    // Execute import in dependency order
    try {
      if (options.transaction.atomic) {
        // Prisma's default interactive-transaction timeout is 5_000ms, which
        // is too tight for realistic cross-user imports on this branch. A
        // payload with ~20 personas / ~100+ summaries / hundreds of claims
        // exceeds 5s end-to-end because every nested write goes through
        // CASL's ability check (added in v0.2.0) and the Clean Architecture
        // layering introduced in v0.3.0 (added per-call indirection through
        // the application services), so the default times out with
        // "Transaction already closed" and the entire import rolls back.
        // Bump to 5 minutes for atomic mode — this is the only place the
        // budget matters for import correctness, and the import route is
        // rate-limited upstream so unbounded payloads cannot pile up.
        await this.prisma.$transaction(
          async (tx) => {
            await this.importLines(remappedLines, resolutionMap, result, options, tx as PrismaClient)
          },
          { maxWait: 10_000, timeout: 300_000 },
        )
      } else {
        await this.importLines(remappedLines, resolutionMap, result, options, this.prisma)
      }

      result.success = true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.errors.push({
        line: 0,
        type: 'execution',
        message: `Import execution failed: ${errorMessage}`,
        data: error
      })
      result.success = false
    }

    return result
  }

  /**
   * Import lines in dependency order.
   * Order: personas -> ontologies -> world state -> summaries -> claims -> claim relations -> annotations
   */
  private async importLines(
    lines: ImportLine[],
    resolutionMap: Map<string, Resolution>,
    result: ImportResult,
    options: ImportOptions,
    tx: PrismaClient
  ): Promise<void> {
    // Group lines by type for dependency ordering
    const personaLines = lines.filter(l => l.type === 'persona')
    const ontologyLines = lines.filter(l => l.type === 'ontology')
    const entityLines = lines.filter(l => l.type === 'entity')
    const eventLines = lines.filter(l => l.type === 'event')
    const timeLines = lines.filter(l => l.type === 'time')
    const entityCollectionLines = lines.filter(l => l.type === 'entity_collection' || l.type === 'entityCollection')
    const eventCollectionLines = lines.filter(l => l.type === 'event_collection' || l.type === 'eventCollection')
    const timeCollectionLines = lines.filter(l => l.type === 'time_collection' || l.type === 'timeCollection')
    const relationLines = lines.filter(l => l.type === 'relation')
    const summaryLines = lines.filter(l => l.type === 'summary')
    const claimLines = lines.filter(l => l.type === 'claim')
    const claimRelationLines = lines.filter(l => l.type === 'claim_relation')
    const annotationLines = lines.filter(l => l.type === 'annotation')

    // Track imported IDs for dependency resolution
    const importedIds: ImportedIds = {
      personas: new Set<string>(),
      summaries: new Set<string>(),
      claims: new Set<string>()
    }

    // 1. Import personas (no dependencies)
    for (const line of personaLines) {
      await this.importer.importPersona(line, resolutionMap, result, options, tx, importedIds)
    }

    // 2. Import ontologies (depend on personas)
    for (const line of ontologyLines) {
      await this.importer.importOntology(line, resolutionMap, result, options, tx, importedIds)
    }

    // 3. Import world state objects. World objects live in the layers graph; the
    // import merges each item into the reconstructed aggregate (legacy read-
    // through when no layers rows exist yet), then materializes the merged
    // aggregate into the layers store once.
    const worldRead = await readWorldAggregate(tx, { userId: this.userId, projectId: this.projectId })
    const worldAggregate = worldRead.aggregate
    let worldWritable = true
    if (!worldRead.exists) {
      if (!this.importer.canCreate('WorldState', { userId: this.userId, projectId: this.projectId })) {
        result.errors.push({
          line: 0,
          type: 'authorization',
          message: 'Cannot create WorldState in this scope'
        })
        if (options.transaction.atomic) throw new ValidationError('Cannot create WorldState in this scope')
        worldWritable = false
      }
    }
    // When world creation is denied, skip world-object merges but continue with
    // summaries/claims/annotations below.
    if (worldWritable) {
      for (const line of entityLines) {
        this.importer.mergeWorldStateItem(line, 'entity', worldAggregate, resolutionMap, result)
      }
      for (const line of eventLines) {
        this.importer.mergeWorldStateItem(line, 'event', worldAggregate, resolutionMap, result)
      }
      for (const line of timeLines) {
        this.importer.mergeWorldStateItem(line, 'time', worldAggregate, resolutionMap, result)
      }
      for (const line of entityCollectionLines) {
        this.importer.mergeWorldStateItem(line, 'entityCollection', worldAggregate, resolutionMap, result)
      }
      for (const line of eventCollectionLines) {
        this.importer.mergeWorldStateItem(line, 'eventCollection', worldAggregate, resolutionMap, result)
      }
      for (const line of timeCollectionLines) {
        this.importer.mergeWorldStateItem(line, 'timeCollection', worldAggregate, resolutionMap, result)
      }
      for (const line of relationLines) {
        this.importer.mergeWorldStateItem(line, 'relation', worldAggregate, resolutionMap, result)
      }

      await writeWorldAggregate(tx, { userId: this.userId, projectId: this.projectId }, worldAggregate)
    }

    // 4. Import summaries (depend on videos and personas)
    for (const line of summaryLines) {
      await this.importer.importSummary(line, resolutionMap, result, options, tx, importedIds)
    }

    // 5. Import claims (depend on summaries)
    for (const line of claimLines) {
      await this.importer.importClaim(line, resolutionMap, result, options, tx, importedIds)
    }

    // 6. Import claim relations (depend on claims)
    for (const line of claimRelationLines) {
      await this.importer.importClaimRelation(line, resolutionMap, result, options, tx, importedIds)
    }

    // 7. Import annotations (depend on videos, personas)
    for (const line of annotationLines) {
      await this.importer.importAnnotation(line, resolutionMap, result, options, tx)
    }
  }
}
