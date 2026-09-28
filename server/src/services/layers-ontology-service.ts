import { Prisma, type LayersOntology as PrismaLayersOntology, type TypeDef as PrismaTypeDef } from '@prisma/client'
import { subject } from '@casl/ability'
import { accessibleBy } from '@casl/prisma'
import type {
  Ontology as OntologyShape,
  TypeDef as TypeDefShape
} from '@fovea/layers-schema'
import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, UnauthorizedError, ForbiddenError } from '../lib/errors.js'
import { LayersOntologyRepository } from '../repositories/LayersOntologyRepository.js'

/**
 * Converts a value to Prisma.InputJsonValue for storage in a JSON column.
 * Prisma JSON columns accept any serializable value at runtime; this bridges
 * the TypeScript gap without an unsafe cast. Returns undefined for undefined
 * input so the field is omitted from the write (leaving the column NULL on
 * create, untouched on update).
 */
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

/**
 * API-facing ontology shape: the layers record fields plus id, tree/persona
 * foreign keys, scope columns, and ISO timestamps. JSON columns are surfaced as
 * their `@fovea/layers-schema` compile-time types.
 */
export interface LayersOntologyResponse {
  id: string
  name: string
  description: string | null
  version: string | null
  domain: string | null
  parentOntologyId: string | null
  personaId: string | null
  knowledgeRefs: OntologyShape['knowledgeRefs'] | null
  projectId: string | null
  createdByUserId: string | null
  layersUri: string | null
  createdAt: string
  updatedAt: string
}

/** Fields accepted when creating an ontology. */
export interface LayersOntologyInput {
  id?: string
  name: string
  description?: string | null
  version?: string | null
  domain?: string | null
  parentOntologyId?: string | null
  personaId?: string | null
  knowledgeRefs?: OntologyShape['knowledgeRefs']
  projectId?: string | null
}

/** Mutable fields accepted when updating an ontology in place. */
export interface LayersOntologyUpdateInput {
  name?: string
  description?: string | null
  version?: string | null
  domain?: string | null
  parentOntologyId?: string | null
  knowledgeRefs?: OntologyShape['knowledgeRefs']
}

/**
 * API-facing type-definition shape: the layers record fields plus id, ontology
 * and parent-type foreign keys, scope columns, and ISO timestamps.
 */
export interface TypeDefResponse {
  id: string
  ontologyId: string
  name: string
  typeKind: string
  gloss: string | null
  parentTypeId: string | null
  allowedRoles: TypeDefShape['allowedRoles'] | null
  allowedValues: TypeDefShape['allowedValues'] | null
  knowledgeRefs: TypeDefShape['knowledgeRefs'] | null
  features: TypeDefShape['features'] | null
  projectId: string | null
  createdByUserId: string | null
  layersUri: string | null
  createdAt: string
  updatedAt: string
}

/** Fields accepted when creating a type definition. */
export interface TypeDefInput {
  id?: string
  name: string
  typeKind: string
  gloss?: string | null
  parentTypeId?: string | null
  allowedRoles?: TypeDefShape['allowedRoles']
  allowedValues?: TypeDefShape['allowedValues']
  knowledgeRefs?: TypeDefShape['knowledgeRefs']
  features?: TypeDefShape['features']
}

/** Mutable fields accepted when updating a type definition in place. */
export interface TypeDefUpdateInput {
  name?: string
  typeKind?: string
  gloss?: string | null
  parentTypeId?: string | null
  allowedRoles?: TypeDefShape['allowedRoles']
  allowedValues?: TypeDefShape['allowedValues']
  knowledgeRefs?: TypeDefShape['knowledgeRefs']
  features?: TypeDefShape['features']
}

/**
 * Owns the ontologies resource group's business rules and RBAC, delegating all
 * data access to a LayersOntologyRepository. Construct one per request from the
 * request-scoped CASL ability and the authenticated user's id.
 *
 * LayersOntology rows are annotation ontologies; TypeDef rows are the typed
 * definitions belonging to them. Both carry (projectId, createdByUserId) scope
 * columns. The service performs every authorization decision: the `accessibleBy`
 * read filter for lists, instance-level `can()` checks for single-row
 * reads/updates/deletes, and the create pre-check. An ontology bound to a
 * persona inherits that persona's project scope (mirroring the annotation
 * route); a type definition inherits its parent ontology's project scope. The
 * repository performs none of these decisions.
 *
 * @example
 * ```typescript
 * const service = new LayersOntologyService(repo, request.ability ?? null, request.user?.id)
 * const ontologies = await service.listOntologies()
 * ```
 */
