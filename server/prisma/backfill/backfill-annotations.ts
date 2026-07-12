/**
 * Backfills a legacy Annotation into the layers store: the round-trip core.
 *
 * Every Annotation produces exactly one LayersAnnotation, reusing the
 * Annotation's id. Its `frames` bounding-box sequence is projected onto a
 * layers spatio-temporal anchor via the conversion service, with the exact
 * source values preserved in the annotation's features bag so the sequence
 * reconstructs bit-exactly. Annotations sharing a video and persona are grouped
 * under one homogeneous AnnotationLayer (a set persona marks an ontology-type
 * layer; a null persona marks a world-object layer), mirroring the legacy
 * `Annotation.personaId` distinction.
 *
 * The denotation link follows the layer's persona: type annotations carry an
 * `ontologyTypeRefId` (a soft reference to a TypeDef), object annotations carry
 * a `denotesNodeId` (a real link to the GraphNode the label names, set only when
 * that node exists so the foreign key holds).
 *
 * @module
 */

import { PrismaClient, type Annotation } from '@prisma/client'

import {
  boundingBoxSequenceToSpatioTemporalAnchor,
  to1000,
  type BoundingBoxSequence,
} from '../../src/services/layers-conversion-service.js'
import {
  annotationLayerId,
  expressionVideoId,
  layersOntologyForPersonaId,
  reuseAnnotationId,
} from './id-map.js'
import { toJson, requiredJson, type StepStats } from './helpers.js'

/** Parses a `WIDTHxHEIGHT` resolution string into numeric dimensions. */
function parseResolution(resolution: string | null): { width?: number; height?: number } {
  if (!resolution) return {}
  const match = /^(\d+)\s*x\s*(\d+)$/i.exec(resolution.trim())
  if (!match) return {}
  return { width: Number(match[1]), height: Number(match[2]) }
}

/**
 * Backfills one Annotation into its grouping AnnotationLayer and a single
 * LayersAnnotation.
 *
 * @param prisma - the Prisma client
 * @param annotation - the legacy Annotation row
 * @returns the created/updated tally
 */
export async function backfillAnnotation(
  prisma: PrismaClient,
  annotation: Annotation,
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }

  const video = await prisma.video.findUnique({ where: { id: annotation.videoId } })
  const frameRate = video?.frameRate ?? 30
  const { width, height } = parseResolution(video?.resolution ?? null)

  const scope = {
    projectId: annotation.projectId,
    createdByUserId: annotation.userId ?? annotation.createdByUserId ?? null,
  }

  // Grouping layer: one per (video expression, persona-or-object).
  const expressionId = expressionVideoId(annotation.videoId)
  const layerId = annotationLayerId(annotation.videoId, annotation.personaId)

  // Bind an ontology-type layer to the persona's LayersOntology when it exists.
  let ontologyId: string | null = null
  if (annotation.personaId) {
    const candidateOntologyId = layersOntologyForPersonaId(annotation.personaId)
    const ontologyExists =
      (await prisma.layersOntology.count({ where: { id: candidateOntologyId } })) > 0
    ontologyId = ontologyExists ? candidateOntologyId : null
  }

  const layerExisted = (await prisma.annotationLayer.count({ where: { id: layerId } })) > 0
  await prisma.annotationLayer.upsert({
    where: { id: layerId },
    create: {
      id: layerId,
      expressionId,
      kind: 'span',
      subkind: annotation.personaId ? 'ontology-type' : 'world-object',
      sourceMethod: annotation.source === 'manual' ? 'manual-native' : 'model-projected',
      ontologyId,
      personaId: annotation.personaId,
      ...scope,
    },
    // Scope columns are set once at creation and left stable across re-runs so a
    // shared layer is not churned by later annotations from other owners.
    update: {
      expressionId,
      kind: 'span',
      subkind: annotation.personaId ? 'ontology-type' : 'world-object',
      ontologyId,
      personaId: annotation.personaId,
    },
  })
  layerExisted ? (stats.updated += 1) : (stats.created += 1)

  // Project the frames sequence onto a spatio-temporal anchor, preserving exact
  // source values in the features bag for bit-exact reconstruction.
  const frames = annotation.frames as unknown as BoundingBoxSequence
  const { anchor, features } = boundingBoxSequenceToSpatioTemporalAnchor(frames, {
    frameRate,
    videoWidth: width,
    videoHeight: height,
  })
  const startMs = anchor.temporalSpan.start
  const endMs = anchor.temporalSpan.ending

  // Denotation follows the layer's persona.
  let ontologyTypeRefId: string | null = null
  let denotesNodeId: string | null = null
  if (annotation.personaId) {
    ontologyTypeRefId = annotation.label || null
  } else if (annotation.label) {
    const nodeExists = (await prisma.graphNode.count({ where: { id: annotation.label } })) > 0
    denotesNodeId = nodeExists ? annotation.label : null
  }

  const annotationId = reuseAnnotationId(annotation.id)
  const annotationData = {
    layerId,
    anchor: requiredJson({ spatioTemporalAnchor: anchor }),
    label: annotation.label,
    confidence: to1000(annotation.confidence ?? undefined) ?? null,
    ontologyTypeRefId,
    denotesNodeId,
    features: toJson(features),
    startMs,
    endMs,
    ...scope,
  }
  const annotationExisted =
    (await prisma.layersAnnotation.count({ where: { id: annotationId } })) > 0
  await prisma.layersAnnotation.upsert({
    where: { id: annotationId },
    create: { id: annotationId, ...annotationData },
    update: annotationData,
  })
  annotationExisted ? (stats.updated += 1) : (stats.created += 1)

  return stats
}

/**
 * Backfills a batch of annotations, aggregating their tallies.
 *
 * @param prisma - the Prisma client
 * @param annotations - the legacy Annotation rows
 * @returns the aggregate created/updated tally
 */
export async function backfillAnnotations(
  prisma: PrismaClient,
  annotations: Annotation[],
): Promise<StepStats> {
  const stats: StepStats = { created: 0, updated: 0 }
  for (const annotation of annotations) {
    const step = await backfillAnnotation(prisma, annotation)
    stats.created += step.created
    stats.updated += step.updated
  }
  return stats
}
