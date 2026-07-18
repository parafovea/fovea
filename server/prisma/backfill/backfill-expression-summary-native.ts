/**
 * One-shot backfill from the legacy expression/summary/transcript off-shape
 * columns to the native layers representation.
 *
 * Three legacy shapes are corrected so the native rows become authoritative:
 *
 *   - a pasted document folded its title (and any caller metadata) into the
 *     `Expression.metadata` annotationMetadata column under an out-of-schema
 *     `title` key; the title and caller metadata move to the open
 *     `Expression.features` map and the provenance column is cleared;
 *   - a video's source `Media.metadata` held the arbitrary source-video metadata
 *     the provenance column has no shape for; it moves to `Media.features`;
 *   - a materialized ASR transcript dropped its per-segment confidence, speaker,
 *     and sentiment; these are rebuilt as token-aligned annotation layers over
 *     the transcript's canonical tokenization, read from the source summary's
 *     `transcriptJson` segments (one segment per token, in order).
 *
 * Confidence is quantized once to the 0-1000 integer scale — the canonical native
 * precision — so the migration is not bit-exact by design.
 *
 * Idempotent: a document/media row whose provenance column is already empty is
 * skipped, and a transcript that already carries a confidence/speaker/sentiment
 * layer is not re-layered.
 *
 * Run (against a configured DATABASE_URL) with tsx, e.g.
 * `tsx prisma/backfill/backfill-expression-summary-native.ts`. This script is not
 * wired into `prisma migrate`; run it once after deploying the re-model.
 *
 * @module
 */

import { PrismaClient, Prisma } from '@prisma/client'

import { to1000 } from '../../src/services/layers-conversion-service.js'

/** A transcript segment as stored in `VideoSummary.transcriptJson.segments`. */
interface TranscriptSegment {
  start: number
  end: number
  text: string
  speaker?: string
  confidence?: number
  sentiment?: string
}

/** Narrows a JSON value to a plain (non-array) object, else null. */
function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) }
  }
  return null
}

/** Reads the ordered transcript segments from a summary's transcriptJson. */
function segmentsOf(value: Prisma.JsonValue | null): TranscriptSegment[] {
  const record = asRecord(value)
  const segments = record?.segments
  return Array.isArray(segments) ? (segments as TranscriptSegment[]) : []
}

/** Moves a document expression's title + caller metadata to `features`. */
async function backfillDocumentTitles(prisma: PrismaClient): Promise<number> {
  const documents = await prisma.expression.findMany({
    where: { sourceKind: 'document' },
    select: { id: true, metadata: true, features: true },
  })

  let migrated = 0
  for (const doc of documents) {
    const legacy = asRecord(doc.metadata)
    if (legacy === null || Object.keys(legacy).length === 0) continue

    const features = asRecord(doc.features) ?? {}
    Object.assign(features, legacy)

    await prisma.expression.update({
      where: { id: doc.id },
      data: { features: features as Prisma.InputJsonValue, metadata: Prisma.JsonNull },
    })
    migrated += 1
  }
  return migrated
}

/** Moves a video Media's source metadata to `features`. */
async function backfillVideoMediaMetadata(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.media.findMany({
    where: { kind: 'video' },
    select: { id: true, metadata: true, features: true },
  })

  let migrated = 0
  for (const row of rows) {
    const legacy = asRecord(row.metadata)
    if (legacy === null || Object.keys(legacy).length === 0) continue

    const features = asRecord(row.features) ?? {}
    Object.assign(features, legacy)

    await prisma.media.update({
      where: { id: row.id },
      data: { features: features as Prisma.InputJsonValue, metadata: Prisma.JsonNull },
    })
    migrated += 1
  }
  return migrated
}

