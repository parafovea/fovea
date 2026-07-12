/**
 * Video-annotation bridge over the unified layers store.
 *
 * Reconstructs the legacy Annotation wire shape from the layers store (an
 * AnnotationLayer grouping plus a LayersAnnotation) and materializes a legacy
 * annotation into it, mirroring the `/api/layers/videos/:videoId/annotations`
 * route. A given annotation lives in exactly one store, so the export reader
 * unions the layers rows with the legacy rows; the writers used by import and
 * sharing always target the layers store.
 *
 * @module
 */

import { PrismaClient, Prisma } from '@prisma/client'

import {
  annotationToLayers,
  layersToAnnotation,
  type VideoAnnotationInput,
  type VideoAnnotationOutput,
} from '../video-annotation-mapper.js'
import { getOrCreateVideoExpression, parseResolution } from '../video-expression-service.js'
import { layersOntologyForPersonaId } from '../layers-id-map.js'
import type { BoundingBoxSequence } from '../layers-conversion-service.js'

/** The forced scope columns a materialized annotation carries. */
export interface AnnotationScope {
  userId: string | null
  projectId: string | null
}

/** Coerces a value to a Prisma JSON input, stripping undefined properties. */
function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/**
 * The layer subkinds a video annotation lives under (see
 * `annotationToLayers`). Constrains reconstruction queries so span layers of
 * other kinds (claim text spans, whose subkind is `claim`) never surface as
 * video annotations even when they anchor over the same video expression.
 */
const VIDEO_ANNOTATION_SUBKINDS = ['ontology-type', 'world-object']

/**
 * Materializes a legacy annotation into the layers store, get-or-creating the
 * video Expression and the per-(video, persona) grouping AnnotationLayer, then
 * upserting the LayersAnnotation by the annotation's id (idempotent create). The
 * scope columns are forced to the caller's values, never the payload's.
 *
 * @param prisma - the Prisma client (or transaction client)
 * @param input - the legacy annotation to materialize (carries its id)
 * @param scope - the owning user and project the new rows are scoped to
 */
export async function writeVideoAnnotation(
  prisma: PrismaClient,
  input: VideoAnnotationInput,
  scope: AnnotationScope,
): Promise<void> {
  const { expressionId, video } = await getOrCreateVideoExpression(prisma, input.videoId)
  const { width, height } = parseResolution(video.resolution)
  const frameRate = video.frameRate ?? 30

  let ontologyId: string | null = null
  if (input.personaId) {
    const candidate = layersOntologyForPersonaId(input.personaId)
    const exists = (await prisma.layersOntology.count({ where: { id: candidate } })) > 0
    ontologyId = exists ? candidate : null
  }

  const mapping = annotationToLayers(input, {
    expressionId,
    ontologyId,
    frameRate,
    videoWidth: width ?? undefined,
    videoHeight: height ?? undefined,
  })

  await prisma.annotationLayer.upsert({
    where: { id: mapping.layer.id },
    create: {
      id: mapping.layer.id,
      expressionId: mapping.layer.expressionId,
      kind: mapping.layer.kind,
      subkind: mapping.layer.subkind,
      sourceMethod: mapping.layer.sourceMethod,
      ontologyId: mapping.layer.ontologyId,
      personaId: mapping.layer.personaId,
      projectId: scope.projectId,
      createdByUserId: scope.userId,
    },
    update: {
      expressionId: mapping.layer.expressionId,
      kind: mapping.layer.kind,
      subkind: mapping.layer.subkind,
      ontologyId: mapping.layer.ontologyId,
      personaId: mapping.layer.personaId,
    },
  })

  let denotesNodeId: string | null = null
  if (mapping.annotation.denotesNodeCandidateId) {
    const exists =
      (await prisma.graphNode.count({ where: { id: mapping.annotation.denotesNodeCandidateId } })) > 0
    denotesNodeId = exists ? mapping.annotation.denotesNodeCandidateId : null
  }

  const writeData = {
    anchor: toJsonInput(mapping.annotation.anchor),
    label: mapping.annotation.label,
    confidence: mapping.annotation.confidence,
    ontologyTypeRefId: mapping.annotation.ontologyTypeRefId,
    denotesNodeId,
    features: toJsonInput(mapping.annotation.features),
    startMs: mapping.annotation.startMs,
    endMs: mapping.annotation.endMs,
  }

  await prisma.layersAnnotation.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      layerId: mapping.annotation.layerId,
      projectId: scope.projectId,
      createdByUserId: scope.userId,
      ...writeData,
    },
    update: writeData,
  })
}

