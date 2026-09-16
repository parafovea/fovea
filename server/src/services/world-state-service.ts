import { Prisma, PrismaClient, type Persona } from '@prisma/client'
import { subject } from '@casl/ability'

import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, UnauthorizedError, InternalError, ForbiddenError, ConflictError } from '../lib/errors.js'
import { config } from '../config.js'
import {
  dereferenceGlossItems,
  dereferenceSummaries,
  countObjectRefsInGlosses,
  type DereferenceTarget,
  type TypeWithGloss,
} from '../lib/reference-cleanup.js'
import type { GlossItem } from '@models/types.js'
import { dereferenceClaimProse, clearClaimStructuredRefs } from './layers-bridge/claim-bridge.js'
import { LayersOntologyRepository } from '../repositories/LayersOntologyRepository.js'
import { isSingleUserMode } from './user-service.js'
import { layersOntologyForPersonaId, worldScaffoldLayerId } from './layers-id-map.js'
import { clearVideoBoxesElseDelete } from './layers-bridge/annotation-bridge.js'
import {
  emptyWorldState,
  personalWorldStateId,
  type WorldStateAggregate,
} from './world-model.js'
import { worldStateToLayersViaLens, layersToWorldStateViaLens } from './layers-lens/world-lens.js'
import {
  readWorldRows,
  pruneWorldRows,
  createWorldProjection,
  upsertWorldProjection,
} from './layers-bridge/world-store.js'
import {
  emptyOntology,
  type PersonaOntologyAggregate,
} from './ontology-model.js'
import { layersToOntologyViaLens, ontologyToLayersViaLens } from './layers-lens/ontology-lens.js'
import { readGlossMap, writeGlossStandoff } from './layers-bridge/ontology-bridge.js'

/**
 * Coerces a value to Prisma.InputJsonValue for a JSON column, omitting the field
 * for null/undefined so the column stays NULL. Round-tripping through JSON also
 * strips undefined object properties so stored JSON compares equal on read.
 */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/** Coerces a JSON column to an array of records, tolerating null/non-array. */
function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/**
 * Merge an incoming array of `{ id }` objects into an existing one by id:
 * existing items keep their position, a matching id is overwritten, and new
 * ids are appended. This turns the whole-blob PUT into an upsert so a writer
 * carrying a stale view (it never saw a concurrently-added item) no longer
 * drops it — the merge re-runs against the freshly-read row via optimistic
 * concurrency. Removals go through the explicit DELETE routes, never omission.
 */
export function mergeById(existing: Prisma.JsonValue | null | undefined, incoming: unknown[]): Prisma.InputJsonValue {
  const byId = new Map<string, unknown>()
  const order: string[] = []
  const add = (item: unknown) => {
    const id = (item as { id?: string } | null)?.id
    if (!id) return
    if (!byId.has(id)) order.push(id)
    byId.set(id, item)
  }
  if (Array.isArray(existing)) existing.forEach(add)
  incoming.forEach(add)
  return order.map((id) => byId.get(id)) as Prisma.InputJsonValue
}

/**
 * Partial world state update fields. All fields are optional; only provided
 * fields are written.
 */
export interface WorldStateUpdateInput {
  entities?: unknown[]
  events?: unknown[]
  times?: unknown[]
  entityCollections?: unknown[]
  eventCollections?: unknown[]
  timeCollections?: unknown[]
  relations?: unknown[]
}

/**
 * API-facing world state shape: the entity/event/time/collection/relation JSON
 * arrays plus the id, userId, and ISO timestamps.
 */
export interface WorldStateResponse {
  id: string
  userId: string
  entities: unknown[]
  events: unknown[]
  times: unknown[]
  entityCollections: unknown[]
  eventCollections: unknown[]
  timeCollections: unknown[]
  relations: unknown[]
  createdAt: string
  updatedAt: string
}

/** Counts returned by a world-object deletion preview. */
export interface WorldObjectDeletionPreview {
  glossReferences: number
  annotationCount: number
  relationCount: number
  collectionMemberships: number
}

/** Success payload returned by a world-object deletion with cleanup. */
export interface WorldObjectDeletionResult {
  message: string
  cleanedUp: {
    glossReferences: number
    relations: number
    collectionMemberships: number
  }
}

/** The reconstructed world plus whether any backing rows existed. */
export interface PersonalWorldRead {
  aggregate: WorldStateAggregate
  exists: boolean
}

/** A persona's reconstructed ontology plus its id and timestamps. */
export interface PersonaOntologyBundle {
  id: string
  personaId: string
  aggregate: PersonaOntologyAggregate
  createdAt: string
  updatedAt: string
}

/** The bucket keys of a WorldState aggregate. */
const WORLD_BUCKET_KEYS: (keyof WorldStateAggregate)[] = [
  'entities',
  'events',
  'times',
  'entityCollections',
  'eventCollections',
  'timeCollections',
  'relations',
]

/**
 * The world buckets whose objects carry a dereferenceable `.description` gloss.
 * Times/timeCollections/relations carry no description, so they are not swept.
 */
const DESCRIPTION_BUCKET_KEYS: (keyof WorldStateAggregate)[] = [
  'entities',
  'events',
  'entityCollections',
  'eventCollections',
]

/**
 * How a collection bucket stores its members. Entity and event collections carry
 * a string-id array (`entityIds` / `eventIds`); a time collection carries `times`,
 * an array of Time objects matched by their `id`. World collections never carry a
 * `members` field.
 */
