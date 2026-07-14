import { createHash, randomUUID } from 'node:crypto'
import { Prisma, type Expression as PrismaExpression } from '@prisma/client'
import { subject } from '@casl/ability'
import { accessibleBy } from '@casl/prisma'
import type { Token } from '@fovea/layers-schema'
import type { AppAbility } from '../lib/abilities.js'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.js'
import { prisma } from '../lib/prisma.js'
import { secToMs } from './layers-conversion-service.js'
import { VideoAccessService } from './video-access-service.js'
import {
  ExpressionRepository,
  type ExpressionDetail,
  type ExpressionWithTokens,
} from '../repositories/ExpressionRepository.js'

/**
 * Converts a typed value to Prisma.InputJsonValue for storage in a JSON column.
 * Prisma JSON columns accept any serializable value at runtime; this bridges the
 * TypeScript gap without an unsafe cast.
 */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value))
}

/** sha256 hex digest of a string, captured at ingest for drift detection. */
function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/**
 * A transcript segment as stored in `VideoSummary.transcriptJson.segments`.
 * Times are in seconds.
 */
interface TranscriptSegment {
  start: number
  end: number
  text: string
  speaker?: string
  confidence?: number
  sentiment?: string
}

/** The `VideoSummary.transcriptJson` shape: ordered segments plus metadata. */
interface TranscriptJson {
  segments: TranscriptSegment[]
  speakers?: string[]
  language?: string
}

/** The subset of `Video.metadata` the text materializer reads. */
interface VideoTextMetadata {
  description?: string
  title?: string
  language?: string
}

/**
 * Narrows an unknown JSON value to a TranscriptJson, or returns null when it
 * carries no usable segment array.
 */
function asTranscriptJson(value: Prisma.JsonValue | null): TranscriptJson | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const segments = (value as { segments?: unknown }).segments
  if (!Array.isArray(segments)) return null
  return value as unknown as TranscriptJson
}

/** Narrows an unknown JSON value to the video-metadata text fields. */
function asVideoTextMetadata(value: Prisma.JsonValue | null): VideoTextMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as unknown as VideoTextMetadata
}

/**
 * Tokenizes text on whitespace into layers {@link Token}s, recording UTF-8 byte
 * offsets (and character offsets) into the source string so annotation spans can
 * index back into the expression text.
 */
function whitespaceTokens(text: string): Token[] {
  const tokens: Token[] = []
  const re = /\S+/g
  let match: RegExpExecArray | null
  let index = 0
  while ((match = re.exec(text)) !== null) {
    const charStart = match.index
    const charEnd = match.index + match[0].length
    tokens.push({
      tokenIndex: index++,
      text: match[0],
      textSpan: {
        byteStart: Buffer.byteLength(text.slice(0, charStart), 'utf8'),
        byteEnd: Buffer.byteLength(text.slice(0, charEnd), 'utf8'),
        charStart,
        charEnd,
      },
    })
  }
  return tokens
}

/**
 * Builds the ASR transcript's full text and one layers {@link Token} per
 * transcript segment. Each token carries the segment's UTF-8 byte span into the
 * concatenated text and its temporal span in milliseconds (seconds mapped
 * through {@link secToMs}). Segments are joined with newlines.
 *
 * @returns the concatenated text and the per-segment token stream
 */
function transcriptToTokens(segments: TranscriptSegment[]): { text: string; tokens: Token[] } {
  const positioned: Array<{ segment: TranscriptSegment; charStart: number; charEnd: number }> = []
  let text = ''
  segments.forEach((segment, i) => {
    if (i > 0) text += '\n'
    const charStart = text.length
    text += segment.text
    const charEnd = text.length
    positioned.push({ segment, charStart, charEnd })
  })

  const tokens: Token[] = positioned.map(({ segment, charStart, charEnd }, i) => ({
    tokenIndex: i,
    text: segment.text,
    textSpan: {
      byteStart: Buffer.byteLength(text.slice(0, charStart), 'utf8'),
      byteEnd: Buffer.byteLength(text.slice(0, charEnd), 'utf8'),
      charStart,
      charEnd,
    },
    temporalSpan: { start: secToMs(segment.start), ending: secToMs(segment.end) },
  }))

  return { text, tokens }
}

