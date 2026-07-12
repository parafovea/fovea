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
  spatioTemporalAnchorToBoundingBoxSequence,
  type BoundingBoxSequence,
} from '../../src/services/layers-conversion-service.js'
import {
  expressionVideoId,
  layersOntologyForPersonaId,
  mediaVideoId,
  reuseAnnotationId,
  reuseClaimNodeId,
  reuseTypeId,
  reuseWorldObjectNodeId,
} from './id-map.js'

/** Default numeric tolerance for the round-trip deep-equality. */
const DEFAULT_EPSILON = 1e-9

/** The result of a verification run. */
export interface VerifyReport {
  /** Number of annotations whose frames round-tripped bit-exactly. */
  roundTripped: number
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

    const features = (layersAnnotation.features ?? undefined) as Record<string, unknown> | undefined
    const rebuilt: BoundingBoxSequence = spatioTemporalAnchorToBoundingBoxSequence(
      spatioTemporalAnchor,
      features,
      { frameRate },
    )
    const original = annotation.frames as unknown

    if (deepEqualApprox(rebuilt, original, epsilon)) {
      roundTripped += 1
    } else {
      mismatches.push(
        `Annotation ${annotation.id} frames did not round-trip: ` +
          `expected ${JSON.stringify(original)} got ${JSON.stringify(rebuilt)}`,
      )
    }
  }

  // --- Ontology types -> TypeDef count parity ------------------------------
  let ontologyTypeCount = 0
  const ontologies = await prisma.ontology.findMany({ where: sinceFilter })
  for (const ontology of ontologies) {
    const buckets = [
      ontology.entityTypes,
      ontology.eventTypes,
      ontology.roleTypes,
      ontology.relationTypes,
    ]
    // Confirm the persona ontology exists before checking its types.
    const layersOntologyId = layersOntologyForPersonaId(ontology.personaId)
    if ((await prisma.layersOntology.count({ where: { id: layersOntologyId } })) === 0) {
      mismatches.push(`Ontology ${ontology.id} has no LayersOntology for persona ${ontology.personaId}`)
    }
    for (const bucket of buckets) {
      const types = Array.isArray(bucket) ? (bucket as Array<{ id: string }>) : []
      for (const type of types) {
        ontologyTypeCount += 1
        if ((await prisma.typeDef.count({ where: { id: reuseTypeId(type.id) } })) === 0) {
          mismatches.push(`Ontology type ${type.id} has no TypeDef (count parity)`)
        }
      }
    }
  }

  // --- World objects -> GraphNode count parity -----------------------------
  let worldObjectCount = 0
  const worldStates = await prisma.worldState.findMany({ where: sinceFilter })
  for (const worldState of worldStates) {
    const record = worldState as unknown as Record<string, unknown>
    for (const bucket of ['entities', 'events', 'times', 'locations']) {
      const objects = Array.isArray(record[bucket]) ? (record[bucket] as Array<{ id: string }>) : []
      for (const object of objects) {
        worldObjectCount += 1
        if ((await prisma.graphNode.count({ where: { id: reuseWorldObjectNodeId(object.id) } })) === 0) {
          mismatches.push(`World object ${object.id} has no GraphNode (count parity)`)
        }
      }
    }
  }

  // --- Claims -> claim GraphNode count parity ------------------------------
  const claims = await prisma.claim.findMany({ where: sinceFilter })
  for (const claim of claims) {
    const node = await prisma.graphNode.findUnique({ where: { id: reuseClaimNodeId(claim.id) } })
    if (!node || node.nodeType !== 'claim') {
      mismatches.push(`Claim ${claim.id} has no claim GraphNode (count parity)`)
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
