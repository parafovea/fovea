import { Prisma } from '@prisma/client'
import { subject } from '@casl/ability'
import { accessibleBy } from '@casl/prisma'
import type { AppAbility, SubjectName } from '../lib/abilities.js'
import { NotFoundError, ForbiddenError, UnauthorizedError, ValidationError } from '../lib/errors.js'
import {
  fetchModelService,
  MODEL_SERVICE_TIMEOUTS,
} from '../lib/fetchModelService.js'
import { config } from '../config.js'
import {
  InterchangeRepository,
  targetForNsid,
  type NormalizedRecordDTO,
  type InterchangeTarget,
  type PersistResult,
} from '../repositories/InterchangeRepository.js'

/** The layers interchange import request: the source payload to normalize. */
export interface ImportRequest {
  /** Opaque source records handed to the model-service codec for normalization. */
  records: unknown[]
  /** The interchange format / provenance tag (e.g. `lairs`, `jsonlines`). */
  source: string
  /** Optional descriptive filename recorded in the import-history audit row. */
  filename?: string
  /** Optional project scope for every persisted row; defaults to personal. */
  projectId?: string | null
}

/** The layers interchange export request: which corpus to serialize. */
export interface ExportRequest {
  /** Corpus id to export; takes precedence over `corpusName` when both are set. */
  corpusId?: string
  /** Corpus name to export when no id is supplied. */
  corpusName?: string
}

/** Summary returned by an import: what the codec produced and what persisted. */
export interface ImportResult {
  importId: string
  source: string
  persisted: number
  skipped: number
  byNsid: Record<string, number>
}

/** The model-service normalization response: the records ready to persist. */
interface ModelServiceImportResponse {
  records: NormalizedRecordDTO[]
}

/** Maps a dispatch target to the CASL subject its `create` is authorized against. */
const TARGET_SUBJECT: Record<InterchangeTarget, SubjectName> = {
  media: 'Media',
  corpus: 'Corpus',
  expression: 'Expression',
  'annotation-layer': 'AnnotationLayer',
  annotation: 'LayersAnnotation',
}

/**
 * Owns the layers interchange business rules and RBAC, delegating all data
 * access to an InterchangeRepository and all normalization/serialization to the
 * model-service codec. Construct one per request from the request-scoped CASL
 * ability and the authenticated user's id.
 *
 * Import normalizes an opaque source payload through the model-service, then
 * persists the returned records under the caller's ownership scope after
 * pre-authorizing a `create` for every layers subject the batch touches. Export
 * reads a corpus the caller may `read` back out as normalized records (filtered
 * by the caller's CASL read scope over expressions) and serializes it through
 * the model-service. The repository performs no authorization.
 *
 * @example
 * ```typescript
 * const service = new InterchangeService(repo, request.ability, request.user!.id)
 * const result = await service.importRecords({ records, source: 'lairs' })
 * ```
 */
export class InterchangeService {
  constructor(
    private readonly repository: InterchangeRepository,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined,
  ) {}

  /**
   * Resolves the acting user id, requiring authentication.
   *
   * @returns the authenticated user's id
   * @throws {UnauthorizedError} when no user is present
   */
  private requireUserId(): string {
    if (!this.userId) throw new UnauthorizedError('Authentication required')
    return this.userId
  }

  /**
   * Normalizes an interchange payload through the model-service and persists the
   * resulting records under the caller's scope.
   *
   * @param request - the source records, format tag, and optional project scope
   * @returns the import id and persisted/skipped tallies
   * @throws {UnauthorizedError} when unauthenticated
   * @throws {ForbiddenError} when the caller cannot create one of the record subjects
   */
  async importRecords(request: ImportRequest): Promise<ImportResult> {
    const userId = this.requireUserId()
    const projectId = request.projectId ?? null

    // Normalize the opaque source payload through the model-service codec.
    const response = await fetchModelService(
      `${config.modelService.url}/api/layers/import`,
      {
        method: 'POST',
        timeoutMs: MODEL_SERVICE_TIMEOUTS.layersImport,
        body: { records: request.records, source: request.source },
      },
    )
    if (!response.ok) {
      const detail = await response.text()
      throw new ValidationError(`Model service rejected import: ${detail}`)
    }
    const normalized = (await response.json()) as ModelServiceImportResponse
    const records = Array.isArray(normalized.records) ? normalized.records : []

    // Pre-authorize a `create` for every distinct layers subject the batch will
    // write, using a candidate carrying the resolved (projectId, createdByUserId)
    // so CASL's ownership/project conditions resolve against real field values.
    // A record whose nsid maps to no store is ignored here (it is skipped at
    // persist time as well).
    const targets = new Set<InterchangeTarget>()
    for (const record of records) {
      const target = targetForNsid(record.nsid)
      if (target) targets.add(target)
    }
    if (this.ability) {
      for (const target of targets) {
        const candidate = subject(TARGET_SUBJECT[target], { projectId, createdByUserId: userId })
        if (!this.ability.can('create', candidate)) {
          throw new ForbiddenError(`Cannot create ${TARGET_SUBJECT[target]} in this scope`)
        }
      }
    }

    const result: PersistResult = await this.repository.persistNormalizedRecords(
      records,
      { projectId, createdByUserId: userId },
    )

    const history = await this.repository.recordImportHistory({
      filename: request.filename ?? `${request.source}-import`,
      importedBy: userId,
      importOptions: { source: request.source, projectId },
      result: result.byNsid as Prisma.InputJsonValue,
      success: true,
      itemsImported: result.persisted,
      itemsSkipped: result.skipped,
    })

    return {
      importId: history.id,
      source: request.source,
      persisted: result.persisted,
      skipped: result.skipped,
      byNsid: result.byNsid,
    }
  }

  /**
   * Reads a corpus the caller may read back out as normalized records and
   * serializes it through the model-service codec.
   *
   * @param request - the corpus id or name to export
   * @returns the model-service export artifact (opaque JSON)
   * @throws {UnauthorizedError} when unauthenticated
   * @throws {ValidationError} when neither corpusId nor corpusName is supplied
   * @throws {NotFoundError} when the corpus does not exist
   * @throws {ForbiddenError} when the caller cannot read the corpus
   */
  async exportRecords(request: ExportRequest): Promise<unknown> {
    this.requireUserId()

    if (!request.corpusId && !request.corpusName) {
      throw new ValidationError('Either corpusId or corpusName is required')
    }

    const corpus = request.corpusId
      ? await this.repository.findCorpusById(request.corpusId)
      : await this.repository.findCorpusByName(request.corpusName!)
    if (!corpus) {
      throw new NotFoundError('Corpus', request.corpusId ?? request.corpusName!)
    }

    if (this.ability && !this.ability.can('read', subject('Corpus', corpus))) {
      throw new ForbiddenError('Cannot read this Corpus')
    }

    // Filter the corpus's expressions to what the caller may read; when no
    // ability is present (single-user paths) an empty filter reads them all.
    const expressionScope: Prisma.ExpressionWhereInput = this.ability
      ? accessibleBy(this.ability, 'read').Expression
      : {}
    const records = await this.repository.readCorpusRecords(corpus, expressionScope)

    const response = await fetchModelService(
      `${config.modelService.url}/api/layers/export`,
      {
        method: 'POST',
        timeoutMs: MODEL_SERVICE_TIMEOUTS.layersExport,
        body: { records, corpus_name: corpus.name },
      },
    )
    if (!response.ok) {
      const detail = await response.text()
      throw new ValidationError(`Model service rejected export: ${detail}`)
    }
    return response.json()
  }
}
