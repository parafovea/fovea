/**
 * Backfills a legacy VideoSummary into the layers store.
 *
 * A summary's structured transcript maps to a Media(kind=audio), a transcript
 * Expression, a Segmentation, and a Tokenization holding one temporally-anchored
 * token per ASR segment. Speaker turns become a speaker-tier AnnotationLayer with
 * one temporal-span annotation per segment, and a ClusterSet groups those
 * segments by speaker. The summary's narrative gloss becomes a document-tag
 * AnnotationLayer with a single document-level annotation carrying the gloss text.
 *
 * @module
 */

import { PrismaClient, type VideoSummary } from '@prisma/client'

import { secToMs } from '../../src/services/layers-conversion-service.js'
import {
  expressionTranscriptId,
  mediaAudioId,
  segmentationTranscriptId,
  speakerAnnotationId,
  speakerClusterSetId,
  speakerLayerId,
  summaryGlossAnnotationId,
  summaryGlossLayerId,
  tokenizationTranscriptId,
} from './id-map.js'
import {
  toJson,
  requiredJson,
  glossToText,
  type BackfillToken,
  type LegacyGlossItem,
  type LegacyTranscript,
  type LegacyTranscriptSegment,
  type StepStats,
} from './helpers.js'

/** Reads the structured transcript column, tolerating null/malformed JSON. */
function readTranscript(value: unknown): LegacyTranscript | null {
  if (!value || typeof value !== 'object') return null
  const bag = value as { segments?: unknown }
  if (!Array.isArray(bag.segments)) return null
  return value as LegacyTranscript
}

/** A token stream plus the concatenated transcript text it indexes into. */
interface TranscriptTokens {
  text: string
  tokens: BackfillToken[]
}

/**
 * Builds one temporally-anchored token per ASR segment, concatenating segment
 * texts (space-joined) into the transcript text the token offsets index into.
 */
function tokenizeSegments(segments: LegacyTranscriptSegment[]): TranscriptTokens {
  const tokens: BackfillToken[] = []
  let text = ''
  segments.forEach((segment, index) => {
    if (index > 0) text += ' '
    const charStart = text.length
    const byteStart = Buffer.byteLength(text, 'utf8')
    text += segment.text
    const charEnd = text.length
    const byteEnd = Buffer.byteLength(text, 'utf8')
    tokens.push({
      tokenIndex: index,
      text: segment.text,
      textSpan: { byteStart, byteEnd, charStart, charEnd },
      temporalSpan: { start: secToMs(segment.start), ending: secToMs(segment.end) },
    })
  })
  return { text, tokens }
}

/**
 * Backfills one VideoSummary into its audio media, transcript expression, token
 * decomposition, speaker tier, cluster set, and gloss document tag.
 *
 * @param prisma - the Prisma client
 * @param summary - the legacy VideoSummary row
 * @returns the created/updated tally
 */