/** Rebuilds the token-aligned confidence/speaker/sentiment layers of an ASR transcript. */
async function backfillTranscriptSegmentLayers(prisma: PrismaClient): Promise<number> {
  const transcripts = await prisma.expression.findMany({
    where: { sourceKind: 'asr-transcript', NOT: { videoSummaryId: null } },
    select: {
      id: true,
      createdByUserId: true,
      projectId: true,
      videoSummaryId: true,
      annotationLayers: { select: { subkind: true } },
      segmentations: { include: { tokenizations: true } },
    },
  })

  let migrated = 0
  for (const transcript of transcripts) {
    const tokenization = transcript.segmentations
      .flatMap((segmentation) => segmentation.tokenizations)
      .find((token) => token.isCanonical)
    if (!tokenization || transcript.videoSummaryId === null) continue

    const summary = await prisma.videoSummary.findUnique({
      where: { id: transcript.videoSummaryId },
      select: { transcriptJson: true },
    })
    const segments = segmentsOf(summary?.transcriptJson ?? null)
    if (segments.length === 0) continue

    const existing = new Set(
      transcript.annotationLayers.map((layer) => layer.subkind).filter((s): s is string => s !== null)
    )

    const specs: Array<{
      subkind: string
      kind: string
      annotations: Array<{ tokenIndex: number; label?: string; confidence?: number }>
    }> = []

    const confidence = segments
      .map((segment, tokenIndex) => ({ tokenIndex, value: to1000(segment.confidence) }))
      .filter((entry): entry is { tokenIndex: number; value: number } => entry.value !== undefined)
    if (confidence.length > 0 && !existing.has('confidence')) {
      specs.push({
        kind: 'token-tag',
        subkind: 'confidence',
        annotations: confidence.map((entry) => ({
          tokenIndex: entry.tokenIndex,
          confidence: entry.value,
        })),
      })
    }

    const speakers = segments
      .map((segment, tokenIndex) => ({ tokenIndex, value: segment.speaker }))
      .filter((entry): entry is { tokenIndex: number; value: string } => entry.value !== undefined)
    if (speakers.length > 0 && !existing.has('speaker')) {
      specs.push({
        kind: 'tier',
        subkind: 'speaker',
        annotations: speakers.map((entry) => ({ tokenIndex: entry.tokenIndex, label: entry.value })),
      })
    }

    const sentiments = segments
      .map((segment, tokenIndex) => ({ tokenIndex, value: segment.sentiment }))
      .filter((entry): entry is { tokenIndex: number; value: string } => entry.value !== undefined)
    if (sentiments.length > 0 && !existing.has('sentiment')) {
      specs.push({
        kind: 'token-tag',
        subkind: 'sentiment',
        annotations: sentiments.map((entry) => ({ tokenIndex: entry.tokenIndex, label: entry.value })),
      })
    }

    for (const spec of specs) {
      const layer = await prisma.annotationLayer.create({
        data: {
          expressionId: transcript.id,
          kind: spec.kind,
          subkind: spec.subkind,
          tokenizationId: tokenization.id,
          sourceMethod: 'automatic',
          createdByUserId: transcript.createdByUserId,
          projectId: transcript.projectId,
        },
        select: { id: true },
      })
      await prisma.layersAnnotation.createMany({
        data: spec.annotations.map((annotation) => ({
          layerId: layer.id,
          tokenizationId: tokenization.id,
          tokenIndex: annotation.tokenIndex,
          label: annotation.label ?? null,
          confidence: annotation.confidence ?? null,
          createdByUserId: transcript.createdByUserId,
          projectId: transcript.projectId,
        })),
      })
      migrated += 1
    }
  }
  return migrated
}

async function main(): Promise<void> {
  const prisma = new PrismaClient()
  try {
    const documents = await backfillDocumentTitles(prisma)
    const media = await backfillVideoMediaMetadata(prisma)
    const layers = await backfillTranscriptSegmentLayers(prisma)
    // eslint-disable-next-line no-console
    console.log(
      `backfill complete: ${documents} document(s), ${media} media row(s), ${layers} transcript layer(s) migrated`
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exit(1)
})
