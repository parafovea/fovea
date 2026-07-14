import {
  Prisma,
  type Corpus as PrismaCorpus,
  type CorpusMembership as PrismaCorpusMembership,
  type ClusterSet as PrismaClusterSet,
  type Alignment as PrismaAlignment,
  type Expression as PrismaExpression,
} from '@prisma/client'
import { subject } from '@casl/ability'
import { accessibleBy } from '@casl/prisma'
import type { Cluster, ObjectRef, AlignmentLink } from '@fovea/layers-schema'
import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, ForbiddenError } from '../lib/errors.js'
import { CorpusRepository } from '../repositories/CorpusRepository.js'

/**
 * Bridges a typed value into Prisma.InputJsonValue for storage in a JSON
 * column. Prisma JSON columns accept any serializable value at runtime; this
 * round-trip crosses the TypeScript gap without an unsafe cast.
 */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value))
}

/**
 * Fields accepted when creating or updating a corpus. JSON-column fields carry
 * their compile-time @fovea/layers-schema shape; envelope fields are plain
 * scalars. `id` is the optional client-supplied UUID that makes the create
 * idempotent.
 */
export interface CorpusInput {
  id?: string
  name: string
  description?: string | null
  version?: string | null
  domain?: string | null
  ontologyRefs?: string[]
  languages?: string[]
  metadata?: Record<string, unknown>
  projectId?: string | null
  layersUri?: string | null
}

/** Partial corpus update: only provided fields are written. */
export interface CorpusUpdateInput {
  name?: string
  description?: string | null
  version?: string | null
  domain?: string | null
  ontologyRefs?: string[]
  languages?: string[]
  metadata?: Record<string, unknown>
  layersUri?: string | null
}

/** Fields accepted when adding an expression to a corpus. */
export interface MembershipInput {
  id?: string
  expressionId: string
  split?: string | null
  ordinal?: number | null
  metadata?: Record<string, unknown>
}

/** Fields accepted when creating a cluster set. */
export interface ClusterSetInput {
  id?: string
  expressionId?: string | null
  corpusId?: string | null
  kind: string
  layerId?: string | null
  clusters: Cluster[]
  metadata?: Record<string, unknown>
  layersUri?: string | null
}

/** Partial cluster-set update: only provided fields are written. */
export interface ClusterSetUpdateInput {
  kind?: string
  layerId?: string | null
  clusters?: Cluster[]
  metadata?: Record<string, unknown>
  layersUri?: string | null
}

/** Fields accepted when creating an alignment. */
export interface AlignmentInput {
  id?: string
  expressionId?: string | null
  kind: string
  subkind?: string | null
  source?: ObjectRef
  target?: ObjectRef
  sourceLang?: string | null
  targetLang?: string | null
  links: AlignmentLink[]
  metadata?: Record<string, unknown>
  layersUri?: string | null
}

/** Partial alignment update: only provided fields are written. */
export interface AlignmentUpdateInput {
  kind?: string
  subkind?: string | null
  source?: ObjectRef
  target?: ObjectRef
  sourceLang?: string | null
  targetLang?: string | null
  links?: AlignmentLink[]
  metadata?: Record<string, unknown>
  layersUri?: string | null
}

/** API-facing corpus shape. */
export interface CorpusResponse {
  id: string
  name: string
  description: string | null
  version: string | null
  domain: string | null
  ontologyRefs: unknown
  languages: string[]
  metadata: unknown
  projectId: string | null
  createdByUserId: string | null
  layersUri: string | null
  createdAt: string
  updatedAt: string
}

/** API-facing corpus-membership shape. */
export interface MembershipResponse {
  id: string
  corpusId: string
  expressionId: string
  split: string | null
  ordinal: number | null
  metadata: unknown
  createdAt: string
  updatedAt: string
}

