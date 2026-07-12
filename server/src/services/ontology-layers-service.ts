import { PrismaClient, type Persona } from '@prisma/client'
import { subject } from '@casl/ability'

import type { AppAbility } from '../lib/abilities.js'
import { NotFoundError, ForbiddenError } from '../lib/errors.js'
import { GraphRepository } from '../repositories/GraphRepository.js'
import { LayersOntologyRepository } from '../repositories/LayersOntologyRepository.js'
import { WorldStateService, resolvePersonalUserId } from './world-state-service.js'
import { emptyWorldState, type WorldStateAggregate } from './world-layers-mapper.js'
import type { PersonaOntologyAggregate } from './ontology-layers-mapper.js'

/** A persona in the `/api/ontology` response shape. */
export interface PersonaResponse {
  id: string
  name: string
  role: string
  informationNeed: string
  details: string | null
  createdAt: string
  updatedAt: string
}

/**
 * A persona ontology in the `/api/ontology` response shape. `entities`,
 * `events`, and `roles` are the entity/event/role TYPE arrays (the contract's
 * historical field names for the type buckets); `relations` is always empty (the
 * legacy per-persona ontology never carried relation instances).
 */
export interface PersonaOntologyResponse {
  id: string
  personaId: string
  entities: unknown[]
  roles: unknown[]
  events: unknown[]
  relationTypes: unknown[]
  relations: unknown[]
  createdAt: string
  updatedAt: string
}

/** The combined `/api/ontology` payload: personas, their ontologies, and world. */
export interface OntologyBundle {
  personas: PersonaResponse[]
  personaOntologies: PersonaOntologyResponse[]
  world?: WorldStateAggregate
}

/** A persona to upsert in an ontology save. */
export interface PersonaInput {
  id: string
  name: string
  role: string
  informationNeed: string
  details?: string
}

/**
 * A persona ontology to upsert in an ontology save. `entities`/`roles`/`events`
 * carry the entity/role/event TYPE arrays under the contract's field names.
 */
export interface OntologyInput {
  personaId: string
  entities?: unknown[]
  roles?: unknown[]
  events?: unknown[]
  relationTypes?: unknown[]
}

/** The combined ontology save payload. */
export interface OntologySaveInput {
  personas: PersonaInput[]
  personaOntologies: OntologyInput[]
  world?: WorldStateAggregate
}

/**
 * Maps a persona row to the response shape.
 */
function personaResponse(persona: Persona): PersonaResponse {
  return {
    id: persona.id,
    name: persona.name,
    role: persona.role,
    informationNeed: persona.informationNeed,
    details: persona.details,
    createdAt: persona.createdAt.toISOString(),
    updatedAt: persona.updatedAt.toISOString(),
  }
}

/** Maps the contract's ontology field names to the type-bucket aggregate. */
function toAggregate(input: OntologyInput): PersonaOntologyAggregate {
  return {
    entityTypes: input.entities ?? [],
    eventTypes: input.events ?? [],
    roleTypes: input.roles ?? [],
    relationTypes: input.relationTypes ?? [],
  }
}

/** Maps a reconstructed ontology aggregate to the contract's field names. */
function toOntologyResponse(
  id: string,
  personaId: string,
  aggregate: PersonaOntologyAggregate,
  createdAt: string,
  updatedAt: string,
): PersonaOntologyResponse {
  return {
    id,
    personaId,
    entities: aggregate.entityTypes,
    roles: aggregate.roleTypes,
    events: aggregate.eventTypes,
    relationTypes: aggregate.relationTypes,
    relations: [],
    createdAt,
    updatedAt,
  }
}

/**
 * Assembles and saves the combined `/api/ontology` payload over the layers
 * store, keeping the contract identical: personas stay in the `persona` table,
 * their ontologies map to LayersOntology + TypeDef, and the world maps to
 * GraphNode + GraphEdge. World and per-persona ontology persistence is delegated
 * to a WorldStateService over the same repositories.
 *
 * @example
 * ```typescript
 * const service = new OntologyLayersService(graphRepo, ontologyRepo, prisma, request.ability ?? null, request.user?.id)
 * const bundle = await service.getBundle()
 * ```
 */
export class OntologyLayersService {
  private readonly world: WorldStateService

  constructor(
    graphRepo: GraphRepository,
    ontologyRepo: LayersOntologyRepository,
    private readonly prisma: PrismaClient,
    private readonly ability: AppAbility | null,
    private readonly userId: string | undefined,
  ) {
    this.world = new WorldStateService(graphRepo, ontologyRepo, prisma, ability, userId)
  }