export class LayersOntologyService {
  constructor(
    private readonly repository: LayersOntologyRepository,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined
  ) {}

  /** Resolves the acting user id, or throws when the request is unauthenticated. */
  private requireUserId(): string {
    if (!this.userId) throw new UnauthorizedError('Authentication required')
    return this.userId
  }

  /** Resolves the caller's ability, or throws when none was built. */
  private requireAbility(): AppAbility {
    if (!this.ability) throw new ForbiddenError('No abilities defined')
    return this.ability
  }

  // --- LayersOntology ----------------------------------------------------

  private mapOntology(ontology: PrismaLayersOntology): LayersOntologyResponse {
    return {
      id: ontology.id,
      name: ontology.name,
      description: ontology.description,
      version: ontology.version,
      domain: ontology.domain,
      parentOntologyId: ontology.parentOntologyId,
      personaId: ontology.personaId,
      knowledgeRefs: ontology.knowledgeRefs as LayersOntologyResponse['knowledgeRefs'],
      projectId: ontology.projectId,
      createdByUserId: ontology.createdByUserId,
      layersUri: ontology.layersUri,
      createdAt: ontology.createdAt.toISOString(),
      updatedAt: ontology.updatedAt.toISOString()
    }
  }

  /**
   * Resolves the project scope for an ontology being created. When the ontology
   * is bound to a persona, its project is inherited from that persona (and the
   * caller must be able to read the persona, mirroring the annotation route so a
   * caller cannot attach an ontology under another user's persona); otherwise
   * the explicitly supplied projectId is used.
   */
  private async resolveOntologyProjectId(input: LayersOntologyInput): Promise<string | null> {
    if (input.personaId) {
      const persona = await this.repository.findPersonaById(input.personaId)
      if (!persona) throw new NotFoundError('Persona', input.personaId)
      if (!this.requireAbility().can('read', subject('Persona', persona))) {
        throw new ForbiddenError('Cannot create an ontology under this Persona')
      }
      return persona.projectId
    }
    return input.projectId ?? null
  }

  /**
   * Lists ontologies the caller can read, optionally narrowed by personaId,
   * projectId, and domain.
   */
  async listOntologies(filter?: {
    personaId?: string
    projectId?: string
    domain?: string
  }): Promise<LayersOntologyResponse[]> {
    const ability = this.requireAbility()
    const extraWhere: Prisma.LayersOntologyWhereInput = {}
    if (filter?.personaId) extraWhere.personaId = filter.personaId
    if (filter?.projectId) extraWhere.projectId = filter.projectId
    if (filter?.domain) extraWhere.domain = filter.domain
    const ontologies = await this.repository.findAccessibleOntologies(
      accessibleBy(ability, 'read').LayersOntology,
      extraWhere
    )
    return ontologies.map(o => this.mapOntology(o))
  }

  /** Loads one ontology, enforcing instance-level read access. */
  async getOntology(id: string): Promise<LayersOntologyResponse> {
    const ability = this.requireAbility()
    const ontology = await this.repository.findOntologyById(id)
    if (!ontology) throw new NotFoundError('LayersOntology', id)
    if (!ability.can('read', subject('LayersOntology', ontology))) {
      throw new ForbiddenError('Cannot read this LayersOntology')
    }
    return this.mapOntology(ontology)
  }

