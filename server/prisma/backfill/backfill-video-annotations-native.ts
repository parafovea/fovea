/**
 * One-shot backfill from the legacy video-annotation sidecar to the native
 * layers representation.
 *
 * Before the native re-model, a video annotation's bounding-box sequence was
 * projected onto a `spatioTemporalAnchor` whose exact source values were stashed
 * verbatim under `fovea.*` keys — per-keyframe `fovea.frameNumber` / `fovea.x` /
 * `fovea.y` / `fovea.width` / `fovea.height` / `fovea.confidence` (exact floats),
 * `fovea.isKeyframe`, `fovea.metadata`, and sequence-level
 * `fovea.interpolationSegments` / `fovea.visibilityRanges` / `fovea.trackId` /
 * `fovea.trackingSource` / `fovea.trackingConfidence` / frame counts — plus a
 * `fovea.annotation` object holding the legacy `type` / `linkType` / `source` /
 * exact `confidence`. This script reconstructs the legacy annotation from that
 * sidecar and reprojects it through the current mapper so the native rows become
 * authoritative:
 *
 *   - the keyframe's integer `bbox` is the canonical geometry and its `timeMs`
 *     the canonical time; per-box confidence, visibility, interpolation mode, and
 *     metadata ride in `keyframe.features`, and the frame number / frame counts
 *     derive on read;
 *   - `type` derives from the layer persona, `linkType` from the denoted node's
 *     `nodeType` (the node is get-or-created so the link is never null),
 *     `confidence` is the native 0-1000 column, and only `source` plus the
 *     tracker identity ride as flat scalar features.
 *
 * The `fovea.annotation` object and every per-keyframe / sequence-level `fovea.*`
 * key are dropped, so the row carries no sidecar. Confidence is quantized once to
 * the 0-1000 integer scale and geometry to integer pixels — the canonical native
 * precision — so the migration is not bit-exact by design.
 *
 * Idempotent: a re-run skips a row that no longer carries the `fovea.annotation`
 * object (an already-migrated or natively-authored row).
 *
 * Run (against a configured DATABASE_URL) with tsx, e.g.
 * `tsx prisma/backfill/backfill-video-annotations-native.ts`. This script is not
 * wired into `prisma migrate`; run it once after deploying the re-model.
 *
 * @module
 */

import { PrismaClient } from '@prisma/client'

import {
  annotationToLayers,
  type VideoAnnotationInput,
  type VideoAnnotationLinkType,
} from '../../src/services/video-annotation-mapper.js'
import { from1000, type BoundingBoxSequence } from '../../src/services/layers-conversion-service.js'

/** The legacy `fovea.annotation` meta object stashed in the features bag. */
const FOVEA_ANNOTATION_KEY = 'fovea.annotation'
/** The default frame rate when a video carries none. */
const DEFAULT_FRAME_RATE = 30

/** The legacy per-keyframe / sequence-level `fovea.*` keys, kept for reconstruction. */
const LEGACY = {
  frameNumber: 'fovea.frameNumber',
  x: 'fovea.x',
  y: 'fovea.y',
  width: 'fovea.width',
  height: 'fovea.height',
  confidence: 'fovea.confidence',
  isKeyframe: 'fovea.isKeyframe',
  metadata: 'fovea.metadata',
  interpolationSegments: 'fovea.interpolationSegments',
  visibilityRanges: 'fovea.visibilityRanges',
  trackId: 'fovea.trackId',
  trackingSource: 'fovea.trackingSource',
  trackingConfidence: 'fovea.trackingConfidence',
  totalFrames: 'fovea.totalFrames',
  keyframeCount: 'fovea.keyframeCount',
  interpolatedFrameCount: 'fovea.interpolatedFrameCount',
} as const

/** Reads a keyframe's feature entries into a lookup. */
function keyframeFeatures(features: unknown): Map<string, string> {
  const index = new Map<string, string>()
  const entries = (features as { entries?: Array<{ key: string; value: string }> } | undefined)
    ?.entries
  if (entries) for (const entry of entries) index.set(entry.key, entry.value)
  return index
}