  /** Resolves the personal user id (authenticated user or single-user default). */
  private resolveUserId(): Promise<string> {
    return resolvePersonalUserId(this.prisma, this.userId)
  }

  /**
   * Assembles the combined payload: the user's personas, their reconstructed
   * ontologies, and the reconstructed world.
   *
   * @returns the combined `/api/ontology` payload
   */
  async getBundle(): Promise<OntologyBundle> {
    const userId = await this.resolveUserId()

    const personas = await this.prisma.persona.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })

    const personaOntologies: PersonaOntologyResponse[] = []
    for (const persona of personas) {
      const bundle = await this.world.readPersonaOntologyBundle(persona)
      if (!bundle) continue
      personaOntologies.push(
        toOntologyResponse(bundle.id, persona.id, bundle.aggregate, bundle.createdAt, bundle.updatedAt),
      )
    }

    const { aggregate } = await this.world.readPersonalWorld(userId)

    return {
      personas: personas.map(personaResponse),
      personaOntologies,
      world: aggregate,
    }
  }

  /**
   * Saves the combined payload. All ownership prechecks run before any write, so
   * a rejected foreign-persona attempt leaves the store untouched.
   *
   * @param input - the personas, ontologies, and world to save
   * @returns the saved combined payload
   * @throws {ForbiddenError} when the caller cannot own a referenced persona
   * @throws {NotFoundError} when an ontology names a persona that does not exist
   */
  async saveBundle(input: OntologySaveInput): Promise<OntologyBundle> {
    const userId = await this.resolveUserId()

    // Precheck every referenced persona before any write.
    for (const persona of input.personas) {
      const existing = await this.prisma.persona.findUnique({ where: { id: persona.id } })
      if (existing && this.ability && !this.ability.can('update', subject('Persona', existing))) {
        throw new ForbiddenError(`Cannot update persona ${persona.id}`)
      }
    }
    const owningPersonas = new Map<string, Persona>()
    for (const ontology of input.personaOntologies) {
      const existing =
        owningPersonas.get(ontology.personaId) ??
        (await this.prisma.persona.findUnique({ where: { id: ontology.personaId } }))
      // A persona created in this same save is authorized through the personas
      // loop above; only reject when the persona already exists and is foreign.
      if (existing) {
        if (this.ability && !this.ability.can('update', subject('Persona', existing))) {
          throw new ForbiddenError(`Cannot modify ontology for persona ${ontology.personaId}`)
        }
        owningPersonas.set(ontology.personaId, existing)
      } else if (!input.personas.some((p) => p.id === ontology.personaId)) {
        throw new NotFoundError('Persona', ontology.personaId)
      }
    }

    // Upsert personas.
    const savedPersonas: Persona[] = []
    for (const persona of input.personas) {
      const saved = await this.prisma.persona.upsert({
        where: { id: persona.id },
        update: {
          name: persona.name,
          role: persona.role,
          informationNeed: persona.informationNeed,
          details: persona.details,
        },
        create: {
          id: persona.id,
          name: persona.name,
          role: persona.role,
          informationNeed: persona.informationNeed,
          details: persona.details,
          userId,
        },
      })
      savedPersonas.push(saved)
    }

    // Upsert per-persona ontologies.
    const savedOntologies: PersonaOntologyResponse[] = []
    for (const ontology of input.personaOntologies) {
      const persona =
        owningPersonas.get(ontology.personaId) ??
        (await this.prisma.persona.findUnique({ where: { id: ontology.personaId } }))
      if (!persona) throw new NotFoundError('Persona', ontology.personaId)
      await this.world.writePersonaOntology(persona, toAggregate(ontology))
      const bundle = await this.world.readPersonaOntologyBundle(persona)
      if (bundle) {
        savedOntologies.push(
          toOntologyResponse(bundle.id, persona.id, bundle.aggregate, bundle.createdAt, bundle.updatedAt),
        )
      }
    }

    // Save the world when provided.
    let savedWorld: WorldStateAggregate | undefined
    if (input.world) {
      const world: WorldStateAggregate = { ...emptyWorldState(), ...input.world }
      await this.world.writePersonalWorld(userId, world)
      savedWorld = (await this.world.readPersonalWorld(userId)).aggregate
    }

    return {
      personas: savedPersonas.map(personaResponse),
      personaOntologies: savedOntologies,
      world: savedWorld,
    }
  }
}
