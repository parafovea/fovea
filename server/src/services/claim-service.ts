import { Claim, ClaimRelation, Prisma } from '@prisma/client'
import { Job } from 'bullmq'
import { accessibleBy } from '@casl/prisma'
import { subject } from '@casl/ability'
import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, ValidationError, ForbiddenError } from '../lib/errors.js'
import {
  claimExtractionQueue,
  ClaimExtractionJobData,
  claimSynthesisQueue,
  ClaimSynthesisJobData,
} from '../queues/setup.js'
import {
  ClaimRepository,
  ClaimWithSubclaimTree,
  ClaimWithSubclaimsAndParent,
} from '../repositories/ClaimRepository.js'

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
  claim: Claim
  summaryId: string
}

/** A claim node in a recursive tree (subclaims nested). */
interface ClaimTreeNode {
  subclaims?: ClaimTreeNode[]
}

/**
 * Counts all claims in a tree recursively.
 *
 * @param claims - the root claims
 * @returns the total number of claims, including all nested subclaims
 */
function countAllClaims(claims: ClaimTreeNode[]): number {
  let count = claims.length
  for (const claim of claims) {
    if (claim.subclaims && claim.subclaims.length > 0) {
      count += countAllClaims(claim.subclaims)
    }
  }
  return count
}

/**
 * Calculates the maximum depth of a claim tree recursively.
 *
 * @param claims - the root claims
 * @param currentDepth - the depth of the current level (0 for roots)
 * @returns the maximum subclaim nesting depth
 */
function calculateMaxDepth(claims: ClaimTreeNode[], currentDepth: number = 0): number {
  let maxDepth = currentDepth
  for (const claim of claims) {
    if (claim.subclaims && claim.subclaims.length > 0) {
      const depth = calculateMaxDepth(claim.subclaims, currentDepth + 1)
      maxDepth = Math.max(maxDepth, depth)
    }
  }
  return maxDepth
}

/**
 * Owns claim business rules and authorization, delegating all data access to a
 * ClaimRepository. Construct one per request from the request-scoped CASL
 * ability and the authenticated user's id and system role.
 *
 * Per-resource authorization fetches the row first, then checks
 * `ability.can(action, subject('Claim' | 'VideoSummary', row))`. List filtering
 * uses `accessibleBy(ability, 'read').Claim`. The ability already encodes the
 * caller's project memberships and ownership, so the service makes no separate
 * admin branch.
 *
 * @example
 * ```typescript
 * const service = new ClaimService(repository, request.ability ?? null, request.user?.id, request.user?.systemRole)
 * const claims = await service.listClaims(summaryId, { summaryType: 'video' })
 * ```
 */
export class ClaimService {
  constructor(
    private readonly repository: ClaimRepository,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined,
    /**
     * The caller's system role. CASL already grants `manage all` to
     * system_admin, so the service needs no separate admin branch; the
     * parameter is accepted to keep the construction signature uniform across
     * the domain services.
     */
    _systemRole: string | undefined
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

  /**
   * Rebuilds the denormalized `claimsJson` on the parent summary from the
   * current claim tree.
   *
   * @param summaryId - VideoSummary UUID
   * @param summaryType - the summary type ("video" or "collection")
   */
  private async updateSummaryClaimsJson(summaryId: string, summaryType: string): Promise<void> {
    // Fetch all root claims with nested subclaims (up to 3 levels deep)
    const claims = await this.repository.findClaimTree(summaryId, summaryType)

    // Calculate metadata
    const totalClaims = countAllClaims(claims)
    const maxDepth = calculateMaxDepth(claims)

    const claimsJson = {
      version: '1.0',
      claims,
      metadata: {
        extractedAt: new Date().toISOString(),
        totalClaims,
        totalSubclaims: totalClaims - claims.length,
        maxDepth,
      },
    }

    // Update summary based on type
    if (summaryType === 'video') {
      await this.repository.updateVideoSummaryClaimsJson(
        summaryId,
        claimsJson as unknown as Prisma.InputJsonValue,
        new Date()
      )
    }
    // Future: Add collection summary support
  }

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
    options: { summaryType?: 'video' | 'collection'; includeSubclaims?: boolean; minConfidence?: number }
  ): Promise<Claim[] | ClaimWithSubclaimTree[]> {
    const { summaryType = 'video', includeSubclaims = true, minConfidence } = options
    const ability = this.requireAbility()

    // Verify summary exists
    const summary = summaryType === 'video'
      ? await this.repository.findVideoSummaryById(summaryId)
      : null // Future: Add collection summary support

    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    // Defense in depth: even if a caller knows another user's
    // summaryId, deny the claim listing. Without this, the summaries-
    // list scoping is the only gate, and a known summaryId would
    // unconditionally surface its claims.
    if (!ability.can('read', subject('VideoSummary', summary))) {
      throw new ForbiddenError('Cannot read claims under this Summary')
    }

    // Query root claims filtered by caller's read ability on Claim.
    return this.repository.findRootClaims(
      {
        AND: [
          {
            summaryId,
            summaryType,
            parentClaimId: null,
            ...(minConfidence && { confidence: { gte: minConfidence } }),
          },
          accessibleBy(ability, 'read').Claim,
        ],
      },
      includeSubclaims
    )
  }

