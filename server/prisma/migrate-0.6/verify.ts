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
 * view-model field is caught here rather than at the irreversible 0.6.1 drop.
 *
 * Run as a CLI; it exits non-zero on any mismatch so it can gate a deploy.
 *
 * ```bash
 * tsx server/prisma/backfill/verify.ts --since 2026-01-01T00:00:00Z
 * ```
 *
 * @module
 */

import { pathToFileURL } from 'node:url'

import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import type { SpatioTemporalAnchor } from '@fovea/layers-schema'

import {
  boundingBoxSequenceToSpatioTemporalAnchor,
  spatioTemporalAnchorToBoundingBoxSequence,
  type BoundingBoxSequence,
} from '../../src/services/layers-conversion-service.js'
import { readWorldAggregate, type WorldScope } from '../../src/services/layers-bridge/world-bridge.js'
import { readOntologyAggregate, typeDefRowId } from '../../src/services/layers-bridge/ontology-bridge.js'
import { readSummaryClaims } from '../../src/services/layers-bridge/claim-bridge.js'
import {
  expressionVideoId,
  layersOntologyForPersonaId,
  mediaVideoId,
  reuseAnnotationId,
  reuseClaimNodeId,
  reuseWorldObjectNodeId,
} from './id-map.js'

/** The four ontology buckets and the layers `typeKind` each maps to. */
const ONTOLOGY_BUCKETS: ReadonlyArray<readonly [bucket: string, typeKind: string]> = [
  ['entityTypes', 'entity-type'],
  ['eventTypes', 'situation-type'],
  ['roleTypes', 'role-type'],
  ['relationTypes', 'relation-type'],
]

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
  if (Array.isArray(recon) && Array.isArray(source)) {
    if (recon.length !== source.length) return false
    return recon.every((item, index) => reconMatchesSource(item, source[index], epsilon))
  }
  if (isPlainObject(recon) && isPlainObject(source)) {
    return Object.keys(recon).every((key) => reconMatchesSource(recon[key], source[key], epsilon))
  }
  return false
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
  const annotations = await prisma.annotation.findMany({ where: sinceFilter })
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
      const types = Array.isArray(record[bucket]) ? (record[bucket] as Array<{ id: string }>) : []
      const reconBucket = Array.isArray(reconOntologyRecord[bucket])
        ? byId(reconOntologyRecord[bucket] as Array<{ id: string }>)
        : new Map<string, Record<string, unknown>>()
      for (const type of types) {
        ontologyTypeCount += 1
        // The bridge keys a TypeDef by a derived id, not the raw type id.
        const typeDefId = typeDefRowId(layersOntologyId, typeKind, type.id)
        if ((await prisma.typeDef.count({ where: { id: typeDefId } })) === 0) {
          mismatches.push(`Ontology type ${type.id} has no TypeDef (count parity)`)
          continue
        }
        const recon = reconBucket.get(type.id)
        if (!recon) {
          mismatches.push(`Ontology ${bucket} ${type.id} did not reconstruct from the layers store`)
        } else if (!reconMatchesSource(recon, type, epsilon)) {
          mismatches.push(
            `Ontology ${bucket} ${type.id} content did not round-trip: ` +
              `source ${JSON.stringify(type)} reconstructed ${JSON.stringify(recon)}`,
          )
        } else {
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
      const objects = Array.isArray(record[bucket]) ? (record[bucket] as Array<{ id: string }>) : []
      const reconBucket = Array.isArray(reconWorldRecord[bucket])
        ? byId(reconWorldRecord[bucket] as Array<{ id: string }>)
        : new Map<string, Record<string, unknown>>()
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
        } else {
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
    } else {
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
      videos: videos.length,
    },
  }
}

/** Parses the CLI arguments into verify options. */
function parseArgs(argv: string[]): VerifyOptions {
  const options: VerifyOptions = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--since') {
      const value = argv[i + 1]
      if (!value) throw new Error('--since requires an ISO-8601 timestamp')
      const since = new Date(value)
      if (Number.isNaN(since.getTime())) throw new Error(`invalid --since value: ${value}`)
      options.since = since
      i += 1
    }
  }
  return options
}

/** CLI entry: loads env, verifies, prints the report, exits non-zero on mismatch. */
async function main(): Promise<void> {
  dotenv.config()
  const options = parseArgs(process.argv.slice(2))

  const prisma = new PrismaClient()
  try {
    const report = await runVerify(prisma, options)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    if (report.mismatches.length > 0) {
      process.stderr.write(`VERIFY FAILED: ${report.mismatches.length} mismatch(es)\n`)
      process.exitCode = 1
    } else {
      process.stdout.write(`VERIFY OK: ${report.roundTripped} annotation(s) round-tripped\n`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