  /**
   * Creates an ontology, or updates it in place when a client-supplied id
   * already exists (idempotent create). The idempotent update authorizes against
   * the EXISTING row's `update` permission, so a caller cannot hijack another
   * user's ontology by supplying its id.
   */
  async createOntology(input: LayersOntologyInput): Promise<{ ontology: LayersOntologyResponse; created: boolean }> {
    const ability = this.requireAbility()
    const userId = this.requireUserId()

    const updateExisting = async (existing: PrismaLayersOntology) => {
      if (!ability.can('update', subject('LayersOntology', existing))) {
        throw new ForbiddenError('Cannot update this LayersOntology')
      }
      const updated = await this.repository.updateOntology(existing.id, {
        name: input.name,
        description: input.description ?? null,
        version: input.version ?? null,
        domain: input.domain ?? null,
        parentOntologyId: input.parentOntologyId ?? null,
        knowledgeRefs: toJson(input.knowledgeRefs)
      })
      return { ontology: this.mapOntology(updated), created: false }
    }

    // Idempotent create: an existing row under the client-supplied id is updated
    // in place rather than duplicated.
    if (input.id) {
      const existing = await this.repository.findOntologyById(input.id)
      if (existing) return updateExisting(existing)
    }

    const projectId = await this.resolveOntologyProjectId(input)

    // Pre-authorize the create in the resolved scope so future rule tightening
    // cannot be bypassed. The candidate carries the final scope columns so
    // CASL's MongoQuery conditions resolve against actual field values.
    const candidate = subject('LayersOntology', { projectId, createdByUserId: userId })
    if (!ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create LayersOntology in this scope')
    }

    try {
      const ontology = await this.repository.createOntology({
        id: input.id,
        name: input.name,
        description: input.description ?? null,
        version: input.version ?? null,
        domain: input.domain ?? null,
        parentOntologyId: input.parentOntologyId ?? null,
        personaId: input.personaId ?? null,
        knowledgeRefs: toJson(input.knowledgeRefs),
        projectId,
        createdByUserId: userId
      })
      return { ontology: this.mapOntology(ontology), created: true }
    } catch (error) {
      // Concurrent-create race: a parallel request with the same client id won
      // the insert between our find and create. Fall back to the idempotent
      // update path (re-authorizing against the now-existing row).
      if (
        input.id &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.repository.findOntologyById(input.id)
        if (existing) return updateExisting(existing)
      }
      throw error
    }
  }

  /** Updates an ontology, enforcing instance-level update access. */
  async updateOntology(id: string, input: LayersOntologyUpdateInput): Promise<LayersOntologyResponse> {
    const ability = this.requireAbility()
    const existing = await this.repository.findOntologyById(id)
    if (!existing) throw new NotFoundError('LayersOntology', id)
    if (!ability.can('update', subject('LayersOntology', existing))) {
      throw new ForbiddenError('Cannot update this LayersOntology')
    }
    const updated = await this.repository.updateOntology(id, {
      name: input.name,
      description: input.description,
      version: input.version,
      domain: input.domain,
      parentOntologyId: input.parentOntologyId,
      knowledgeRefs: toJson(input.knowledgeRefs)
    })
    return this.mapOntology(updated)
  }

  /** Deletes an ontology, enforcing instance-level delete access. */
  async deleteOntology(id: string): Promise<void> {
    const ability = this.requireAbility()
    const existing = await this.repository.findOntologyById(id)
    if (!existing) throw new NotFoundError('LayersOntology', id)
    if (!ability.can('delete', subject('LayersOntology', existing))) {
      throw new ForbiddenError('Cannot delete this LayersOntology')
    }
    await this.repository.deleteOntology(id)
  }

  // --- TypeDef -----------------------------------------------------------

  private mapTypeDef(typeDef: PrismaTypeDef): TypeDefResponse {
    return {
      id: typeDef.id,
      ontologyId: typeDef.ontologyId,
      name: typeDef.name,
      typeKind: typeDef.typeKind,
      gloss: typeDef.gloss,
      parentTypeId: typeDef.parentTypeId,
      allowedRoles: typeDef.allowedRoles as TypeDefResponse['allowedRoles'],
      allowedValues: typeDef.allowedValues as TypeDefResponse['allowedValues'],
      knowledgeRefs: typeDef.knowledgeRefs as TypeDefResponse['knowledgeRefs'],
      features: typeDef.features as TypeDefResponse['features'],
      projectId: typeDef.projectId,
      createdByUserId: typeDef.createdByUserId,
      layersUri: typeDef.layersUri,
      createdAt: typeDef.createdAt.toISOString(),
      updatedAt: typeDef.updatedAt.toISOString()
    }
  }

  /**
   * Loads a parent ontology and enforces read access on it. Used as the gate
   * before listing or creating its type definitions: a caller who cannot read
   * the ontology may neither enumerate nor extend its types.
   */
  private async loadReadableOntology(ontologyId: string): Promise<PrismaLayersOntology> {
    const ability = this.requireAbility()
    const ontology = await this.repository.findOntologyById(ontologyId)
    if (!ontology) throw new NotFoundError('LayersOntology', ontologyId)
    if (!ability.can('read', subject('LayersOntology', ontology))) {
      throw new ForbiddenError('Cannot read this LayersOntology')
    }
    return ontology
  }

  /**
   * Lists the type definitions belonging to an ontology that the caller can
   * read, optionally narrowed by typeKind. Requires read access to the parent
   * ontology.
   */
  async listTypeDefs(ontologyId: string, filter?: { typeKind?: string }): Promise<TypeDefResponse[]> {
    const ability = this.requireAbility()
    await this.loadReadableOntology(ontologyId)
    const extraWhere: Prisma.TypeDefWhereInput = { ontologyId }
    if (filter?.typeKind) extraWhere.typeKind = filter.typeKind
    const typeDefs = await this.repository.findAccessibleTypeDefs(
      accessibleBy(ability, 'read').TypeDef,
      extraWhere
    )
    return typeDefs.map(t => this.mapTypeDef(t))
  }

