/**
 * Pure conflict detection, resolution, and id remapping for imports.
 *
 * These functions take their inputs (lines, existingData, options, userId) as
 * parameters rather than reading instance state, so they can be tested and
 * reused without a database or authorization context. The id remap is
 * structure-agnostic; see `buildRemapPattern` and `remapObjectIds`.
 *
 * @module
 */

import { randomUUID } from 'crypto'
import {
  Conflict,
  ExistingData,
  ImportLine,
  ImportOptions,
  Resolution
} from '../import-types.js'
import { isOwnedByImporter } from './dependency-graph.js'
import {
  AnnotationData,
  CollectionData,
  EntityData,
  EventData,
  PersonaData,
  TimeData
} from './types.js'

/**
 * Build a case-insensitive matcher whose alternations are the literal
 * keys of `idMap`. The remap is structure-agnostic: rather than gate on
 * field names (the previous remap walked an allowlist of `id` / `*Id` /
 * `*Ids` / GlossItem `content`, which had to be extended whenever the
 * exported schema gained a new id-bearing field and silently missed every
 * free-form string that namedropped a referenced record), every string
 * value in the payload is scanned for substrings that are themselves
 * keys in `idMap` and rewritten to the importer's regenerated value.
 *
 * Keys are sorted longest-first so a longer id that happens to contain
 * a shorter id as a prefix wins. Keys are RegExp-escaped so id formats
 * containing regex metacharacters (hyphens are fine, but a future short
 * id format could include dots or parentheses) substitute literally.
 * The `\b`-free pattern intentionally also rewrites ids that appear as
 * substrings of larger tokens (e.g. `claim_<id>_v2`, `entity-<id>.png`,
 * `https://x/<id>?q=1`), since those are the exact shapes inline prose
 * uses when it namedrops a referenced record. Strings whose substrings
 * are not in `idMap` pass through unchanged so the substitution stays
 * a strict no-op outside the cross-user path.
 */
function escapeRegex(s: string): string {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
}

function buildRemapPattern(idMap: Map<string, string>): RegExp | null {
  if (idMap.size === 0) return null
  const keys = Array.from(idMap.keys())
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
  return new RegExp(keys.join('|'), 'gi')
}

function remapInlineIds(text: string, pattern: RegExp, idMap: Map<string, string>): string {
  if (!text) return text
  pattern.lastIndex = 0
  return text.replace(pattern, m => idMap.get(m.toLowerCase()) ?? m)
}

/**
 * Detect conflicts between import data and existing database data.
 *
 * @param lines - the import lines
 * @param existingData - existing data in the database
 * @param userId - the importing user's id
 * @returns array of detected conflicts
 */
