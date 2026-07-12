import { Prisma, type AnnotationLayer, type LayersAnnotation, type TextAnnotationRelation } from '@prisma/client'
import { subject } from '@casl/ability'
import { accessibleBy } from '@casl/prisma'
import type { Anchor } from '@fovea/layers-schema'
import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, ForbiddenError } from '../lib/errors.js'
import { AnnotationLayerRepository } from '../repositories/AnnotationLayerRepository.js'

/**
 * Converts a typed value to Prisma.InputJsonValue for storage in a JSON column.
 * Prisma JSON columns accept any serializable value at runtime; this bridges
 * the TypeScript gap without an unsafe cast. Returns undefined for undefined
 * input so the field is left untouched on update.
 */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue)
}

/**
 * Derives the denormalized millisecond extent of an annotation from its anchor.
 *
 * The layers anchor already carries integer-millisecond times, so no unit
 * conversion is needed: a temporal span is read directly, and a
 * spatio-temporal anchor's `temporalSpan` (whose `start`/`ending` bound its
 * keyframes) supplies the extent for video-region anchors. Non-temporal anchors
 * (token references, text spans, external targets) have no extent and yield
 * nulls.
 *
 * @param anchor - the polymorphic layers anchor, if any
 * @returns the start/end millisecond bounds, or nulls when the anchor is
 *   absent or non-temporal
 */
function deriveTemporalExtent(anchor: Anchor | undefined): { startMs: number | null; endMs: number | null } {
  if (!anchor) return { startMs: null, endMs: null }
  const span = anchor.temporalSpan ?? anchor.spatioTemporalAnchor?.temporalSpan
  if (span) return { startMs: span.start, endMs: span.ending }
  return { startMs: null, endMs: null }
}

/** Create/idempotent-update fields for an annotation layer. */
export interface AnnotationLayerCreateInput {
  id?: string
  expressionId: string
  kind: string
  subkind?: string | null
  formalism?: string | null
  sourceMethod?: string
  labelSet?: string | null
  tokenizationId?: string | null
  ontologyId?: string | null
  parentLayerId?: string | null
  personaId?: string | null
  metadata?: unknown
  features?: unknown
  languages?: string[]
  layersUri?: string | null
}

/** Create/idempotent-update fields for a layers annotation. */
export interface LayersAnnotationCreateInput {
  id?: string
  layerId: string
  tokenizationId?: string | null
  anchor?: Anchor
  tokenIndex?: number | null
  label?: string | null
  value?: string | null
  text?: string | null
  parentAnnotationId?: string | null
  childIds?: unknown
  headIndex?: number | null
  targetIndex?: number | null
  arguments?: unknown
  confidence?: number | null
  ontologyTypeRefId?: string | null
  denotesNodeId?: string | null
  knowledgeRefs?: unknown
  temporal?: unknown
  spatial?: unknown
  features?: unknown
  layersUri?: string | null
}

/** Partial update fields for a layers annotation (PUT). All optional. */
export interface LayersAnnotationUpdateInput {
  anchor?: Anchor
  tokenizationId?: string | null
  tokenIndex?: number | null
  label?: string | null
  value?: string | null
  text?: string | null
  parentAnnotationId?: string | null
  childIds?: unknown
  headIndex?: number | null
  targetIndex?: number | null
  arguments?: unknown
  confidence?: number | null
  ontologyTypeRefId?: string | null
  denotesNodeId?: string | null
  knowledgeRefs?: unknown
  temporal?: unknown
  spatial?: unknown
  features?: unknown
  layersUri?: string | null
}

/** Create/idempotent-update fields for a text annotation relation. */
export interface TextAnnotationRelationCreateInput {
  id?: string
  layerId: string
  sourceAnnotationId: string
  targetAnnotationId: string
  relationTypeRef: unknown
  label?: string | null
  features?: unknown
  layersUri?: string | null
}

/** API-facing annotation-layer shape (JSON columns pass through; ISO dates). */
export interface AnnotationLayerResponse {
  id: string
  expressionId: string
  kind: string
  subkind: string | null
  formalism: string | null
  sourceMethod: string
  labelSet: string | null
  tokenizationId: string | null
  ontologyId: string | null
  parentLayerId: string | null
  personaId: string | null
  metadata: unknown
  features: unknown
  languages: string[]
  projectId: string | null
  createdByUserId: string | null
  layersUri: string | null
  createdAt: string
  updatedAt: string
}