  /** Loads one type definition, enforcing instance-level read access. */
  async getTypeDef(id: string): Promise<TypeDefResponse> {
    const ability = this.requireAbility()
    const typeDef = await this.repository.findTypeDefById(id)
    if (!typeDef) throw new NotFoundError('TypeDef', id)
    if (!ability.can('read', subject('TypeDef', typeDef))) {
      throw new ForbiddenError('Cannot read this TypeDef')
    }
    return this.mapTypeDef(typeDef)
  }

  /**
   * Creates a type definition under an ontology, or updates it in place when a
   * client-supplied id already exists (idempotent create). The type definition
   * inherits its parent ontology's project scope, and the caller must be able to
   * read that ontology before extending it.
   */
  async createTypeDef(
    ontologyId: string,
    input: TypeDefInput
  ): Promise<{ typeDef: TypeDefResponse; created: boolean }> {
    const ability = this.requireAbility()
    const userId = this.requireUserId()
    const ontology = await this.loadReadableOntology(ontologyId)
    const projectId = ontology.projectId

    const updateExisting = async (existing: PrismaTypeDef) => {
      if (!ability.can('update', subject('TypeDef', existing))) {
        throw new ForbiddenError('Cannot update this TypeDef')
      }
      const updated = await this.repository.updateTypeDef(existing.id, {
        name: input.name,
        typeKind: input.typeKind,
        gloss: input.gloss ?? null,
        parentTypeId: input.parentTypeId ?? null,
        allowedRoles: toJson(input.allowedRoles),
        allowedValues: toJson(input.allowedValues),
        knowledgeRefs: toJson(input.knowledgeRefs),
        features: toJson(input.features)
      })
      return { typeDef: this.mapTypeDef(updated), created: false }
    }

    if (input.id) {
      const existing = await this.repository.findTypeDefById(input.id)
      if (existing) return updateExisting(existing)
    }

    const candidate = subject('TypeDef', { projectId, createdByUserId: userId })
    if (!ability.can('create', candidate)) {
      throw new ForbiddenError('Cannot create TypeDef in this scope')
    }

    try {
      const typeDef = await this.repository.createTypeDef({
        id: input.id,
        ontologyId,
        name: input.name,
        typeKind: input.typeKind,
        gloss: input.gloss ?? null,
        parentTypeId: input.parentTypeId ?? null,
        allowedRoles: toJson(input.allowedRoles),
        allowedValues: toJson(input.allowedValues),
        knowledgeRefs: toJson(input.knowledgeRefs),
        features: toJson(input.features),
        projectId,
        createdByUserId: userId
      })
      return { typeDef: this.mapTypeDef(typeDef), created: true }
    } catch (error) {
      if (
        input.id &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.repository.findTypeDefById(input.id)
        if (existing) return updateExisting(existing)
      }
      throw error
    }
  }

  /** Updates a type definition, enforcing instance-level update access. */
  async updateTypeDef(id: string, input: TypeDefUpdateInput): Promise<TypeDefResponse> {
    const ability = this.requireAbility()
    const existing = await this.repository.findTypeDefById(id)
    if (!existing) throw new NotFoundError('TypeDef', id)
    if (!ability.can('update', subject('TypeDef', existing))) {
      throw new ForbiddenError('Cannot update this TypeDef')
    }
    const updated = await this.repository.updateTypeDef(id, {
      name: input.name,
      typeKind: input.typeKind,
      gloss: input.gloss,
      parentTypeId: input.parentTypeId,
      allowedRoles: toJson(input.allowedRoles),
      allowedValues: toJson(input.allowedValues),
      knowledgeRefs: toJson(input.knowledgeRefs),
      features: toJson(input.features)
    })
    return this.mapTypeDef(updated)
  }

  /** Deletes a type definition, enforcing instance-level delete access. */
  async deleteTypeDef(id: string): Promise<void> {
    const ability = this.requireAbility()
    const existing = await this.repository.findTypeDefById(id)
    if (!existing) throw new NotFoundError('TypeDef', id)
    if (!ability.can('delete', subject('TypeDef', existing))) {
      throw new ForbiddenError('Cannot delete this TypeDef')
    }
    await this.repository.deleteTypeDef(id)
  }
}