/** Fields accepted when creating a standalone document expression. */
export interface CreateDocumentInput {
  /** Optional client-generated id; when it already exists the create is idempotent. */
  id?: string
  text: string
  title?: string
  languages?: string[]
  projectId?: string | null
  metadata?: unknown
  features?: unknown
}

/** Pagination for the document grid. */
export interface DocumentListOptions {
  skip: number
  take: number
}

/**
 * API-facing shape of one nested row inside an expression detail. JSON columns
 * pass through as `unknown`; dates become ISO strings.
 */
type Json = unknown

/** Owns the text-expression business rules and RBAC for the layers store:
 * the single privileged expression detail read, on-demand materialization of a
 * video's metadata-text and ASR-transcript expressions, and standalone document
 * creation and listing. Data access is delegated to an ExpressionRepository;
 * every authorization decision (CASL row `read`, create pre-checks, the
 * `accessibleBy` list filter) is made here. Construct one per request from the
 * request-scoped CASL ability and the authenticated user's id.
 *
 * @example
 * ```typescript
 * const service = new TextExpressionService(repo, request.ability ?? null, request.user?.id)
 * const detail = await service.getExpressionDetail(id)
 * ```
 */
export class TextExpressionService {
  constructor(
    private readonly repository: ExpressionRepository,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined
  ) {}

  /** Resolves the authenticated user id or throws. */
  private requireUserId(): string {
    if (!this.userId) throw new UnauthorizedError('Authentication required')
    return this.userId
  }

  /** Authorizes an action on an expression row, throwing when denied. */
  private authorize(action: 'read' | 'update' | 'delete', row: PrismaExpression): void {
    if (this.ability && !this.ability.can(action, subject('Expression', row))) {
      throw new ForbiddenError(`Cannot ${action} this Expression`)
    }
  }

  /** Pre-authorizes creating an expression in a given ownership/project scope. */
  private authorizeCreate(projectId: string | null, userId: string): void {
    if (!this.ability) return
    const candidate = subject('Expression', { projectId, createdByUserId: userId })
    if (!this.ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create Expression in this scope')
    }
  }

  /**
   * Loads an expression with its tokenizations, annotation layers (with their
   * annotations and relations), and segmentations, enforcing a CASL row-level
   * read check.
   *
   * @param id - Expression UUID
   * @returns the mapped expression detail
   * @throws {NotFoundError} when the expression does not exist
   * @throws {ForbiddenError} when read access is denied
   */
  async getExpressionDetail(id: string): Promise<Record<string, Json>> {
    const detail = await this.repository.findExpressionDetail(id)
    if (!detail) throw new NotFoundError('Expression', id)
    this.authorize('read', detail)
    return this.mapDetail(detail)
  }