/** API-facing cluster-set shape. */
export interface ClusterSetResponse {
  id: string
  expressionId: string | null
  corpusId: string | null
  kind: string
  layerId: string | null
  clusters: unknown
  metadata: unknown
  projectId: string | null
  createdByUserId: string | null
  layersUri: string | null
  createdAt: string
  updatedAt: string
}

/** API-facing alignment shape. */
export interface AlignmentResponse {
  id: string
  expressionId: string | null
  kind: string
  subkind: string | null
  source: unknown
  target: unknown
  sourceLang: string | null
  targetLang: string | null
  links: unknown
  metadata: unknown
  projectId: string | null
  createdByUserId: string | null
  layersUri: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Owns the business rules and RBAC for the layers corpora domain, delegating
 * all data access to a CorpusRepository. Construct one per request from the
 * request-scoped CASL ability and the authenticated user's id.
 *
 * Corpus, ClusterSet, and Alignment are first-class content models scoped on
 * createdByUserId (+ optional projectId); the service filters lists with
 * `accessibleBy(ability, 'read').<Model>` and runs instance-level `can()`
 * checks before returning or mutating a single row. CorpusMembership carries
 * no scope column of its own — it is authorized through its parent corpus:
 * listing a corpus's memberships needs `read` on the corpus, and adding or
 * removing one needs `update` on the corpus. ClusterSet and Alignment inherit
 * their project scope from the expression they reference (when any), so a
 * caller who can read that expression's project can file clusters/alignments
 * into it.
 *
 * @example
 * ```typescript
 * const service = new CorporaService(repo, request.ability ?? null, request.user!.id)
 * const corpora = await service.listCorpora()
 * ```
 */
export class CorporaService {
  constructor(
    private readonly repository: CorpusRepository,
    private readonly ability: AppAbility | null,
    private readonly userId: string
  ) {}

  // --- mapping --------------------------------------------------------------

  private mapCorpus(c: PrismaCorpus): CorpusResponse {
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      version: c.version,
      domain: c.domain,
      ontologyRefs: c.ontologyRefs ?? null,
      languages: c.languages,
      metadata: c.metadata ?? null,
      projectId: c.projectId,
      createdByUserId: c.createdByUserId,
      layersUri: c.layersUri,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }
  }

  private mapMembership(m: PrismaCorpusMembership): MembershipResponse {
    return {
      id: m.id,
      corpusId: m.corpusId,
      expressionId: m.expressionId,
      split: m.split,
      ordinal: m.ordinal,
      metadata: m.metadata ?? null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }
  }

  private mapClusterSet(cs: PrismaClusterSet): ClusterSetResponse {
    return {
      id: cs.id,
      expressionId: cs.expressionId,
      corpusId: cs.corpusId,
      kind: cs.kind,
      layerId: cs.layerId,
      clusters: cs.clusters,
      metadata: cs.metadata ?? null,
      projectId: cs.projectId,
      createdByUserId: cs.createdByUserId,
      layersUri: cs.layersUri,
      createdAt: cs.createdAt.toISOString(),
      updatedAt: cs.updatedAt.toISOString(),
    }
  }

  private mapAlignment(a: PrismaAlignment): AlignmentResponse {
    return {
      id: a.id,
      expressionId: a.expressionId,
      kind: a.kind,
      subkind: a.subkind,
      source: a.source,
      target: a.target,
      sourceLang: a.sourceLang,
      targetLang: a.targetLang,
      links: a.links,
      metadata: a.metadata ?? null,
      projectId: a.projectId,
      createdByUserId: a.createdByUserId,
      layersUri: a.layersUri,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }
  }

  // --- shared authorization helpers -----------------------------------------

  /**
   * Loads an expression by id and confirms the caller may read it, returning
   * the project scope clusters/alignments filed against it should inherit.
   * A null expressionId yields a null scope (an unscoped, personal record).
   */
  private async resolveExpressionScope(
    expressionId: string | null | undefined
  ): Promise<{ expression: PrismaExpression | null; projectId: string | null }> {
    if (!expressionId) return { expression: null, projectId: null }
    const expression = await this.repository.findExpressionById(expressionId)
    if (!expression) throw new NotFoundError('Expression', expressionId)
    if (this.ability && !this.ability.can('read', subject('Expression', expression))) {
      throw new ForbiddenError('Cannot reference this Expression')
    }
    return { expression, projectId: expression.projectId }
  }

