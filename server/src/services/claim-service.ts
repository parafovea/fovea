import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient, type VideoSummary } from '@prisma/client'
import { Job } from 'bullmq'
import { subject } from '@casl/ability'
import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors.js'
import {
  claimExtractionQueue,
  ClaimExtractionJobData,
  claimSynthesisQueue,
  ClaimSynthesisJobData,
} from '../queues/setup.js'
import { GraphRepository } from '../repositories/GraphRepository.js'
import { AnnotationLayerRepository } from '../repositories/AnnotationLayerRepository.js'
import { readOntologyAggregate } from './layers-bridge/ontology-bridge.js'
import { getOrCreateVideoExpression } from './video-expression-service.js'
import { claimRelationEdgeId, claimSpanLayerId, expressionTranscriptId } from './layers-id-map.js'
import {
  claimSpanAnnotations,
  claimToNode,
  collectSubtreeIds,
  edgeToRelation,
  isClaimNode,
  isClaimRelationEdge,
  nestClaims,
  nodeToClaim,
  relationToEdge,
  type StoredClaim,
  type StoredClaimNode,
  type StoredRelation,
} from './claim-layers-mapper.js'

/**
 * Coerces a value to Prisma.InputJsonValue for an optional JSON column, omitting
 * the field for null/undefined so the column stays NULL. Round-tripping through
 * JSON also strips undefined object properties so stored JSON compares equal on
 * read.
 */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/** Coerces a value for a required JSON column, falling back to Prisma.JsonNull. */
function requiredJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return toJson(value) ?? Prisma.JsonNull
}

/** Type guard for claim extraction job data. */
function isClaimExtractionData(data: unknown): data is ClaimExtractionJobData {
  if (typeof data !== 'object' || data === null) return false
  return 'summaryId' in data && typeof data.summaryId === 'string'
}

/** Type guard for claim synthesis job data. */
function isClaimSynthesisData(data: unknown): data is ClaimSynthesisJobData {
  if (typeof data !== 'object' || data === null) return false
  return 'summaryId' in data && typeof data.summaryId === 'string'
}

/** A single gloss item carried by a claim or claimer. */
export interface GlossItemInput {
  type: 'text' | 'typeRef' | 'objectRef' | 'annotationRef' | 'claimRef'
  content: string
  refType?: string
  refPersonaId?: string | null
  refClaimId?: string
}

/** A span within a claim's source text. */
export interface ClaimTextSpanInput {
  sentenceIndex?: number
  charStart: number
  charEnd: number
}

/** A video time span (seconds) a claim is grounded in. */
export interface ClaimTimeSpanInput {
  start: number
  end: number
  source: 'scrub' | 'annotation'
  annotationIds?: string[]
}

/** A span within a claim used by a relation endpoint. */
export interface ClaimSpanInput {
  charStart: number
  charEnd: number
}

/** Audio modality values supporting a claim. */
export type AudioModality = ('speech' | 'non-speech')[]
/** Video modality values supporting a claim. */
export type VideoModality = ('text' | 'non-text')[]
/** Metadata modality values supporting a claim. */
export type MetadataModality = ('text' | 'non-text')[]

/** Validated fields for creating a claim under a summary. */
export interface CreateClaimInput {
  /** Optional client-supplied id; makes create idempotent on retry. */
  id?: string
  summaryType: 'video' | 'collection'
  text: string
  gloss?: GlossItemInput[]
  parentClaimId?: string
  textSpans?: ClaimTextSpanInput[]
  timeSpans?: ClaimTimeSpanInput[]
  claimerType?: string | null
  claimerGloss?: GlossItemInput[]
  claimRelation?: GlossItemInput[]
  claimEventId?: string
  claimTimeId?: string
  claimLocationId?: string
  confidence?: number
  audio?: AudioModality | null
  video?: VideoModality | null
  metadata?: MetadataModality | null
  comment?: string | null
}

/** Validated fields for updating a claim (all optional). */
export interface UpdateClaimInput {
  text?: string
  gloss?: GlossItemInput[]
  textSpans?: ClaimTextSpanInput[]
  timeSpans?: ClaimTimeSpanInput[]
  claimerType?: string | null
  claimerGloss?: GlossItemInput[]
  claimRelation?: GlossItemInput[]
  claimEventId?: string
  claimTimeId?: string
  claimLocationId?: string
  confidence?: number
  audio?: AudioModality | null
  video?: VideoModality | null
  metadata?: MetadataModality | null
  comment?: string | null
}

/** Validated config for queueing a claim extraction job. */
export interface ClaimExtractionConfigInput {
  summaryType?: 'video' | 'collection'
  inputSources: {
    includeSummaryText: boolean
    includeAnnotations: boolean
    includeOntology: boolean
    ontologyDepth: 'names-only' | 'names-and-glosses' | 'full-definitions'
  }
  extractionStrategy: 'sentence-based' | 'semantic-units' | 'hierarchical' | 'manual'
  maxClaimsPerSummary?: number
  maxSubclaimDepth?: number
  minConfidence?: number
  modelId?: string
  deduplicateClaims?: boolean
  mergeSimilarClaims?: boolean
}

/** Validated config for queueing a claim synthesis job. */
export interface ClaimSynthesisConfigInput {
  synthesisStrategy?: 'hierarchical' | 'chronological' | 'narrative' | 'analytical'
  maxLength?: number
  includeConflicts?: boolean
  includeCitations?: boolean
}

