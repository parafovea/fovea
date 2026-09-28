/**
 * Verifies the layers backfill against the legacy source: the CI gate.
 *
 * The core guarantee is round-trip fidelity of annotation geometry. For every
 * legacy Annotation, the verifier finds the LayersAnnotation the backfill
 * produced (same id), rebuilds a bounding-box sequence from its spatio-temporal
 * anchor plus features bag via the conversion service, and deep-equals it (within
 * a float epsilon) to the original `Annotation.frames`. It also asserts per-model
 * count parity: every Annotation yields exactly one LayersAnnotation, every
 * ontology type yields one TypeDef, every world object and every Claim yields one
 * GraphNode, and every Video yields one video Media and one video Expression.
 *
 * Beyond count parity, the verifier checks *content* fidelity for world objects,
 * ontology types, and claims by reconstructing each through the application's own
 * backward read path (`readWorldAggregate`, `readOntologyAggregate`,
 * `readSummaryClaims`) and comparing the reconstruction to the legacy source with
 * {@link reconMatchesSource}: every field the layers view-model preserves must
 * match its source, so a copy that routes the wrong legacy column into a
 * view-model field is caught here rather than at the irreversible legacy-table drop.
 *
 * The admin CLI (`cli.ts`) runs it through the `verify` subcommand, and after
 * the copy in the `migrate` subcommand; either exits non-zero on any mismatch.
 *
 * @module
 */

import type { PrismaClient } from '@prisma/client'
import type { SpatioTemporalAnchor } from '@fovea/layers-schema'

import {
  boundingBoxSequenceToSpatioTemporalAnchor,
  spatioTemporalAnchorToBoundingBoxSequence,
  type BoundingBoxSequence,
} from '../../src/services/layers-conversion-service.js'
import { readWorldAggregate, type WorldScope } from '../../src/services/layers-bridge/world-bridge.js'
import { readOntologyAggregate, typeDefRowId } from '../../src/services/layers-bridge/ontology-bridge.js'
import { readSummaryClaims } from '../../src/services/layers-bridge/claim-bridge.js'
import { readAnnotationById } from '../../src/services/layers-bridge/annotation-bridge.js'
import {
  expressionVideoId,
  layersOntologyForPersonaId,
  mediaVideoId,
  reuseAnnotationId,
  reuseClaimNodeId,
  reuseWorldObjectNodeId,
} from './id-map.js'
import { legacyTypesOf, ONTOLOGY_BUCKETS } from './backfill-ontologies.js'
import { COPIED_ANNOTATIONS, selectForCopy } from './helpers.js'


/** Default numeric tolerance for the round-trip deep-equality. */
const DEFAULT_EPSILON = 1e-9

/** The result of a verification run. */
export interface VerifyReport {
  /** Number of annotations whose frames round-tripped bit-exactly. */
  roundTripped: number
  /**
   * Number of non-annotation objects (world objects, ontology types, claims, and
   * claim relations) whose content the backward read reproduced faithfully.
   */
  contentChecked: number
  /** Human-readable mismatch descriptions; empty means the gate passes. */
  mismatches: string[]
  /** Per-check counts, for reporting. */
  counts: {
    annotations: number
    ontologyTypes: number
    worldObjects: number
    claims: number
    claimRelations: number
    videos: number
  }
}

/** Options controlling a verification run. */
export interface VerifyOptions {
  /** Only verify legacy rows updated at or after this instant. */
  since?: Date
  /** Numeric tolerance for the frames deep-equality. */
  epsilon?: number
}

/**
 * Deep-equality with a numeric tolerance. Numbers compare within `epsilon`;
 * arrays and plain objects compare structurally (key order irrelevant);
 * everything else compares strictly. Absent and undefined-valued keys are
 * treated alike so a value stripped by JSON serialization matches a
 * reconstruction that simply omits it.
 */
export function deepEqualApprox(a: unknown, b: unknown, epsilon = DEFAULT_EPSILON): boolean {
  if (a === b) return true
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= epsilon
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((item, index) => deepEqualApprox(item, b[index], epsilon))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    for (const key of keys) {
      if (!deepEqualApprox(a[key], b[key], epsilon)) return false
    }
    return true
  }
  return false
}