  // --- Corpus ---------------------------------------------------------------

  /** Lists every corpus the caller can read. */
  async listCorpora(): Promise<CorpusResponse[]> {
    const readScope = this.ability
      ? accessibleBy(this.ability, 'read').Corpus
      : {}
    const corpora = await this.repository.findAccessibleCorpora(readScope)
    return corpora.map(c => this.mapCorpus(c))
  }

  /** Gets a single corpus after an instance-level read check. */
  async getCorpus(id: string): Promise<CorpusResponse> {
    const corpus = await this.loadReadableCorpus(id)
    return this.mapCorpus(corpus)
  }

  /**
   * Creates a corpus, or updates it in place when a client-supplied id already
   * exists (idempotent create). Pre-authorizes the create in the resolved
   * (projectId, owner) scope and falls back to the update path on a concurrent
   * P2002 unique violation.
   */
  async createCorpus(
    input: CorpusInput
  ): Promise<{ corpus: CorpusResponse; created: boolean }> {
    const projectId = input.projectId ?? null

    if (input.id) {
      const existing = await this.repository.findCorpusById(input.id)
      if (existing) {
        return { corpus: await this.applyCorpusUpdate(existing, input), created: false }
      }
    }

    const candidate = subject('Corpus', { projectId, createdByUserId: this.userId })
    if (this.ability && !this.ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create Corpus in this scope')
    }

    try {
      const corpus = await this.repository.createCorpus({
        id: input.id,
        name: input.name,
        description: input.description ?? null,
        version: input.version ?? null,
        domain: input.domain ?? null,
        ontologyRefs: input.ontologyRefs !== undefined ? toJson(input.ontologyRefs) : undefined,
        languages: input.languages ?? [],
        metadata: input.metadata !== undefined ? toJson(input.metadata) : undefined,
        projectId,
        createdByUserId: this.userId,
        layersUri: input.layersUri ?? null,
      })
      return { corpus: this.mapCorpus(corpus), created: true }
    } catch (error) {
      if (
        input.id &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.repository.findCorpusById(input.id)
        if (existing) {
          return { corpus: await this.applyCorpusUpdate(existing, input), created: false }
        }
      }
      throw error
    }
  }

  /** Updates a corpus after an instance-level update check. */
  async updateCorpus(id: string, input: CorpusUpdateInput): Promise<CorpusResponse> {
    const existing = await this.repository.findCorpusById(id)
    if (!existing) throw new NotFoundError('Corpus', id)
    return this.applyCorpusUpdate(existing, input)
  }

  /** Deletes a corpus after an instance-level delete check. */
  async deleteCorpus(id: string): Promise<void> {
    const existing = await this.repository.findCorpusById(id)
    if (!existing) throw new NotFoundError('Corpus', id)
    if (this.ability && !this.ability.can('delete', subject('Corpus', existing))) {
      throw new ForbiddenError('Cannot delete this Corpus')
    }
    await this.repository.deleteCorpus(id)
  }

  /** Authorizes and applies a corpus update from full or partial input. */
  private async applyCorpusUpdate(
    existing: PrismaCorpus,
    input: CorpusInput | CorpusUpdateInput
  ): Promise<CorpusResponse> {
    if (this.ability && !this.ability.can('update', subject('Corpus', existing))) {
      throw new ForbiddenError('Cannot update this Corpus')
    }
    const updated = await this.repository.updateCorpus(existing.id, {
      name: input.name,
      description: input.description,
      version: input.version,
      domain: input.domain,
      ontologyRefs: input.ontologyRefs !== undefined ? toJson(input.ontologyRefs) : undefined,
      languages: input.languages !== undefined ? { set: input.languages } : undefined,
      metadata: input.metadata !== undefined ? toJson(input.metadata) : undefined,
      layersUri: input.layersUri,
    })
    return this.mapCorpus(updated)
  }