export function detectConflicts(lines: ImportLine[], existingData: ExistingData, userId: string): Conflict[] {
  const conflicts: Conflict[] = []

  // Identify foreign persona IDs from import data: personas whose userId
  // differs from the importing user. These need new UUIDs even if their IDs
  // don't already exist in the database.
  const foreignPersonaIds = new Set<string>()
  for (const line of lines) {
    if (line.type === 'persona') {
      const personaData = line.data as PersonaData
      if (personaData.userId && personaData.userId !== userId) {
        foreignPersonaIds.add(personaData.id)
      }
    }
  }

  for (const line of lines) {
    switch (line.type) {
      case 'persona': {
        const personaData = line.data as PersonaData
        if (existingData.personaIds.has(personaData.id)) {
          conflicts.push({
            type: 'duplicate-persona',
            line: line.lineNumber,
            originalId: personaData.id,
            existingId: personaData.id,
            details: `Persona with ID ${personaData.id} already exists`,
            ownedByImporter: isOwnedByImporter(personaData.id, 'persona', existingData)
          })
        } else if (foreignPersonaIds.has(personaData.id)) {
          conflicts.push({
            type: 'duplicate-persona',
            line: line.lineNumber,
            originalId: personaData.id,
            details: `Persona from a different user requires new ID`,
            ownedByImporter: false
          })
        }
        break
      }

      case 'annotation': {
        const annotationData = line.data as AnnotationData
        if (existingData.annotationIds.has(annotationData.id)) {
          const sequence = annotationData.boundingBoxSequence
          const keyframes = sequence.boxes.filter((b) => b.isKeyframe)
          const frameRange = keyframes.length > 0 ? {
            start: keyframes[0].frameNumber,
            end: keyframes[keyframes.length - 1].frameNumber
          } : undefined

          conflicts.push({
            type: 'duplicate-sequence',
            line: line.lineNumber,
            originalId: annotationData.id,
            existingId: annotationData.id,
            details: `Annotation with ID ${annotationData.id} already exists`,
            frameRange,
            interpolationType: (sequence.interpolationSegments as Array<{ type?: string }>)[0]?.type,
            ownedByImporter: isOwnedByImporter(annotationData.id, 'annotation', existingData)
          })
        } else if (annotationData.personaId && foreignPersonaIds.has(annotationData.personaId)) {
          conflicts.push({
            type: 'duplicate-sequence',
            line: line.lineNumber,
            originalId: annotationData.id,
            details: `Annotation from a different user requires new ID`,
            ownedByImporter: false
          })
        }

        // Check for missing dependencies
        if (annotationData.videoId && !existingData.videoIds.has(annotationData.videoId)) {
          conflicts.push({
            type: 'missing-dependency',
            line: line.lineNumber,
            originalId: annotationData.id,
            details: `Video ${annotationData.videoId} does not exist`
          })
        }

        if (annotationData.linkedEntityId && !existingData.entityIds.has(annotationData.linkedEntityId)) {
          conflicts.push({
            type: 'missing-dependency',
            line: line.lineNumber,
            originalId: annotationData.id,
            details: `Entity ${annotationData.linkedEntityId} does not exist`
          })
        }
        break
      }

      case 'entity': {
        const entityData = line.data as EntityData
        if (existingData.entityIds.has(entityData.id)) {
          conflicts.push({
            type: 'duplicate-object',
            line: line.lineNumber,
            originalId: entityData.id,
            existingId: entityData.id,
            details: `Entity with ID ${entityData.id} already exists`,
            ownedByImporter: isOwnedByImporter(entityData.id, 'entity', existingData)
          })
        } else if (foreignPersonaIds.size > 0) {
          conflicts.push({
            type: 'duplicate-object',
            line: line.lineNumber,
            originalId: entityData.id,
            details: `Entity from a different user requires new ID`,
            ownedByImporter: false
          })
        }
        break
      }

      case 'event': {
        const eventData = line.data as EventData
        if (existingData.eventIds.has(eventData.id)) {
          conflicts.push({
            type: 'duplicate-object',
            line: line.lineNumber,
            originalId: eventData.id,
            existingId: eventData.id,
            details: `Event with ID ${eventData.id} already exists`,
            ownedByImporter: isOwnedByImporter(eventData.id, 'event', existingData)
          })
        } else if (foreignPersonaIds.size > 0) {
          conflicts.push({
            type: 'duplicate-object',
            line: line.lineNumber,
            originalId: eventData.id,
            details: `Event from a different user requires new ID`,
            ownedByImporter: false
          })
        }
        break
      }

      case 'time': {
        const timeData = line.data as TimeData
        if (existingData.timeIds.has(timeData.id)) {
          conflicts.push({
            type: 'duplicate-object',
            line: line.lineNumber,
            originalId: timeData.id,
            existingId: timeData.id,
            details: `Time with ID ${timeData.id} already exists`,
            ownedByImporter: isOwnedByImporter(timeData.id, 'time', existingData)
          })
        } else if (foreignPersonaIds.size > 0) {
          conflicts.push({
            type: 'duplicate-object',
            line: line.lineNumber,
            originalId: timeData.id,
            details: `Time from a different user requires new ID`,
            ownedByImporter: false
          })
        }
        break
      }

      case 'entity_collection':
      case 'entityCollection':
      case 'event_collection':
      case 'eventCollection':
      case 'time_collection':
      case 'timeCollection': {
        const collectionData = line.data as CollectionData
        if (existingData.collectionIds.has(collectionData.id)) {
          conflicts.push({
            type: 'duplicate-object',
            line: line.lineNumber,
            originalId: collectionData.id,
            existingId: collectionData.id,
            details: `Collection with ID ${collectionData.id} already exists`,
            ownedByImporter: isOwnedByImporter(collectionData.id, line.type, existingData)
          })
        } else if (foreignPersonaIds.size > 0) {
          conflicts.push({
            type: 'duplicate-object',
            line: line.lineNumber,
            originalId: collectionData.id,
            details: `Collection from a different user requires new ID`,
            ownedByImporter: false
          })
        }
        break
      }

      case 'relation': {
        const relationData = line.data as { id: string; [key: string]: unknown }
        if (relationData.id && existingData.collectionIds.has(relationData.id)) {
          conflicts.push({
            type: 'duplicate-object',
            line: line.lineNumber,
            originalId: relationData.id,
            existingId: relationData.id,
            details: `Relation with ID ${relationData.id} already exists`,
            ownedByImporter: isOwnedByImporter(relationData.id, 'relation', existingData)
          })
        } else if (relationData.id && foreignPersonaIds.size > 0) {
          conflicts.push({
            type: 'duplicate-object',
            line: line.lineNumber,
            originalId: relationData.id,
            details: `Relation from a different user requires new ID`,
            ownedByImporter: false
          })
        }
        break
      }

      case 'summary': {
        const summaryData = line.data as { id: string; personaId?: string; [key: string]: unknown }
        if (summaryData.id && existingData.summaryIds.has(summaryData.id)) {
          conflicts.push({
            type: 'duplicate-summary',
            line: line.lineNumber,
            originalId: summaryData.id,
            existingId: summaryData.id,
            details: `Summary with ID ${summaryData.id} already exists`,
            ownedByImporter: isOwnedByImporter(summaryData.id, 'summary', existingData)
          })
        } else if (summaryData.id && summaryData.personaId && foreignPersonaIds.has(summaryData.personaId)) {
          conflicts.push({
            type: 'duplicate-summary',
            line: line.lineNumber,
            originalId: summaryData.id,
            details: `Summary from a different user requires new ID`,
            ownedByImporter: false
          })
        }
        break
      }

      case 'claim': {
        const claimData = line.data as { id: string; [key: string]: unknown }
        if (claimData.id && existingData.claimIds.has(claimData.id)) {
          conflicts.push({
            type: 'duplicate-claim',
            line: line.lineNumber,
            originalId: claimData.id,
            existingId: claimData.id,
            details: `Claim with ID ${claimData.id} already exists`,
            ownedByImporter: isOwnedByImporter(claimData.id, 'claim', existingData)
          })
        } else if (claimData.id && foreignPersonaIds.size > 0) {
          conflicts.push({
            type: 'duplicate-claim',
            line: line.lineNumber,
            originalId: claimData.id,
            details: `Claim from a different user requires new ID`,
            ownedByImporter: false
          })
        }
        break
      }

      case 'claim_relation': {
        const relationData = line.data as { id: string; [key: string]: unknown }
        if (relationData.id && existingData.claimRelationIds.has(relationData.id)) {
          conflicts.push({
            type: 'duplicate-claim-relation',
            line: line.lineNumber,
            originalId: relationData.id,
            existingId: relationData.id,
            details: `Claim relation with ID ${relationData.id} already exists`,
            ownedByImporter: isOwnedByImporter(relationData.id, 'claim_relation', existingData)
          })
        } else if (relationData.id && foreignPersonaIds.size > 0) {
          conflicts.push({
            type: 'duplicate-claim-relation',
            line: line.lineNumber,
            originalId: relationData.id,
            details: `Claim relation from a different user requires new ID`,
            ownedByImporter: false
          })
        }
        break
      }
    }
  }

  return conflicts
}

