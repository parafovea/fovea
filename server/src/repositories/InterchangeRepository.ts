import { PrismaClient, Prisma, ImportHistory } from '@prisma/client'

/**
 * A single normalized interchange record as exchanged with the model-service
 * layers codec: an opaque JSON `value_json` tagged by its layers namespace id
 * (`nsid`) and a client-stable `local_id`. `local_id` doubles as the row id in
 * the layers store, which is what makes persistence idempotent (a re-imported
 * record upserts its existing row rather than minting a duplicate).
 */
export interface NormalizedRecordDTO {
  local_id: string
  nsid: string
  value_json: unknown
}

/**
 * Ownership scope stamped onto every row an import persists. Mirrors the
 * (projectId, createdByUserId) columns every layers content model carries so
 * CASL `accessibleBy`/`can` resolve against real values.
 */
export interface LayersScope {
  projectId: string | null
  createdByUserId: string
}

/** Outcome of persisting a batch of normalized records. */
export interface PersistResult {
  persisted: number
  skipped: number
  byNsid: Record<string, number>
}

/** The layers models an interchange record can dispatch to, in FK-safe order. */
export type InterchangeTarget = 'media' | 'corpus' | 'expression' | 'annotation-layer' | 'annotation'

/** The order rows must be written so a child's foreign keys already exist. */
const TARGET_ORDER: InterchangeTarget[] = [
  'media',
  'corpus',
  'expression',
  'annotation-layer',
  'annotation',
]

/**
 * Converts an arbitrary value to Prisma.InputJsonValue for storage in a JSON
 * column. Prisma JSON columns accept any serializable value at runtime; this
 * bridges the TypeScript gap without an unsafe cast.
 */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null))
}

/**
 * Renders an optional bundle for a nullable Json column: the bundle when
 * present, or undefined so the field is omitted from the write (leaving the
 * column NULL on create, untouched on update).
 */
function optionalJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null ? undefined : JSON.parse(JSON.stringify(value))
}

/** Narrows an unknown value_json to an indexable record without asserting shape. */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** The ownership stamp every layers content row carries. */
interface RowScope {
  createdByUserId: string | null
  projectId: string | null
}

/**
 * True when an existing row's ownership stamp matches the import scope. An
 * import may only create or update rows under its own (user, project) scope, so
 * a record whose id resolves to a row owned by a different scope is rejected.
 */
function scopeMatches(existing: RowScope, scope: LayersScope): boolean {
  return (
    existing.createdByUserId === scope.createdByUserId && existing.projectId === scope.projectId
  )
}

/** Reads a string field under either a camelCase or snake_case key. */
function readString(rec: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = rec[key]
    if (typeof v === 'string') return v
  }
  return undefined
}

/** Reads a numeric field under either a camelCase or snake_case key. */
function readNumber(rec: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const v = rec[key]
    if (typeof v === 'number') return v
  }
  return undefined
}

/**
 * Resolves an `nsid` to the layers model it persists into. The nsid is a
 * namespaced layers id (e.g. `pub.layers.expression#Expression`); we key off
 * its trailing type token so the mapping is stable across namespace prefixes.
 * Returns null for records this store does not persist (they are counted as
 * skipped rather than failing the whole batch).
 */