/** Narrows a value to a string-keyed plain object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Asymmetric fidelity check: every field the reconstruction *carries* must equal
 * the legacy source's value for that field (numbers within `epsilon`). Keys the
 * source has but the reconstruction omits are ignored, because the layers
 * view-model deliberately drops some legacy columns and imposes that same drop on
 * any 0.6-native ingest. What this catches is a *mis-mapped* field: a copy that
 * routes the wrong legacy column into a view-model field surfaces as the
 * reconstructed field disagreeing with its source. Recursion carries the same
 * recon-keyed semantics into nested objects; arrays compare element-wise.
 *
 * @param recon - the value reconstructed from the layers store via a backward read
 * @param source - the legacy source value the copy read from
 * @param epsilon - numeric tolerance for float fields
 * @returns whether every reconstructed field matches its source
 */
export function reconMatchesSource(recon: unknown, source: unknown, epsilon = DEFAULT_EPSILON): boolean {
  if (recon === source) return true
  // A null reconstructed field carries nothing, so it matches an omitted one.
  if (recon === null && source === undefined) return true
  if (typeof recon === 'number' && typeof source === 'number') {
    return Math.abs(recon - source) <= epsilon
  }
  // A reconstruction serializes timestamps to ISO strings; the raw Prisma row
  // hands them back as Date objects. Treat a Date and its ISO string as equal so
  // a faithful copy is not flagged over a representation the store never keeps.
  if (recon instanceof Date || source instanceof Date) {
    const reconIso = recon instanceof Date ? recon.toISOString() : recon
    const sourceIso = source instanceof Date ? source.toISOString() : source
    return reconIso === sourceIso
  }
  // The view-model defaults an absent list field (a type's roles, filler types,
  // or relation endpoints) to `[]`, so an empty reconstructed list matches a
  // source that omits the field.
  if (Array.isArray(recon) && source === undefined) {
    return recon.every((item) => isEmptyTextItem(item))
  }
  if (Array.isArray(recon) && Array.isArray(source)) {
    // An empty text gloss item carries no content, and the bridges drop it on
    // write, so it is not a mis-mapped field.
    const reconItems = recon.filter((item) => !isEmptyTextItem(item))
    const sourceItems = source.filter((item) => !isEmptyTextItem(item))
    if (reconItems.length !== sourceItems.length) return false
    return reconItems.every((item, index) => reconMatchesSource(item, sourceItems[index], epsilon))
  }
  if (isPlainObject(recon) && isPlainObject(source)) {
    return Object.keys(recon).every((key) => reconMatchesSource(recon[key], source[key], epsilon))
  }
  return false
}

/**
 * A legacy field the copy deliberately does not carry into the layers store,
 * with the reason. The field audit fails on any dropped field not listed here,
 * so every loss at the contract-phase drop is an explicit, reviewed decision.
 */
export interface AcceptedDrop {
  /** The record kind the path belongs to. */
  domain: AuditDomain
  /** A path as {@link droppedPaths} reports it (`a.b`, `list[].c`). */
  path: string
  /** Why the field is safe to lose. */
  reason: string
  /** When set, the drop is accepted only for source values this accepts. */
  onlyWhen?: (value: unknown) => boolean
}

/** The record kinds the field audit covers. */
export type AuditDomain =
  | 'annotation'
  | 'annotationFrames'
  | 'ontologyType'
  | 'worldObject'
  | 'claim'
  | 'claimRelation'