  /**
   * Materializes (and stores) the text expressions projected from a video:
   * the metadata-text expression from `Video.metadata` and the ASR-transcript
   * expression + segmentation from a summary's `transcriptJson`.
   *
   * Materialization is per-user and idempotent under a source digest: an
   * existing expression whose stored `sourceDigest` matches the freshly hashed
   * source text is returned unchanged; a drifted one is rebuilt (the stale row
   * and its cascade are dropped and re-created); absent sources are skipped.
   *
   * @param videoId - source Video UUID
   * @returns the materialized text expressions with their token decomposition
   * @throws {NotFoundError} when the video does not exist or the caller cannot access it
   * @throws {ForbiddenError} when create access is denied
   */
  async materializeVideoTextExpressions(videoId: string): Promise<Array<Record<string, Json>>> {
    const userId = this.requireUserId()
    const video = await this.repository.findVideoById(videoId)
    if (!video) throw new NotFoundError('Video', videoId)
    await this.assertVideoAccessible(videoId, userId)

    const results: ExpressionWithTokens[] = []

    // 1. Metadata-text expression (tweet/description). Skip when the video
    //    carries no usable metadata text.
    const meta = asVideoTextMetadata(video.metadata)
    const metaText = (meta.description ?? meta.title ?? '').trim()
    if (metaText.length > 0) {
      const languages = meta.language ? [meta.language] : []
      const metaExpr = await this.upsertMaterialized({
        videoId,
        userId,
        sourceKind: 'video-metadata-text',
        kind: 'social-media',
        text: metaText,
        languages,
        buildTokens: false,
      })
      results.push(metaExpr)
    }

    // 2. ASR-transcript expression + segmentation, built from the first
    //    transcript-bearing summary the caller can read. Gate on the source
    //    summary's CASL read, mirroring the /summaries routes: a summary the
    //    caller cannot read is skipped rather than having its transcript
    //    materialized into a caller-owned expression, so another user's
    //    private transcript is never exposed. When an earlier summary is
    //    unreadable but a later one is readable, the readable transcript is
    //    still materialized.
    const summaries = await this.repository.findSummariesWithTranscript(videoId)
    const readableSummary =
      summaries.find(
        (candidate) => !this.ability || this.ability.can('read', subject('VideoSummary', candidate))
      ) ?? null
    const transcript = readableSummary ? asTranscriptJson(readableSummary.transcriptJson) : null
    if (readableSummary && transcript && transcript.segments.length > 0) {
      const { text, tokens } = transcriptToTokens(transcript.segments)
      const languages = transcript.language ? [transcript.language] : []
      const asrExpr = await this.upsertMaterialized({
        videoId,
        userId,
        sourceKind: 'asr-transcript',
        kind: 'transcript',
        text,
        languages,
        buildTokens: true,
        tokens,
        videoSummaryId: readableSummary.id,
      })
      results.push(asrExpr)
    }

    return results.map((row) => this.mapWithTokens(row))
  }

  /**
   * Gates access to a source video, mirroring the /videos routes: the caller
   * may materialize only videos assigned to their projects (or assigned to them
   * directly), plus globally-unassigned videos; system admins may materialize
   * any. Throws {@link NotFoundError} (never a distinct 403) when the video is
   * inaccessible so its existence is not leaked, matching GET
   * /api/videos/:videoId.
   */
  private async assertVideoAccessible(videoId: string, userId: string): Promise<void> {
    const systemRole = this.ability?.can('manage', 'all') ? 'system_admin' : 'user'
    const accessible = await new VideoAccessService(prisma).getAccessibleVideoIds(
      userId,
      systemRole
    )
    if (accessible !== 'all' && !accessible.includes(videoId)) {
      throw new NotFoundError('Video', videoId)
    }
  }

  /**
   * Reuses or rebuilds one materialized text expression under a source-digest
   * guard, optionally attaching a segmentation + tokenization for token-bearing
   * sources (the ASR transcript).
   */
  private async upsertMaterialized(args: {
    videoId: string
    userId: string
    sourceKind: string
    kind: string
    text: string
    languages: string[]
    buildTokens: boolean
    tokens?: Token[]
    videoSummaryId?: string
  }): Promise<ExpressionWithTokens> {
    const { videoId, userId, sourceKind, kind, text, languages, buildTokens } = args
    const digest = sha256(text)

    const existing = await this.repository.findMaterializedExpression(videoId, sourceKind, userId)
    if (existing) {
      // Unchanged source: reuse the stored expression after a read check.
      if (existing.sourceDigest === digest) {
        this.authorize('read', existing)
        return existing
      }
      // Drifted source: drop the stale row (cascading its segmentations,
      // tokenizations, and layers) and rebuild from the fresh text.
      this.authorize('update', existing)
      await this.repository.deleteExpression(existing.id)
    }

    this.authorizeCreate(null, userId)

    const id = randomUUID()
    await this.repository.createExpression({
      id,
      layersId: `video:${videoId}:${sourceKind}`,
      kind,
      text,
      sourceDigest: digest,
      sourceKind,
      videoId,
      videoSummaryId: args.videoSummaryId,
      languages,
      createdByUserId: userId,
      projectId: null,
    })

    if (buildTokens && args.tokens) {
      const segmentation = await this.repository.createSegmentation({
        expressionId: id,
        createdByUserId: userId,
        projectId: null,
      })
      await this.repository.createTokenization({
        segmentationId: segmentation.id,
        expressionId: id,
        kind: 'custom',
        isCanonical: true,
        tokens: toJson(args.tokens),
      })
    }

    const reloaded = await this.repository.findExpressionWithTokens(id)
    // The row was just created in this request, so a missing reload is an
    // invariant violation rather than a not-found condition.
    if (!reloaded) throw new NotFoundError('Expression', id)
    return reloaded
  }