/** API-facing layers-annotation shape. */
export interface LayersAnnotationResponse {
  id: string
  layerId: string
  tokenizationId: string | null
  anchor: unknown
  tokenIndex: number | null
  label: string | null
  value: string | null
  text: string | null
  parentAnnotationId: string | null
  childIds: unknown
  headIndex: number | null
  targetIndex: number | null
  arguments: unknown
  confidence: number | null
  ontologyTypeRefId: string | null
  denotesNodeId: string | null
  knowledgeRefs: unknown
  temporal: unknown
  spatial: unknown
  features: unknown
  startMs: number | null
  endMs: number | null
  projectId: string | null
  createdByUserId: string | null
  layersUri: string | null
  createdAt: string
  updatedAt: string
}

/** API-facing text-annotation-relation shape. */
export interface TextAnnotationRelationResponse {
  id: string
  layerId: string
  sourceAnnotationId: string
  targetAnnotationId: string
  relationTypeRef: unknown
  label: string | null
  features: unknown
  projectId: string | null
  createdByUserId: string | null
  layersUri: string | null
  createdAt: string
  updatedAt: string
}

/** A create result flagging whether a new row was minted (201) or an existing one refreshed (200). */
export interface CreateResult<T> {
  row: T
  created: boolean
}

/**
 * Owns the business rules and RBAC for the layers annotation-layers domain
 * (AnnotationLayer + LayersAnnotation + TextAnnotationRelation), delegating all
 * data access to an AnnotationLayerRepository. Construct one per request from
 * the request-scoped CASL ability and the authenticated user's id.
 *
 * Every content model in this domain scopes on `createdByUserId` (+ an optional
 * `projectId` inherited from the parent expression / layer). The service makes
 * every authorization decision — the `accessibleBy` read filter for lists, the
 * instance-level `can()` checks for single rows, and the create pre-check
 * against a candidate carrying the resolved scope — mirroring
 * `routes/annotations.ts`. The repository performs none.
 *
 * Creates are idempotent by client-supplied id: a re-POST of an already-stored
 * row updates it in place (authorized against the existing row's `update`
 * permission) rather than minting a duplicate, and a concurrent-insert race is
 * absorbed via the Prisma P2002 fallback.
 *
 * @example
 * ```typescript
 * const service = new AnnotationLayerService(repo, request.ability, request.user.id)
 * const { row, created } = await service.createLayer(input)
 * ```
 */
export class AnnotationLayerService {
  constructor(
    private readonly repository: AnnotationLayerRepository,
    private readonly ability: AppAbility,
    private readonly userId: string,
  ) {}

  // ---- mappers -------------------------------------------------------------