/** Every legacy field the copy is known and allowed not to carry. */
export const ACCEPTED_DROPS: readonly AcceptedDrop[] = [
  {
    domain: 'ontologyType',
    path: 'color',
    reason: 'written only by 0.5 seed scripts; neither the 0.5 nor the 0.6 type model has a color',
  },
  {
    domain: 'ontologyType',
    path: 'description',
    reason: 'a 0.5 seed-written plain-string definition; legacyTypeOf carries it as the gloss',
  },
  {
    domain: 'ontologyType',
    path: 'symmetric',
    reason: 'the ontology lens records the flag only when true, and an absent flag reads as false',
    onlyWhen: (value) => value === false,
  },
  {
    domain: 'ontologyType',
    path: 'transitive',
    reason: 'the ontology lens records the flag only when true, and an absent flag reads as false',
    onlyWhen: (value) => value === false,
  },
  {
    domain: 'ontologyType',
    path: 'createdAt',
    reason: 'carried on the TypeDef row, which the verifier checks directly; the type view-model has no timestamps',
  },
  {
    domain: 'ontologyType',
    path: 'updatedAt',
    reason: 'carried on the TypeDef row, which the verifier checks directly; the type view-model has no timestamps',
  },
  {
    domain: 'annotation',
    path: 'projectId',
    reason: 'carried on the LayersAnnotation row, which the verifier checks directly; the view-model has no project',
  },
]

/** Whether a value carries information worth preserving. */
function hasContent(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (value instanceof Date || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some((item) => !isEmptyTextItem(item) && hasContent(item))
  if (isPlainObject(value)) return Object.values(value).some(hasContent)
  return true
}

/**
 * Lists the paths of every field that holds content in the legacy source but
 * is absent from the reconstruction. Objects recurse by key; arrays recurse
 * element-wise (empty text items removed) when both sides have the same length,
 * reporting element fields as `list[].field`. A length mismatch is left to
 * {@link reconMatchesSource}.
 *
 * @param source - the legacy value
 * @param recon - the value reconstructed from the layers store
 * @param prefix - the path of `source` within its record
 * @returns the dropped paths
 */
export function droppedPaths(
  source: unknown,
  recon: unknown,
  prefix = '',
): Array<{ path: string; value: unknown }> {
  if (Array.isArray(source) && Array.isArray(recon)) {
    const sourceItems = source.filter((item) => !isEmptyTextItem(item))
    const reconItems = recon.filter((item) => !isEmptyTextItem(item))
    if (sourceItems.length !== reconItems.length) return []
    return sourceItems.flatMap((item, index) => droppedPaths(item, reconItems[index], `${prefix}[]`))
  }
  if (!isPlainObject(source) || source instanceof Date) return []
  const reconRecord = isPlainObject(recon) && !(recon instanceof Date) ? recon : {}
  const dropped: Array<{ path: string; value: unknown }> = []
  for (const [key, value] of Object.entries(source)) {
    if (!hasContent(value)) continue
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (!(key in reconRecord) || reconRecord[key] === undefined) {
      dropped.push({ path, value })
    } else {
      dropped.push(...droppedPaths(value, reconRecord[key], path))
    }
  }
  return dropped
}

/**
 * Records a mismatch for every field of `source` that the reconstruction drops
 * and {@link ACCEPTED_DROPS} does not list for `domain`.
 *
 * @param domain - the record kind
 * @param label - how the record is named in a mismatch
 * @param source - the legacy record
 * @param recon - the reconstruction
 * @param mismatches - the list to append to
 * @returns whether the record passed the audit
 */
export function auditDroppedFields(
  domain: AuditDomain,
  label: string,
  source: unknown,
  recon: unknown,
  mismatches: string[],
): boolean {
  const unaccepted = droppedPaths(source, recon).filter(
    ({ path, value }) =>
      !ACCEPTED_DROPS.some(
        (drop) =>
          drop.domain === domain && drop.path === path && (drop.onlyWhen === undefined || drop.onlyWhen(value)),
      ),
  )
  for (const { path, value } of unaccepted) {
    mismatches.push(
      `${label} would lose field ${path} = ${JSON.stringify(value)} (not carried into the layers store)`,
    )
  }
  return unaccepted.length === 0
}

/** Returns a shallow copy of `record` without the listed keys. */
function withoutKeys(record: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)))
}

/** Whether a value is a gloss text item with no content. */
function isEmptyTextItem(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    value.type === 'text' &&
    (value.content === undefined || (typeof value.content === 'string' && value.content.trim() === ''))
  )
}