/**
 * Resolve conflicts based on import options.
 *
 * @param conflicts - detected conflicts
 * @param options - the import options with resolution strategies
 * @returns array of resolutions, one per conflict
 */
export function resolveConflicts(conflicts: Conflict[], options: ImportOptions): Resolution[] {
  const resolutions: Resolution[] = []

  for (const conflict of conflicts) {
    // Foreign data (not owned by importing user) is always copied with new IDs
    if (conflict.ownedByImporter === false) {
      resolutions.push({
        conflictType: conflict.type,
        strategy: 'create-new',
        originalId: conflict.originalId,
        newId: randomUUID(),
        action: 'create-new'
      })
      continue
    }

    let resolution: Resolution

    switch (conflict.type) {
      case 'duplicate-sequence': {
        const strategy = options.conflictResolution.sequences.duplicateSequenceIds
        resolution = {
          conflictType: conflict.type,
          strategy,
          originalId: conflict.originalId,
          action: strategy === 'skip' ? 'skip' :
                  strategy === 'replace' ? 'replace' :
                  strategy === 'merge-keyframes' ? 'merge' :
                  strategy === 'create-new' ? 'create-new' : 'skip'
        }

        if (strategy === 'create-new') {
          resolution.newId = randomUUID()
        }
        break
      }

      case 'duplicate-persona': {
        const personaStrategy = options.conflictResolution.personas
        resolution = {
          conflictType: conflict.type,
          strategy: personaStrategy,
          originalId: conflict.originalId,
          action: personaStrategy === 'skip' ? 'skip' :
                  personaStrategy === 'replace' ? 'replace' :
                  personaStrategy === 'merge' ? 'merge' :
                  personaStrategy === 'rename' ? 'rename' : 'skip'
        }
        break
      }

      case 'duplicate-object': {
        const objStrategy = options.conflictResolution.worldObjects
        resolution = {
          conflictType: conflict.type,
          strategy: objStrategy,
          originalId: conflict.originalId,
          action: objStrategy === 'skip' ? 'skip' :
                  objStrategy === 'replace' ? 'replace' :
                  objStrategy === 'merge-assignments' ? 'merge' : 'skip'
        }
        break
      }

      case 'duplicate-summary':
      case 'duplicate-claim':
      case 'duplicate-claim-relation': {
        resolution = {
          conflictType: conflict.type,
          strategy: 'skip',
          originalId: conflict.originalId,
          action: 'skip'
        }
        break
      }

      case 'missing-dependency': {
        const depStrategy = options.conflictResolution.missingDependencies
        resolution = {
          conflictType: conflict.type,
          strategy: depStrategy,
          originalId: conflict.originalId,
          action: depStrategy === 'skip-item' ? 'skip' :
                  depStrategy === 'create-placeholder' ? 'create-new' :
                  'fail'
        }
        break
      }

      case 'overlapping-frames': {
        const frameStrategy = options.conflictResolution.sequences.overlappingFrameRanges
        resolution = {
          conflictType: conflict.type,
          strategy: frameStrategy,
          originalId: conflict.originalId,
          action: frameStrategy === 'fail-import' ? 'fail' : 'skip'
        }
        break
      }

      case 'interpolation-conflict': {
        const interpStrategy = options.conflictResolution.sequences.interpolationConflicts
        resolution = {
          conflictType: conflict.type,
          strategy: interpStrategy,
          originalId: conflict.originalId,
          action: interpStrategy === 'fail-import' ? 'fail' :
                  interpStrategy === 'use-imported' ? 'replace' : 'skip'
        }
        break
      }

      default:
        resolution = {
          conflictType: conflict.type,
          strategy: 'skip',
          originalId: conflict.originalId,
          action: 'skip'
        }
    }

    resolutions.push(resolution)
  }

  return resolutions
}