/** Validated fields for creating a claim from a video + persona pair. */
export interface CreateVideoPersonaClaimInput {
  /** Optional client-supplied id; makes create idempotent on retry. */
  id?: string
  text: string
  gloss?: GlossItemInput[]
  parentClaimId?: string
  textSpans?: ClaimTextSpanInput[]
  claimerType?: string | null
  claimerGloss?: GlossItemInput[]
  claimRelation?: GlossItemInput[]
  claimEventId?: string
  claimTimeId?: string
  claimLocationId?: string
  confidence?: number
  audio?: AudioModality | null
  video?: VideoModality | null
  metadata?: MetadataModality | null
  comment?: string | null
}

/** Validated fields for creating a relation between two claims. */
export interface CreateClaimRelationInput {
  targetClaimId: string
  relationTypeId: string
  sourceSpans?: ClaimSpanInput[]
  targetSpans?: ClaimSpanInput[]
  confidence?: number
  notes?: string
}

/** Job-status response shape (BullMQ state mapped to API state). */
export interface JobStatusResponse {
  jobId: string
  status: string
  progress: number | null
  result: unknown
  error: string | null
}

/** Queue-job acknowledgement response. */
export interface QueuedJobResponse {
  jobId: string
  status: string
  summaryId: string
}

/** Response shape for the video + persona claim create path. */
export interface VideoPersonaClaimResponse {
  claim: StoredClaim
  summaryId: string
}

/**
 * Owns claim business rules and authorization over the layers store. Claims are
 * kept as GraphNode(nodeType=claim) rows whose `properties.foveaClaim.object`
 * stashes the complete claim, their text spans as span LayersAnnotations, and
 * ClaimRelations as GraphEdges whose `properties.foveaClaimRelation.object`
 * stashes the complete relation. The `/api/summaries/:summaryId/claims` contract
 * (request/response shapes, auth, and CASL decisions) is unchanged: claims are
 * still authorized as `Claim` subjects (each reconstructed claim carries the
 * `createdBy`/`projectId` the ability conditions read), and summaries as
 * `VideoSummary` subjects.
 *
 * A per-summary claim-span AnnotationLayer anchors each claim's text-span
 * annotations; it is ensured before the first claim of a summary is written.
 *
 * @example
 * ```typescript
 * const service = new ClaimService(graphRepo, annotationLayerRepo, prisma, request.ability ?? null, request.user?.id, request.user?.systemRole)
 * const claims = await service.listClaims(summaryId, { summaryType: 'video' })
 * ```
 */
export class ClaimService {
  constructor(
    private readonly graphRepo: GraphRepository,
    private readonly annotationLayerRepo: AnnotationLayerRepository,
    private readonly prisma: PrismaClient,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined,
    /**
     * The caller's system role. CASL already grants `manage all` to
     * system_admin, so the service needs no separate admin branch; the
     * parameter is accepted to keep the construction signature uniform across
     * the domain services.
     */
    _systemRole: string | undefined,
  ) {}

  /**
   * Asserts that a CASL ability is present, returning it narrowed.
   *
   * Mirrors the per-request `if (!request.ability) throw new ForbiddenError(...)`
   * guard the route used on every authenticated handler.
   */
  private requireAbility(): AppAbility {
    if (!this.ability) {
      throw new ForbiddenError('No abilities defined')
    }
    return this.ability
  }

  // --- Layers reads ----------------------------------------------------------

  /** Reads the layers claim nodes for a summary. */
  private async findSummaryClaimNodes(summaryId: string): Promise<StoredClaim[]> {
    const nodes = await this.graphRepo.findAccessibleNodes(
      {},
      {
        nodeType: 'claim',
        properties: { path: ['foveaClaim', 'summaryId'], equals: summaryId },
      },
    )
    const claims: StoredClaim[] = []
    for (const node of nodes) {
      if (!isClaimNode(node)) continue
      const claim = nodeToClaim(node)
      if (claim && claim.summaryId === summaryId) claims.push(claim)
    }
    return claims
  }

  /** Reads a summary's flat claim list from the layers store. */
  private async readClaims(summaryId: string): Promise<{ claims: StoredClaim[] }> {
    return { claims: await this.findSummaryClaimNodes(summaryId) }
  }

  /** Finds a claim by id in the layers store. */
  private async findClaimById(claimId: string): Promise<StoredClaim | null> {
    const node = await this.graphRepo.findNodeById(claimId)
    if (node && isClaimNode(node)) {
      const claim = nodeToClaim(node)
      if (claim) return claim
    }
    return null
  }

  /** Finds a relation by id in the layers store. */
  private async findRelationById(relationId: string): Promise<StoredRelation | null> {
    const edge = await this.graphRepo.findEdgeById(relationId)
    if (edge && isClaimRelationEdge(edge)) {
      const relation = edgeToRelation(edge)
      if (relation) return relation
    }
    return null
  }

  /** Lists a claim's relations from the layers store. */
  private async readClaimRelations(
    claim: StoredClaim,
  ): Promise<{ asSource: StoredRelation[]; asTarget: StoredRelation[] }> {
    const asSourceEdges = await this.graphRepo.findAccessibleEdges({}, { sourceLocalId: claim.id })
    const asTargetEdges = await this.graphRepo.findAccessibleEdges({}, { targetLocalId: claim.id })
    const toRelations = (edges: typeof asSourceEdges): StoredRelation[] => {
      const relations: StoredRelation[] = []
      for (const edge of edges) {
        if (!isClaimRelationEdge(edge)) continue
        const relation = edgeToRelation(edge)
        if (relation) relations.push(relation)
      }
      return relations
    }
    return { asSource: toRelations(asSourceEdges), asTarget: toRelations(asTargetEdges) }
  }