interface CollectionMemberField {
  field: 'entityIds' | 'eventIds' | 'times'
  /** True when the field holds member objects keyed by `id`, false for a raw id array. */
  objectMembers: boolean
}

/**
 * Resolves the personal user id to operate on: the authenticated user, or the
 * configured default user in single-user mode.
 *
 * @param prisma - the Prisma client
 * @param userId - the authenticated user id, if any
 * @returns the resolved user id
 * @throws {InternalError} when the default user is missing in single-user mode
 * @throws {UnauthorizedError} when no user is present and not in single-user mode
 */
export async function resolvePersonalUserId(
  prisma: PrismaClient,
  userId: string | undefined,
): Promise<string> {
  if (userId) return userId
  if (isSingleUserMode()) {
    const defaultUser = await prisma.user.findFirst({ where: { username: config.defaultUser.username } })
    if (!defaultUser) throw new InternalError('Default user not found in single-user mode')
    return defaultUser.id
  }
  throw new UnauthorizedError('Authentication required')
}

/**
 * Owns world-state persistence and reference cleanup over the layers store,
 * keeping the `/api/world` contract identical while reading and writing
 * GraphNode / GraphEdge (world objects) and LayersOntology / TypeDef (the
 * persona ontologies its gloss cleanup rewrites).
 *
 * World objects are keyed by scope (createdByUserId = the user, projectId = null
 * for personal state) rather than by a single WorldState row. Reads reconstruct
 * the aggregate from the scoped graph rows; when none exist, a legacy WorldState
 * row is surfaced read-through so writers not yet re-pointed (import) keep
 * working until the next save materializes the aggregate into layers. Writes
 * prune the scope's world rows and recreate them from the aggregate.
 *
 * @example
 * ```typescript
 * const service = new WorldStateService(ontologyRepo, prisma, request.ability ?? null, request.user?.id)
 * const worldState = await service.getOrCreatePersonal()
 * ```
 */
export class WorldStateService {
  constructor(
    private readonly ontologyRepo: LayersOntologyRepository,
    private readonly prisma: PrismaClient,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined,
  ) {}

  /** Resolves the personal user id (authenticated user or single-user default). */
  private resolveUserId(): Promise<string> {
    return resolvePersonalUserId(this.prisma, this.userId)
  }

  /** Wraps a reconstructed aggregate in the API response shape. */
  private toResponse(userId: string, aggregate: WorldStateAggregate): WorldStateResponse {
    const now = new Date().toISOString()
    return {
      id: personalWorldStateId(userId),
      userId,
      entities: aggregate.entities,
      events: aggregate.events,
      times: aggregate.times,
      entityCollections: aggregate.entityCollections,
      eventCollections: aggregate.eventCollections,
      timeCollections: aggregate.timeCollections,
      relations: aggregate.relations,
      createdAt: now,
      updatedAt: now,
    }
  }

  /**
   * Reads a user's personal world from the layers store.
   *
   * @param userId - the owning user id
   * @param tx - optional transaction client to read inside (so a cleanup reads the
   *   post-delete state committed earlier in the same delete transaction)
   * @returns the reconstructed aggregate and whether any backing rows existed
   */
  async readPersonalWorld(userId: string, tx?: Prisma.TransactionClient): Promise<PersonalWorldRead> {
    const { rows, exists } = await readWorldRows(tx ?? this.prisma, { createdByUserId: userId, projectId: null })
    return exists
      ? { aggregate: await layersToWorldStateViaLens(rows), exists: true }
      : { aggregate: emptyWorldState(), exists: false }
  }

  /**
   * Writes a user's personal world to the layers store: prunes the scope's
   * existing world rows, then recreates nodes and edges from the aggregate.
   *
   * @param userId - the owning user id
   * @param aggregate - the world state to persist
   * @throws {ForbiddenError} when create access to the scope is denied
   */
  async writePersonalWorld(userId: string, aggregate: WorldStateAggregate): Promise<void> {
    const scope = { createdByUserId: userId, projectId: null }
    const projection = await worldStateToLayersViaLens(aggregate, scope)

    const hasRows =
      projection.nodes.length > 0 || projection.edges.length > 0 || projection.catalogCollections.length > 0
    if (hasRows && this.ability) {
      const candidate = subject('GraphNode', { projectId: null, createdByUserId: userId })
      if (!this.ability.can('create', candidate)) {
        throw new ForbiddenError('Cannot create world objects in this scope')
      }
    }

    await pruneWorldRows(this.prisma, scope)
    await createWorldProjection(this.prisma, projection)
  }

  /**
   * Gets the caller's personal world, returning an empty aggregate when none
   * exists (get-or-nothing: no placeholder row is created).
   *
   * @returns the world state in API shape
   */
  async getOrCreatePersonal(): Promise<WorldStateResponse> {
    const userId = await this.resolveUserId()
    const { aggregate } = await this.readPersonalWorld(userId)
    return this.toResponse(userId, aggregate)
  }