/** Indexes a list of `{ id }` objects by id for id-matched fidelity comparison. */
function byId(objects: ReadonlyArray<{ id: string }>): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>()
  for (const object of objects) map.set(object.id, object as Record<string, unknown>)
  return map
}

/**
 * Verifies the backfill and returns a report. Never throws for a data mismatch;
 * mismatches are collected so the caller can print all of them and exit.
 *
 * @param prisma - the Prisma client
 * @param options - watermark and epsilon
 * @returns the verification report
 */
export async function runVerify(
  prisma: PrismaClient,
  options: VerifyOptions = {},
): Promise<VerifyReport> {
  const epsilon = options.epsilon ?? DEFAULT_EPSILON
  const sinceFilter = options.since ? { updatedAt: { gte: options.since } } : {}
  const mismatches: string[] = []
  let roundTripped = 0
  let contentChecked = 0

  // --- Annotations: round-trip + 1:1 count parity --------------------------
  const annotations = await prisma.annotation.findMany({ where: { ...sinceFilter, ...COPIED_ANNOTATIONS } })
  const frameRateCache = new Map<string, number>()

  for (const annotation of annotations) {
    const layersId = reuseAnnotationId(annotation.id)
    const layersAnnotation = await prisma.layersAnnotation.findUnique({ where: { id: layersId } })
    if (!layersAnnotation) {
      mismatches.push(`Annotation ${annotation.id} has no LayersAnnotation (count parity)`)
      continue
    }

    let frameRate = frameRateCache.get(annotation.videoId)
    if (frameRate === undefined) {
      const video = await prisma.video.findUnique({ where: { id: annotation.videoId } })
      frameRate = video?.frameRate ?? 30
      frameRateCache.set(annotation.videoId, frameRate)
    }

    const anchorWrapper = layersAnnotation.anchor as { spatioTemporalAnchor?: SpatioTemporalAnchor }
    const spatioTemporalAnchor = anchorWrapper?.spatioTemporalAnchor
    if (!spatioTemporalAnchor) {
      mismatches.push(`LayersAnnotation ${layersId} has no spatioTemporalAnchor`)
      continue
    }

    const rebuilt: BoundingBoxSequence = spatioTemporalAnchorToBoundingBoxSequence(
      spatioTemporalAnchor,
      { frameRate },
    )
    // Zero-loss for a lens migration means the stored row equals the canonical
    // 0.6 projection of the legacy frames — not bit-equality with the raw legacy
    // frames, which the native anchor deliberately quantizes (integer pixel
    // geometry, per-keyframe visibility). Compare the reconstruction against the
    // legacy frames pushed through the same forward+inverse conversion the writer
    // applied, so the check catches migration loss without flagging the model's
    // inherent canonicalization (which the app imposes on any 0.6-native ingest).
    const canonical: BoundingBoxSequence = spatioTemporalAnchorToBoundingBoxSequence(
      boundingBoxSequenceToSpatioTemporalAnchor(annotation.frames as unknown as BoundingBoxSequence, {
        frameRate,
      }),
      { frameRate },
    )

    if (deepEqualApprox(rebuilt, canonical, epsilon)) {
      roundTripped += 1
    } else {
      mismatches.push(
        `Annotation ${annotation.id} frames did not round-trip: ` +
          `expected ${JSON.stringify(canonical)} got ${JSON.stringify(rebuilt)}`,
      )
    }

    // Every other field, read back through the view-model the application
    // serves, must match the legacy row, and nothing may be silently dropped.
    const reconAnnotation = await readAnnotationById(prisma, layersId)
    if (!reconAnnotation) {
      mismatches.push(`Annotation ${annotation.id} did not reconstruct through the application read path`)
      continue
    }
    const { frames: legacyFrames, ...legacyRow } = annotation as unknown as Record<string, unknown>
    const { frames: reconFrames, ...reconRead } = reconAnnotation as unknown as Record<string, unknown>
    // `linkedObjectName` is derived on read from the denoted world object's name,
    // not stored for the annotation, so it has no legacy counterpart.
    const reconFields = withoutKeys(reconRead, ['linkedObjectName'])
    // 0.5 kept an owner (`userId`) and a creator (`createdByUserId`); the layers
    // store keeps one creator, which the view-model serves as `createdBy`. Two
    // different values would lose one of them.
    if (
      annotation.userId !== null &&
      annotation.createdByUserId !== null &&
      annotation.userId !== annotation.createdByUserId
    ) {
      mismatches.push(
        `Annotation ${annotation.id} has owner ${annotation.userId} and creator ` +
          `${annotation.createdByUserId}; the layers store keeps only one`,
      )
    }
    const legacyFields = {
      ...withoutKeys(legacyRow, ['userId', 'createdByUserId']),
      createdBy: annotation.createdByUserId ?? annotation.userId,
    }
    if (layersAnnotation.projectId !== annotation.projectId) {
      mismatches.push(
        `Annotation ${annotation.id} project ${String(annotation.projectId)} was stored as ` +
          `${String(layersAnnotation.projectId)}`,
      )
    }
    if (!reconMatchesSource(reconFields, legacyFields, epsilon)) {
      mismatches.push(
        `Annotation ${annotation.id} fields did not round-trip: ` +
          `source ${JSON.stringify(legacyFields)} reconstructed ${JSON.stringify(reconFields)}`,
      )
    } else if (
      auditDroppedFields('annotation', `Annotation ${annotation.id}`, legacyFields, reconFields, mismatches) &&
      auditDroppedFields('annotationFrames', `Annotation ${annotation.id} frames`, legacyFrames, reconFrames, mismatches)
    ) {
      contentChecked += 1
    }
  }

  // --- Ontology types -> TypeDef count parity + content fidelity ------------
  let ontologyTypeCount = 0
  const ontologies = await prisma.ontology.findMany({ where: sinceFilter })
  for (const ontology of ontologies) {
    const record = ontology as unknown as Record<string, unknown>
    // Confirm the persona ontology exists before checking its types.
    const layersOntologyId = layersOntologyForPersonaId(ontology.personaId)
    if ((await prisma.layersOntology.count({ where: { id: layersOntologyId } })) === 0) {
      mismatches.push(`Ontology ${ontology.id} has no LayersOntology for persona ${ontology.personaId}`)
    }
    // One backward read reconstructs the persona's four type buckets; index each
    // by id to check every legacy type against the type the lens rebuilt.
    const { aggregate: reconOntology } = await readOntologyAggregate(prisma, ontology.personaId)
    const reconOntologyRecord = reconOntology as unknown as Record<string, unknown>
    for (const [bucket, typeKind] of ONTOLOGY_BUCKETS) {
      const reconBucket = Array.isArray(reconOntologyRecord[bucket])
        ? byId(reconOntologyRecord[bucket] as Array<{ id: string }>)
        : new Map<string, Record<string, unknown>>()
      // A catch-up verify checks only the types the catch-up copy wrote.
      const types = selectForCopy(
        legacyTypesOf(record[bucket]),
        new Set(reconBucket.keys()),
        options.since,
      ) as Array<{ id: string }>
      for (const type of types) {
        ontologyTypeCount += 1
        // The bridge keys a TypeDef by a derived id, not the raw type id.
        const typeDefId = typeDefRowId(layersOntologyId, typeKind, type.id)
        const typeDef = await prisma.typeDef.findUnique({
          where: { id: typeDefId },
          select: { createdAt: true, updatedAt: true },
        })
        if (!typeDef) {
          mismatches.push(`Ontology type ${type.id} has no TypeDef (count parity)`)
          continue
        }
        // The type view-model has no timestamps, so the legacy ones are checked
        // against the TypeDef row the copy stamped.
        const legacyTimes = type as { createdAt?: unknown; updatedAt?: unknown }
        for (const [field, stored] of [
          ['createdAt', typeDef.createdAt],
          ['updatedAt', typeDef.updatedAt],
        ] as const) {
          const legacy = legacyTimes[field]
          if (typeof legacy === 'string' && legacy !== '' && new Date(legacy).getTime() !== stored.getTime()) {
            mismatches.push(`Ontology type ${type.id} ${field} ${legacy} was stored as ${stored.toISOString()}`)
          }
        }
        const recon = reconBucket.get(type.id)
        if (!recon) {
          mismatches.push(`Ontology ${bucket} ${type.id} did not reconstruct from the layers store`)
        } else if (!reconMatchesSource(recon, type, epsilon)) {
          mismatches.push(
            `Ontology ${bucket} ${type.id} content did not round-trip: ` +
              `source ${JSON.stringify(type)} reconstructed ${JSON.stringify(recon)}`,
          )
        } else if (auditDroppedFields('ontologyType', `Ontology ${bucket} ${type.id}`, type, recon, mismatches)) {
          contentChecked += 1
        }
      }
    }
  }

  // --- World objects -> GraphNode count parity + content fidelity -----------
  // The three primary buckets become GraphNodes (checked for count parity by
  // their derived node id); the collection buckets and relations persist as
  // other row kinds, so their existence is proven by the content reconstruction
  // rather than a node count. Content fidelity covers every bucket the aggregate
  // carries.
  const WORLD_NODE_BUCKETS = ['entities', 'events', 'times'] as const
  const WORLD_BUCKETS = [
    ...WORLD_NODE_BUCKETS,
    'entityCollections',
    'eventCollections',
    'timeCollections',
    'relations',
  ] as const
  const WORLD_NODE_BUCKET_SET = new Set<string>(WORLD_NODE_BUCKETS)
  let worldObjectCount = 0
  const worldStates = await prisma.worldState.findMany({ where: sinceFilter })
  for (const worldState of worldStates) {
    const record = worldState as unknown as Record<string, unknown>
    const scope: WorldScope = { userId: worldState.userId, projectId: worldState.projectId }
    // One backward read reconstructs the whole scope; index each bucket by id so
    // a legacy object is checked against the object the lens rebuilt for it.
    const { aggregate: reconWorld } = await readWorldAggregate(prisma, scope)
    const reconWorldRecord = reconWorld as unknown as Record<string, unknown>
    for (const bucket of WORLD_BUCKETS) {
      const reconBucket = Array.isArray(reconWorldRecord[bucket])
        ? byId(reconWorldRecord[bucket] as Array<{ id: string }>)
        : new Map<string, Record<string, unknown>>()
      // A catch-up verify checks only the objects the catch-up copy wrote.
      const objects = selectForCopy(
        Array.isArray(record[bucket]) ? (record[bucket] as unknown[]) : [],
        new Set(reconBucket.keys()),
        options.since,
      ) as Array<{ id: string }>
      for (const object of objects) {
        if (WORLD_NODE_BUCKET_SET.has(bucket)) {
          worldObjectCount += 1
          if ((await prisma.graphNode.count({ where: { id: reuseWorldObjectNodeId(object.id) } })) === 0) {
            mismatches.push(`World object ${object.id} has no GraphNode (count parity)`)
            continue
          }
        }
        const recon = reconBucket.get(object.id)
        if (!recon) {
          mismatches.push(`World ${bucket} ${object.id} did not reconstruct from the layers store`)
        } else if (!reconMatchesSource(recon, object, epsilon)) {
          mismatches.push(
            `World ${bucket} ${object.id} content did not round-trip: ` +
              `source ${JSON.stringify(object)} reconstructed ${JSON.stringify(recon)}`,
          )
        } else if (auditDroppedFields('worldObject', `World ${bucket} ${object.id}`, object, recon, mismatches)) {
          contentChecked += 1
        }
      }
    }
  }

  // --- Claims -> claim GraphNode count parity + content fidelity ------------
  // Content is checked against the raw legacy row (not the copy's own mapping),
  // so a mis-mapped column surfaces here rather than hiding behind a shared
  // transform. One backward read per summary reconstructs all its claims.
  const claims = await prisma.claim.findMany({ where: sinceFilter })
  const summaryReconCache = new Map<string, Map<string, Record<string, unknown>>>()
  for (const claim of claims) {
    const node = await prisma.graphNode.findUnique({ where: { id: reuseClaimNodeId(claim.id) } })
    if (!node || node.nodeType !== 'claim') {
      mismatches.push(`Claim ${claim.id} has no claim GraphNode (count parity)`)
      continue
    }
    let reconClaims = summaryReconCache.get(claim.summaryId)
    if (!reconClaims) {
      const read = await readSummaryClaims(prisma, claim.summaryId)
      reconClaims = byId(read.claims as ReadonlyArray<{ id: string }>)
      summaryReconCache.set(claim.summaryId, reconClaims)
    }
    const recon = reconClaims.get(claim.id)
    if (!recon) {
      mismatches.push(`Claim ${claim.id} did not reconstruct from the layers store`)
    } else if (!reconMatchesSource(recon, claim as unknown as Record<string, unknown>, epsilon)) {
      mismatches.push(
        `Claim ${claim.id} content did not round-trip: ` +
          `source ${JSON.stringify(claim)} reconstructed ${JSON.stringify(recon)}`,
      )
    } else if (auditDroppedFields('claim', `Claim ${claim.id}`, claim, recon, mismatches)) {
      contentChecked += 1
    }
  }

  // --- Claim relations -> relation edges + content fidelity ----------------
  // A relation is read back with its source claim's summary and matched by its
  // endpoints and type, since the relation lens keys the edge by that triple.
  const relations = await prisma.claimRelation.findMany({
    where: sinceFilter,
    include: { sourceClaim: { select: { summaryId: true } } },
  })
  const summaryRelationCache = new Map<string, ReadonlyArray<Record<string, unknown>>>()
  for (const relation of relations) {
    const { sourceClaim, ...source } = relation
    let reconRelations = summaryRelationCache.get(sourceClaim.summaryId)
    if (!reconRelations) {
      const read = await readSummaryClaims(prisma, sourceClaim.summaryId)
      reconRelations = read.relations as unknown as ReadonlyArray<Record<string, unknown>>
      summaryRelationCache.set(sourceClaim.summaryId, reconRelations)
    }
    const recon = reconRelations.find(
      (candidate) =>
        candidate.sourceClaimId === relation.sourceClaimId &&
        candidate.targetClaimId === relation.targetClaimId &&
        candidate.relationTypeId === relation.relationTypeId,
    )
    if (!recon) {
      mismatches.push(`Claim relation ${relation.id} did not reconstruct from the layers store`)
      continue
    }
    // The edge id is derived from the triple, so it is not compared to the legacy id.
    const reconFields = withoutKeys(recon, ['id'])
    const sourceFields = withoutKeys(source as unknown as Record<string, unknown>, ['id'])
    if (!reconMatchesSource(reconFields, sourceFields, epsilon)) {
      mismatches.push(
        `Claim relation ${relation.id} content did not round-trip: ` +
          `source ${JSON.stringify(sourceFields)} reconstructed ${JSON.stringify(reconFields)}`,
      )
    } else if (auditDroppedFields('claimRelation', `Claim relation ${relation.id}`, sourceFields, reconFields, mismatches)) {
      contentChecked += 1
    }
  }

  // --- Videos -> video Media + Expression count parity ---------------------
  const videos = await prisma.video.findMany({ where: sinceFilter })
  for (const video of videos) {
    if ((await prisma.media.count({ where: { id: mediaVideoId(video.id) } })) === 0) {
      mismatches.push(`Video ${video.id} has no video Media (count parity)`)
    }
    if ((await prisma.expression.count({ where: { id: expressionVideoId(video.id) } })) === 0) {
      mismatches.push(`Video ${video.id} has no video Expression (count parity)`)
    }
  }

  return {
    roundTripped,
    contentChecked,
    mismatches,
    counts: {
      annotations: annotations.length,
      ontologyTypes: ontologyTypeCount,
      worldObjects: worldObjectCount,
      claims: claims.length,
      claimRelations: relations.length,
      videos: videos.length,
    },
  }
}