/**
 * Recursively remap IDs across the imported payload.
 *
 * The remap is structure-agnostic: it walks every value in the object
 * tree and applies the id-shape substitution to every string. Building the
 * matcher from the idMap keys themselves makes the remap independent of
 * field naming: a whole-string id, an id embedded in surrounding prose, an
 * id array element, an id carried by a GlossItem `content`, and an id inside
 * a JSON-encoded substring are all rewritten by the same regex pass against
 * idMap. Substrings whose lowercased form is not in idMap pass through
 * unchanged so the substitution is a strict no-op outside the cross-user path.
 */
function remapObjectIds(obj: unknown, idMap: Map<string, string>, pattern: RegExp): ImportLine['data'] {
  if (typeof obj === 'string') {
    return remapInlineIds(obj, pattern, idMap) as unknown as ImportLine['data']
  }
  if (Array.isArray(obj)) {
    return obj.map(item => remapObjectIds(item, idMap, pattern)) as unknown as ImportLine['data']
  }
  if (obj && typeof obj === 'object') {
    const remapped: ImportLine['data'] = {}
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        remapped[key] = remapInlineIds(value, pattern, idMap)
      } else if (value !== null && typeof value === 'object') {
        remapped[key] = remapObjectIds(value, idMap, pattern)
      } else {
        remapped[key] = value
      }
    }
    return remapped
  }
  return obj as ImportLine['data']
}