  /**
   * Creates a standalone document expression from pasted text plus a canonical
   * whitespace tokenization, or returns the existing row when a client-supplied
   * id already exists (idempotent create-by-client-uuid).
   *
   * @param input - the document text and optional scope/metadata
   * @returns the created (or existing) document with its token decomposition
   * @throws {ForbiddenError} when create/update access is denied
   */
  async createDocument(input: CreateDocumentInput): Promise<Record<string, Json>> {
    const userId = this.requireUserId()
    const projectId = input.projectId ?? null

    // Idempotent create: an existing row with the client id is returned in
    // place (authorized against that row's read), never duplicated.
    if (input.id) {
      const existing = await this.repository.findExpressionWithTokens(input.id)
      if (existing) {
        this.authorize('read', existing)
        return this.mapWithTokens(existing)
      }
    }

    this.authorizeCreate(projectId, userId)

    // A project-scoped document may only be created by a member of that
    // project. The baseline own-content create rule passes for any self-owned
    // Expression regardless of projectId, so a non-member could otherwise
    // inject a row into a project's read scope they cannot access; verify
    // direct membership explicitly. System admins authorize via manage-all
    // rather than the baseline rule, so they are exempt.
    if (projectId && !this.ability?.can('manage', 'all')) {
      const membership = await prisma.projectMembership.findUnique({
        where: { userId_projectId: { userId, projectId } },
      })
      if (!membership) {
        throw new ForbiddenError('Cannot create Expression in this project')
      }
    }

    const id = input.id ?? randomUUID()
    const text = input.text
    const digest = sha256(text)

    // Expression carries no title column; a supplied document title is folded
    // into the metadata JSON (under `title`) alongside any caller metadata.
    let metadata = input.metadata
    if (input.title !== undefined) {
      const base =
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
          ? (metadata as Record<string, unknown>)
          : {}
      metadata = { ...base, title: input.title }
    }

    try {
      await this.repository.createExpression({
        id,
        layersId: id,
        kind: 'document',
        text,
        sourceDigest: digest,
        sourceKind: 'document',
        languages: input.languages ?? [],
        metadata: metadata !== undefined ? toJson(metadata) : undefined,
        features: input.features !== undefined ? toJson(input.features) : undefined,
        createdByUserId: userId,
        projectId,
      })
    } catch (error) {
      // Concurrent-create race on the client id: fall back to returning the
      // now-existing row rather than surfacing the unique-violation.
      if (
        input.id &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.repository.findExpressionWithTokens(input.id)
        if (existing) {
          this.authorize('read', existing)
          return this.mapWithTokens(existing)
        }
      }
      throw error
    }

    const segmentation = await this.repository.createSegmentation({
      expressionId: id,
      createdByUserId: userId,
      projectId,
    })
    await this.repository.createTokenization({
      segmentationId: segmentation.id,
      expressionId: id,
      kind: 'whitespace',
      isCanonical: true,
      tokens: toJson(whitespaceTokens(text)),
    })

    const reloaded = await this.repository.findExpressionWithTokens(id)
    if (!reloaded) throw new NotFoundError('Expression', id)
    return this.mapWithTokens(reloaded)
  }

  /**
   * Lists document expressions the caller can read, paginated and newest-first.
   *
   * @param options - pagination offsets
   * @returns the document grid page and the total accessible count
   */
  async listDocuments(
    options: DocumentListOptions
  ): Promise<{ items: Array<Record<string, Json>>; total: number }> {
    const readScope: Prisma.ExpressionWhereInput = this.ability
      ? accessibleBy(this.ability, 'read').Expression
      : { createdByUserId: this.userId ?? '' }

    const [rows, total] = await Promise.all([
      this.repository.findAccessibleDocuments(readScope, options.skip, options.take),
      this.repository.countAccessibleDocuments(readScope),
    ])

    return { items: rows.map((row) => this.mapExpression(row)), total }
  }