export function targetForNsid(nsid: string): InterchangeTarget | null {
  const token = nsid
    .split(/[/#.]/)
    .filter(Boolean)
    .pop()
    ?.toLowerCase()
  switch (token) {
    case 'media':
      return 'media'
    case 'corpus':
      return 'corpus'
    case 'expression':
      return 'expression'
    case 'annotationlayer':
    case 'annotation-layer':
    case 'layer':
      return 'annotation-layer'
    case 'annotation':
    case 'layersannotation':
      return 'annotation'
    default:
      return null
  }
}

/**
 * Owns every Prisma call the layers interchange makes: persisting a batch of
 * normalized records into the layers content tables (idempotently, by
 * `local_id`), reading a corpus back out as normalized records, and recording
 * the import-history audit row.
 *
 * The InterchangeService decides who may invoke a method and supplies the
 * ownership scope and any read filter; this class enforces no CASL policy of its
 * own, but it does scope every persist to the supplied import scope — an upsert
 * only touches a row (and a child only attaches to a parent) whose ownership
 * stamp matches, so an import cannot mutate or graft onto another owner's
 * content. Methods return raw Prisma types and propagate Prisma errors.
 *
 * @example
 * ```typescript
 * const repo = new InterchangeRepository(fastify.prisma)
 * const result = await repo.persistNormalizedRecords(records, scope)
 * ```
 */
export class InterchangeRepository {
  /**
   * Creates a new InterchangeRepository.
   *
   * @param prisma - Prisma client instance for database access
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Persists a batch of normalized records into the layers content tables in a
   * single transaction. Records are grouped by their resolved target model and
   * written in foreign-key-safe order (media/corpus before expression, layers
   * before annotations) so intra-batch references resolve. Each write is an
   * upsert keyed by `local_id`, making a re-import idempotent. Records whose
   * `nsid` maps to no store, whose required foreign keys are absent, whose
   * `local_id` resolves to a row owned by another scope, or whose parent belongs
   * to another scope are counted as skipped rather than aborting the batch.
   *
   * @param records - the normalized records to persist
   * @param scope - the (projectId, createdByUserId) ownership stamp for new rows
   * @returns the persisted/skipped counts and a per-nsid tally
   */
  async persistNormalizedRecords(
    records: NormalizedRecordDTO[],
    scope: LayersScope,
  ): Promise<PersistResult> {
    const byTarget = new Map<InterchangeTarget, NormalizedRecordDTO[]>()
    const byNsid: Record<string, number> = {}
    let skipped = 0

    for (const record of records) {
      const target = targetForNsid(record.nsid)
      if (!target) {
        skipped++
        continue
      }
      const bucket = byTarget.get(target) ?? []
      bucket.push(record)
      byTarget.set(target, bucket)
    }

    let persisted = 0
    await this.prisma.$transaction(async (tx) => {
      for (const target of TARGET_ORDER) {
        const bucket = byTarget.get(target)
        if (!bucket) continue
        for (const record of bucket) {
          const wrote = await this.persistOne(tx, target, record, scope)
          if (wrote) {
            persisted++
            byNsid[record.nsid] = (byNsid[record.nsid] ?? 0) + 1
          } else {
            skipped++
          }
        }
      }
    })

    return { persisted, skipped, byNsid }
  }

  /**
   * Upserts one normalized record into its target model, keyed by `local_id`.
   *
   * An id that already resolves to a row owned by a different (user, project)
   * scope is never overwritten: the record is skipped so an import cannot mutate
   * another owner's content by supplying (or colliding with) their `local_id`.
   * A child record (annotation layer, annotation) is likewise skipped when its
   * referenced parent (expression, layer) does not exist or belongs to a
   * different scope, so an import cannot graft rows onto another owner's parent.
   * An expression whose resolved corpus or parent expression belongs to another
   * scope is skipped for the same reason; an absent or unresolved container
   * leaves the foreign key null rather than skipping the record.
   *
   * @returns true when a row was written, false when the record was skipped —
   *   because a required field or foreign key was absent, or because it would
   *   have touched a row or parent outside the import scope
   */
  private async persistOne(
    tx: Prisma.TransactionClient,
    target: InterchangeTarget,
    record: NormalizedRecordDTO,
    scope: LayersScope,
  ): Promise<boolean> {
    const id = record.local_id
    const value = asRecord(record.value_json)
    const json = toJson(record.value_json)
    const { projectId, createdByUserId } = scope

    // Re-authorize against the existing row: an id already owned by another
    // scope is skipped rather than overwritten.
    const existing = await this.findRowScope(tx, target, id)
    if (existing && !scopeMatches(existing, scope)) return false

    switch (target) {
      case 'media': {
        const kind = readString(value, 'kind') ?? 'document'
        await tx.media.upsert({
          where: { id },
          create: {
            id,
            kind,
            title: readString(value, 'title'),
            metadata: json,
            projectId,
            createdByUserId,
          },
          update: { kind, title: readString(value, 'title'), metadata: json },
        })
        return true
      }
      case 'corpus': {
        const name = readString(value, 'name') ?? id
        await tx.corpus.upsert({
          where: { id },
          create: {
            id,
            name,
            description: readString(value, 'description'),
            version: readString(value, 'version'),
            domain: readString(value, 'domain'),
            metadata: json,
            projectId,
            createdByUserId,
          },
          update: { name, metadata: json },
        })
        return true
      }
      case 'expression': {
        const kind = readString(value, 'kind') ?? 'unknown'
        const layersId = readString(value, 'layersId', 'id') ?? id
        const sourceKind = readString(value, 'sourceKind', 'source_kind') ?? 'document'
        // Carry the container/source foreign keys so a corpus round-trip keeps
        // its members. Each FK is set only when the referenced parent exists in
        // the store (media/corpus are written earlier in the batch), leaving it
        // NULL otherwise so the write stays foreign-key-safe.
        const corpusId = await this.resolveFk(tx, 'corpus', readString(value, 'corpusId', 'corpus_id'))
        const mediaId = await this.resolveFk(tx, 'media', readString(value, 'mediaId', 'media_id'))
        const videoId = await this.resolveFk(tx, 'video', readString(value, 'videoId', 'video_id'))
        const parentExpressionId = await this.resolveFk(
          tx,
          'expression',
          readString(value, 'parentExpressionId', 'parent_expression_id'),
        )
        // A resolved container or parent must belong to the import scope; an
        // expression must not be grafted onto another owner's corpus or parent
        // expression. An absent or unresolved reference leaves the FK null (the
        // FK-safe behavior above) rather than skipping the record.
        if (corpusId) {
          const corpusOwner = await this.findRowScope(tx, 'corpus', corpusId)
          if (corpusOwner && !scopeMatches(corpusOwner, scope)) return false
        }
        if (parentExpressionId) {
          const parentOwner = await this.findRowScope(tx, 'expression', parentExpressionId)
          if (parentOwner && !scopeMatches(parentOwner, scope)) return false
        }
        await tx.expression.upsert({
          where: { id },
          create: {
            id,
            layersId,
            kind,
            sourceKind,
            text: readString(value, 'text'),
            metadata: json,
            corpusId,
            mediaId,
            videoId,
            parentExpressionId,
            projectId,
            createdByUserId,
          },
          update: {
            kind,
            layersId,
            sourceKind,
            text: readString(value, 'text'),
            metadata: json,
            corpusId,
            mediaId,
            videoId,
            parentExpressionId,
          },
        })
        return true
      }
      case 'annotation-layer': {
        const expressionId = readString(value, 'expressionId', 'expression_id')
        if (!expressionId) return false
        // The parent expression must exist and belong to the import scope; a
        // layer must not attach to another owner's expression.
        const parent = await this.findRowScope(tx, 'expression', expressionId)
        if (!parent || !scopeMatches(parent, scope)) return false
        const kind = readString(value, 'kind') ?? 'span'
        await tx.annotationLayer.upsert({
          where: { id },
          create: {
            id,
            expressionId,
            kind,
            subkind: readString(value, 'subkind'),
            metadata: json,
            projectId,
            createdByUserId,
          },
          update: { kind, subkind: readString(value, 'subkind'), metadata: json },
        })
        return true
      }
      case 'annotation': {
        const layerId = readString(value, 'layerId', 'layer_id')
        const anchor = value.anchor
        if (!layerId || anchor === undefined) return false
        // The parent layer must exist and belong to the import scope; an
        // annotation must not attach to another owner's layer.
        const parent = await this.findRowScope(tx, 'annotation-layer', layerId)
        if (!parent || !scopeMatches(parent, scope)) return false
        // Persist the semantic feature bundle, not the whole record: the
        // `features` column holds `value.features`, so downstream consumers read
        // the bundle rather than an id/anchor/label envelope.
        const features = optionalJson(value.features)
        // denotesNodeId is a real GraphNode FK: only set it when the referenced
        // node is present in the store, so an import never violates the FK (the
        // node is not part of the corpus export). ontologyTypeRefId is a soft
        // ref with no DB constraint and rides through as a plain scalar.
        const denotesNodeId = await this.resolveFk(
          tx,
          'graph-node',
          readString(value, 'denotesNodeId', 'denotes_node_id'),
        )
        await tx.layersAnnotation.upsert({
          where: { id },
          create: {
            id,
            layerId,
            anchor: toJson(anchor),
            tokenIndex: readNumber(value, 'tokenIndex', 'token_index'),
            label: readString(value, 'label'),
            value: readString(value, 'value'),
            text: readString(value, 'text'),
            headIndex: readNumber(value, 'headIndex', 'head_index'),
            targetIndex: readNumber(value, 'targetIndex', 'target_index'),
            arguments: optionalJson(value.arguments),
            confidence: readNumber(value, 'confidence'),
            ontologyTypeRefId: readString(value, 'ontologyTypeRefId', 'ontology_type_ref_id'),
            denotesNodeId,
            temporal: optionalJson(value.temporal),
            spatial: optionalJson(value.spatial),
            features,
            projectId,
            createdByUserId,
          },
          update: {
            anchor: toJson(anchor),
            tokenIndex: readNumber(value, 'tokenIndex', 'token_index'),
            label: readString(value, 'label'),
            value: readString(value, 'value'),
            text: readString(value, 'text'),
            headIndex: readNumber(value, 'headIndex', 'head_index'),
            targetIndex: readNumber(value, 'targetIndex', 'target_index'),
            arguments: optionalJson(value.arguments),
            confidence: readNumber(value, 'confidence'),
            ontologyTypeRefId: readString(value, 'ontologyTypeRefId', 'ontology_type_ref_id'),
            denotesNodeId,
            temporal: optionalJson(value.temporal),
            spatial: optionalJson(value.spatial),
            features,
          },
        })
        return true
      }
    }
  }

  /**
   * Reads the ownership stamp of an existing target row by id, or null when no
   * row exists. Used to re-authorize an upsert against the row it would touch
   * and to verify a child record's parent belongs to the import scope.
   */
  private async findRowScope(
    tx: Prisma.TransactionClient,
    target: InterchangeTarget,
    id: string,
  ): Promise<RowScope | null> {
    const scope = { createdByUserId: true, projectId: true } as const
    switch (target) {
      case 'media':
        return tx.media.findUnique({ where: { id }, select: scope })
      case 'corpus':
        return tx.corpus.findUnique({ where: { id }, select: scope })
      case 'expression':
        return tx.expression.findUnique({ where: { id }, select: scope })
      case 'annotation-layer':
        return tx.annotationLayer.findUnique({ where: { id }, select: scope })
      case 'annotation':
        return tx.layersAnnotation.findUnique({ where: { id }, select: scope })
    }
  }

  /**
   * Resolves an optional foreign key to itself when the referenced parent
   * exists in the store, or undefined otherwise, so a write only sets an FK
   * whose target is present. Returns undefined for an absent id.
   */
  private async resolveFk(
    tx: Prisma.TransactionClient,
    model: 'corpus' | 'media' | 'video' | 'expression' | 'graph-node',
    id: string | undefined,
  ): Promise<string | undefined> {
    if (!id) return undefined
    const idOnly = { id: true } as const
    let found: { id: string } | null = null
    switch (model) {
      case 'corpus':
        found = await tx.corpus.findUnique({ where: { id }, select: idOnly })
        break
      case 'media':
        found = await tx.media.findUnique({ where: { id }, select: idOnly })
        break
      case 'video':
        found = await tx.video.findUnique({ where: { id }, select: idOnly })
        break
      case 'expression':
        found = await tx.expression.findUnique({ where: { id }, select: idOnly })
        break
      case 'graph-node':
        found = await tx.graphNode.findUnique({ where: { id }, select: idOnly })
        break
    }
    return found ? id : undefined
  }

  /**
   * Records an import-history audit row.
   *
   * @param data - the import-history fields (filename, options, result, counts)
   * @returns the created import-history row
   */
  async recordImportHistory(
    data: Prisma.ImportHistoryUncheckedCreateInput,
  ): Promise<ImportHistory> {
    return this.prisma.importHistory.create({ data })
  }

  /**
   * Finds a corpus by id.
   *
   * @param id - corpus id
   * @returns the corpus, or null when absent
   */
  async findCorpusById(id: string) {
    return this.prisma.corpus.findUnique({ where: { id } })
  }

  /**
   * Finds the first corpus with the given name.
   *
   * @param name - corpus name
   * @returns the corpus, or null when none matches
   */
  async findCorpusByName(name: string) {
    return this.prisma.corpus.findFirst({ where: { name } })
  }

  /**
   * Reads a corpus back out as normalized records: the corpus itself, every
   * expression scoped to it that also satisfies `expressionScope` (the caller's
   * CASL read filter), and each such expression's annotation layers and
   * annotations. The corpus row is included so a round-trip export carries its
   * own container metadata.
   *
   * @param corpus - the corpus row to export
   * @param expressionScope - the caller's CASL read filter over expressions
   * @returns the normalized records making up the corpus
   */
  async readCorpusRecords(
    corpus: { id: string; name: string },
    expressionScope: Prisma.ExpressionWhereInput,
  ): Promise<NormalizedRecordDTO[]> {
    const expressions = await this.prisma.expression.findMany({
      where: { AND: [{ corpusId: corpus.id }, expressionScope] },
      include: { annotationLayers: { include: { annotations: true } } },
      orderBy: { createdAt: 'asc' },
    })

    const records: NormalizedRecordDTO[] = [
      { local_id: corpus.id, nsid: 'pub.layers.corpus#Corpus', value_json: corpus },
    ]

    for (const expr of expressions) {
      const { annotationLayers, ...exprValue } = expr
      records.push({
        local_id: expr.id,
        nsid: 'pub.layers.expression#Expression',
        value_json: exprValue,
      })
      for (const layer of annotationLayers) {
        const { annotations, ...layerValue } = layer
        records.push({
          local_id: layer.id,
          nsid: 'pub.layers.annotation#AnnotationLayer',
          value_json: layerValue,
        })
        for (const annotation of annotations) {
          records.push({
            local_id: annotation.id,
            nsid: 'pub.layers.annotation#Annotation',
            value_json: annotation,
          })
        }
      }
    }

    return records
  }
}
