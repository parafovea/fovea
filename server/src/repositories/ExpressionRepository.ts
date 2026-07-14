import { PrismaClient, Prisma, type Expression, type Video, type VideoSummary } from '@prisma/client'

/**
 * An Expression joined with everything a single privileged detail read exposes:
 * its tokenizations, its segmentations (each with their tokenizations), and its
 * annotation layers (each with their annotations and relations).
 */
export type ExpressionDetail = Prisma.ExpressionGetPayload<{
  include: {
    tokenizations: true
    segmentations: { include: { tokenizations: true } }
    annotationLayers: {
      include: {
        annotations: true
        relations: true
      }
    }
  }
}>

/**
 * An Expression joined with the token-decomposition it carries: its
 * segmentations (each with their tokenizations) and its direct tokenizations.
 * Returned by the materialize path so the caller can hand the token streams
 * back without a second round-trip.
 */
export type ExpressionWithTokens = Prisma.ExpressionGetPayload<{
  include: {
    tokenizations: true
    segmentations: { include: { tokenizations: true } }
  }
}>

/**
 * Repository for all Expression-domain database access in the layers store:
 * expressions, their segmentations and tokenizations, plus the Video and
 * VideoSummary reads the text-expression materializer needs to project video
 * metadata and ASR transcripts into expressions.
 *
 * This class owns every Prisma call in the expression domain. It performs no
 * authorization: callers (the TextExpressionService) decide who may invoke a
 * method and what the resulting filter should be. Methods return raw Prisma
 * model types and propagate Prisma errors to their callers.
 *
 * @example
 * ```typescript
 * const repo = new ExpressionRepository(fastify.prisma)
 * const detail = await repo.findExpressionDetail(id)
 * ```
 */
export class ExpressionRepository {
  /**
   * Creates a new ExpressionRepository instance.
   *
   * @param prisma - Prisma client instance for database access
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Loads an expression with the full detail graph: tokenizations,
   * segmentations (with their tokenizations), and annotation layers (with their
   * annotations and relations).
   *
   * @param id - Expression UUID
   * @returns the expression detail, or null if not found
   */
  async findExpressionDetail(id: string): Promise<ExpressionDetail | null> {
    return this.prisma.expression.findUnique({
      where: { id },
      include: {
        tokenizations: true,
        segmentations: { include: { tokenizations: true } },
        annotationLayers: {
          include: {
            annotations: true,
            relations: true,
          },
        },
      },
    })
  }

  /**
   * Finds an expression by id without any relations.
   *
   * @param id - Expression UUID
   * @returns the expression, or null if not found
   */
  async findById(id: string): Promise<Expression | null> {
    return this.prisma.expression.findUnique({ where: { id } })
  }

  /**
   * Finds a video by id. Used by the materializer to read the source metadata
   * and frame rate.
   *
   * @param videoId - Video UUID
   * @returns the video, or null if not found
   */
  async findVideoById(videoId: string): Promise<Video | null> {
    return this.prisma.video.findUnique({ where: { id: videoId } })
  }

  /**
   * Finds every summary of a video that carries a structured ASR transcript,
   * ordered by creation (earliest first) so the caller can pick a transcript
   * source deterministically.
   *
   * @param videoId - Video UUID
   * @returns the transcript-bearing summaries, earliest first (empty if none)
   */
  async findSummariesWithTranscript(videoId: string): Promise<VideoSummary[]> {
    return this.prisma.videoSummary.findMany({
      where: { videoId, transcriptJson: { not: Prisma.DbNull } },
      orderBy: { createdAt: 'asc' },
    })
  }

  /**
   * Finds a materialized text expression for a video, scoped to its owner and
   * source kind, with its token decomposition included. Materialization is
   * per-user: each caller reuses or creates their own copy, so the lookup is
   * keyed by (videoId, sourceKind, createdByUserId).
   *
   * @param videoId - source Video UUID
   * @param sourceKind - the projection kind (e.g. video-metadata-text, asr-transcript)
   * @param userId - the owning user
   * @returns the materialized expression with tokens, or null if none exists
   */
  async findMaterializedExpression(
    videoId: string,
    sourceKind: string,
    userId: string
  ): Promise<ExpressionWithTokens | null> {
    return this.prisma.expression.findFirst({
      where: { videoId, sourceKind, createdByUserId: userId },
      include: {
        tokenizations: true,
        segmentations: { include: { tokenizations: true } },
      },
    })
  }

  /**
   * Creates an expression from unchecked input (so callers set scope columns
   * such as videoId / createdByUserId directly rather than via relation connect).
   *
   * @param data - Prisma unchecked create input
   * @returns the created expression
   */
  async createExpression(data: Prisma.ExpressionUncheckedCreateInput): Promise<Expression> {
    return this.prisma.expression.create({ data })
  }

  /**
   * Updates an expression by id.
   *
   * @param id - Expression UUID
   * @param data - Prisma expression update input
   * @returns the updated expression
   */
  async updateExpression(
    id: string,
    data: Prisma.ExpressionUncheckedUpdateInput
  ): Promise<Expression> {
    return this.prisma.expression.update({ where: { id }, data })
  }

  /**
   * Deletes an expression by id. Segmentations, tokenizations, and annotation
   * layers cascade via their onDelete relations.
   *
   * @param id - Expression UUID
   */
  async deleteExpression(id: string): Promise<void> {
    await this.prisma.expression.delete({ where: { id } })
  }

  /**
   * Loads an expression with its token decomposition (segmentations with
   * tokenizations, and direct tokenizations).
   *
   * @param id - Expression UUID
   * @returns the expression with tokens, or null if not found
   */
  async findExpressionWithTokens(id: string): Promise<ExpressionWithTokens | null> {
    return this.prisma.expression.findUnique({
      where: { id },
      include: {
        tokenizations: true,
        segmentations: { include: { tokenizations: true } },
      },
    })
  }

  /**
   * Creates a segmentation from unchecked input.
   *
   * @param data - Prisma unchecked create input
   * @returns the created segmentation id
   */
  async createSegmentation(
    data: Prisma.SegmentationUncheckedCreateInput
  ): Promise<{ id: string }> {
    const created = await this.prisma.segmentation.create({ data, select: { id: true } })
    return created
  }

  /**
   * Creates a tokenization from unchecked input.
   *
   * @param data - Prisma unchecked create input
   * @returns the created tokenization id
   */
  async createTokenization(
    data: Prisma.TokenizationUncheckedCreateInput
  ): Promise<{ id: string }> {
    const created = await this.prisma.tokenization.create({ data, select: { id: true } })
    return created
  }

  /**
   * Lists document expressions (sourceKind = document) matching a read-scope
   * filter, paginated and newest-first.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @param skip - offset
   * @param take - page size
   * @returns the accessible document expressions
   */
  async findAccessibleDocuments(
    readScope: Prisma.ExpressionWhereInput,
    skip: number,
    take: number
  ): Promise<Expression[]> {
    return this.prisma.expression.findMany({
      where: { AND: [{ sourceKind: 'document' }, readScope] },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    })
  }

  /**
   * Counts document expressions matching a read-scope filter.
   *
   * @param readScope - the caller's CASL read filter as a WHERE clause
   * @returns the total number of accessible document expressions
   */
  async countAccessibleDocuments(readScope: Prisma.ExpressionWhereInput): Promise<number> {
    return this.prisma.expression.count({
      where: { AND: [{ sourceKind: 'document' }, readScope] },
    })
  }
}