  // ----------------------------------------------------------------------
  // Response mapping
  // ----------------------------------------------------------------------

  /** Maps a bare expression row to its API shape (dates to ISO strings). */
  private mapExpression(row: PrismaExpression): Record<string, Json> {
    return {
      id: row.id,
      layersId: row.layersId,
      kind: row.kind,
      sourceKind: row.sourceKind,
      text: row.text,
      sourceDigest: row.sourceDigest,
      parentExpressionId: row.parentExpressionId,
      anchor: row.anchor,
      mediaId: row.mediaId,
      videoId: row.videoId,
      videoSummaryId: row.videoSummaryId,
      corpusId: row.corpusId,
      metadata: row.metadata,
      features: row.features,
      languages: row.languages,
      sourceUrl: row.sourceUrl,
      projectId: row.projectId,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** Maps a tokenization row to its API shape. */
  private mapTokenization(row: ExpressionWithTokens['tokenizations'][number]): Record<string, Json> {
    return {
      id: row.id,
      segmentationId: row.segmentationId,
      expressionId: row.expressionId,
      kind: row.kind,
      isCanonical: row.isCanonical,
      tokens: row.tokens,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** Maps a segmentation row (with its tokenizations) to its API shape. */
  private mapSegmentation(
    row: ExpressionWithTokens['segmentations'][number]
  ): Record<string, Json> {
    return {
      id: row.id,
      expressionId: row.expressionId,
      metadata: row.metadata,
      features: row.features,
      tokenizations: row.tokenizations.map((t) => this.mapTokenization(t)),
      projectId: row.projectId,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  /** Maps an expression plus its token decomposition to its API shape. */
  private mapWithTokens(row: ExpressionWithTokens): Record<string, Json> {
    return {
      ...this.mapExpression(row),
      tokenizations: row.tokenizations.map((t) => this.mapTokenization(t)),
      segmentations: row.segmentations.map((s) => this.mapSegmentation(s)),
    }
  }

  /** Maps the full expression detail graph to its API shape. */
  private mapDetail(row: ExpressionDetail): Record<string, Json> {
    return {
      ...this.mapExpression(row),
      tokenizations: row.tokenizations.map((t) => this.mapTokenization(t)),
      segmentations: row.segmentations.map((s) => this.mapSegmentation(s)),
      annotationLayers: row.annotationLayers.map((layer) => ({
        id: layer.id,
        expressionId: layer.expressionId,
        kind: layer.kind,
        subkind: layer.subkind,
        formalism: layer.formalism,
        sourceMethod: layer.sourceMethod,
        labelSet: layer.labelSet,
        tokenizationId: layer.tokenizationId,
        ontologyId: layer.ontologyId,
        parentLayerId: layer.parentLayerId,
        personaId: layer.personaId,
        metadata: layer.metadata,
        features: layer.features,
        languages: layer.languages,
        projectId: layer.projectId,
        createdByUserId: layer.createdByUserId,
        createdAt: layer.createdAt.toISOString(),
        updatedAt: layer.updatedAt.toISOString(),
        annotations: layer.annotations.map((a) => ({
          id: a.id,
          layerId: a.layerId,
          tokenizationId: a.tokenizationId,
          anchor: a.anchor,
          tokenIndex: a.tokenIndex,
          label: a.label,
          value: a.value,
          text: a.text,
          parentAnnotationId: a.parentAnnotationId,
          childIds: a.childIds,
          headIndex: a.headIndex,
          targetIndex: a.targetIndex,
          arguments: a.arguments,
          confidence: a.confidence,
          ontologyTypeRefId: a.ontologyTypeRefId,
          denotesNodeId: a.denotesNodeId,
          knowledgeRefs: a.knowledgeRefs,
          temporal: a.temporal,
          spatial: a.spatial,
          features: a.features,
          startMs: a.startMs,
          endMs: a.endMs,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
        })),
        relations: layer.relations.map((r) => ({
          id: r.id,
          layerId: r.layerId,
          sourceAnnotationId: r.sourceAnnotationId,
          targetAnnotationId: r.targetAnnotationId,
          relationTypeRef: r.relationTypeRef,
          label: r.label,
          features: r.features,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        })),
      })),
    }
  }
}