  // --- Layers writes ---------------------------------------------------------

  /** Resolves the expression the claim-span layer anchors over. */
  private async resolveClaimSpanExpressionId(summary: VideoSummary): Promise<string> {
    const transcriptId = expressionTranscriptId(summary.id)
    const hasTranscript = (await this.prisma.expression.count({ where: { id: transcriptId } })) > 0
    if (hasTranscript) return transcriptId
    const { expressionId } = await getOrCreateVideoExpression(this.prisma, summary.videoId)
    return expressionId
  }

  /** Finds or creates the per-summary claim-span marker layer, returning its id. */
  private async ensureClaimSpanLayer(summary: VideoSummary): Promise<string> {
    const layerId = claimSpanLayerId(summary.id)
    const existing = await this.annotationLayerRepo.findLayerById(layerId)
    if (existing) return layerId
    const expressionId = await this.resolveClaimSpanExpressionId(summary)
    try {
      await this.annotationLayerRepo.createLayer({
        id: layerId,
        expressionId,
        kind: 'span',
        subkind: 'claim',
        projectId: summary.projectId ?? null,
        createdByUserId: summary.createdBy ?? null,
      })
    } catch (err) {
      // The layer id is a pure function of the summary id, so two concurrent
      // first-claim creates both find no layer and both attempt this create. The
      // loser hits the id's unique violation; the layer now exists, so treat the
      // collision as success and return the shared id.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return layerId
      }
      throw err
    }
    return layerId
  }

  /** Creates a claim node and its span annotations under the given layer. */
  private async persistClaimNode(layerId: string, claim: StoredClaim): Promise<void> {
    const node = claimToNode(claim)
    await this.graphRepo.createNode({
      id: node.id,
      nodeType: node.nodeType,
      label: node.label,
      properties: toJson(node.properties),
      projectId: node.projectId,
      createdByUserId: node.createdByUserId,
    })
    for (const ann of claimSpanAnnotations(claim)) {
      await this.annotationLayerRepo.createAnnotation({
        id: ann.id,
        layerId,
        anchor: requiredJson(ann.anchor),
        label: ann.label,
        denotesNodeId: ann.denotesNodeId,
        features: toJson(ann.features),
        projectId: ann.projectId,
        createdByUserId: ann.createdByUserId,
      })
    }
  }

  /** Updates a claim node in place and regenerates its span annotations. */
  private async updateClaimNode(layerId: string, claim: StoredClaim): Promise<void> {
    const node = claimToNode(claim)
    await this.graphRepo.updateNode(node.id, {
      label: node.label,
      properties: toJson(node.properties),
    })
    await this.prisma.layersAnnotation.deleteMany({ where: { denotesNodeId: claim.id } })
    for (const ann of claimSpanAnnotations(claim)) {
      await this.annotationLayerRepo.createAnnotation({
        id: ann.id,
        layerId,
        anchor: requiredJson(ann.anchor),
        label: ann.label,
        denotesNodeId: ann.denotesNodeId,
        features: toJson(ann.features),
        projectId: ann.projectId,
        createdByUserId: ann.createdByUserId,
      })
    }
  }

  /** Creates a claim-relation edge from a stored relation. */
  private async persistRelationEdge(
    relation: StoredRelation,
    summaryId: string,
    projectId: string | null,
  ): Promise<void> {
    const edge = relationToEdge(relation, summaryId, projectId)
    await this.graphRepo.createEdge({
      id: edge.id,
      source: toJson(edge.source) as Prisma.InputJsonValue,
      target: toJson(edge.target) as Prisma.InputJsonValue,
      sourceLocalId: edge.sourceLocalId,
      targetLocalId: edge.targetLocalId,
      edgeType: edge.edgeType,
      label: edge.label,
      confidence: edge.confidence,
      properties: toJson(edge.properties),
      projectId: edge.projectId,
      createdByUserId: edge.createdByUserId,
    })
  }

  // --- Claim shaping ---------------------------------------------------------

  /** Builds a new stored claim from create input, stamping owner and scope. */
  private buildClaim(
    summary: VideoSummary,
    summaryType: string,
    input: CreateClaimInput | CreateVideoPersonaClaimInput,
    projectId: string | null,
  ): StoredClaim {
    const now = new Date().toISOString()
    return {
      id: input.id ?? randomUUID(),
      summaryId: summary.id,
      summaryType,
      text: input.text,
      gloss: input.gloss ?? [],
      parentClaimId: input.parentClaimId ?? null,
      textSpans: input.textSpans ?? null,
      timeSpans: 'timeSpans' in input ? input.timeSpans ?? null : null,
      claimerType: input.claimerType ?? null,
      claimerGloss: input.claimerGloss ?? null,
      claimRelation: input.claimRelation ?? null,
      claimEventId: input.claimEventId ?? null,
      claimTimeId: input.claimTimeId ?? null,
      claimLocationId: input.claimLocationId ?? null,
      confidence: input.confidence ?? null,
      modelUsed: null,
      extractionStrategy: 'manual',
      audio: input.audio ?? null,
      video: input.video ?? null,
      metadata: input.metadata ?? null,
      comment: input.comment ?? null,
      createdBy: this.userId ?? null,
      projectId,
      createdAt: now,
      updatedAt: now,
    }
  }

  /** Applies an update over an existing stored claim (only provided fields). */
  private static applyUpdate(existing: StoredClaim, input: UpdateClaimInput): StoredClaim {
    const merged: StoredClaim = { ...existing }
    if (input.text !== undefined) merged.text = input.text
    if (input.gloss !== undefined) merged.gloss = input.gloss
    if (input.textSpans !== undefined) merged.textSpans = input.textSpans
    if (input.timeSpans !== undefined) merged.timeSpans = input.timeSpans
    if (input.claimerType !== undefined) merged.claimerType = input.claimerType
    if (input.claimerGloss !== undefined) merged.claimerGloss = input.claimerGloss
    if (input.claimRelation !== undefined) merged.claimRelation = input.claimRelation
    if (input.claimEventId !== undefined) merged.claimEventId = input.claimEventId
    if (input.claimTimeId !== undefined) merged.claimTimeId = input.claimTimeId
    if (input.claimLocationId !== undefined) merged.claimLocationId = input.claimLocationId
    if (input.confidence !== undefined) merged.confidence = input.confidence
    if (input.audio !== undefined) merged.audio = input.audio
    if (input.video !== undefined) merged.video = input.video
    if (input.metadata !== undefined) merged.metadata = input.metadata
    if (input.comment !== undefined) merged.comment = input.comment
    merged.updatedAt = new Date().toISOString()
    return merged
  }

  /** Authorizes an action on a claim subject, throwing when denied. */
  private authorizeClaim(action: 'read' | 'update' | 'delete', claim: StoredClaim): void {
    const ability = this.requireAbility()
    if (!ability.can(action, subject('Claim', { ...claim }))) {
      throw new ForbiddenError('Cannot ' + action + ' this Claim')
    }
  }

  /** Finds a claim (with its subclaim subtree) inside a nested tree. */
  private static findInTree(tree: StoredClaimNode[], claimId: string): StoredClaimNode | null {
    for (const node of tree) {
      if (node.id === claimId) return node
      const found = ClaimService.findInTree(node.subclaims, claimId)
      if (found) return found
    }
    return null
  }

  // --- Public API ------------------------------------------------------------

  /**
   * Lists the root claims for a summary, filtered by the caller's read ability.
   *
   * @param summaryId - VideoSummary UUID
   * @param options - summary type, whether to include subclaims, and the
   *   optional minimum-confidence filter
   * @returns the matching root claims (optionally with their subclaim trees)
   * @throws {ForbiddenError} when no ability is present or read on the summary is denied
   * @throws {NotFoundError} when the summary does not exist
   */
  async listClaims(
    summaryId: string,
    options: { summaryType?: 'video' | 'collection'; includeSubclaims?: boolean; minConfidence?: number },
  ): Promise<StoredClaimNode[]> {
    const { summaryType = 'video', includeSubclaims = true, minConfidence } = options
    const ability = this.requireAbility()

    const summary =
      summaryType === 'video' ? await this.prisma.videoSummary.findUnique({ where: { id: summaryId } }) : null
    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    // Defense in depth: even if a caller knows another user's summaryId, deny
    // the claim listing unless they can read the summary.
    if (!ability.can('read', subject('VideoSummary', summary))) {
      throw new ForbiddenError('Cannot read claims under this Summary')
    }

    const { claims } = await this.readClaims(summaryId)
    let roots = nestClaims(claims).filter((root) => ability.can('read', subject('Claim', { ...root })))
    if (minConfidence != null) {
      roots = roots.filter((root) => typeof root.confidence === 'number' && root.confidence >= minConfidence)
    }
    if (!includeSubclaims) {
      roots = roots.map((root) => ({ ...root, subclaims: [] }))
    }
    return roots
  }

  /**
   * Gets a single claim by ID with its subclaim tree.
   *
   * @param summaryId - VideoSummary UUID the claim must belong to
   * @param claimId - Claim UUID
   * @returns the claim with its subclaims
   * @throws {ForbiddenError} when no ability is present or read is denied
   * @throws {NotFoundError} when the claim does not exist or belongs to another summary
   */
  async getClaim(summaryId: string, claimId: string): Promise<StoredClaimNode> {
    const claim = await this.findClaimById(claimId)
    if (!claim || claim.summaryId !== summaryId) {
      throw new NotFoundError('Claim', claimId)
    }
    this.authorizeClaim('read', claim)

    const { claims } = await this.readClaims(summaryId)
    const found = ClaimService.findInTree(nestClaims(claims), claimId)
    return found ?? { ...claim, subclaims: [] }
  }

  /**
   * Creates a claim under a summary and returns the rebuilt claim tree.
   *
   * @param summaryId - VideoSummary UUID
   * @param input - validated create fields
   * @returns the complete root claim tree after the create
   * @throws {ForbiddenError} when no ability is present, the parent summary is unreadable, the create is denied, or a parent claim is not updatable
   * @throws {NotFoundError} when the summary does not exist
   * @throws {ValidationError} when the parent claim is invalid
   */
  async createClaim(summaryId: string, input: CreateClaimInput): Promise<StoredClaimNode[]> {
    const { summaryType } = input
    const ability = this.requireAbility()
    const userId = this.userId!

    const summary =
      summaryType === 'video' ? await this.prisma.videoSummary.findUnique({ where: { id: summaryId } }) : null
    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    // The parent summary must be one the caller can read; otherwise A could
    // attach claims under B's summary.
    if (!ability.can('read', subject('VideoSummary', summary))) {
      throw new ForbiddenError('Cannot create a claim under this Summary')
    }

    // Pre-authorize create on a candidate Claim in the resolved scope.
    if (!ability.can('create', subject('Claim', { projectId: summary.projectId, createdBy: userId }))) {
      throw new ForbiddenError('Cannot create this Claim')
    }

    if (input.parentClaimId) {
      const { claims } = await this.readClaims(summaryId)
      const parent = claims.find((c) => c.id === input.parentClaimId)
      if (!parent || parent.summaryId !== summaryId) {
        throw new ValidationError('Invalid parent claim')
      }
      this.authorizeClaim('update', parent)
    }

    // Idempotent create on a client-supplied id: a network retry / resend
    // carrying the same id must not mint a duplicate. If the claim already
    // exists, re-authorize against it (so a caller cannot hijack another user's
    // claim by supplying its id) and return the current tree.
    if (input.id) {
      const existing = await this.findClaimById(input.id)
      if (existing) {
        if (!ability.can('update', subject('Claim', { ...existing }))) {
          throw new ForbiddenError('Cannot create this Claim')
        }
        return nestClaims((await this.readClaims(summaryId)).claims)
      }
    }

    const layerId = await this.ensureClaimSpanLayer(summary)
    const claim = this.buildClaim(summary, summaryType, input, summary.projectId ?? null)
    try {
      await this.persistClaimNode(layerId, claim)
    } catch (err) {
      // Lost the same-id race (the claim node's id is unique). Collapse to the
      // idempotent path: re-authorize against the stored row and return the
      // current tree; a denied update is a 403, never a raw P2002 as a 500.
      if (input.id && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.findClaimById(input.id)
        if (existing) {
          if (!ability.can('update', subject('Claim', { ...existing }))) {
            throw new ForbiddenError('Cannot create this Claim')
          }
          return nestClaims((await this.readClaims(summaryId)).claims)
        }
      }
      throw err
    }

    return nestClaims((await this.readClaims(summaryId)).claims)
  }

  /**
   * Updates a claim and returns the rebuilt claim tree.
   *
   * @param summaryId - VideoSummary UUID the claim must belong to
   * @param claimId - Claim UUID
   * @param input - validated update fields
   * @returns the complete root claim tree after the update
   * @throws {ForbiddenError} when no ability is present or update is denied
   * @throws {NotFoundError} when the claim does not exist or belongs to another summary
   */
  async updateClaim(summaryId: string, claimId: string, input: UpdateClaimInput): Promise<StoredClaimNode[]> {
    const existing = await this.findClaimById(claimId)
    if (!existing || existing.summaryId !== summaryId) {
      throw new NotFoundError('Claim', claimId)
    }
    this.authorizeClaim('update', existing)

    const summary = await this.prisma.videoSummary.findUnique({ where: { id: summaryId } })
    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    const layerId = await this.ensureClaimSpanLayer(summary)
    const merged = ClaimService.applyUpdate(existing, input)
    await this.updateClaimNode(layerId, merged)

    return nestClaims((await this.readClaims(summaryId)).claims)
  }

  /**
   * Deletes a claim (cascading to its subclaims) from the layers store.
   *
   * @param summaryId - VideoSummary UUID the claim must belong to
   * @param claimId - Claim UUID
   * @throws {ForbiddenError} when no ability is present or delete is denied
   * @throws {NotFoundError} when the claim does not exist or belongs to another summary
   */
  async deleteClaim(summaryId: string, claimId: string): Promise<void> {
    const existing = await this.findClaimById(claimId)
    if (!existing || existing.summaryId !== summaryId) {
      throw new NotFoundError('Claim', claimId)
    }
    this.authorizeClaim('delete', existing)

    const summary = await this.prisma.videoSummary.findUnique({ where: { id: summaryId } })
    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    const { claims } = await this.readClaims(summaryId)
    const subtreeIds = [...collectSubtreeIds(claims, claimId)]

    // Span annotations first (deleting the node would only null their FK).
    await this.prisma.layersAnnotation.deleteMany({ where: { denotesNodeId: { in: subtreeIds } } })

    // Relation edges incident to any deleted claim.
    const incident = await this.graphRepo.findAccessibleEdges(
      {},
      { OR: [{ sourceLocalId: { in: subtreeIds } }, { targetLocalId: { in: subtreeIds } }] },
    )
    for (const edge of incident) {
      if (isClaimRelationEdge(edge)) await this.graphRepo.deleteEdge(edge.id)
    }

    for (const id of subtreeIds) {
      await this.graphRepo.deleteNode(id)
    }
  }

  /**
   * Queues a claim extraction job for a summary.
   *
   * @param summaryId - VideoSummary UUID
   * @param config - validated extraction config
   * @returns the queued-job acknowledgement
   * @throws {ForbiddenError} when no ability is present or update on the summary is denied
   * @throws {NotFoundError} when the summary does not exist
   */
  async generateClaims(summaryId: string, config: ClaimExtractionConfigInput): Promise<QueuedJobResponse> {
    const summaryType = config.summaryType || 'video'
    const ability = this.requireAbility()

    const summary =
      summaryType === 'video' ? await this.prisma.videoSummary.findUnique({ where: { id: summaryId } }) : null
    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    if (!ability.can('update', subject('VideoSummary', summary))) {
      throw new ForbiddenError('Cannot update this VideoSummary')
    }

    const jobData: ClaimExtractionJobData = {
      summaryId,
      summaryType,
      createdBy: this.userId ?? undefined,
      config: {
        inputSources: config.inputSources,
        extractionStrategy: config.extractionStrategy,
        maxClaimsPerSummary: config.maxClaimsPerSummary,
        maxSubclaimDepth: config.maxSubclaimDepth,
        minConfidence: config.minConfidence,
        modelId: config.modelId,
        deduplicateClaims: config.deduplicateClaims,
        mergeSimilarClaims: config.mergeSimilarClaims,
      },
    }

    const job = await claimExtractionQueue.add('extract-claims', jobData, {
      jobId: `claims-${summaryId}-${Date.now()}`,
    })

    return { jobId: job.id ?? '', status: 'queued', summaryId }
  }

  /**
   * Gets the status of a claim extraction job, authorized against the summary
   * the job targets.
   *
   * @param jobId - the extraction job ID
   * @returns the mapped job-status response
   * @throws {ForbiddenError} when no ability is present or read on the target summary is denied
   * @throws {NotFoundError} when the job does not exist
   */
  async getExtractionJobStatus(jobId: string): Promise<JobStatusResponse> {
    const ability = this.requireAbility()

    const job = await claimExtractionQueue.getJob(jobId)
    if (!job) {
      throw new NotFoundError('Job', jobId)
    }

    const targetSummaryId = isClaimExtractionData(job.data) ? job.data.summaryId : undefined
    if (targetSummaryId) {
      const existing = await this.prisma.videoSummary.findUnique({ where: { id: targetSummaryId } })
      if (existing && !ability.can('read', subject('VideoSummary', existing))) {
        throw new ForbiddenError('Cannot read this VideoSummary')
      }
    }

    return this.mapJobStatus(job)
  }

  /**
   * Queues a claim synthesis job for a summary that has at least one claim.
   *
   * @param summaryId - VideoSummary UUID
   * @param config - validated synthesis config
   * @returns the queued-job acknowledgement
   * @throws {ForbiddenError} when no ability is present or update on the summary is denied
   * @throws {NotFoundError} when the summary does not exist
   * @throws {ValidationError} when the summary has no claims to synthesize
   */
  async synthesize(summaryId: string, config: ClaimSynthesisConfigInput): Promise<QueuedJobResponse> {
    const ability = this.requireAbility()

    const summary = await this.prisma.videoSummary.findUnique({ where: { id: summaryId } })
    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    if (!ability.can('update', subject('VideoSummary', summary))) {
      throw new ForbiddenError('Cannot update this VideoSummary')
    }

    const { claims } = await this.readClaims(summaryId)
    if (claims.length === 0) {
      throw new ValidationError('Summary has no claims to synthesize')
    }

    const jobData: ClaimSynthesisJobData = {
      summaryId,
      summaryType: 'video',
      config: {
        synthesisStrategy: config.synthesisStrategy || 'hierarchical',
        maxLength: config.maxLength,
        includeConflicts: config.includeConflicts,
        includeCitations: config.includeCitations,
      },
    }

    const job = await claimSynthesisQueue.add('synthesize-summary', jobData, {
      jobId: `synthesis-${summaryId}-${Date.now()}`,
    })

    return { jobId: job.id ?? '', status: 'queued', summaryId }
  }

  /**
   * Gets the status of a claim synthesis job, authorized against the summary the
   * job targets.
   *
   * @param jobId - the synthesis job ID
   * @returns the mapped job-status response
   * @throws {ForbiddenError} when no ability is present or read on the target summary is denied
   * @throws {NotFoundError} when the job does not exist
   */
  async getSynthesisJobStatus(jobId: string): Promise<JobStatusResponse> {
    const ability = this.requireAbility()

    const job = await claimSynthesisQueue.getJob(jobId)
    if (!job) {
      throw new NotFoundError('Job', jobId)
    }

    const targetSummaryId = isClaimSynthesisData(job.data) ? job.data.summaryId : undefined
    if (targetSummaryId) {
      const existing = await this.prisma.videoSummary.findUnique({ where: { id: targetSummaryId } })
      if (existing && !ability.can('read', subject('VideoSummary', existing))) {
        throw new ForbiddenError('Cannot read this VideoSummary')
      }
    }

    return this.mapJobStatus(job)
  }

  /**
   * Creates a typed relation between a source and target claim, validating the
   * relation type against the persona's ontology.
   *
   * @param summaryId - VideoSummary UUID the source claim must belong to
   * @param claimId - the source claim UUID
   * @param input - validated relation fields
   * @returns the created relation
   * @throws {ForbiddenError} when no ability is present or update on either endpoint is denied
   * @throws {NotFoundError} when the source claim, target claim, or summary does not exist
   * @throws {ValidationError} when the relation type is invalid or does not support claim-to-claim relations
   */
  async createRelation(
    summaryId: string,
    claimId: string,
    input: CreateClaimRelationInput,
  ): Promise<StoredRelation> {
    const { targetClaimId, relationTypeId, sourceSpans, targetSpans, confidence, notes } = input
    const userId = this.userId!

    const sourceClaim = await this.findClaimById(claimId)
    if (!sourceClaim || sourceClaim.summaryId !== summaryId) {
      throw new NotFoundError('Source claim', claimId)
    }

    const targetClaim = await this.findClaimById(targetClaimId)
    if (!targetClaim) {
      throw new NotFoundError('Target claim', targetClaimId)
    }

    // Relating two claims mutates both; require update on both endpoints.
    this.authorizeClaim('update', sourceClaim)
    this.authorizeClaim('update', targetClaim)

    const summary = await this.prisma.videoSummary.findUnique({ where: { id: summaryId } })
    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    // Validate relationTypeId against the persona's ontology (layers store).
    const { aggregate: ontology, exists: ontologyExists } = await readOntologyAggregate(
      this.prisma,
      summary.personaId,
    )
    if (ontologyExists) {
      const rawRelationTypes = ontology.relationTypes
      const relationType = rawRelationTypes.find(
        (rt): rt is Prisma.JsonObject =>
          typeof rt === 'object' && rt !== null && !Array.isArray(rt) && 'id' in rt && rt.id === relationTypeId,
      )

      if (!relationType) {
        throw new ValidationError(
          `Invalid relation type: ${relationTypeId}. Must be defined in persona's ontology.`,
        )
      }

      const rawSource = relationType.sourceTypes
      const rawTarget = relationType.targetTypes
      const sourceTypes = Array.isArray(rawSource) ? rawSource.filter((s): s is string => typeof s === 'string') : []
      const targetTypes = Array.isArray(rawTarget) ? rawTarget.filter((t): t is string => typeof t === 'string') : []

      const rtName = typeof relationType.name === 'string' ? relationType.name : relationTypeId
      if (!sourceTypes.includes('claim') || !targetTypes.includes('claim')) {
        throw new ValidationError(
          `Relation type '${rtName}' does not support claim-to-claim relations. Source types: [${sourceTypes.join(', ')}], Target types: [${targetTypes.join(', ')}]`,
        )
      }
    }

    // A retry or double-submit of the same (source, target, relationType) triple
    // must not mint a second identical edge. Reuse an existing matching relation
    // if one is already stored.
    const existingRelations = await this.readClaimRelations(sourceClaim)
    const duplicate = existingRelations.asSource.find(
      (r) => r.targetClaimId === targetClaimId && r.relationTypeId === relationTypeId,
    )
    if (duplicate) return duplicate

    // Derive the edge id from the (source, target, relationType) triple so two
    // concurrent identical requests resolve to the same primary-key row: the read
    // above cannot see an insert that has not committed, but both writes then
    // target the same id and the loser hits a unique violation, which collapses
    // to the stored edge rather than a second identical relation.
    const relationId = claimRelationEdgeId(claimId, targetClaimId, relationTypeId)
    const now = new Date().toISOString()
    const relation: StoredRelation = {
      id: relationId,
      sourceClaimId: claimId,
      targetClaimId,
      relationTypeId,
      sourceSpans: sourceSpans ?? null,
      targetSpans: targetSpans ?? null,
      confidence: confidence ?? null,
      notes: notes ?? null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    }
    try {
      await this.persistRelationEdge(relation, summaryId, sourceClaim.projectId ?? null)
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raced = await this.findRelationById(relationId)
        if (raced) return raced
      }
      throw err
    }

    return relation
  }

  /**
   * Lists a claim's relations (as source and as target), filtered so that the
   * other endpoint claim is also readable by the caller.
   *
   * @param summaryId - VideoSummary UUID the claim must belong to
   * @param claimId - Claim UUID
   * @returns the relations grouped by direction
   * @throws {ForbiddenError} when no ability is present or read on the claim is denied
   * @throws {NotFoundError} when the claim does not exist or belongs to another summary
   */
  async getRelations(
    summaryId: string,
    claimId: string,
  ): Promise<{ asSource: StoredRelation[]; asTarget: StoredRelation[] }> {
    const ability = this.requireAbility()

    const claim = await this.findClaimById(claimId)
    if (!claim || claim.summaryId !== summaryId) {
      throw new NotFoundError('Claim', claimId)
    }
    this.authorizeClaim('read', claim)

    const { asSource, asTarget } = await this.readClaimRelations(claim)

    // Keep only relations whose OPPOSITE endpoint claim is also readable;
    // otherwise relation payloads would leak the existence and metadata of claims
    // the caller cannot read. The known endpoint (claimId) is already proven
    // readable above, so the filter must check the OTHER endpoint, not this one.
    const otherReadable = async (otherId: string): Promise<boolean> => {
      const other = await this.findClaimById(otherId)
      return other != null && ability.can('read', subject('Claim', { ...other }))
    }

    const filteredSource: StoredRelation[] = []
    for (const relation of asSource) {
      if (await otherReadable(relation.targetClaimId)) filteredSource.push(relation)
    }
    const filteredTarget: StoredRelation[] = []
    for (const relation of asTarget) {
      if (await otherReadable(relation.sourceClaimId)) filteredTarget.push(relation)
    }

    return { asSource: filteredSource, asTarget: filteredTarget }
  }

  /**
   * Deletes a claim relation, authorizing against both endpoint claims.
   *
   * @param summaryId - VideoSummary UUID the source claim must belong to
   * @param relationId - ClaimRelation UUID
   * @throws {ForbiddenError} when no ability is present or update on either endpoint is denied
   * @throws {NotFoundError} when the relation does not exist or its source claim belongs to another summary
   */
  async deleteRelation(summaryId: string, relationId: string): Promise<void> {
    const relation = await this.findRelationById(relationId)
    if (!relation) {
      throw new NotFoundError('Relation', relationId)
    }

    const sourceClaim = await this.findClaimById(relation.sourceClaimId)
    const targetClaim = await this.findClaimById(relation.targetClaimId)
    if (!sourceClaim || sourceClaim.summaryId !== summaryId) {
      throw new NotFoundError('Relation', relationId)
    }
    if (!targetClaim) {
      throw new NotFoundError('Relation', relationId)
    }

    // Deleting a relation mutates both endpoints; require update on both.
    this.authorizeClaim('update', sourceClaim)
    this.authorizeClaim('update', targetClaim)

    await this.graphRepo.deleteEdge(relationId)
  }

  /**
   * Creates a claim for a (videoId, personaId) pair, auto-creating the
   * VideoSummary if needed.
   *
   * @param videoId - the video ID
   * @param personaId - the persona UUID
   * @param input - validated create fields
   * @returns the created claim and its summary ID
   * @throws {ForbiddenError} when no ability is present, the create is denied, an existing summary is not updatable, or a parent claim is not updatable
   * @throws {NotFoundError} when the video or persona does not exist
   * @throws {ValidationError} when the parent claim is invalid
   */
  async createVideoPersonaClaim(
    videoId: string,
    personaId: string,
    input: CreateVideoPersonaClaimInput,
  ): Promise<VideoPersonaClaimResponse> {
    const ability = this.requireAbility()
    const userId = this.userId!

    const video = await this.prisma.video.findUnique({ where: { id: videoId } })
    if (!video) {
      throw new NotFoundError('Video', videoId)
    }

    const persona = await this.prisma.persona.findUnique({
      where: { id: personaId },
      select: { id: true, projectId: true },
    })
    if (!persona) {
      throw new NotFoundError('Persona', personaId)
    }

    // Pre-authorize claim creation in the resolved project scope before
    // upserting a summary (which would otherwise leak persona-level state).
    if (!ability.can('create', subject('Claim', { projectId: persona.projectId, createdBy: userId }))) {
      throw new ForbiddenError('Cannot create this Claim')
    }

    // Idempotent create on a client-supplied id: a retry carrying the same id
    // must not mint a duplicate. Re-authorize against the existing row (so a
    // caller can't hijack another user's claim by supplying its id) and return
    // it, skipping the summary upsert.
    if (input.id) {
      const existing = await this.findClaimById(input.id)
      if (existing) {
        if (!ability.can('update', subject('Claim', { ...existing }))) {
          throw new ForbiddenError('Cannot create this Claim')
        }
        return { claim: existing, summaryId: existing.summaryId }
      }
    }

    // If an existing summary is present, the caller must also be able to update
    // it (we attach claims to it and auto-create it if missing).
    const existingSummary = await this.prisma.videoSummary.findUnique({
      where: { videoId_personaId: { videoId, personaId } },
    })
    if (existingSummary && !ability.can('update', subject('VideoSummary', existingSummary))) {
      throw new ForbiddenError('Cannot update this VideoSummary')
    }

    // Find or create the VideoSummary, stamping the persona's project scope and
    // the caller as owner so the auto-created parent is project-visible and owned
    // from birth (mirrors the child claim's projectId/createdBy stamping below).
    // Without the stamp the parent is born projectId = NULL and a project
    // collaborator is 403'd at the parent-summary read gate.
    const summary = await this.prisma.videoSummary.upsert({
      where: { videoId_personaId: { videoId, personaId } },
      create: {
        videoId,
        personaId,
        summary: [],
        projectId: persona.projectId ?? undefined,
        createdBy: userId,
      },
      update: {},
    })

    if (input.parentClaimId) {
      const { claims } = await this.readClaims(summary.id)
      const parent = claims.find((c) => c.id === input.parentClaimId)
      if (!parent || parent.summaryId !== summary.id) {
        throw new ValidationError('Invalid parent claim')
      }
      this.authorizeClaim('update', parent)
    }

    const layerId = await this.ensureClaimSpanLayer(summary)
    const claim = this.buildClaim(summary, 'video', input, persona.projectId ?? null)
    try {
      await this.persistClaimNode(layerId, claim)
    } catch (err) {
      // Lost the same-id race: re-authorize the stored row and return it
      // idempotently rather than surfacing a raw P2002 as a 500.
      if (input.id && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.findClaimById(input.id)
        if (existing) {
          if (!ability.can('update', subject('Claim', { ...existing }))) {
            throw new ForbiddenError('Cannot create this Claim')
          }
          return { claim: existing, summaryId: existing.summaryId }
        }
      }
      throw err
    }

    return { claim, summaryId: summary.id }
  }

  /**
   * Maps a BullMQ job to the API job-status response: BullMQ state mapped to an
   * API state string, numeric progress (or null), and the result or error.
   */
  private async mapJobStatus(job: Job): Promise<JobStatusResponse> {
    const state = await job.getState()
    const progress = typeof job.progress === 'number' ? job.progress : null

    let status: string
    if (state === 'completed') {
      status = 'completed'
    } else if (state === 'failed') {
      status = 'failed'
    } else if (state === 'active') {
      status = 'processing'
    } else {
      status = 'queued'
    }

    let result = null
    let error = null

    if (state === 'completed') {
      result = job.returnvalue
    } else if (state === 'failed') {
      error = job.failedReason || 'Job failed'
    }

    return { jobId: job.id ?? '', status, progress, result, error }
  }
}