  /**
   * Merges an aggregate into the caller's scoped world rows: each object is
   * upserted as its own GraphNode/GraphEdge row (created when new, updated under
   * a lockVersion compare-and-swap when it already exists). Rows the aggregate
   * does not mention are left in place, so a partial write never drops a
   * concurrently-added object; removal is explicit (the DELETE routes). On a CAS
   * miss the whole reconcile retries against a fresh read so a concurrent
   * same-object edit is not silently clobbered.
   *
   * @param userId - the owning user id
   * @param projectId - the project scope (null for personal state)
   * @param aggregate - the world objects to upsert
   * @throws {ForbiddenError} when create access to the scope is denied
   * @throws {ConflictError} when the write keeps conflicting after retries
   */
  private async upsertWorldObjects(
    userId: string,
    projectId: string | null,
    aggregate: WorldStateAggregate,
  ): Promise<void> {
    const scope = { createdByUserId: userId, projectId }
    const projection = await worldStateToLayersViaLens(aggregate, scope)
    if (projection.nodes.length === 0 && projection.edges.length === 0 && projection.catalogCollections.length === 0)
      return

    if (this.ability) {
      const candidate = subject('GraphNode', { projectId, createdByUserId: userId })
      if (!this.ability.can('create', candidate)) {
        throw new ForbiddenError('Cannot create world objects in this scope')
      }
    }

    await upsertWorldProjection(this.prisma, scope, projection, 5)
  }

  /**
   * Merges world buckets into a user's personal world by id under the per-row
   * `lockVersion` guard: each provided bucket is upserted into the current state,
   * objects the caller did not send are preserved, and omitted buckets are left
   * untouched. Removal is explicit (the DELETE routes), never omission, so a
   * partial write carrying a stale view never drops a concurrently-added object.
   *
   * @param userId - the owning user id
   * @param world - the world buckets to merge (omitted buckets are untouched)
   * @throws {ForbiddenError} when create access to the scope is denied
   * @throws {ConflictError} when the write keeps conflicting after retries
   */
  async mergePersonalWorld(userId: string, world: Partial<WorldStateAggregate>): Promise<void> {
    const { aggregate } = await this.readPersonalWorld(userId)
    const merged: WorldStateAggregate = { ...aggregate }
    for (const key of WORLD_BUCKET_KEYS) {
      const value = world[key]
      if (value !== undefined) {
        merged[key] = mergeById(aggregate[key] as unknown as Prisma.JsonValue, value) as unknown as unknown[]
      }
    }
    await this.upsertWorldObjects(userId, null, merged)
  }

  /**
   * Updates the caller's personal world; only provided buckets are written, the
   * rest are preserved from the current state.
   *
   * @param input - partial world state update fields
   * @returns the updated world state in API shape
   */
  async updatePersonal(input: WorldStateUpdateInput): Promise<WorldStateResponse> {
    const userId = await this.resolveUserId()
    await this.mergePersonalWorld(userId, input)
    const { aggregate: after } = await this.readPersonalWorld(userId)
    return this.toResponse(userId, after)
  }

  /**
   * The ids of the world-scaffold annotations attached to a collection — its
   * type-assignment and description annotations, which have no GraphNode to
   * denote and instead carry the collection in an `argumentRef` role `subject`.
   */
  private async collectionAnnotationIds(userId: string, collectionId: string): Promise<string[]> {
    const rows = await this.prisma.layersAnnotation.findMany({
      where: { layerId: worldScaffoldLayerId(userId, null), denotesNodeId: null },
      select: { id: true, arguments: true },
    })
    return rows
      .filter((row) => {
        const args = Array.isArray(row.arguments) ? row.arguments : []
        return args.some(
          (a) =>
            (a as { role?: unknown; target?: { localId?: { value?: unknown } } } | null)?.role === 'subject' &&
            (a as { target?: { localId?: { value?: unknown } } }).target?.localId?.value === collectionId,
        )
      })
      .map((row) => row.id)
  }

  /**
   * Removes a single object (by id) from one of the personal world's collection
   * or relation buckets. A collection is a catalog collection plus its memberships
   * and a relation is a
   * GraphEdge, so removal deletes the matching rows directly (scoped to the caller
   * so another user's row cannot be touched); a collection's type-assignment and
   * description annotations are removed with it. Removal is explicit, never
   * omission from a whole-blob PUT, so the merge-by-id update cannot resurrect a
   * deleted object.
   *
   * @param field - the bucket to remove from
   * @param objectId - the id of the object to remove
   * @throws {NotFoundError} when the user has no personal world state
   * @throws {ForbiddenError} when update access is denied
   */
  async removeWorldObject(
    field: 'entityCollections' | 'eventCollections' | 'timeCollections' | 'relations',
    objectId: string,
  ): Promise<void> {
    const userId = await this.resolveUserId()
    const { aggregate, exists } = await this.readPersonalWorld(userId)
    if (!exists) {
      throw new NotFoundError('WorldState', userId)
    }
    // Confirm the id names a world row in exactly this bucket before deleting, so a
    // collection or relation id from another bucket — or a non-world row the caller
    // happens to own — cannot be destroyed through the wrong endpoint, bypassing the
    // graceful-delete cleanup path.
    const present = asRecords(aggregate[field]).some((object) => object.id === objectId)
    if (!present) {
      throw new NotFoundError('World object', objectId)
    }
    if (this.ability) {
      const candidate = subject('GraphNode', { projectId: null, createdByUserId: userId })
      if (!this.ability.can('update', candidate)) {
        throw new ForbiddenError('Cannot update world objects in this scope')
      }
    }

    const owner = { createdByUserId: userId, projectId: null }
    if (field === 'relations') {
      await this.prisma.graphEdge.deleteMany({ where: { id: objectId, ...owner } })
    } else {
      const annotationIds = await this.collectionAnnotationIds(userId, objectId)
      await this.prisma.catalogMembership.deleteMany({ where: { catalogRef: objectId, ...owner } })
      await this.prisma.catalogCollection.deleteMany({ where: { id: objectId, ...owner } })
      if (annotationIds.length > 0) {
        await this.prisma.layersAnnotation.deleteMany({ where: { id: { in: annotationIds } } })
      }
    }
  }