/** Reconstructs the exact legacy sequence from a row's OLD sidecar anchor + features. */
function legacySequence(
  anchor: { keyframes?: Array<{ bbox: { x: number; y: number; width: number; height: number }; timeMs: number; features?: unknown }> },
  bag: Record<string, unknown>,
  frameRate: number,
): BoundingBoxSequence {
  const keyframes = anchor.keyframes ?? []
  const boxes = keyframes.map((kf) => {
    const feat = keyframeFeatures(kf.features)
    const frameNumber = feat.has(LEGACY.frameNumber)
      ? Number(feat.get(LEGACY.frameNumber))
      : Math.round((kf.timeMs / 1000) * frameRate)
    const box: BoundingBoxSequence['boxes'][number] = {
      x: feat.has(LEGACY.x) ? Number(feat.get(LEGACY.x)) : kf.bbox.x,
      y: feat.has(LEGACY.y) ? Number(feat.get(LEGACY.y)) : kf.bbox.y,
      width: feat.has(LEGACY.width) ? Number(feat.get(LEGACY.width)) : kf.bbox.width,
      height: feat.has(LEGACY.height) ? Number(feat.get(LEGACY.height)) : kf.bbox.height,
      frameNumber,
    }
    if (feat.has(LEGACY.confidence)) box.confidence = Number(feat.get(LEGACY.confidence))
    else if (feat.has('confidence')) box.confidence = from1000(Number(feat.get('confidence')))
    if (feat.has(LEGACY.isKeyframe)) box.isKeyframe = feat.get(LEGACY.isKeyframe) === 'true'
    if (feat.has(LEGACY.metadata)) {
      box.metadata = JSON.parse(feat.get(LEGACY.metadata) as string) as Record<string, unknown>
    }
    return box
  })

  const totalFrames =
    (bag[LEGACY.totalFrames] as number | undefined) ??
    (boxes.length > 0 ? boxes[boxes.length - 1].frameNumber - boxes[0].frameNumber + 1 : 0)
  const keyframeCount = (bag[LEGACY.keyframeCount] as number | undefined) ?? boxes.length
  const interpolatedFrameCount =
    (bag[LEGACY.interpolatedFrameCount] as number | undefined) ??
    Math.max(0, totalFrames - keyframeCount)

  const seq: BoundingBoxSequence = {
    boxes,
    interpolationSegments:
      (bag[LEGACY.interpolationSegments] as BoundingBoxSequence['interpolationSegments'] | undefined) ??
      [],
    visibilityRanges:
      (bag[LEGACY.visibilityRanges] as BoundingBoxSequence['visibilityRanges'] | undefined) ?? [],
    totalFrames,
    keyframeCount,
    interpolatedFrameCount,
  }
  if (bag[LEGACY.trackId] !== undefined) seq.trackId = bag[LEGACY.trackId] as string | number
  if (bag[LEGACY.trackingSource] !== undefined) {
    seq.trackingSource = bag[LEGACY.trackingSource] as BoundingBoxSequence['trackingSource']
  }
  if (bag[LEGACY.trackingConfidence] !== undefined) {
    seq.trackingConfidence = bag[LEGACY.trackingConfidence] as number
  }
  return seq
}

/** The legacy `fovea.annotation` meta object shape. */
interface LegacyMeta {
  type?: string
  linkType?: VideoAnnotationLinkType | null
  source?: string
  confidence?: number | null
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  let migrated = 0
  let skipped = 0
  try {
    const rows = await prisma.layersAnnotation.findMany({
      where: { layer: { subkind: { in: ['ontology-type', 'world-object'] } } },
      include: { layer: { include: { expression: { include: { video: true } } } } },
    })

    for (const row of rows) {
      const bag = (row.features ?? {}) as Record<string, unknown>
      const meta = bag[FOVEA_ANNOTATION_KEY] as LegacyMeta | undefined
      const anchorWrapper = row.anchor as
        | { spatioTemporalAnchor?: Parameters<typeof legacySequence>[0] }
        | null
      const oldAnchor = anchorWrapper?.spatioTemporalAnchor
      // Skip already-native / natively-authored rows and non-spatio-temporal rows.
      if (!meta || !oldAnchor) {
        skipped++
        continue
      }

      const layer = row.layer
      const video = layer.expression.video
      const videoId = video?.id ?? layer.expression.videoId ?? ''
      const frameRate = video?.frameRate ?? DEFAULT_FRAME_RATE
      const personaId = layer.personaId

      const frames = legacySequence(oldAnchor, bag, frameRate)
      // The legacy `fovea.annotation` meta carried the object-annotation link kind.
      const linkType = personaId ? null : (meta.linkType ?? null)

      const input: VideoAnnotationInput = {
        id: row.id,
        videoId,
        personaId,
        type: meta.type ?? (personaId ? 'type' : 'object'),
        label: row.label ?? '',
        linkType,
        frames,
        confidence:
          typeof meta.confidence === 'number'
            ? meta.confidence
            : row.confidence != null
              ? (from1000(row.confidence) ?? null)
              : null,
        source: meta.source ?? 'manual',
      }

      const mapping = annotationToLayers(input, {
        expressionId: layer.expressionId,
        ontologyId: layer.ontologyId,
        frameRate,
      })

      // Get-or-create the denoted node so the link is never nulled.
      let denotesNodeId: string | null = row.denotesNodeId
      if (mapping.annotation.denotesNode) {
        const node = mapping.annotation.denotesNode
        await prisma.graphNode.upsert({
          where: { id: node.id },
          create: {
            id: node.id,
            nodeType: node.nodeType,
            label: node.label,
            projectId: row.projectId,
            createdByUserId: row.createdByUserId,
          },
          update: {},
        })
        denotesNodeId = node.id
      }

      await prisma.layersAnnotation.update({
        where: { id: row.id },
        data: {
          anchor: JSON.parse(JSON.stringify(mapping.annotation.anchor)),
          confidence: mapping.annotation.confidence,
          ontologyTypeRefId: mapping.annotation.ontologyTypeRefId,
          denotesNodeId,
          features: JSON.parse(JSON.stringify(mapping.annotation.features)),
          startMs: mapping.annotation.startMs,
          endMs: mapping.annotation.endMs,
        },
      })
      migrated++
    }

    console.log(`Video-annotation backfill complete: ${migrated} migrated, ${skipped} skipped.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