  private mapLayer(row: AnnotationLayer): AnnotationLayerResponse {
    return {
      id: row.id,
      expressionId: row.expressionId,
      kind: row.kind,
      subkind: row.subkind,
      formalism: row.formalism,
      sourceMethod: row.sourceMethod,
      labelSet: row.labelSet,
      tokenizationId: row.tokenizationId,
      ontologyId: row.ontologyId,
      parentLayerId: row.parentLayerId,
      personaId: row.personaId,
      metadata: row.metadata ?? null,
      features: row.features ?? null,
      languages: row.languages,
      projectId: row.projectId,
      createdByUserId: row.createdByUserId,
      layersUri: row.layersUri,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private mapAnnotation(row: LayersAnnotation): LayersAnnotationResponse {
    return {
      id: row.id,
      layerId: row.layerId,
      tokenizationId: row.tokenizationId,
      anchor: row.anchor,
      tokenIndex: row.tokenIndex,
      label: row.label,
      value: row.value,
      text: row.text,
      parentAnnotationId: row.parentAnnotationId,
      childIds: row.childIds ?? null,
      headIndex: row.headIndex,
      targetIndex: row.targetIndex,
      arguments: row.arguments ?? null,
      confidence: row.confidence,
      ontologyTypeRefId: row.ontologyTypeRefId,
      denotesNodeId: row.denotesNodeId,
      knowledgeRefs: row.knowledgeRefs ?? null,
      temporal: row.temporal ?? null,
      spatial: row.spatial ?? null,
      features: row.features ?? null,
      startMs: row.startMs,
      endMs: row.endMs,
      projectId: row.projectId,
      createdByUserId: row.createdByUserId,
      layersUri: row.layersUri,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private mapRelation(row: TextAnnotationRelation): TextAnnotationRelationResponse {
    return {
      id: row.id,
      layerId: row.layerId,
      sourceAnnotationId: row.sourceAnnotationId,
      targetAnnotationId: row.targetAnnotationId,
      relationTypeRef: row.relationTypeRef,
      label: row.label,
      features: row.features ?? null,
      projectId: row.projectId,
      createdByUserId: row.createdByUserId,
      layersUri: row.layersUri,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  // ---- scope resolution ----------------------------------------------------

  /**
   * Loads an expression the caller may read and returns its project scope.
   * A new layer inherits its expression's projectId so it is scoped
   * consistently with the text it annotates.
   */
  private async resolveExpressionScope(expressionId: string): Promise<{ projectId: string | null }> {
    const expression = await this.repository.findExpressionById(expressionId)
    if (!expression) throw new NotFoundError('Expression', expressionId)
    if (!this.ability.can('read', subject('Expression', expression))) {
      throw new ForbiddenError('Cannot create a layer over this Expression')
    }
    return { projectId: expression.projectId }
  }

  /**
   * Loads a layer the caller may read. Annotations and relations inherit their
   * layer's project scope and, for annotations, its persona (type vs object).
   */
  private async loadReadableLayer(layerId: string): Promise<AnnotationLayer> {
    const layer = await this.repository.findLayerById(layerId)
    if (!layer) throw new NotFoundError('AnnotationLayer', layerId)
    if (!this.ability.can('read', subject('AnnotationLayer', layer))) {
      throw new ForbiddenError('Cannot annotate under this AnnotationLayer')
    }
    return layer
  }

  /**
   * Resolves the mutually-exclusive denotation link for an annotation from its
   * layer's persona. A layer with a set personaId is an ontology-type layer, so
   * the annotation denotes an ontology type (`ontologyTypeRefId` kept, the
   * world-object link nulled); a null personaId marks a world-object layer, so
   * the annotation denotes a graph node (`denotesNodeId` kept, the ontology ref
   * nulled). This mirrors the `linkType = type === 'object' ? … : null`
   * exclusion in the legacy Annotation route.
   */
  private denotationForLayer(
    layerPersonaId: string | null,
    ontologyTypeRefId: string | null | undefined,
    denotesNodeId: string | null | undefined,
  ): { ontologyTypeRefId: string | null; denotesNodeId: string | null } {
    if (layerPersonaId) {
      return { ontologyTypeRefId: ontologyTypeRefId ?? null, denotesNodeId: null }
    }
    return { ontologyTypeRefId: null, denotesNodeId: denotesNodeId ?? null }
  }

  // ---- AnnotationLayer -----------------------------------------------------

  /**
   * Lists annotation layers the caller may read, optionally filtered to one
   * expression. Applies `accessibleBy(ability,'read').AnnotationLayer` as the
   * base WHERE clause so the caller only sees layers they are entitled to read.
   *
   * @param expressionId - optional expression filter
   * @returns the accessible layers in API shape
   */
  async listLayers(expressionId?: string): Promise<AnnotationLayerResponse[]> {
    const readScope = accessibleBy(this.ability, 'read').AnnotationLayer
    const where: Prisma.AnnotationLayerWhereInput = expressionId
      ? { AND: [readScope, { expressionId }] }
      : readScope
    const rows = await this.repository.findLayers(where)
    return rows.map((r) => this.mapLayer(r))
  }

  /**
   * Creates an annotation layer, or updates it in place when a client-supplied
   * id already exists (idempotent create). The layer inherits its expression's
   * project scope; a set personaId is verified against the caller's persona
   * read access (an ontology-type layer must belong to a persona the caller may
   * use).
   *
   * @param input - the layer fields
   * @returns the created/refreshed layer and whether it was newly minted
   * @throws {NotFoundError} when the expression or persona is absent
   * @throws {ForbiddenError} when read/create/update access is denied
   */
  async createLayer(input: AnnotationLayerCreateInput): Promise<CreateResult<AnnotationLayerResponse>> {
    const { projectId } = await this.resolveExpressionScope(input.expressionId)

    if (input.personaId) {
      const persona = await this.repository.findPersonaById(input.personaId)
      if (!persona) throw new NotFoundError('Persona', input.personaId)
      if (!this.ability.can('read', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot create a layer under this Persona')
      }
    }

    const updateExisting = async (existing: AnnotationLayer): Promise<CreateResult<AnnotationLayerResponse>> => {
      if (!this.ability.can('update', subject('AnnotationLayer', existing))) {
        throw new ForbiddenError('Cannot update this AnnotationLayer')
      }
      const updated = await this.repository.updateLayer(existing.id, {
        subkind: input.subkind ?? null,
        formalism: input.formalism ?? null,
        sourceMethod: input.sourceMethod ?? existing.sourceMethod,
        labelSet: input.labelSet ?? null,
        tokenizationId: input.tokenizationId ?? null,
        ontologyId: input.ontologyId ?? null,
        parentLayerId: input.parentLayerId ?? null,
        metadata: toJson(input.metadata),
        features: toJson(input.features),
        languages: input.languages ?? existing.languages,
        layersUri: input.layersUri ?? null,
      })
      return { row: this.mapLayer(updated), created: false }
    }

    if (input.id) {
      const existing = await this.repository.findLayerById(input.id)
      if (existing) return updateExisting(existing)
    }

    const candidate = subject('AnnotationLayer', { projectId, createdByUserId: this.userId })
    if (!this.ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create AnnotationLayer in this scope')
    }

    try {
      const created = await this.repository.createLayer({
        id: input.id,
        expressionId: input.expressionId,
        kind: input.kind,
        subkind: input.subkind ?? null,
        formalism: input.formalism ?? null,
        sourceMethod: input.sourceMethod ?? 'manual-native',
        labelSet: input.labelSet ?? null,
        tokenizationId: input.tokenizationId ?? null,
        ontologyId: input.ontologyId ?? null,
        parentLayerId: input.parentLayerId ?? null,
        personaId: input.personaId ?? null,
        metadata: toJson(input.metadata),
        features: toJson(input.features),
        languages: input.languages ?? [],
        projectId,
        createdByUserId: this.userId,
        layersUri: input.layersUri ?? null,
      })
      return { row: this.mapLayer(created), created: true }
    } catch (error) {
      if (input.id && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.repository.findLayerById(input.id)
        if (existing) return updateExisting(existing)
      }
      throw error
    }
  }

  /**
   * Deletes an annotation layer. Requires `delete` on the specific layer
   * instance. Cascades to its annotations and relations via the schema.
   *
   * @param id - AnnotationLayer UUID
   */
  async deleteLayer(id: string): Promise<void> {
    const existing = await this.repository.findLayerById(id)
    if (!existing) throw new NotFoundError('AnnotationLayer', id)
    if (!this.ability.can('delete', subject('AnnotationLayer', existing))) {
      throw new ForbiddenError('Cannot delete this AnnotationLayer')
    }
    await this.repository.deleteLayer(id)
  }

  // ---- LayersAnnotation ----------------------------------------------------

  /**
   * Creates a layers annotation, or updates it in place when a client-supplied
   * id already exists (idempotent create). The annotation inherits its layer's
   * project scope, its denormalized `startMs`/`endMs` are derived from the
   * anchor, and its denotation link is normalized to the layer's persona
   * (ontology-type vs world-object).
   *
   * @param input - the annotation fields
   * @returns the created/refreshed annotation and whether it was newly minted
   * @throws {NotFoundError} when the layer is absent
   * @throws {ForbiddenError} when read/create/update access is denied
   */
  async createAnnotation(
    input: LayersAnnotationCreateInput,
  ): Promise<CreateResult<LayersAnnotationResponse>> {
    const layer = await this.loadReadableLayer(input.layerId)
    const projectId = layer.projectId
    const { startMs, endMs } = deriveTemporalExtent(input.anchor)
    const { ontologyTypeRefId, denotesNodeId } = this.denotationForLayer(
      layer.personaId,
      input.ontologyTypeRefId,
      input.denotesNodeId,
    )

    const updateExisting = async (
      existing: LayersAnnotation,
    ): Promise<CreateResult<LayersAnnotationResponse>> => {
      if (!this.ability.can('update', subject('LayersAnnotation', existing))) {
        throw new ForbiddenError('Cannot update this LayersAnnotation')
      }
      const updated = await this.repository.updateAnnotation(existing.id, {
        tokenizationId: input.tokenizationId ?? null,
        anchor: input.anchor === undefined ? undefined : toJson(input.anchor),
        tokenIndex: input.tokenIndex ?? null,
        label: input.label ?? null,
        value: input.value ?? null,
        text: input.text ?? null,
        parentAnnotationId: input.parentAnnotationId ?? null,
        childIds: toJson(input.childIds),
        headIndex: input.headIndex ?? null,
        targetIndex: input.targetIndex ?? null,
        arguments: toJson(input.arguments),
        confidence: input.confidence ?? null,
        ontologyTypeRefId,
        denotesNodeId,
        knowledgeRefs: toJson(input.knowledgeRefs),
        temporal: toJson(input.temporal),
        spatial: toJson(input.spatial),
        features: toJson(input.features),
        startMs,
        endMs,
        layersUri: input.layersUri ?? null,
      })
      return { row: this.mapAnnotation(updated), created: false }
    }

    if (input.id) {
      const existing = await this.repository.findAnnotationById(input.id)
      if (existing) return updateExisting(existing)
    }

    const candidate = subject('LayersAnnotation', { projectId, createdByUserId: this.userId })
    if (!this.ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create LayersAnnotation in this scope')
    }

    try {
      const created = await this.repository.createAnnotation({
        id: input.id,
        layerId: input.layerId,
        tokenizationId: input.tokenizationId ?? null,
        anchor: toJson(input.anchor) ?? Prisma.JsonNull,
        tokenIndex: input.tokenIndex ?? null,
        label: input.label ?? null,
        value: input.value ?? null,
        text: input.text ?? null,
        parentAnnotationId: input.parentAnnotationId ?? null,
        childIds: toJson(input.childIds),
        headIndex: input.headIndex ?? null,
        targetIndex: input.targetIndex ?? null,
        arguments: toJson(input.arguments),
        confidence: input.confidence ?? null,
        ontologyTypeRefId,
        denotesNodeId,
        knowledgeRefs: toJson(input.knowledgeRefs),
        temporal: toJson(input.temporal),
        spatial: toJson(input.spatial),
        features: toJson(input.features),
        startMs,
        endMs,
        projectId,
        createdByUserId: this.userId,
        layersUri: input.layersUri ?? null,
      })
      return { row: this.mapAnnotation(created), created: true }
    } catch (error) {
      if (input.id && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.repository.findAnnotationById(input.id)
        if (existing) return updateExisting(existing)
      }
      throw error
    }
  }

  /**
   * Updates a layers annotation. Requires `update` on the specific instance;
   * only provided fields are written. When the anchor is provided, the
   * denormalized `startMs`/`endMs` are recomputed; the denotation link is
   * re-normalized to the annotation's layer persona.
   *
   * @param id - LayersAnnotation UUID
   * @param input - partial update fields
   * @returns the updated annotation in API shape
   * @throws {NotFoundError} when the annotation or its layer is absent
   * @throws {ForbiddenError} when update access is denied
   */
  async updateAnnotation(
    id: string,
    input: LayersAnnotationUpdateInput,
  ): Promise<LayersAnnotationResponse> {
    const existing = await this.repository.findAnnotationById(id)
    if (!existing) throw new NotFoundError('LayersAnnotation', id)
    if (!this.ability.can('update', subject('LayersAnnotation', existing))) {
      throw new ForbiddenError('Cannot update this LayersAnnotation')
    }

    const layer = await this.repository.findLayerById(existing.layerId)
    if (!layer) throw new NotFoundError('AnnotationLayer', existing.layerId)

    // Recompute the denormalized extent only when a new anchor is supplied;
    // leave the stored extent untouched otherwise.
    const extent = input.anchor !== undefined ? deriveTemporalExtent(input.anchor) : undefined

    // Re-normalize the denotation link only when either side is provided, so a
    // partial update that omits both leaves the stored links intact.
    const denotationProvided =
      input.ontologyTypeRefId !== undefined || input.denotesNodeId !== undefined
    const denotation = denotationProvided
      ? this.denotationForLayer(layer.personaId, input.ontologyTypeRefId, input.denotesNodeId)
      : undefined

    const updated = await this.repository.updateAnnotation(id, {
      tokenizationId: input.tokenizationId ?? undefined,
      anchor: input.anchor === undefined ? undefined : toJson(input.anchor),
      tokenIndex: input.tokenIndex ?? undefined,
      label: input.label ?? undefined,
      value: input.value ?? undefined,
      text: input.text ?? undefined,
      parentAnnotationId: input.parentAnnotationId ?? undefined,
      childIds: toJson(input.childIds),
      headIndex: input.headIndex ?? undefined,
      targetIndex: input.targetIndex ?? undefined,
      arguments: toJson(input.arguments),
      confidence: input.confidence ?? undefined,
      ontologyTypeRefId: denotation?.ontologyTypeRefId,
      denotesNodeId: denotation?.denotesNodeId,
      knowledgeRefs: toJson(input.knowledgeRefs),
      temporal: toJson(input.temporal),
      spatial: toJson(input.spatial),
      features: toJson(input.features),
      startMs: extent?.startMs,
      endMs: extent?.endMs,
      layersUri: input.layersUri ?? undefined,
    })
    return this.mapAnnotation(updated)
  }

  /**
   * Deletes a layers annotation. Requires `delete` on the specific instance.
   *
   * @param id - LayersAnnotation UUID
   */
  async deleteAnnotation(id: string): Promise<void> {
    const existing = await this.repository.findAnnotationById(id)
    if (!existing) throw new NotFoundError('LayersAnnotation', id)
    if (!this.ability.can('delete', subject('LayersAnnotation', existing))) {
      throw new ForbiddenError('Cannot delete this LayersAnnotation')
    }
    await this.repository.deleteAnnotation(id)
  }

  // ---- TextAnnotationRelation ---------------------------------------------

  /**
   * Creates a text annotation relation, or updates it in place when a
   * client-supplied id already exists (idempotent create). The relation
   * inherits its layer's project scope.
   *
   * @param input - the relation fields
   * @returns the created/refreshed relation and whether it was newly minted
   * @throws {NotFoundError} when the layer is absent
   * @throws {ForbiddenError} when read/create/update access is denied
   */
  async createRelation(
    input: TextAnnotationRelationCreateInput,
  ): Promise<CreateResult<TextAnnotationRelationResponse>> {
    const layer = await this.loadReadableLayer(input.layerId)
    const projectId = layer.projectId

    const updateExisting = async (
      existing: TextAnnotationRelation,
    ): Promise<CreateResult<TextAnnotationRelationResponse>> => {
      if (!this.ability.can('update', subject('TextAnnotationRelation', existing))) {
        throw new ForbiddenError('Cannot update this TextAnnotationRelation')
      }
      // Relations expose no PUT; the idempotent create path refreshes the
      // mutable fields (source/target/layer identity stays fixed).
      const refreshed = await this.repository.updateRelation(existing.id, {
        relationTypeRef: toJson(input.relationTypeRef) ?? Prisma.JsonNull,
        label: input.label ?? null,
        features: toJson(input.features),
        layersUri: input.layersUri ?? null,
      })
      return { row: this.mapRelation(refreshed), created: false }
    }

    if (input.id) {
      const existing = await this.repository.findRelationById(input.id)
      if (existing) return updateExisting(existing)
    }

    const candidate = subject('TextAnnotationRelation', { projectId, createdByUserId: this.userId })
    if (!this.ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create TextAnnotationRelation in this scope')
    }

    try {
      const created = await this.repository.createRelation({
        id: input.id,
        layerId: input.layerId,
        sourceAnnotationId: input.sourceAnnotationId,
        targetAnnotationId: input.targetAnnotationId,
        relationTypeRef: toJson(input.relationTypeRef) ?? Prisma.JsonNull,
        label: input.label ?? null,
        features: toJson(input.features),
        projectId,
        createdByUserId: this.userId,
        layersUri: input.layersUri ?? null,
      })
      return { row: this.mapRelation(created), created: true }
    } catch (error) {
      if (input.id && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.repository.findRelationById(input.id)
        if (existing) return updateExisting(existing)
      }
      throw error
    }
  }

  /**
   * Deletes a text annotation relation. Requires `delete` on the specific
   * instance.
   *
   * @param id - TextAnnotationRelation UUID
   */
  async deleteRelation(id: string): Promise<void> {
    const existing = await this.repository.findRelationById(id)
    if (!existing) throw new NotFoundError('TextAnnotationRelation', id)
    if (!this.ability.can('delete', subject('TextAnnotationRelation', existing))) {
      throw new ForbiddenError('Cannot delete this TextAnnotationRelation')
    }
    await this.repository.deleteRelation(id)
  }
}