/**
 * Remap IDs based on conflict resolutions.
 *
 * @param lines - the import lines
 * @param resolutions - conflict resolutions
 * @returns updated import lines with remapped IDs
 */
export function remapIds(lines: ImportLine[], resolutions: Resolution[]): ImportLine[] {
  // Keys are lowercased so the case-insensitive matcher resolves
  // uppercase or mixed-case exporter-side ids against the same entry;
  // values are stored verbatim.
  const idMap = new Map<string, string>()
  for (const resolution of resolutions) {
    if (resolution.newId && resolution.action === 'create-new') {
      idMap.set(resolution.originalId.toLowerCase(), resolution.newId)
    }
  }

  const pattern = buildRemapPattern(idMap)
  if (pattern === null) {
    return lines
  }

  return lines.map(line => {
    const remappedLine = { ...line }
    remappedLine.data = remapObjectIds(line.data, idMap, pattern)
    return remappedLine
  })
}

/**
 * Detect whether the import contains data from a different user.
 *
 * Priority order:
 *   1. Provenance `metadata` line with `exporterUserId` (definitive,
 *      present on exports from this version onward).
 *   2. Any `persona` line whose `userId` differs from the importer
 *      (legacy fallback for older exports).
 *   3. Any annotation carrying a `userId` that differs (covers exports
 *      containing only object annotations with no persona).
 *
 * Returning `true` forces regeneration of every ID in the batch. When
 * the batch has no persona lines AND no metadata AND no userId-bearing
 * annotations (i.e. a legacy export), we return `false` to preserve
 * the existing same-user re-import UX.
 *
 * @param lines - the import lines
 * @param userId - the importing user's id
 * @returns true when the import originated from a different user
 */
export function isCrossUserImport(lines: ImportLine[], userId: string): boolean {
  for (const line of lines) {
    if (line.type === 'metadata') {
      const exporterUserId = (line.data as { exporterUserId?: unknown }).exporterUserId
      if (typeof exporterUserId === 'string' && exporterUserId.length > 0) {
        return exporterUserId !== userId
      }
    }
  }
  for (const line of lines) {
    if (line.type === 'persona' && typeof line.data.userId === 'string') {
      if (line.data.userId !== userId) return true
    }
  }
  for (const line of lines) {
    if (line.type === 'annotation') {
      const annUserId = (line.data as { userId?: unknown }).userId
      if (typeof annUserId === 'string' && annUserId !== userId) return true
    }
  }
  return false
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
export function generateCrossUserResolutions(lines: ImportLine[], existingResolutions: Resolution[]): Resolution[] {
  // Only treat items with an existing create-new resolution as already resolved.
  // Skip/replace/merge resolutions from non-ID conflicts (e.g. missing-dependency)
  // must not block ID regeneration for cross-user imports.
  const resolvedIds = new Set(
    existingResolutions.filter(r => r.action === 'create-new').map(r => r.originalId)
  )
  const additionalResolutions: Resolution[] = []

  for (const line of lines) {
    const id = line.data.id as string | undefined
    if (!id || resolvedIds.has(id)) continue

    let conflictType: Resolution['conflictType']
    switch (line.type) {
      case 'persona':
        conflictType = 'duplicate-persona'
        break
      case 'annotation':
        conflictType = 'duplicate-sequence'
        break
      case 'entity':
      case 'event':
      case 'time':
      case 'entity_collection':
      case 'entityCollection':
      case 'event_collection':
      case 'eventCollection':
      case 'time_collection':
      case 'timeCollection':
      case 'relation':
        conflictType = 'duplicate-object'
        break
      case 'summary':
        conflictType = 'duplicate-summary'
        break
      case 'claim':
        conflictType = 'duplicate-claim'
        break
      case 'claim_relation':
        conflictType = 'duplicate-claim-relation'
        break
      default:
        continue
    }

    additionalResolutions.push({
      conflictType,
      strategy: 'create-new',
      originalId: id,
      newId: randomUUID(),
      action: 'create-new'
    })
    resolvedIds.add(id)
  }

  return additionalResolutions
}