/**
 * Deletes a materialized annotation from the layers store by id. A no-op when no
 * layers row with that id exists.
 *
 * @param prisma - the Prisma client
 * @param id - the annotation id
 */
export async function deleteVideoAnnotation(prisma: PrismaClient, id: string): Promise<void> {
  await prisma.layersAnnotation.deleteMany({ where: { id } })
}

/**
 * Reads the layers annotations matching a WHERE clause, reconstructed into the
 * legacy annotation shape. The caller composes the WHERE from its CASL read
 * filter and any persona/video scoping.
 *
 * @param prisma - the Prisma client
 * @param where - the composed LayersAnnotation WHERE clause
 * @returns the reconstructed annotations
 */
export async function readLayersAnnotations(
  prisma: PrismaClient,
  where: Prisma.LayersAnnotationWhereInput,
): Promise<VideoAnnotationOutput[]> {
  const rows = await prisma.layersAnnotation.findMany({
    where: { AND: [where, { layer: { subkind: { in: VIDEO_ANNOTATION_SUBKINDS } } }] },
    include: { layer: { include: { expression: { include: { video: true } } } }, denotesNode: true },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map((row) => {
    const video = row.layer.expression.video
    return layersToAnnotation(
      row,
      { personaId: row.layer.personaId },
      { id: video?.id ?? row.layer.expression.videoId ?? '', frameRate: video?.frameRate ?? null },
      row.denotesNode ? { nodeType: row.denotesNode.nodeType, label: row.denotesNode.label } : null,
    )
  })
}

/** A legacy Annotation row read for the export reader. */
export interface LegacyAnnotationRow {
  id: string
  videoId: string
  personaId: string | null
  type: string
  label: string
  linkType: string | null
  frames: Prisma.JsonValue
  confidence: number | null
  source: string
  createdAt: Date
  updatedAt: Date
}

/** Reconstructs the legacy annotation shape from a legacy Annotation row. */
export function legacyAnnotationToOutput(row: LegacyAnnotationRow): VideoAnnotationOutput {
  return {
    id: row.id,
    videoId: row.videoId,
    personaId: row.personaId,
    type: row.type,
    label: row.label,
    linkType: (row.linkType as VideoAnnotationOutput['linkType']) ?? null,
    frames: (row.frames as unknown as BoundingBoxSequence) ?? {
      boxes: [],
      interpolationSegments: [],
      visibilityRanges: [],
      totalFrames: 0,
      keyframeCount: 0,
      interpolatedFrameCount: 0,
    },
    confidence: row.confidence,
    source: row.source,
    linkedObjectName: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * Reads the legacy annotations matching a WHERE clause, reconstructed into the
 * shared legacy annotation shape. Used by the export reader for annotations that
 * were never materialized into the layers store.
 *
 * @param prisma - the Prisma client
 * @param where - the composed Annotation WHERE clause
 * @returns the reconstructed annotations
 */
export async function readLegacyAnnotations(
  prisma: PrismaClient,
  where: Prisma.AnnotationWhereInput,
): Promise<VideoAnnotationOutput[]> {
  const rows = await prisma.annotation.findMany({ where, orderBy: { createdAt: 'asc' } })
  return rows.map(legacyAnnotationToOutput)
}

/**
 * Reads a persona's annotations across both stores as `{ type, label }` pairs,
 * for the detection-query builder's world-instance extraction. Layers rows carry
 * their semantic legacy `type` in the stashed annotation meta, so it round-trips.
 *
 * @param prisma - the Prisma client
 * @param personaId - the persona whose annotations to read
 * @returns the annotation `type` / `label` pairs
 */
export async function readPersonaAnnotationTypesAndLabels(
  prisma: PrismaClient,
  personaId: string,
): Promise<Array<{ type: string; label: string }>> {
  const layersRows = await readLayersAnnotations(prisma, { layer: { personaId } })
  if (layersRows.length > 0) {
    return layersRows.map((row) => ({ type: row.type, label: row.label }))
  }
  const legacy = await prisma.annotation.findMany({
    where: { personaId },
    select: { type: true, label: true },
  })
  return legacy.map((row) => ({ type: row.type, label: row.label }))
}

/**
 * Reads a (video, persona) pair's annotations across both stores as
 * `{ type, label }` pairs, for the claim-extraction context builder.
 *
 * @param prisma - the Prisma client
 * @param videoId - the video the annotations belong to
 * @param personaId - the persona the annotations belong to
 * @param limit - the maximum number of annotations to return
 * @returns the annotation `type` / `label` pairs
 */
export async function readVideoPersonaAnnotations(
  prisma: PrismaClient,
  videoId: string,
  personaId: string,
  limit: number,
): Promise<Array<{ type: string; label: string }>> {
  const layersRows = await readLayersAnnotations(prisma, {
    layer: { personaId, expression: { videoId } },
  })
  if (layersRows.length > 0) {
    return layersRows.slice(0, limit).map((row) => ({ type: row.type, label: row.label }))
  }
  const legacy = await prisma.annotation.findMany({
    where: { videoId, personaId },
    take: limit,
    select: { type: true, label: true },
  })
  return legacy.map((row) => ({ type: row.type, label: row.label }))
}

/** An optional semantic-type / label filter for persona annotation queries. */
export interface PersonaAnnotationFilter {
  type?: string
  label?: string
}

/**
 * Counts a persona's annotations, optionally filtered by the semantic `type`
 * (stashed in the layers annotation meta) and `label`, for persona/type deletion
 * previews. Reads the layers store when the persona has any layers annotation,
 * else falls through to the legacy table.
 *
 * @param prisma - the Prisma client
 * @param personaId - the persona whose annotations to count
 * @param filter - optional `type` / `label` filter
 * @returns the number of matching annotations
 */
export async function countPersonaAnnotations(
  prisma: PrismaClient,
  personaId: string,
  filter: PersonaAnnotationFilter = {},
): Promise<number> {
  const hasLayers = (await prisma.layersAnnotation.count({ where: { layer: { personaId } } })) > 0
  if (hasLayers) {
    if (filter.type === undefined && filter.label === undefined) {
      return prisma.layersAnnotation.count({ where: { layer: { personaId } } })
    }
    const where: Prisma.LayersAnnotationWhereInput = { layer: { personaId } }
    if (filter.label !== undefined) where.label = filter.label
    const rows = await readLayersAnnotations(prisma, where)
    return filter.type !== undefined ? rows.filter((r) => r.type === filter.type).length : rows.length
  }
  const where: Prisma.AnnotationWhereInput = { personaId }
  if (filter.type !== undefined) where.type = filter.type
  if (filter.label !== undefined) where.label = filter.label
  return prisma.annotation.count({ where })
}

/**
 * Deletes a persona's annotations, optionally filtered by the semantic `type`
 * and `label`, for persona/type deletion. Deletes from the layers store when the
 * persona has any layers annotation, else from the legacy table.
 *
 * @param prisma - the Prisma client
 * @param personaId - the persona whose annotations to delete
 * @param filter - optional `type` / `label` filter
 * @returns the number of annotations removed
 */
export async function deletePersonaAnnotations(
  prisma: PrismaClient,
  personaId: string,
  filter: PersonaAnnotationFilter = {},
): Promise<number> {
  const hasLayers = (await prisma.layersAnnotation.count({ where: { layer: { personaId } } })) > 0
  if (hasLayers) {
    if (filter.type === undefined && filter.label === undefined) {
      const result = await prisma.layersAnnotation.deleteMany({ where: { layer: { personaId } } })
      return result.count
    }
    const where: Prisma.LayersAnnotationWhereInput = { layer: { personaId } }
    if (filter.label !== undefined) where.label = filter.label
    const rows = await readLayersAnnotations(prisma, where)
    const ids = rows
      .filter((r) => filter.type === undefined || r.type === filter.type)
      .map((r) => r.id)
    if (ids.length === 0) return 0
    const result = await prisma.layersAnnotation.deleteMany({ where: { id: { in: ids } } })
    return result.count
  }
  const where: Prisma.AnnotationWhereInput = { personaId }
  if (filter.type !== undefined) where.type = filter.type
  if (filter.label !== undefined) where.label = filter.label
  const result = await prisma.annotation.deleteMany({ where })
  return result.count
}

/**
 * Reads a single annotation by id across both stores, reconstructed into the
 * legacy annotation shape, or null when no annotation with that id exists.
 *
 * @param prisma - the Prisma client
 * @param id - the annotation id
 * @returns the reconstructed annotation, or null
 */
export async function readAnnotationById(
  prisma: PrismaClient,
  id: string,
): Promise<VideoAnnotationOutput | null> {
  const layersRows = await readLayersAnnotations(prisma, { id })
  if (layersRows.length > 0) return layersRows[0]
  const legacy = await readLegacyAnnotations(prisma, { id })
  return legacy.length > 0 ? legacy[0] : null
}

/**
 * Returns the owner user id of an annotation across both stores, or null when no
 * annotation with that id exists.
 *
 * @param prisma - the Prisma client
 * @param id - the annotation id
 * @returns the owner user id, or null
 */
export async function annotationOwner(prisma: PrismaClient, id: string): Promise<string | null> {
  const layers = await prisma.layersAnnotation.findUnique({
    where: { id },
    select: { createdByUserId: true },
  })
  if (layers) return layers.createdByUserId
  const legacy = await prisma.annotation.findUnique({
    where: { id },
    select: { createdByUserId: true },
  })
  return legacy ? legacy.createdByUserId : null
}

/**
 * True when an annotation with the given id exists in either store.
 *
 * @param prisma - the Prisma client
 * @param id - the annotation id
 * @returns whether the annotation exists
 */
export async function annotationExists(prisma: PrismaClient, id: string): Promise<boolean> {
  if ((await prisma.layersAnnotation.count({ where: { id } })) > 0) return true
  return (await prisma.annotation.count({ where: { id } })) > 0
}

/**
 * Lists every annotation id paired with its persona id across both stores, for
 * import conflict detection.
 *
 * @param prisma - the Prisma client
 * @returns annotation id / persona id pairs
 */
export async function readAllAnnotationRefs(
  prisma: PrismaClient,
): Promise<Array<{ id: string; personaId: string | null }>> {
  const refs: Array<{ id: string; personaId: string | null }> = []
  const seen = new Set<string>()
  const layersRows = await prisma.layersAnnotation.findMany({
    where: { layer: { subkind: { in: VIDEO_ANNOTATION_SUBKINDS } } },
    select: { id: true, layer: { select: { personaId: true } } },
  })
  for (const row of layersRows) {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      refs.push({ id: row.id, personaId: row.layer.personaId })
    }
  }
  const legacy = await prisma.annotation.findMany({ select: { id: true, personaId: true } })
  for (const row of legacy) {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      refs.push({ id: row.id, personaId: row.personaId })
    }
  }
  return refs
}