  /**
   * Gets a single claim by ID with its subclaim tree and parent.
   *
   * @param summaryId - VideoSummary UUID the claim must belong to
   * @param claimId - Claim UUID
   * @returns the claim with subclaims and parent
   * @throws {ForbiddenError} when no ability is present or read is denied
   * @throws {NotFoundError} when the claim does not exist or belongs to another summary
   */
  async getClaim(summaryId: string, claimId: string): Promise<ClaimWithSubclaimsAndParent> {
    const ability = this.requireAbility()

    const claim = await this.repository.findClaimWithSubclaimsAndParent(claimId)

    if (!claim || claim.summaryId !== summaryId) {
      throw new NotFoundError('Claim', claimId)
    }

    if (!ability.can('read', subject('Claim', claim))) {
      throw new ForbiddenError('Cannot read this Claim')
    }

    return claim
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
  async createClaim(summaryId: string, input: CreateClaimInput): Promise<ClaimWithSubclaimTree[]> {
    const { id, text, gloss, parentClaimId, summaryType, audio, video, metadata, comment, ...rest } = input
    const ability = this.requireAbility()
    const userId = this.userId!

    // Verify summary exists; resolve projectId for authorization scope.
    const summary = summaryType === 'video'
      ? await this.repository.findVideoSummaryById(summaryId)
      : null

    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    // The parent summary must be one the caller can read; otherwise A
    // could attach claims under B's summary (the create candidate
    // carries createdBy=A so the generic create rule passes even when
    // the parent summary belongs to B).
    if (!ability.can('read', subject('VideoSummary', summary))) {
      throw new ForbiddenError('Cannot create a claim under this Summary')
    }

    // Pre-authorize create on a candidate Claim in the resolved scope. The
    // candidate carries the final projectId and createdBy so CASL's
    // MongoQuery conditions resolve against actual field values.
    const candidate = subject('Claim', {
      projectId: summary.projectId,
      createdBy: userId,
    })
    if (!ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create this Claim')
    }

    // If parentClaimId provided, verify it exists and belongs to same
    // summary, and that the caller can update it (sub-claim attaches to it).
    if (parentClaimId) {
      const parentClaim = await this.repository.findClaimById(parentClaimId)

      if (!parentClaim || parentClaim.summaryId !== summaryId) {
        throw new ValidationError('Invalid parent claim')
      }
      if (!ability.can('update', subject('Claim', parentClaim))) {
        throw new ForbiddenError('Cannot update this Claim')
      }
    }

    // Idempotent create on a client-supplied id: a network retry / resend
    // carrying the same id must not mint a duplicate. If the claim already
    // exists, re-authorize against it (so a caller cannot hijack another
    // user's claim by supplying its id) and return the current tree.
    if (id) {
      const existing = await this.repository.findClaimById(id)
      if (existing) {
        if (!ability.can('update', subject('Claim', existing))) {
          throw new ForbiddenError('Cannot create this Claim')
        }
        return this.repository.findClaimTree(summaryId, summaryType)
      }
    }

    // Convert null JSON fields to Prisma.JsonNull. Never trust request body
    // for createdBy; always stamp from authenticated session.
    const claimData: Prisma.ClaimUncheckedCreateInput = {
      id: id || undefined,
      summaryId,
      summaryType,
      text,
      gloss: (gloss || []) as unknown as Prisma.InputJsonValue,
      parentClaimId: parentClaimId || undefined,
      extractionStrategy: 'manual',
      audio: audio === null ? Prisma.JsonNull : (audio ?? Prisma.JsonNull),
      video: video === null ? Prisma.JsonNull : (video ?? Prisma.JsonNull),
      metadata: metadata === null ? Prisma.JsonNull : (metadata ?? Prisma.JsonNull),
      comment: comment || undefined,
      projectId: summary.projectId ?? undefined,
      ...this.toClaimScalars(rest),
      createdBy: userId,
    }

    // Create claim. On a concurrent same-id insert (P2002), collapse to the
    // idempotent path instead of surfacing a 500.
    try {
      await this.repository.createClaim(claimData)
    } catch (err) {
      if (id && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.repository.findClaimById(id)
        if (existing && ability.can('update', subject('Claim', existing))) {
          return this.repository.findClaimTree(summaryId, summaryType)
        }
      }
      throw err
    }

    // Update denormalized claimsJson
    await this.updateSummaryClaimsJson(summaryId, summaryType)

    // Fetch and return complete claims tree
    return this.repository.findClaimTree(summaryId, summaryType)
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
  async updateClaim(summaryId: string, claimId: string, input: UpdateClaimInput): Promise<ClaimWithSubclaimTree[]> {
    const { audio, video, metadata, comment, ...rest } = input
    const ability = this.requireAbility()

    // Verify claim exists and belongs to summary
    const existingClaim = await this.repository.findClaimById(claimId)

    if (!existingClaim || existingClaim.summaryId !== summaryId) {
      throw new NotFoundError('Claim', claimId)
    }

    if (!ability.can('update', subject('Claim', existingClaim))) {
      throw new ForbiddenError('Cannot update this Claim')
    }

    // Convert null JSON fields to Prisma.JsonNull
    const updateData: Prisma.ClaimUpdateInput = {
      ...this.toClaimScalars(rest),
      ...(audio !== undefined && { audio: audio === null ? Prisma.JsonNull : audio }),
      ...(video !== undefined && { video: video === null ? Prisma.JsonNull : video }),
      ...(metadata !== undefined && { metadata: metadata === null ? Prisma.JsonNull : metadata }),
      ...(comment !== undefined && { comment }),
    }

    // Update claim
    await this.repository.updateClaim(claimId, updateData)

    // Update denormalized claimsJson
    await this.updateSummaryClaimsJson(summaryId, existingClaim.summaryType)

    // Fetch and return complete claims tree
    return this.repository.findClaimTree(summaryId, existingClaim.summaryType)
  }

  /**
   * Deletes a claim (cascading to its subclaims) and rebuilds the denormalized
   * claim tree on the parent summary.
   *
   * @param summaryId - VideoSummary UUID the claim must belong to
   * @param claimId - Claim UUID
   * @throws {ForbiddenError} when no ability is present or delete is denied
   * @throws {NotFoundError} when the claim does not exist or belongs to another summary
   */
  async deleteClaim(summaryId: string, claimId: string): Promise<void> {
    const ability = this.requireAbility()

    // Verify claim exists and belongs to summary
    const claim = await this.repository.findClaimById(claimId)

    if (!claim || claim.summaryId !== summaryId) {
      throw new NotFoundError('Claim', claimId)
    }

    if (!ability.can('delete', subject('Claim', claim))) {
      throw new ForbiddenError('Cannot delete this Claim')
    }

    // Delete claim (cascades to subclaims via onDelete: Cascade)
    await this.repository.deleteClaim(claimId)

    // Update denormalized claimsJson
    await this.updateSummaryClaimsJson(summaryId, claim.summaryType)
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

    // Verify summary exists
    const summary = summaryType === 'video'
      ? await this.repository.findVideoSummaryById(summaryId)
      : null

    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    // Extraction writes claims and updates the parent summary's claimsJson;
    // require update rights on the summary it targets.
    if (!ability.can('update', subject('VideoSummary', summary))) {
      throw new ForbiddenError('Cannot update this VideoSummary')
    }

    // Queue extraction job using BullMQ
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

    const job = await claimExtractionQueue.add(
      'extract-claims',
      jobData,
      {
        jobId: `claims-${summaryId}-${Date.now()}`,
      }
    )

    return {
      jobId: job.id ?? '',
      status: 'queued',
      summaryId,
    }
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

    // Get job from queue
    const job = await claimExtractionQueue.getJob(jobId)

    if (!job) {
      throw new NotFoundError('Job', jobId)
    }

    // Authorize against the summary targeted by this job so job-status
    // probing can't leak existence of other users' summaries.
    const targetSummaryId = isClaimExtractionData(job.data) ? job.data.summaryId : undefined
    if (targetSummaryId) {
      const existing = await this.repository.findVideoSummaryById(targetSummaryId)
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

    // Verify summary exists and has claims
    const summary = await this.repository.findVideoSummaryWithRootClaim(summaryId)

    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    // Synthesis writes to the parent summary (updates its text/gloss);
    // require update rights.
    if (!ability.can('update', subject('VideoSummary', summary))) {
      throw new ForbiddenError('Cannot update this VideoSummary')
    }

    if (!summary.claims || summary.claims.length === 0) {
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

    const job = await claimSynthesisQueue.add(
      'synthesize-summary',
      jobData,
      {
        jobId: `synthesis-${summaryId}-${Date.now()}`,
      }
    )

    return {
      jobId: job.id ?? '',
      status: 'queued',
      summaryId,
    }
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

    // Get job from queue
    const job = await claimSynthesisQueue.getJob(jobId)

    if (!job) {
      throw new NotFoundError('Job', jobId)
    }

    // Authorize against the summary targeted by this job.
    const targetSummaryId = isClaimSynthesisData(job.data) ? job.data.summaryId : undefined
    if (targetSummaryId) {
      const existing = await this.repository.findVideoSummaryById(targetSummaryId)
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
  async createRelation(summaryId: string, claimId: string, input: CreateClaimRelationInput): Promise<ClaimRelation> {
    const { targetClaimId, relationTypeId, sourceSpans, targetSpans, confidence, notes } = input
    const ability = this.requireAbility()
    const userId = this.userId!

    // Verify source claim exists
    const sourceClaim = await this.repository.findClaimById(claimId)

    if (!sourceClaim || sourceClaim.summaryId !== summaryId) {
      throw new NotFoundError('Source claim', claimId)
    }

    // Verify target claim exists
    const targetClaim = await this.repository.findClaimById(targetClaimId)

    if (!targetClaim) {
      throw new NotFoundError('Target claim', targetClaimId)
    }

    // Relating two claims mutates both; require update on both endpoints.
    if (!ability.can('update', subject('Claim', sourceClaim))) {
      throw new ForbiddenError('Cannot update this Claim')
    }
    if (!ability.can('update', subject('Claim', targetClaim))) {
      throw new ForbiddenError('Cannot update this Claim')
    }

    // Get summary to find persona and ontology
    const summary = await this.repository.findVideoSummaryWithPersonaOntology(summaryId)

    if (!summary) {
      throw new NotFoundError('Summary', summaryId)
    }

    // Validate relationTypeId against ontology
    if (summary.persona.ontology) {
      const rawRelationTypes = Array.isArray(summary.persona.ontology.relationTypes)
        ? summary.persona.ontology.relationTypes
        : []
      const relationType = rawRelationTypes.find(
        (rt): rt is Prisma.JsonObject =>
          typeof rt === 'object' && rt !== null && !Array.isArray(rt) && 'id' in rt && rt.id === relationTypeId
      )

      if (!relationType) {
        throw new ValidationError(`Invalid relation type: ${relationTypeId}. Must be defined in persona's ontology.`)
      }

      // Check that this relation type allows claim→claim relations
      const rawSource = relationType.sourceTypes
      const rawTarget = relationType.targetTypes
      const sourceTypes = Array.isArray(rawSource) ? rawSource.filter((s): s is string => typeof s === 'string') : []
      const targetTypes = Array.isArray(rawTarget) ? rawTarget.filter((t): t is string => typeof t === 'string') : []

      const rtName = typeof relationType.name === 'string' ? relationType.name : relationTypeId
      if (!sourceTypes.includes('claim') || !targetTypes.includes('claim')) {
        throw new ValidationError(`Relation type '${rtName}' does not support claim-to-claim relations. Source types: [${sourceTypes.join(', ')}], Target types: [${targetTypes.join(', ')}]`)
      }
    }

    // Create relation; stamp createdBy from the authenticated session. The
    // (sourceClaimId, targetClaimId, relationTypeId) triple is unique, so a
    // retry or double-submit is idempotent: on a duplicate, return the existing
    // relation rather than minting a second identical row.
    try {
      return await this.repository.createClaimRelation({
        sourceClaimId: claimId,
        targetClaimId,
        relationTypeId,
        sourceSpans: (sourceSpans || undefined) as unknown as Prisma.InputJsonValue | undefined,
        targetSpans: (targetSpans || undefined) as unknown as Prisma.InputJsonValue | undefined,
        confidence,
        notes,
        createdBy: userId,
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.repository.findClaimRelations({
          sourceClaimId: claimId,
          targetClaimId,
          relationTypeId,
        })
        if (existing[0]) return existing[0]
      }
      throw error
    }
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
    claimId: string
  ): Promise<{ asSource: ClaimRelation[]; asTarget: ClaimRelation[] }> {
    const ability = this.requireAbility()

    // Verify claim exists
    const claim = await this.repository.findClaimById(claimId)

    if (!claim || claim.summaryId !== summaryId) {
      throw new NotFoundError('Claim', claimId)
    }

    if (!ability.can('read', subject('Claim', claim))) {
      throw new ForbiddenError('Cannot read this Claim')
    }

    // Filter relations to those whose OTHER endpoint claim is also readable;
    // otherwise we'd leak the existence and metadata of claims the caller can't
    // see via relation payloads. The known endpoint (claimId) is already proven
    // readable above, so an OR over either endpoint would always pass and filter
    // nothing — each query must require the OPPOSITE endpoint to be accessible.
    const accessibleClaims = accessibleBy(ability, 'read').Claim

    const asSource = await this.repository.findClaimRelations({
      AND: [
        { sourceClaimId: claimId },
        { targetClaim: accessibleClaims },
      ],
    })

    const asTarget = await this.repository.findClaimRelations({
      AND: [
        { targetClaimId: claimId },
        { sourceClaim: accessibleClaims },
      ],
    })

    return { asSource, asTarget }
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
    const ability = this.requireAbility()

    // Verify relation exists; load both endpoint claims for auth.
    const relation = await this.repository.findClaimRelationWithEndpoints(relationId)

    if (!relation || relation.sourceClaim.summaryId !== summaryId) {
      throw new NotFoundError('Relation', relationId)
    }

    // Deleting a relation mutates both endpoints; require update on both.
    if (!ability.can('update', subject('Claim', relation.sourceClaim))) {
      throw new ForbiddenError('Cannot update this Claim')
    }
    if (!ability.can('update', subject('Claim', relation.targetClaim))) {
      throw new ForbiddenError('Cannot update this Claim')
    }

    // Delete relation
    await this.repository.deleteClaimRelation(relationId)
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
    input: CreateVideoPersonaClaimInput
  ): Promise<VideoPersonaClaimResponse> {
    const { id, text, gloss, parentClaimId, audio, video: videoModality, metadata, comment, ...rest } = input
    const ability = this.requireAbility()
    const userId = this.userId!

    // Verify video exists
    const video = await this.repository.findVideoById(videoId)
    if (!video) {
      throw new NotFoundError('Video', videoId)
    }

    // Verify persona exists; resolve project scope for authorization.
    const persona = await this.repository.findPersonaProjectScope(personaId)
    if (!persona) {
      throw new NotFoundError('Persona', personaId)
    }

    // Pre-authorize claim creation in the resolved project scope before
    // upserting a summary (which would otherwise leak persona-level state).
    const candidate = subject('Claim', {
      projectId: persona.projectId,
      createdBy: userId,
    })
    if (!ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create this Claim')
    }

    // Idempotent create on a client-supplied id: a retry carrying the same id
    // must not mint a duplicate. Re-authorize against the existing row (so a
    // caller can't hijack another user's claim by supplying its id) and return
    // it, skipping the summary upsert.
    if (id) {
      const existing = await this.repository.findClaimById(id)
      if (existing) {
        if (!ability.can('update', subject('Claim', existing))) {
          throw new ForbiddenError('Cannot create this Claim')
        }
        return { claim: existing, summaryId: existing.summaryId }
      }
    }

    // If an existing summary is present, the caller must also be able to
    // update it (we attach claims to it and auto-create it if missing).
    const existingSummary = await this.repository.findVideoSummaryByVideoPersona(videoId, personaId)
    if (existingSummary && !ability.can('update', subject('VideoSummary', existingSummary))) {
      throw new ForbiddenError('Cannot update this VideoSummary')
    }

    // Find or create VideoSummary, stamping the persona's project scope and
    // the caller as owner so the auto-created parent is project-visible and
    // owned (mirrors the child claim's projectId/createdBy stamping below).
    const summary = await this.repository.upsertEmptyVideoSummary(
      videoId,
      personaId,
      persona.projectId,
      userId,
    )

    // If parentClaimId provided, verify it exists and belongs to same
    // summary, and that the caller can update it.
    if (parentClaimId) {
      const parentClaim = await this.repository.findClaimById(parentClaimId)

      if (!parentClaim || parentClaim.summaryId !== summary.id) {
        throw new ValidationError('Invalid parent claim')
      }
      if (!ability.can('update', subject('Claim', parentClaim))) {
        throw new ForbiddenError('Cannot update this Claim')
      }
    }

    // Convert null JSON fields to Prisma.JsonNull. Never trust request
    // body for createdBy; always stamp from the authenticated session.
    const claimData: Prisma.ClaimUncheckedCreateInput = {
      id: id || undefined,
      summaryId: summary.id,
      summaryType: 'video',
      text,
      gloss: (gloss || []) as unknown as Prisma.InputJsonValue,
      parentClaimId: parentClaimId || undefined,
      extractionStrategy: 'manual',
      audio: audio === null ? Prisma.JsonNull : (audio ?? Prisma.JsonNull),
      video: videoModality === null ? Prisma.JsonNull : (videoModality ?? Prisma.JsonNull),
      metadata: metadata === null ? Prisma.JsonNull : (metadata ?? Prisma.JsonNull),
      comment: comment || undefined,
      projectId: persona.projectId ?? undefined,
      ...this.toClaimScalars(rest),
      createdBy: userId,
    }

    // Create claim. On a concurrent same-id insert (P2002), collapse to the
    // idempotent path instead of surfacing a 500.
    let claim
    try {
      claim = await this.repository.createClaim(claimData)
    } catch (err) {
      if (id && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.repository.findClaimById(id)
        if (existing && ability.can('update', subject('Claim', existing))) {
          return { claim: existing, summaryId: existing.summaryId }
        }
      }
      throw err
    }

    return {
      claim,
      summaryId: summary.id,
    }
  }

  /**
   * Normalizes the residual scalar/JSON fields (textSpans, timeSpans, claimer
   * fields, world-state references) into a Prisma-safe shape, mirroring the
   * route's `...rest` spread into the claim create/update input.
   */
  private toClaimScalars(rest: {
    textSpans?: ClaimTextSpanInput[]
    timeSpans?: ClaimTimeSpanInput[]
    claimerType?: string | null
    claimerGloss?: GlossItemInput[]
    claimRelation?: GlossItemInput[]
    claimEventId?: string
    claimTimeId?: string
    claimLocationId?: string
    confidence?: number
  }): Record<string, unknown> {
    return rest as Record<string, unknown>
  }

  /**
   * Maps a BullMQ job to the API job-status response: BullMQ state mapped to an
   * API state string, numeric progress (or null), and the result or error.
   */
  private async mapJobStatus(job: Job): Promise<JobStatusResponse> {
    // Get job state
    const state = await job.getState()
    const progress = typeof job.progress === 'number' ? job.progress : null

    // Map BullMQ states to API states
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

    // Get result or error
    let result = null
    let error = null

    if (state === 'completed') {
      result = job.returnvalue
    } else if (state === 'failed') {
      error = job.failedReason || 'Job failed'
    }

    return {
      jobId: job.id ?? '',
      status,
      progress,
      result,
      error,
    }
  }
}
