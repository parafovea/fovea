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

/** The serialized interchange artifact an export returns. */
export interface ExportResult {
  /** The corpus's records in wire form: each `value_json` is a JSON string. */
  records: NormalizedRecordDTO[]
  /** The exported corpus's name. */
  corpusName: string
}

/**
 * Parses a wire `value_json` — a JSON-encoded string per the model-service
 * contract — into the object shape the repository persists. A non-string value
 * is passed through unchanged so an already-parsed payload stays usable.
 */
function parseValueJson(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value
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
 * model-service. Construct one per request from the request-scoped CASL ability
 * and the authenticated user's id.
 *
 * Import normalizes the posted records through the model-service, then persists
 * them under the caller's ownership scope after pre-authorizing a `create` for
 * every layers subject the batch touches; the repository additionally scopes
 * each upsert to the caller's own rows, so an import never overwrites or grafts
 * onto content owned by another scope. Export reads a corpus the caller may
 * `read` back out as normalized records (filtered by the caller's CASL read
 * scope over expressions) and serializes it through the model-service.
 * `value_json` crosses the wire as a JSON string in both directions.
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

    // Normalize the posted records through the model-service, which validates
    // them against the canonical layers record shape and returns them ready to
    // persist. Records carry `value_json` as a JSON string on the wire.
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
    // The model-service returns records whose `value_json` is a JSON string;
    // parse each back to the object shape the repository persists.
    const normalized = (await response.json()) as ModelServiceImportResponse
    const records: NormalizedRecordDTO[] = (
      Array.isArray(normalized.records) ? normalized.records : []
    ).map((record) => ({
      local_id: record.local_id,
      nsid: record.nsid,
      value_json: parseValueJson(record.value_json),
    }))

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
   * @returns the corpus's records in wire form plus the corpus name
   * @throws {UnauthorizedError} when unauthenticated
   * @throws {ValidationError} when neither corpusId nor corpusName is supplied
   * @throws {NotFoundError} when the corpus does not exist
   * @throws {ForbiddenError} when the caller cannot read the corpus
   */
  async exportRecords(request: ExportRequest): Promise<ExportResult> {
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

    // The model-service records carry `value_json` as a required JSON string;
    // serialize each row's value before sending so it matches the wire contract.
    const wireRecords = records.map((record) => ({
      local_id: record.local_id,
      nsid: record.nsid,
      value_json: JSON.stringify(record.value_json),
    }))

    const response = await fetchModelService(
      `${config.modelService.url}/api/layers/export`,
      {
        method: 'POST',
        timeoutMs: MODEL_SERVICE_TIMEOUTS.layersExport,
        body: { records: wireRecords, corpus_name: corpus.name },
      },
    )
    if (!response.ok) {
      const detail = await response.text()
      throw new ValidationError(`Model service rejected export: ${detail}`)
    }

    // The export endpoint answers with newline-delimited JSON (one record per
    // line); parse each non-empty line back into a wire record.
    const body = await response.text()
    const exported: NormalizedRecordDTO[] = body
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as NormalizedRecordDTO)

    return { records: exported, corpusName: corpus.name }
  }
}
