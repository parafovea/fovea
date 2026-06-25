import { PrismaClient, Claim, ClaimRelation, VideoSummary, Video, Prisma } from '@prisma/client'

/**
 * Claim row joined with its nested subclaims (up to three levels deep). This is
 * the shape returned by the claim-tree read paths (list, create, update) and is
 * what the denormalized `claimsJson` field stores.
 */
export type ClaimWithSubclaimTree = Prisma.ClaimGetPayload<{
  include: {
    subclaims: {
      include: {
        subclaims: {
          include: {
            subclaims: true
          }
        }
      }
    }
  }
}>

/**
 * Claim row joined with its subclaim tree and its parent claim. Returned by the
 * single-claim read path.
 */
export type ClaimWithSubclaimsAndParent = Prisma.ClaimGetPayload<{
  include: {
    subclaims: {
      include: {
        subclaims: {
          include: {
            subclaims: true
          }
        }
      }
    }
    parentClaim: true
  }
}>

/**
 * VideoSummary joined with its persona and that persona's ontology. Used by the
 * relation-create path to validate a relation type against the ontology.
 */
export type SummaryWithPersonaOntology = Prisma.VideoSummaryGetPayload<{
  include: {
    persona: {
      include: {
        ontology: true
      }
    }
  }
}>

/**
 * ClaimRelation joined with both endpoint claims. Used by the relation-delete
 * path to authorize against both endpoints.
 */
export type ClaimRelationWithEndpoints = Prisma.ClaimRelationGetPayload<{
  include: {
    sourceClaim: true
    targetClaim: true
  }
}>

/** Standard three-level subclaim include used by every claim-tree read. */
const SUBCLAIM_TREE_INCLUDE = {
  subclaims: {
    include: {
      subclaims: {
        include: {
          subclaims: true,
        },
      },
    },
  },
} as const

/**
 * Repository for all Claim, ClaimRelation, VideoSummary, Video, and Persona
 * database access in the claims domain.
 *
 * This class owns every Prisma call the claims routes used. It performs no
 * authorization: callers (the ClaimService) decide who may invoke a method.
 * Methods return raw Prisma model types and propagate Prisma errors (for
 * example P2025 on a missing delete target) to their callers.
 *
 * @example
 * ```typescript
 * const repo = new ClaimRepository(fastify.prisma)
 * const claim = await repo.findClaimById(id)
 * if (!claim) {
 *   throw new NotFoundError('Claim', id)
 * }
 * ```
 */
export class ClaimRepository {
  /**
   * Creates a new ClaimRepository instance.
   *
   * @param prisma - Prisma client instance for database access
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finds a video summary by ID.
   *
   * @param id - VideoSummary UUID
   * @returns the summary, or null if not found
   */
  async findVideoSummaryById(id: string): Promise<VideoSummary | null> {
    return this.prisma.videoSummary.findUnique({ where: { id } })
  }

  /**
   * Finds a video summary by ID together with a single root claim (if any).
   *
   * Used by the synthesis path to verify the summary has at least one claim to
   * synthesize.
   *
   * @param id - VideoSummary UUID
   * @returns the summary with at most one root claim, or null if not found
   */
  async findVideoSummaryWithRootClaim(id: string): Promise<Prisma.VideoSummaryGetPayload<{
    include: { claims: true }
  }> | null> {
    return this.prisma.videoSummary.findUnique({
      where: { id },
      include: {
        claims: {
          where: { parentClaimId: null },
          take: 1,
        },
      },
    })
  }

  /**
   * Finds a video summary by ID together with its persona and that persona's
   * ontology.
   *
   * @param id - VideoSummary UUID
   * @returns the summary with persona and ontology, or null if not found
   */
  async findVideoSummaryWithPersonaOntology(id: string): Promise<SummaryWithPersonaOntology | null> {
    return this.prisma.videoSummary.findUnique({
      where: { id },
      include: {
        persona: {
          include: {
            ontology: true,
          },
        },
      },
    })
  }

  /**
   * Finds a video summary by its (videoId, personaId) unique pair.
   *
   * @param videoId - the video ID
   * @param personaId - the persona UUID
   * @returns the summary, or null if none exists yet
   */
  async findVideoSummaryByVideoPersona(videoId: string, personaId: string): Promise<VideoSummary | null> {
    return this.prisma.videoSummary.findUnique({
      where: { videoId_personaId: { videoId, personaId } },
    })
  }

  /**
   * Upserts a video summary for a (videoId, personaId) pair, creating an empty
   * one if absent and leaving an existing one untouched.
   *
   * A freshly created summary is stamped with the caller's id and the persona's
   * project scope so it is owned and project-visible from birth. Without this
   * the auto-created parent summary would be NULL-scoped and unreadable, which
   * 403s project collaborators adding claims under it (and orphans the summary
   * from its own creator).
   *
   * @param videoId - the video ID
   * @param personaId - the persona UUID
   * @param projectId - the persona's project scope (null for personal personas)
   * @param createdBy - the id of the user the summary is created for
   * @returns the existing or newly created summary
   */
  async upsertEmptyVideoSummary(
    videoId: string,
    personaId: string,
    projectId: string | null,
    createdBy: string,
  ): Promise<VideoSummary> {
    return this.prisma.videoSummary.upsert({
      where: {
        videoId_personaId: {
          videoId,
          personaId,
        },
      },
      create: {
        videoId,
        personaId,
        summary: [],
        projectId: projectId ?? undefined,
        createdBy,
      },
      update: {},
    })
  }