export async function backfillSummary(
  prisma: PrismaClient,
  summary: VideoSummary,
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  const scope = { projectId: summary.projectId, createdByUserId: summary.createdBy ?? null }

  const transcript = readTranscript(summary.transcriptJson)
  if (transcript) {
    const segments = transcript.segments
    const { text, tokens } = tokenizeSegments(segments)
    const durationMs = segments.length > 0 ? secToMs(segments[segments.length - 1].end) : null

    // Media(kind=audio): the audio track the transcript describes.
    const mediaId = mediaAudioId(summary.id)
    const audioDescriptor = {
      language: transcript.language ?? summary.audioLanguage ?? null,
      speakerCount: summary.speakerCount ?? transcript.speakers?.length ?? null,
    }
    const mediaData = {
      kind: 'audio',
      durationMs,
      audio: toJson(audioDescriptor),
      videoId: summary.videoId,
      ...scope,
    }
    const mediaExisted = (await prisma.media.count({ where: { id: mediaId } })) > 0
    await prisma.media.upsert({
      where: { id: mediaId },
      create: { id: mediaId, ...mediaData },
      update: mediaData,
    })
    mediaExisted ? (stats.updated += 1) : (stats.created += 1)

    // Expression(kind=transcript): the token-bearing transcript.
    const exprId = expressionTranscriptId(summary.id)
    const languages = audioDescriptor.language ? [audioDescriptor.language] : []
    const exprData = {
      layersId: `summary:${summary.id}#transcript`,
      kind: 'transcript',
      text,
      sourceKind: 'asr-transcript',
      mediaId,
      videoId: summary.videoId,
      videoSummaryId: summary.id,
      languages,
      ...scope,
    }
    const exprExisted = (await prisma.expression.count({ where: { id: exprId } })) > 0
    await prisma.expression.upsert({
      where: { id: exprId },
      create: { id: exprId, ...exprData },
      update: exprData,
    })
    exprExisted ? (stats.updated += 1) : (stats.created += 1)

    // Segmentation + Tokenization: one token per ASR segment.
    const segId = segmentationTranscriptId(summary.id)
    await prisma.segmentation.upsert({
      where: { id: segId },
      create: { id: segId, expressionId: exprId, ...scope },
      update: { expressionId: exprId },
    })
    const tokId = tokenizationTranscriptId(summary.id)
    await prisma.tokenization.upsert({
      where: { id: tokId },
      create: {
        id: tokId,
        segmentationId: segId,
        expressionId: exprId,
        kind: 'segment',
        isCanonical: true,
        tokens: toJson(tokens) ?? [],
      },
      update: {
        segmentationId: segId,
        expressionId: exprId,
        kind: 'segment',
        tokens: toJson(tokens) ?? [],
      },
    })

    // Speaker tier: one temporal-span annotation per segment.
    const speakerLayer = speakerLayerId(summary.id)
    const layerExisted = (await prisma.annotationLayer.count({ where: { id: speakerLayer } })) > 0
    await prisma.annotationLayer.upsert({
      where: { id: speakerLayer },
      create: {
        id: speakerLayer,
        expressionId: exprId,
        kind: 'tier',
        subkind: 'speaker',
        tokenizationId: tokId,
        ...scope,
      },
      update: { expressionId: exprId, kind: 'tier', subkind: 'speaker', tokenizationId: tokId },
    })
    layerExisted ? (stats.updated += 1) : (stats.created += 1)

    const speakerToMembers = new Map<string, number[]>()
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      const speaker = segment.speaker ?? 'unknown'
      const members = speakerToMembers.get(speaker) ?? []
      members.push(index)
      speakerToMembers.set(speaker, members)

      const annId = speakerAnnotationId(summary.id, index)
      const start = secToMs(segment.start)
      const ending = secToMs(segment.end)
      const annData = {
        layerId: speakerLayer,
        tokenizationId: tokId,
        anchor: requiredJson({ temporalSpan: { start, ending } }),
        tokenIndex: index,
        label: speaker,
        value: segment.speaker ?? null,
        confidence: segment.confidence != null ? Math.round(segment.confidence * 1000) : null,
        startMs: start,
        endMs: ending,
        ...scope,
      }
      const annExisted = (await prisma.layersAnnotation.count({ where: { id: annId } })) > 0
      await prisma.layersAnnotation.upsert({
        where: { id: annId },
        create: { id: annId, ...annData },
        update: annData,
      })
      annExisted ? (stats.updated += 1) : (stats.created += 1)
    }

    // ClusterSet: segments grouped by speaker.
    const clusterSetId = speakerClusterSetId(summary.id)
    const clusters = Array.from(speakerToMembers.entries()).map(([label, members]) => ({
      label,
      members,
    }))
    await prisma.clusterSet.upsert({
      where: { id: clusterSetId },
      create: {
        id: clusterSetId,
        expressionId: exprId,
        kind: 'speaker',
        layerId: speakerLayer,
        clusters: requiredJson(clusters),
        ...scope,
      },
      update: {
        expressionId: exprId,
        kind: 'speaker',
        layerId: speakerLayer,
        clusters: requiredJson(clusters),
      },
    })
  }

  // Summary gloss: a document-tag layer carrying the narrative text.
  const glossText = glossToText(summary.summary as unknown as LegacyGlossItem[])
  if (glossText) {
    const videoExprId = expressionTranscriptId(summary.id)
    // The gloss tags the transcript expression when present; otherwise there is
    // no expression to attach to and the gloss layer is skipped.
    const hasTranscriptExpression =
      (await prisma.expression.count({ where: { id: videoExprId } })) > 0
    if (hasTranscriptExpression) {
      const glossLayer = summaryGlossLayerId(summary.id)
      const layerExisted = (await prisma.annotationLayer.count({ where: { id: glossLayer } })) > 0
      await prisma.annotationLayer.upsert({
        where: { id: glossLayer },
        create: {
          id: glossLayer,
          expressionId: videoExprId,
          kind: 'document-tag',
          subkind: 'summary-gloss',
          ...scope,
        },
        update: { expressionId: videoExprId, kind: 'document-tag', subkind: 'summary-gloss' },
      })
      layerExisted ? (stats.updated += 1) : (stats.created += 1)

      const glossAnnId = summaryGlossAnnotationId(summary.id)
      const glossAnnData = {
        layerId: glossLayer,
        anchor: requiredJson({}),
        label: 'summary',
        value: glossText,
        text: glossText,
        ...scope,
      }
      const glossAnnExisted =
        (await prisma.layersAnnotation.count({ where: { id: glossAnnId } })) > 0
      await prisma.layersAnnotation.upsert({
        where: { id: glossAnnId },
        create: { id: glossAnnId, ...glossAnnData },
        update: glossAnnData,
      })
      glossAnnExisted ? (stats.updated += 1) : (stats.created += 1)
    }
  }

  return stats
}

/**
 * Backfills a batch of summaries, aggregating their tallies.
 *
 * @param prisma - the Prisma client
 * @param summaries - the legacy VideoSummary rows
 * @returns the aggregate created/updated tally
 */
export async function backfillSummaries(
  prisma: PrismaClient,
  summaries: VideoSummary[],
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  for (const summary of summaries) {
    const step = await backfillSummary(prisma, summary)
    stats.created += step.created
    stats.updated += step.updated
  }
  return stats
}