  /** Loads a corpus, throwing 404 if absent and 403 if the caller cannot read it. */
  private async loadReadableCorpus(id: string): Promise<PrismaCorpus> {
    const corpus = await this.repository.findCorpusById(id)
    if (!corpus) throw new NotFoundError('Corpus', id)
    if (this.ability && !this.ability.can('read', subject('Corpus', corpus))) {
      throw new ForbiddenError('Cannot read this Corpus')
    }
    return corpus
  }

  // --- CorpusMembership -----------------------------------------------------

  /** Lists a corpus's memberships; requires read on the parent corpus. */
  async listMemberships(corpusId: string): Promise<MembershipResponse[]> {
    await this.loadReadableCorpus(corpusId)
    const memberships = await this.repository.findMembershipsByCorpus(corpusId)
    return memberships.map(m => this.mapMembership(m))
  }

  /**
   * Adds an expression to a corpus, or updates the membership in place when the
   * expression already belongs to the corpus (idempotent by the unique
   * (corpusId, expressionId) pair). Requires update on the parent corpus and
   * read on the expression being added.
   */
  async addMembership(
    corpusId: string,
    input: MembershipInput
  ): Promise<{ membership: MembershipResponse; created: boolean }> {
    const corpus = await this.repository.findCorpusById(corpusId)
    if (!corpus) throw new NotFoundError('Corpus', corpusId)
    if (this.ability && !this.ability.can('update', subject('Corpus', corpus))) {
      throw new ForbiddenError('Cannot modify this Corpus')
    }
    await this.resolveExpressionScope(input.expressionId)

    const existing = await this.repository.findMembershipByCorpusAndExpression(
      corpusId,
      input.expressionId
    )
    if (existing) {
      return { membership: await this.applyMembershipUpdate(existing, input), created: false }
    }

    try {
      const membership = await this.repository.createMembership({
        id: input.id,
        corpusId,
        expressionId: input.expressionId,
        split: input.split ?? null,
        ordinal: input.ordinal ?? null,
        metadata: input.metadata !== undefined ? toJson(input.metadata) : undefined,
      })
      return { membership: this.mapMembership(membership), created: true }
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.repository.findMembershipByCorpusAndExpression(
          corpusId,
          input.expressionId
        )
        if (raced) {
          return { membership: await this.applyMembershipUpdate(raced, input), created: false }
        }
      }
      throw error
    }
  }

  /** Removes a membership; requires update on the parent corpus. */
  async removeMembership(corpusId: string, membershipId: string): Promise<void> {
    const corpus = await this.repository.findCorpusById(corpusId)
    if (!corpus) throw new NotFoundError('Corpus', corpusId)
    if (this.ability && !this.ability.can('update', subject('Corpus', corpus))) {
      throw new ForbiddenError('Cannot modify this Corpus')
    }
    const membership = await this.repository.findMembershipById(membershipId)
    if (!membership || membership.corpusId !== corpusId) {
      throw new NotFoundError('CorpusMembership', membershipId)
    }
    await this.repository.deleteMembership(membershipId)
  }

  /** Applies a membership update (split/ordinal/metadata) in place. */
  private async applyMembershipUpdate(
    existing: PrismaCorpusMembership,
    input: MembershipInput
  ): Promise<MembershipResponse> {
    const updated = await this.repository.updateMembership(existing.id, {
      split: input.split,
      ordinal: input.ordinal,
      metadata: input.metadata !== undefined ? toJson(input.metadata) : undefined,
    })
    return this.mapMembership(updated)
  }

  // --- ClusterSet -----------------------------------------------------------

  /** Lists every cluster set the caller can read. */
  async listClusterSets(): Promise<ClusterSetResponse[]> {
    const readScope = this.ability
      ? accessibleBy(this.ability, 'read').ClusterSet
      : {}
    const rows = await this.repository.findAccessibleClusterSets(readScope)
    return rows.map(cs => this.mapClusterSet(cs))
  }

  /** Gets a single cluster set after an instance-level read check. */
  async getClusterSet(id: string): Promise<ClusterSetResponse> {
    const cs = await this.repository.findClusterSetById(id)
    if (!cs) throw new NotFoundError('ClusterSet', id)
    if (this.ability && !this.ability.can('read', subject('ClusterSet', cs))) {
      throw new ForbiddenError('Cannot read this ClusterSet')
    }
    return this.mapClusterSet(cs)
  }

  /**
   * Creates a cluster set, or updates it in place on an idempotent client id.
   * Inherits its project scope from the referenced expression (when any).
   */
  async createClusterSet(
    input: ClusterSetInput
  ): Promise<{ clusterSet: ClusterSetResponse; created: boolean }> {
    if (input.id) {
      const existing = await this.repository.findClusterSetById(input.id)
      if (existing) {
        return { clusterSet: await this.applyClusterSetUpdate(existing, input), created: false }
      }
    }

    const { projectId } = await this.resolveExpressionScope(input.expressionId)
    const candidate = subject('ClusterSet', { projectId, createdByUserId: this.userId })
    if (this.ability && !this.ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create ClusterSet in this scope')
    }

    try {
      const cs = await this.repository.createClusterSet({
        id: input.id,
        expressionId: input.expressionId ?? null,
        corpusId: input.corpusId ?? null,
        kind: input.kind,
        layerId: input.layerId ?? null,
        clusters: toJson(input.clusters),
        metadata: input.metadata !== undefined ? toJson(input.metadata) : undefined,
        projectId,
        createdByUserId: this.userId,
        layersUri: input.layersUri ?? null,
      })
      return { clusterSet: this.mapClusterSet(cs), created: true }
    } catch (error) {
      if (
        input.id &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.repository.findClusterSetById(input.id)
        if (existing) {
          return { clusterSet: await this.applyClusterSetUpdate(existing, input), created: false }
        }
      }
      throw error
    }
  }

  /** Updates a cluster set after an instance-level update check. */
  async updateClusterSet(id: string, input: ClusterSetUpdateInput): Promise<ClusterSetResponse> {
    const existing = await this.repository.findClusterSetById(id)
    if (!existing) throw new NotFoundError('ClusterSet', id)
    return this.applyClusterSetUpdate(existing, input)
  }

  /** Deletes a cluster set after an instance-level delete check. */
  async deleteClusterSet(id: string): Promise<void> {
    const existing = await this.repository.findClusterSetById(id)
    if (!existing) throw new NotFoundError('ClusterSet', id)
    if (this.ability && !this.ability.can('delete', subject('ClusterSet', existing))) {
      throw new ForbiddenError('Cannot delete this ClusterSet')
    }
    await this.repository.deleteClusterSet(id)
  }

  /** Authorizes and applies a cluster-set update from full or partial input. */
  private async applyClusterSetUpdate(
    existing: PrismaClusterSet,
    input: ClusterSetInput | ClusterSetUpdateInput
  ): Promise<ClusterSetResponse> {
    if (this.ability && !this.ability.can('update', subject('ClusterSet', existing))) {
      throw new ForbiddenError('Cannot update this ClusterSet')
    }
    const updated = await this.repository.updateClusterSet(existing.id, {
      kind: input.kind,
      layerId: input.layerId,
      clusters: input.clusters !== undefined ? toJson(input.clusters) : undefined,
      metadata: input.metadata !== undefined ? toJson(input.metadata) : undefined,
      layersUri: input.layersUri,
    })
    return this.mapClusterSet(updated)
  }

  // --- Alignment ------------------------------------------------------------

  /** Lists every alignment the caller can read. */
  async listAlignments(): Promise<AlignmentResponse[]> {
    const readScope = this.ability
      ? accessibleBy(this.ability, 'read').Alignment
      : {}
    const rows = await this.repository.findAccessibleAlignments(readScope)
    return rows.map(a => this.mapAlignment(a))
  }

  /** Gets a single alignment after an instance-level read check. */
  async getAlignment(id: string): Promise<AlignmentResponse> {
    const a = await this.repository.findAlignmentById(id)
    if (!a) throw new NotFoundError('Alignment', id)
    if (this.ability && !this.ability.can('read', subject('Alignment', a))) {
      throw new ForbiddenError('Cannot read this Alignment')
    }
    return this.mapAlignment(a)
  }

  /**
   * Creates an alignment, or updates it in place on an idempotent client id.
   * Inherits its project scope from the referenced expression (when any).
   */
  async createAlignment(
    input: AlignmentInput
  ): Promise<{ alignment: AlignmentResponse; created: boolean }> {
    if (input.id) {
      const existing = await this.repository.findAlignmentById(input.id)
      if (existing) {
        return { alignment: await this.applyAlignmentUpdate(existing, input), created: false }
      }
    }

    const { projectId } = await this.resolveExpressionScope(input.expressionId)
    const candidate = subject('Alignment', { projectId, createdByUserId: this.userId })
    if (this.ability && !this.ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create Alignment in this scope')
    }

    try {
      const a = await this.repository.createAlignment({
        id: input.id,
        expressionId: input.expressionId ?? null,
        kind: input.kind,
        subkind: input.subkind ?? null,
        source: input.source !== undefined ? toJson(input.source) : Prisma.JsonNull,
        target: input.target !== undefined ? toJson(input.target) : Prisma.JsonNull,
        sourceLang: input.sourceLang ?? null,
        targetLang: input.targetLang ?? null,
        links: toJson(input.links),
        metadata: input.metadata !== undefined ? toJson(input.metadata) : undefined,
        projectId,
        createdByUserId: this.userId,
        layersUri: input.layersUri ?? null,
      })
      return { alignment: this.mapAlignment(a), created: true }
    } catch (error) {
      if (
        input.id &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.repository.findAlignmentById(input.id)
        if (existing) {
          return { alignment: await this.applyAlignmentUpdate(existing, input), created: false }
        }
      }
      throw error
    }
  }

  /** Updates an alignment after an instance-level update check. */
  async updateAlignment(id: string, input: AlignmentUpdateInput): Promise<AlignmentResponse> {
    const existing = await this.repository.findAlignmentById(id)
    if (!existing) throw new NotFoundError('Alignment', id)
    return this.applyAlignmentUpdate(existing, input)
  }

  /** Deletes an alignment after an instance-level delete check. */
  async deleteAlignment(id: string): Promise<void> {
    const existing = await this.repository.findAlignmentById(id)
    if (!existing) throw new NotFoundError('Alignment', id)
    if (this.ability && !this.ability.can('delete', subject('Alignment', existing))) {
      throw new ForbiddenError('Cannot delete this Alignment')
    }
    await this.repository.deleteAlignment(id)
  }

  /** Authorizes and applies an alignment update from full or partial input. */
  private async applyAlignmentUpdate(
    existing: PrismaAlignment,
    input: AlignmentInput | AlignmentUpdateInput
  ): Promise<AlignmentResponse> {
    if (this.ability && !this.ability.can('update', subject('Alignment', existing))) {
      throw new ForbiddenError('Cannot update this Alignment')
    }
    const updated = await this.repository.updateAlignment(existing.id, {
      kind: input.kind,
      subkind: input.subkind,
      source: input.source !== undefined ? toJson(input.source) : undefined,
      target: input.target !== undefined ? toJson(input.target) : undefined,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      links: input.links !== undefined ? toJson(input.links) : undefined,
      metadata: input.metadata !== undefined ? toJson(input.metadata) : undefined,
      layersUri: input.layersUri,
    })
    return this.mapAlignment(updated)
  }
}
