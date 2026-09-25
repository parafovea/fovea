/**
 * Video-annotation bridge over the unified layers store.
 *
 * Reconstructs the Annotation wire shape from the layers store (an
 * AnnotationLayer grouping plus a LayersAnnotation) and materializes an
 * annotation into it, mirroring the `/api/layers/videos/:videoId/annotations`
 * route. The writers used by import and sharing target the layers store.
 *
 * @module
 */

import { PrismaClient, Prisma } from '@prisma/client'

import {
  applyTrackMembership,
  isVideoAnnotationSubkind,
  tracksByAnnotation,
  VIDEO_ANNOTATION_SUBKINDS,
  type VideoAnnotationInput,
  type VideoAnnotationOutput,
  type MappedTrack,
} from '../video-annotation-shared.js'
import { annotationToLayers, layersToAnnotation } from '../layers-lens/video-lens.js'
import { getOrCreateVideoExpression, parseResolution } from '../video-expression-service.js'
import { layersOntologyForPersonaId, trackClusterSetId, worldInstanceNodeId } from '../layers-id-map.js'
import type { PrismaLike } from './util.js'

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

  const mapping = await annotationToLayers(input, {
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
      sourceMethod: mapping.layer.sourceMethod,
      ontologyId: mapping.layer.ontologyId,
      personaId: mapping.layer.personaId,
    },
  })

  // Get-or-create the denoted world node so the denotation FK is always
  // populated (the read side derives linkType from its nodeType). A persona-scoped
  // world-instance annotation materializes a node keyed by the caller's scope and
  // the instance kind + name, so the same name under one owner collapses onto one
  // node while a different owner stays distinct; an object annotation references
  // an already-identified world node by its id (the label). An existing node keeps
  // its fields.
  let denotesNodeId: string | null = null
  if (mapping.annotation.denotesNode) {
    const node = mapping.annotation.denotesNode
    const nodeId = input.personaId
      ? worldInstanceNodeId(scope.userId, scope.projectId, node.nodeType, node.label ?? node.id)
      : node.id
    await prisma.graphNode.upsert({
      where: { id: nodeId },
      create: {
        id: nodeId,
        nodeType: node.nodeType,
        label: node.label,
        projectId: scope.projectId,
        createdByUserId: scope.userId,
      },
      update: {},
    })
    denotesNodeId = nodeId
  }

  const writeData = {
    anchor: toJsonInput(mapping.annotation.anchor),
    label: mapping.annotation.label,
    confidence: mapping.annotation.confidence,
    ontologyTypeRefId: mapping.annotation.ontologyTypeRefId,
    denotesNodeId,
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

  // Fold the annotation's tracker identity into the video's track ClusterSet: its
  // trackId is the cluster it joins, its trackingSource the cluster's label, and
  // its trackingConfidence a cluster feature.
  const setId = trackClusterSetId(input.videoId)
  const existingSet = await prisma.clusterSet.findUnique({ where: { id: setId } })
  if (existingSet || mapping.track !== null) {
    const clusters = applyTrackMembership(existingSet?.clusters ?? null, input.id, mapping.track)
    await prisma.clusterSet.upsert({
      where: { id: setId },
      create: {
        id: setId,
        kind: 'clustering',
        expressionId,
        clusters: toJsonInput(clusters),
        projectId: scope.projectId,
        createdByUserId: scope.userId,
      },
      update: { clusters: toJsonInput(clusters) },
    })
  }
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
 * @param prisma - the Prisma client (or a transaction client)
 * @param where - the composed LayersAnnotation WHERE clause
 * @returns the reconstructed annotations
 */
export async function readLayersAnnotations(
  prisma: PrismaLike,
  where: Prisma.LayersAnnotationWhereInput,
): Promise<VideoAnnotationOutput[]> {
  const rows = await prisma.layersAnnotation.findMany({
    where: { AND: [where, { layer: { subkind: { in: [...VIDEO_ANNOTATION_SUBKINDS] } } }] },
    include: { layer: { include: { expression: { include: { video: true } } } }, denotesNode: true },
    orderBy: { createdAt: 'asc' },
  })

  // Resolve each annotation's tracker identity from its video's track ClusterSet.
  // Annotation ids are unique, so one merged map keys every row's track.
  const videoIds = new Set<string>()
  for (const row of rows) {
    const videoId = row.layer.expression.video?.id ?? row.layer.expression.videoId
    if (videoId) videoIds.add(videoId)
  }
  const tracks = new Map<string, MappedTrack>()
  if (videoIds.size > 0) {
    const trackSets = await prisma.clusterSet.findMany({
      where: { id: { in: [...videoIds].map(trackClusterSetId) } },
    })
    for (const trackSet of trackSets) {
      for (const [annotationId, track] of tracksByAnnotation(trackSet.clusters)) {
        tracks.set(annotationId, track)
      }
    }
  }

  return rows.map((row) => {
    const video = row.layer.expression.video
    return layersToAnnotation(
      row,
      { personaId: row.layer.personaId, sourceMethod: row.layer.sourceMethod },
      { id: video?.id ?? row.layer.expression.videoId ?? '', frameRate: video?.frameRate ?? null },
      row.denotesNode ? { nodeType: row.denotesNode.nodeType, label: row.denotesNode.label } : null,
      tracks.get(row.id) ?? null,
    )
  })
}

/**
 * Reads a (video, persona) pair's annotations from the layers store as
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
  return layersRows.slice(0, limit).map((row) => ({ type: row.type, label: row.label }))
}

/** An optional semantic-type / label filter for persona annotation queries. */
export interface PersonaAnnotationFilter {
  type?: string
  label?: string
}

/**
 * Counts a persona's annotations in the layers store, optionally filtered by the
 * reconstructed `type` and `label`, for persona/type deletion previews.
 *
 * A `label` is the operative identifier for a type's annotations: an annotation
 * carrying a type id on its `label` belongs to that type whether it was authored
 * as a structural type assignment (an `ontologyTypeRefId` soft reference) or as a
 * world-instance labeled with the type id (a `denotesNodeId` link). So a `label`
 * matches on the stored column directly; the reconstructed `type` narrows the
 * count only when no `label` pins it.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param personaId - the persona whose annotations to count
 * @param filter - optional `type` / `label` filter
 * @returns the number of matching annotations
 */
export async function countPersonaAnnotations(
  prisma: PrismaLike,
  personaId: string,
  filter: PersonaAnnotationFilter = {},
): Promise<number> {
  const where: Prisma.LayersAnnotationWhereInput = { layer: { personaId } }
  if (filter.label !== undefined) where.label = filter.label
  if (filter.type === undefined || filter.label !== undefined) {
    return prisma.layersAnnotation.count({ where })
  }
  const rows = await readLayersAnnotations(prisma, where)
  return rows.filter((r) => r.type === filter.type).length
}

/**
 * Cleans up the USER MEDIA annotations that reference a deleted type or object,
 * carrier-aware, and touches nothing else.
 *
 * Only two carriers are user media annotations: video-region boxes (layer subkind
 * in {@link VIDEO_ANNOTATION_SUBKINDS}) and document spans (a null-subkind span
 * layer). A video box keeps its box — its reference fields are nulled (via
 * `clearData`) so the user can reassign a type or object later — while a document
 * span sibling is deleted (its persona-free base placeholder keeps the span). This
 * is the carrier-preservation policy: never delete a bounding box because its type
 * or object was deleted.
 *
 * Rows in any other layer (a `gloss`/`world`/`claim` standoff whose reference is
 * an `ontologyTypeRefId`/`denotesNodeId` too) are SKIPPED here — those are derived
 * projections managed by the ontology/world/claim aggregate rewrites, and touching
 * them here would strand a gloss segment instead of freezing it to text.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param where - selects the annotations that reference the deleted thing
 * @param clearData - the reference fields to null on the surviving video boxes
 * @returns the number of user media annotations touched (nulled plus deleted)
 */
export async function clearVideoBoxesElseDelete(
  prisma: PrismaLike,
  where: Prisma.LayersAnnotationWhereInput,
  clearData: Prisma.LayersAnnotationUncheckedUpdateManyInput,
): Promise<number> {
  const rows = await prisma.layersAnnotation.findMany({
    where,
    select: { id: true, layer: { select: { subkind: true } } },
  })
  const videoIds: string[] = []
  const documentIds: string[] = []
  for (const row of rows) {
    if (isVideoAnnotationSubkind(row.layer.subkind)) videoIds.push(row.id)
    else if (row.layer.subkind == null) documentIds.push(row.id)
    // Any other subkind is a derived standoff (gloss/world/claim); leave it to
    // the aggregate rewrite that owns it.
  }
  let count = 0
  if (videoIds.length > 0) {
    count += (await prisma.layersAnnotation.updateMany({ where: { id: { in: videoIds } }, data: clearData }))
      .count
  }
  if (documentIds.length > 0) {
    count += (await prisma.layersAnnotation.deleteMany({ where: { id: { in: documentIds } } })).count
  }
  return count
}

/**
 * Deletes a persona's annotations from the layers store, optionally filtered by
 * the reconstructed `type` and `label`, for persona/type deletion.
 *
 * As in {@link countPersonaAnnotations}, a `label` is the operative identifier for
 * a type's annotations, matching the stored column directly so both a structural
 * type assignment and a world-instance labeled with the type id are removed; the
 * reconstructed `type` narrows the delete only when no `label` pins it.
 *
 * @param prisma - the Prisma client (or a transaction client)
 * @param personaId - the persona whose annotations to delete
 * @param filter - optional `type` / `label` filter
 * @returns the number of annotations removed
 */
export async function deletePersonaAnnotations(
  prisma: PrismaLike,
  personaId: string,
  filter: PersonaAnnotationFilter = {},
): Promise<number> {
  const where: Prisma.LayersAnnotationWhereInput = { layer: { personaId } }
  // A type deletion targets the annotations that DENOTE the type. The type id
  // rides on `ontologyTypeRefId` for native document spans, and on the `label`
  // column for video-region annotations, so match either — a display-name label
  // never collides with a type id. Carrier preservation then splits the hits: a
  // video bounding box keeps its box (its type ref is nulled) so the user can
  // reassign, while a document span's type sibling is deleted (its persona-free
  // base placeholder keeps the span). An object filter takes the same split on
  // `denotesNodeId`.
  if (filter.type === 'type' && filter.label !== undefined) {
    return clearVideoBoxesElseDelete(
      prisma,
      { layer: { personaId }, OR: [{ ontologyTypeRefId: filter.label }, { label: filter.label }] },
      { ontologyTypeRefId: null, label: null },
    )
  }
  if (filter.type === 'object' && filter.label !== undefined) {
    return clearVideoBoxesElseDelete(
      prisma,
      { layer: { personaId }, denotesNodeId: filter.label },
      { denotesNodeId: null },
    )
  }
  if (filter.label !== undefined) {
    where.label = filter.label
    return (await prisma.layersAnnotation.deleteMany({ where })).count
  }
  if (filter.type !== undefined) {
    const rows = await readLayersAnnotations(prisma, where)
    const ids = rows.filter((r) => r.type === filter.type).map((r) => r.id)
    if (ids.length === 0) return 0
    return (await prisma.layersAnnotation.deleteMany({ where: { id: { in: ids } } })).count
  }
  return (await prisma.layersAnnotation.deleteMany({ where })).count
}

/**
 * Reads a single annotation by id from the layers store, reconstructed into the
 * annotation shape, or null when no annotation with that id exists.
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
  return layersRows.length > 0 ? layersRows[0] : null
}

/**
 * Returns the owner user id of an annotation in the layers store, or null when
 * no annotation with that id exists.
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
  return layers ? layers.createdByUserId : null
}

/**
 * True when an annotation with the given id exists in the layers store.
 *
 * @param prisma - the Prisma client
 * @param id - the annotation id
 * @returns whether the annotation exists
 */
export async function annotationExists(prisma: PrismaClient, id: string): Promise<boolean> {
  return (await prisma.layersAnnotation.count({ where: { id } })) > 0
}

/**
 * Lists every annotation id paired with its persona id in the layers store, for
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
    where: { layer: { subkind: { in: [...VIDEO_ANNOTATION_SUBKINDS] } } },
    select: { id: true, layer: { select: { personaId: true } } },
  })
  for (const row of layersRows) {
    if (!seen.has(row.id)) {
      seen.add(row.id)
      refs.push({ id: row.id, personaId: row.layer.personaId })
    }
  }
  return refs
}