  /**
   * Updates a video summary's denormalized `claimsJson` and `claimsExtractedAt`
   * fields.
   *
   * @param summaryId - VideoSummary UUID
   * @param claimsJson - the denormalized claim tree payload
   * @param claimsExtractedAt - the extraction timestamp
   */
  async updateVideoSummaryClaimsJson(
    summaryId: string,
    claimsJson: Prisma.InputJsonValue,
    claimsExtractedAt: Date
  ): Promise<void> {
    await this.prisma.videoSummary.update({
      where: { id: summaryId },
      data: {
        claimsJson,
        claimsExtractedAt,
      },
    })
  }

  /**
   * Finds a video by ID.
   *
   * @param id - the video ID
   * @returns the video, or null if not found
   */
  async findVideoById(id: string): Promise<Video | null> {
    return this.prisma.video.findUnique({ where: { id } })
  }

  /**
   * Finds a persona by ID, projecting only the fields used to resolve the
   * project authorization scope.
   *
   * @param id - the persona UUID
   * @returns the persona id and projectId, or null if not found
   */
  async findPersonaProjectScope(id: string): Promise<{ id: string; projectId: string | null } | null> {
    return this.prisma.persona.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    })
  }

  /**
   * Finds a claim by ID.
   *
   * @param id - Claim UUID
   * @returns the claim, or null if not found
   */
  async findClaimById(id: string): Promise<Claim | null> {
    return this.prisma.claim.findUnique({ where: { id } })
  }

  /**
   * Finds a claim by ID together with its subclaim tree and parent claim.
   *
   * @param id - Claim UUID
   * @returns the claim with subclaims and parent, or null if not found
   */
  async findClaimWithSubclaimsAndParent(id: string): Promise<ClaimWithSubclaimsAndParent | null> {
    return this.prisma.claim.findUnique({
      where: { id },
      include: {
        ...SUBCLAIM_TREE_INCLUDE,
        parentClaim: true,
      },
    })
  }

  /**
   * Lists the root claims for a summary, filtered by a caller-supplied WHERE
   * clause (which carries both the summary filter and the CASL read scope), and
   * optionally including the nested subclaim tree.
   *
   * @param where - Prisma WHERE clause selecting the root claims
   * @param includeSubclaims - whether to include the nested subclaim tree
   * @returns matching root claims, oldest first
   */
  async findRootClaims(
    where: Prisma.ClaimWhereInput,
    includeSubclaims: boolean
  ): Promise<Claim[] | ClaimWithSubclaimTree[]> {
    return this.prisma.claim.findMany({
      where,
      include: includeSubclaims ? SUBCLAIM_TREE_INCLUDE : undefined,
      orderBy: [{ createdAt: 'asc' }],
    })
  }

  /**
   * Lists the root claims for a summary (by summaryId, summaryType) with the
   * nested subclaim tree, oldest first.
   *
   * Used by the create/update write paths to return the complete claims tree
   * after a mutation.
   *
   * @param summaryId - VideoSummary UUID
   * @param summaryType - the summary type ("video" or "collection")
   * @returns the root claims with their subclaim trees, oldest first
   */
  async findClaimTree(summaryId: string, summaryType: string): Promise<ClaimWithSubclaimTree[]> {
    return this.prisma.claim.findMany({
      where: {
        summaryId,
        summaryType,
        parentClaimId: null,
      },
      include: SUBCLAIM_TREE_INCLUDE,
      orderBy: [{ createdAt: 'asc' }],
    })
  }

  /**
   * Creates a claim.
   *
   * @param data - Prisma claim create input
   * @returns the created claim
   */
  async createClaim(data: Prisma.ClaimUncheckedCreateInput): Promise<Claim> {
    return this.prisma.claim.create({ data })
  }

  /**
   * Updates a claim.
   *
   * @param id - Claim UUID
   * @param data - Prisma claim update input
   * @returns the updated claim
   * @throws {Prisma.PrismaClientKnownRequestError} P2025 if the claim does not exist
   */
  async updateClaim(id: string, data: Prisma.ClaimUpdateInput): Promise<Claim> {
    return this.prisma.claim.update({ where: { id }, data })
  }

  /**
   * Deletes a claim (cascades to subclaims via the schema's onDelete: Cascade).
   *
   * @param id - Claim UUID
   * @returns the deleted claim
   * @throws {Prisma.PrismaClientKnownRequestError} P2025 if the claim does not exist
   */
  async deleteClaim(id: string): Promise<Claim> {
    return this.prisma.claim.delete({ where: { id } })
  }

  /**
   * Creates a claim relation.
   *
   * @param data - Prisma claim relation create input
   * @returns the created relation
   */
  async createClaimRelation(data: Prisma.ClaimRelationUncheckedCreateInput): Promise<ClaimRelation> {
    return this.prisma.claimRelation.create({ data })
  }

  /**
   * Finds a claim relation by ID together with both endpoint claims.
   *
   * @param id - ClaimRelation UUID
   * @returns the relation with both endpoint claims, or null if not found
   */
  async findClaimRelationWithEndpoints(id: string): Promise<ClaimRelationWithEndpoints | null> {
    return this.prisma.claimRelation.findUnique({
      where: { id },
      include: {
        sourceClaim: true,
        targetClaim: true,
      },
    })
  }

  /**
   * Lists claim relations matching a WHERE clause.
   *
   * @param where - Prisma claim relation WHERE clause
   * @returns matching relations
   */
  async findClaimRelations(where: Prisma.ClaimRelationWhereInput): Promise<ClaimRelation[]> {
    return this.prisma.claimRelation.findMany({ where })
  }

  /**
   * Deletes a claim relation.
   *
   * @param id - ClaimRelation UUID
   * @throws {Prisma.PrismaClientKnownRequestError} P2025 if the relation does not exist
   */
  async deleteClaimRelation(id: string): Promise<void> {
    await this.prisma.claimRelation.delete({ where: { id } })
  }
}