  /**
   * Clears a specific user's personal world by pruning its layers rows. Used by
   * the admin endpoint; the admin check itself remains route middleware.
   *
   * @param userId - the user whose world should be cleared
   * @returns the cleared user's id
   * @throws {NotFoundError} when the target user does not exist
   */
  async clearForUser(userId: string): Promise<{ message: string; userId: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundError('User', userId)
    await this.writePersonalWorld(userId, emptyWorldState())
    return { message: 'World state cleared successfully', userId }
  }

  // --- Persona ontology persistence (shared with the ontology route) -------

  /**
   * Returns the ontology repository bound to the given transaction client, or the
   * per-request repository when no transaction is supplied. Lets the gloss
   * cleanup commit atomically with the world-object delete that drives it.
   */
  private ontologyRepoFor(tx?: Prisma.TransactionClient): LayersOntologyRepository {
    return tx ? new LayersOntologyRepository(tx) : this.ontologyRepo
  }

  /**
   * Reads a persona's ontology from the layers store.
   *
   * @param persona - the persona whose ontology to read
   * @param tx - optional transaction client to read inside
   * @returns the reconstructed ontology bundle, or null when the persona has none
   */
  async readPersonaOntologyBundle(
    persona: Persona,
    tx?: Prisma.TransactionClient,
  ): Promise<PersonaOntologyBundle | null> {
    const repo = this.ontologyRepoFor(tx)
    const ontologyId = layersOntologyForPersonaId(persona.id)
    const ontologyRow = await repo.findOntologyById(ontologyId)
    if (ontologyRow) {
      const typeDefs = await repo.findAccessibleTypeDefs({}, { ontologyId })
      const glossMap = await readGlossMap(tx ?? this.prisma, typeDefs)
      return {
        id: ontologyRow.id,
        personaId: persona.id,
        aggregate: layersToOntologyViaLens(typeDefs, glossMap),
        createdAt: ontologyRow.createdAt.toISOString(),
        updatedAt: ontologyRow.updatedAt.toISOString(),
      }
    }

    return null
  }

  /**
   * Merges buckets of a persona's ontology into the layers store by type id,
   * guarded by the backing `LayersOntology.lockVersion`. Only the buckets the
   * caller provides are merged (an omitted bucket is left untouched); within a
   * provided bucket each type is upserted by id and types the caller did not send
   * are preserved, so removals go through the explicit type-deletion routes rather
   * than omission. The read, compare-and-swap, and materialization run in one
   * transaction and retry against a fresh read when a concurrent writer advanced
   * the version, so a stale save neither drops a concurrently-added type nor wipes
   * the ontology on a mid-write failure.
   *
   * @param persona - the owning persona
   * @param buckets - the type buckets to merge (omitted buckets are untouched)
   * @param tx - optional transaction client to run the guarded write inside
   * @throws {ConflictError} when the write keeps conflicting after retries
   */
  async writePersonaOntology(
    persona: Persona,
    buckets: Partial<PersonaOntologyAggregate>,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const scope = { projectId: persona.projectId, createdByUserId: persona.userId }
    const meta = {
      name: `${persona.name} ontology`,
      description: persona.informationNeed,
      domain: persona.domain,
    }
    const ontologyId = layersOntologyForPersonaId(persona.id)

    const write = async (client: Prisma.TransactionClient): Promise<void> => {
      const repo = this.ontologyRepoFor(client)
      const mergeBucket = (base: unknown[], incoming: unknown[] | undefined): unknown[] =>
        incoming === undefined
          ? base
          : (mergeById(base as unknown as Prisma.JsonValue, incoming) as unknown as unknown[])

      for (let attempt = 0; attempt < 5; attempt++) {
        const existing = await repo.findOntologyById(ontologyId)
        let current = emptyOntology()
        if (existing) {
          const currentTypeDefs = await repo.findAccessibleTypeDefs({}, { ontologyId })
          const currentGloss = await readGlossMap(client, currentTypeDefs)
          current = layersToOntologyViaLens(currentTypeDefs, currentGloss)
        }
        const merged: PersonaOntologyAggregate = {
          entityTypes: mergeBucket(current.entityTypes, buckets.entityTypes),
          eventTypes: mergeBucket(current.eventTypes, buckets.eventTypes),
          roleTypes: mergeBucket(current.roleTypes, buckets.roleTypes),
          relationTypes: mergeBucket(current.relationTypes, buckets.relationTypes),
        }
        const { ontology, typeDefs } = await ontologyToLayersViaLens(merged, persona.id, meta, scope)

        if (existing) {
          // Compare-and-swap the ontology version before rewriting its types; on a
          // miss a concurrent writer advanced it, so retry against a fresh read.
          const guard = await client.layersOntology.updateMany({
            where: { id: ontologyId, lockVersion: existing.lockVersion },
            data: {
              name: ontology.name,
              description: ontology.description,
              domain: ontology.domain,
              lockVersion: { increment: 1 },
            },
          })
          if (guard.count !== 1) continue
        } else {
          try {
            await repo.createOntology({
              id: ontology.id,
              name: ontology.name,
              description: ontology.description,
              domain: ontology.domain,
              personaId: ontology.personaId,
              projectId: ontology.projectId,
              createdByUserId: ontology.createdByUserId,
            })
          } catch (error) {
            // A concurrent first save created the row; retry onto the guarded path.
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue
            throw error
          }
        }

        // The merged aggregate carries every surviving type, so recreate the full
        // set: prune the current rows and re-insert. Insert types parent-free first,
        // then set parent refs that resolve to a sibling type, so a self-relation FK
        // never references a not-yet-inserted row.
        const oldTypeDefs = await repo.findAccessibleTypeDefs({}, { ontologyId })
        for (const typeDef of oldTypeDefs) await repo.deleteTypeDef(typeDef.id)

        const createdIds = new Set<string>()
        for (const typeDef of typeDefs) {
          await repo.createTypeDef({
            id: typeDef.id,
            ontologyId: typeDef.ontologyId,
            name: typeDef.name,
            typeKind: typeDef.typeKind,
            gloss: typeDef.gloss,
            parentTypeId: null,
            allowedRoles: toJson(typeDef.allowedRoles),
            allowedValues: toJson(typeDef.allowedValues),
            knowledgeRefs: toJson(typeDef.knowledgeRefs),
            features: toJson(typeDef.features),
            projectId: typeDef.projectId,
            createdByUserId: typeDef.createdByUserId,
          })
          createdIds.add(typeDef.id)
          // The TypeDef row id in this path is the original type id, so the gloss
          // stand-off rows key off it directly.
          await writeGlossStandoff(client, typeDef.id, typeDef.glossItems, ontologyId, persona.id, scope)
        }
        for (const typeDef of typeDefs) {
          if (typeDef.parentTypeId && createdIds.has(typeDef.parentTypeId)) {
            await repo.updateTypeDef(typeDef.id, { parentTypeId: typeDef.parentTypeId })
          }
        }
        return
      }
      throw new ConflictError('Ontology update conflicted after retries')
    }

    if (tx) {
      await write(tx)
    } else {
      await this.prisma.$transaction(write)
    }
  }

  // --- World object deletion with reference cleanup ------------------------

  /**
   * Enumerates the user's personas paired with their reconstructed ontology,
   * for the gloss reference scan and rewrite.
   */
  private async personasWithOntology(
    userId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Array<{ persona: Persona; aggregate: PersonaOntologyAggregate }>> {
    const personas = await (tx ?? this.prisma).persona.findMany({ where: { userId } })
    const result: Array<{ persona: Persona; aggregate: PersonaOntologyAggregate }> = []
    for (const persona of personas) {
      const bundle = await this.readPersonaOntologyBundle(persona, tx)
      result.push({ persona, aggregate: bundle ? bundle.aggregate : emptyOntology() })
    }
    return result
  }

  /** Counts gloss references to a world object across every persona ontology. */
  private async countGlossReferences(
    userId: string,
    objectId: string,
    refType: 'entity-object' | 'event-object' | 'time-object',
  ): Promise<number> {
    let count = 0
    for (const { aggregate } of await this.personasWithOntology(userId)) {
      count += countObjectRefsInGlosses(aggregate.entityTypes as TypeWithGloss[], objectId, refType)
      count += countObjectRefsInGlosses(aggregate.roleTypes as TypeWithGloss[], objectId, refType)
      count += countObjectRefsInGlosses(aggregate.eventTypes as TypeWithGloss[], objectId, refType)
      count += countObjectRefsInGlosses(aggregate.relationTypes as TypeWithGloss[], objectId, refType)
    }
    return count
  }

  /**
   * Freezes every inline mention of a deleted thing across every persona
   * ontology's gloss to the thing's human-readable display name, returning the
   * number of mentions frozen. This is the single seam for all four reference
   * kinds over ontology glosses: the {@link dereferenceGlossItems} matcher
   * decides which gloss segments belong to the target
   * (typeRef / objectRef / claimRef / annotationRef), and the rewrite commits
   * through {@link writePersonaOntology}, which regenerates the stand-off gloss
   * rows from the aggregate. It never deletes a stand-off row directly — doing so
   * would strand the gloss segment instead of freezing it to text. The read,
   * rewrite, and version-guarded write run inside the caller's transaction when
   * one is supplied, so the freeze commits atomically with the delete that drives
   * it.
   *
   * @param userId - the owner whose persona ontologies are swept
   * @param target - the deleted thing (kind + id) and its replacement display name
   * @param tx - optional transaction client so the freeze commits with the delete
   * @returns the total number of gloss mentions frozen to text
   */
  async dereferenceOntologyGlosses(
    userId: string,
    target: DereferenceTarget,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    let total = 0
    for (const { persona, aggregate } of await this.personasWithOntology(userId, tx)) {
      let personaHits = 0
      const convert = (types: unknown[]): unknown[] =>
        (types as Array<Record<string, unknown>>).map((type) => {
          const gloss = type.gloss
          if (!Array.isArray(gloss)) return type
          const { gloss: rewritten, count } = dereferenceGlossItems(gloss as GlossItem[], target)
          if (count === 0) return type
          personaHits += count
          return { ...type, gloss: rewritten }
        })

      const entityTypes = convert(aggregate.entityTypes)
      const eventTypes = convert(aggregate.eventTypes)
      const roleTypes = convert(aggregate.roleTypes)
      const relationTypes = convert(aggregate.relationTypes)
      if (personaHits === 0) continue

      total += personaHits
      await this.writePersonaOntology(persona, { entityTypes, eventTypes, roleTypes, relationTypes }, tx)
    }
    return total
  }

  /**
   * Converts every persona ontology's gloss references to a deleted world object
   * into plain text, returning the number of references found. A thin
   * object-reference specialization of {@link dereferenceOntologyGlosses}.
   *
   * @param userId - owning user id
   * @param objectId - id of the deleted world object
   * @param refType - the kind of object reference to rewrite
   * @param objectName - display name to substitute for the reference
   * @param tx - optional transaction client so the rewrite commits atomically
   *   with the world-object delete that drives it
   * @returns the total number of gloss references converted
   */
  private cleanupGlossReferences(
    userId: string,
    objectId: string,
    refType: 'entity-object' | 'event-object' | 'time-object',
    objectName: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    return this.dereferenceOntologyGlosses(
      userId,
      { kind: 'objectRef', id: objectId, name: objectName, refType },
      tx,
    )
  }

  /**
   * Freezes every inline mention of a deleted thing in a world object's
   * `.description` gloss to its human-readable display name, across the four
   * description-carrying buckets (entities, events, entity/event collections).
   *
   * A `.description` is stand-off: each non-text segment materializes as a child
   * LayersAnnotation under the object's presence annotation. The rewrite therefore
   * goes through the aggregate — read the world, rewrite each changed object's
   * `.description` with the shared {@link dereferenceGlossItems} matcher, and write
   * the changed objects back through the world projection, which regenerates the
   * stand-off from the rewritten gloss. Nulling a gloss-reference row directly would
   * strand its segment instead of freezing it, so the write never edits a stand-off
   * row by hand.
   *
   * The read and the version-guarded write both run on the caller's transaction
   * (`tx`), so the sweep commits atomically with the delete that drives it; a
   * same-object compare-and-swap miss rolls the whole delete back (the projection
   * write uses a single attempt, mirroring `mergeWorldObjects`). The private
   * {@link upsertWorldObjects} — the live `/api/world` PUT vehicle — is deliberately
   * not reused: it writes on `this.prisma` with a 5-attempt retry and an ability
   * gate, the wrong shape for a tx-enclosed, already-authorized cleanup.
   *
   * @param userId - the owning user id
   * @param target - the deleted thing and the display name its mentions freeze to
   * @param tx - the delete transaction the read and write join
   * @returns the total number of description mentions frozen to text
   */
  async dereferenceWorldDescriptions(
    userId: string,
    target: DereferenceTarget,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const { aggregate, exists } = await this.readPersonalWorld(userId, tx)
    if (!exists) return 0

    let total = 0
    const changed: Partial<WorldStateAggregate> = {}
    for (const bucket of DESCRIPTION_BUCKET_KEYS) {
      const changedObjects: Record<string, unknown>[] = []
      for (const object of asRecords(aggregate[bucket])) {
        // Never re-project the deleted object itself — that would resurrect its node.
        if (object.id === target.id) continue
        const description = object.description
        if (!Array.isArray(description) || description.length === 0) continue
        const { gloss, count } = dereferenceGlossItems(description as GlossItem[], target)
        if (count === 0) continue
        total += count
        changedObjects.push({ ...object, description: gloss })
      }
      if (changedObjects.length > 0) changed[bucket] = changedObjects
    }
    if (total === 0) return 0

    // Write back ONLY the changed objects as a partial aggregate: the projection
    // upserts just those nodes/collections and regenerates only their stand-off,
    // leaving every other object (and other collections' memberships) untouched.
    const scope = { createdByUserId: userId, projectId: null }
    const partial: WorldStateAggregate = { ...emptyWorldState(), ...changed }
    const projection = await worldStateToLayersViaLens(partial, scope)
    await upsertWorldProjection(tx ?? this.prisma, scope, projection, 1)
    return total
  }

  /**
   * Freezes every inline text mention of a deleted thing across ALL carriers to
   * its human-readable display name, in one pass: the persona-ontology glosses,
   * the world objects' `.description` glosses, the video summaries, and the claim
   * prose. Each sub-sweep is idempotent and writes nothing when it finds no
   * matching mention, so calling this from a path that already froze one carrier
   * (e.g. a type deletion that already rewrote its own ontology typeRef) is a
   * harmless no-op on that carrier rather than a double-write. The read and the
   * version-guarded writes join the caller's transaction, so the whole freeze
   * commits atomically with the delete that drives it.
   *
   * This is the TEXT-dereference half of the graceful-delete policy; the STRUCTURED
   * clear (nulling a claim's claimer type, its world-object refs, or an annotation
   * id in a time span) is `clearClaimStructuredRefs`, called alongside it.
   *
   * @param userId - the owner whose carriers are swept
   * @param target - the deleted thing (kind + id) and its replacement display name
   * @param tx - the delete transaction the reads and writes join
   * @returns the total number of inline mentions frozen to text across all carriers
   */
  async dereferenceAcrossCarriers(
    userId: string,
    target: DereferenceTarget,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma
    let total = 0
    total += await this.dereferenceOntologyGlosses(userId, target, tx)
    total += await this.dereferenceWorldDescriptions(userId, target, tx)
    total += await dereferenceSummaries(client, target)
    total += await dereferenceClaimProse(client, target)
    return total
  }

  /** Relations incident to a world object of a given kind, split from the rest. */
  private static incidentRelations(
    relations: unknown[],
    kind: string,
    id: string,
  ): { kept: unknown[]; removedIds: string[]; removed: number } {
    const kept: unknown[] = []
    const removedIds: string[] = []
    for (const relation of relations as Array<Record<string, unknown>>) {
      const incident =
        (relation.sourceType === kind && relation.sourceId === id) ||
        (relation.targetType === kind && relation.targetId === id)
      if (incident) {
        if (typeof relation.id === 'string') removedIds.push(relation.id)
      } else {
        kept.push(relation)
      }
    }
    return { kept, removedIds, removed: removedIds.length }
  }

  /** The member field a collection bucket keeps its members under, by object kind. */
  private static memberFieldFor(kind: 'entity' | 'event' | 'time'): CollectionMemberField {
    switch (kind) {
      case 'entity':
        return { field: 'entityIds', objectMembers: false }
      case 'event':
        return { field: 'eventIds', objectMembers: false }
      case 'time':
        return { field: 'times', objectMembers: true }
    }
  }

  /** True when a collection's member field contains the given id. */
  private static collectionHasMember(
    collection: Record<string, unknown>,
    id: string,
    member: CollectionMemberField,
  ): boolean {
    const members = collection[member.field]
    if (!Array.isArray(members)) return false
    return member.objectMembers
      ? members.some((entry) => (entry as { id?: unknown } | null)?.id === id)
      : members.includes(id)
  }

  /** Counts collections whose member field contains the id. */
  private static countMemberships(
    collections: unknown[],
    id: string,
    member: CollectionMemberField,
  ): number {
    let count = 0
    for (const collection of collections as Array<Record<string, unknown>>) {
      if (WorldStateService.collectionHasMember(collection, id, member)) count += 1
    }
    return count
  }

  /**
   * Strips a deleted object's id from the scope's catalog memberships. Reads the
   * scope's memberships fresh (inside the caller's transaction) so a concurrent
   * membership edit is honored, deletes every membership whose member ref points at
   * the id, and reports how many distinct collections the id was removed from.
   *
   * @returns the number of collections the id was removed from
   */
  private async stripCollectionMemberships(
    tx: Prisma.TransactionClient,
    collectionBucket: keyof WorldStateAggregate,
    memberId: string,
    userId: string,
  ): Promise<number> {
    void collectionBucket
    // A member id is unique to its object, so deleting every membership that points
    // at it removes it from exactly the collections that listed it.
    const memberships = await tx.catalogMembership.findMany({
      where: { createdByUserId: userId, projectId: null },
    })
    const removedIds: string[] = []
    const touched = new Set<string>()
    for (const membership of memberships) {
      const value = (membership.member as { ref?: { localId?: { value?: unknown } } } | null)?.ref?.localId?.value
      if (value === memberId) {
        removedIds.push(membership.id)
        touched.add(membership.catalogRef)
      }
    }
    if (removedIds.length > 0) {
      await tx.catalogMembership.deleteMany({ where: { id: { in: removedIds } } })
    }
    return touched.size
  }

  /**
   * Shared deletion preview for a world object of a given kind (entity, event,
   * or time), reading its bucket and the collection bucket by name.
   */
  private async objectDeletionPreview(
    kind: 'entity' | 'event' | 'time',
    bucket: keyof WorldStateAggregate,
    collectionBucket: keyof WorldStateAggregate,
    refType: 'entity-object' | 'event-object' | 'time-object',
    objectId: string,
  ): Promise<WorldObjectDeletionPreview> {
    const userId = await this.resolveUserId()
    const { aggregate, exists } = await this.readPersonalWorld(userId)
    if (!exists) throw new NotFoundError('World state', userId)

    const objects = asRecords(aggregate[bucket])
    const target = objects.find((object) => object.id === objectId)
    if (!target) throw new NotFoundError(kind.charAt(0).toUpperCase() + kind.slice(1), objectId)

    // Object annotations denote the world object's GraphNode (the node reuses the
    // object's own id), so the object-annotation count is the number of layers
    // annotations pointing at that node. The world's own value annotations (the
    // temporal/spatial/interpretation rows in the scope's scaffold layer) are
    // excluded so the count reflects external annotations linking to the object.
    const annotationCount = await this.prisma.layersAnnotation.count({
      where: { denotesNodeId: objectId, NOT: { layerId: worldScaffoldLayerId(userId, null) } },
    })

    return {
      glossReferences: await this.countGlossReferences(userId, objectId, refType),
      annotationCount,
      relationCount: WorldStateService.incidentRelations(aggregate.relations, kind, objectId).removed,
      collectionMemberships: WorldStateService.countMemberships(
        aggregate[collectionBucket],
        objectId,
        WorldStateService.memberFieldFor(kind),
      ),
    }
  }

  /**
   * Shared deletion for a world object of a given kind: deletes its GraphNode and
   * every incident relation edge, strips its collection memberships, and converts
   * ontology gloss references to text. The node and edge deletes plus the
   * collection-node rewrites run in one transaction so the world graph never lands
   * half-updated; removal is explicit rather than omission from a whole-blob PUT.
   */
  private async deleteObject(
    kind: 'entity' | 'event' | 'time',
    bucket: keyof WorldStateAggregate,
    collectionBucket: keyof WorldStateAggregate,
    refType: 'entity-object' | 'event-object' | 'time-object',
    objectId: string,
    nameFor: (target: Record<string, unknown>) => string,
  ): Promise<WorldObjectDeletionResult> {
    const userId = await this.resolveUserId()
    const { aggregate, exists } = await this.readPersonalWorld(userId)
    if (!exists) throw new NotFoundError('World state', userId)

    const objects = asRecords(aggregate[bucket])
    const target = objects.find((object) => object.id === objectId)
    if (!target) throw new NotFoundError(kind.charAt(0).toUpperCase() + kind.slice(1), objectId)

    if (this.ability) {
      const candidate = subject('GraphNode', { projectId: null, createdByUserId: userId })
      if (!this.ability.can('update', candidate)) {
        throw new ForbiddenError('Cannot update world objects in this scope')
      }
    }

    const objectName = nameFor(target)
    const { removedIds, removed: relationsRemoved } = WorldStateService.incidentRelations(
      aggregate.relations,
      kind,
      objectId,
    )
    const scope = { createdByUserId: userId, projectId: null }
    // Clean up the object's references, carrier-aware, in ONE transaction so a
    // partial failure rolls back rather than orphaning glosses on a half-deleted
    // object. (1) Delete the object's own world-scaffold derivations (presence,
    // type-assignment, interpretation, and its description gloss rows). (2) For
    // the user media annotations that link it, a video bounding box KEEPS its box
    // (its `denotesNodeId` is nulled) so the user can relink later, while a
    // document object sibling is deleted (its base placeholder keeps the span).
    // Then remove its incident relation edges, strip its collection memberships,
    // and freeze other objects' gloss references to text (`cleanupGlossReferences`
    // below). Deleted annotations' relations cascade away with them.
    const { glossReferences, memberships } = await this.prisma.$transaction(async (tx) => {
      await tx.layersAnnotation.deleteMany({
        where: { denotesNodeId: objectId, layerId: worldScaffoldLayerId(userId, null) },
      })
      await clearVideoBoxesElseDelete(tx, { denotesNodeId: objectId }, { denotesNodeId: null })
      await tx.graphNode.deleteMany({ where: { id: objectId, ...scope } })
      if (removedIds.length > 0) {
        await tx.graphEdge.deleteMany({ where: { id: { in: removedIds }, ...scope } })
      }
      const memberships = await this.stripCollectionMemberships(tx, collectionBucket, objectId, userId)
      const glossReferences = await this.cleanupGlossReferences(userId, objectId, refType, objectName, tx)
      // Freeze every OTHER inline text mention of the deleted object — world
      // descriptions, video summaries, claim prose (the ontology-gloss sweep above
      // already froze its own carrier, so its re-run here is a 0-hit no-op) — and
      // clear the structured claim refs (describes / occurs-at / located-at) that
      // named it. The gloss-reference count reported to the caller stays the
      // ontology-only count from `cleanupGlossReferences`.
      const target: DereferenceTarget = { kind: 'objectRef', id: objectId, name: objectName, refType }
      await this.dereferenceAcrossCarriers(userId, target, tx)
      await clearClaimStructuredRefs(tx, target)
      return { glossReferences, memberships }
    })

    const label = kind.charAt(0).toUpperCase() + kind.slice(1)
    return {
      message: `${label} "${objectName}" deleted successfully`,
      cleanedUp: { glossReferences, relations: relationsRemoved, collectionMemberships: memberships },
    }
  }

  /** Deletion preview for a world entity. */
  getEntityDeletionPreview(entityId: string): Promise<WorldObjectDeletionPreview> {
    return this.objectDeletionPreview('entity', 'entities', 'entityCollections', 'entity-object', entityId)
  }

  /** Deletes a world entity with reference cleanup. */
  deleteEntity(entityId: string): Promise<WorldObjectDeletionResult> {
    return this.deleteObject(
      'entity',
      'entities',
      'entityCollections',
      'entity-object',
      entityId,
      (target) => (typeof target.name === 'string' ? target.name : entityId),
    )
  }

  /** Deletion preview for a world event. */
  getEventDeletionPreview(eventId: string): Promise<WorldObjectDeletionPreview> {
    return this.objectDeletionPreview('event', 'events', 'eventCollections', 'event-object', eventId)
  }

  /** Deletes a world event with reference cleanup. */
  deleteEvent(eventId: string): Promise<WorldObjectDeletionResult> {
    return this.deleteObject(
      'event',
      'events',
      'eventCollections',
      'event-object',
      eventId,
      (target) => (typeof target.name === 'string' ? target.name : eventId),
    )
  }

  /** Deletion preview for a world time. */
  getTimeDeletionPreview(timeId: string): Promise<WorldObjectDeletionPreview> {
    return this.objectDeletionPreview('time', 'times', 'timeCollections', 'time-object', timeId)
  }

  /** Deletes a world time with reference cleanup. */
  deleteTime(timeId: string): Promise<WorldObjectDeletionResult> {
    return this.deleteObject(
      'time',
      'times',
      'timeCollections',
      'time-object',
      timeId,
      // A world Time has no `name`; freeze inline mentions of a deleted time to the
      // most human-readable label it carries — an explicit label, else the
      // description of its vagueness or the expression of its deictic anchor — and
      // fall back to the id only when the time is wholly anonymous.
      (target) => {
        const nonEmpty = (value: unknown): string | undefined =>
          typeof value === 'string' && value.trim() !== '' ? value : undefined
        const nested = (value: unknown, key: string): string | undefined =>
          nonEmpty((value as Record<string, unknown> | null | undefined)?.[key])
        return (
          nonEmpty(target.label) ??
          nested(target.vagueness, 'description') ??
          nested(target.deictic, 'expression') ??
          timeId
        )
      },
    )
  }
}
