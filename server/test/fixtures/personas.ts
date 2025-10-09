import { Persona, Ontology } from '@prisma/client'

/**
 * Factory function to create test persona objects.
 *
 * @param overrides - Partial persona properties to override defaults
 * @returns A complete Persona object for testing
 *
 * @example
 * ```ts
 * const persona = createPersona({ name: 'Baseball Scout' })
 * ```
 */
export function createPersona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'test-persona-1',
    name: 'Test Analyst',
    role: 'Intelligence Analyst',
    informationNeed: 'Analyze test scenarios',
    createdAt: new Date('2025-10-01T10:00:00Z'),
    updatedAt: new Date('2025-10-01T10:00:00Z'),
    ...overrides,
  }
}

/**
 * Factory function to create test ontology objects.
 *
 * @param overrides - Partial ontology properties to override defaults
 * @returns A complete Ontology object for testing
 *
 * @example
 * ```ts
 * const ontology = createOntology({ personaId: 'persona-1' })
 * ```
 */
export function createOntology(overrides: Partial<Ontology> = {}): Ontology {
  return {
    id: 'test-ontology-1',
    personaId: 'test-persona-1',
    entityTypes: [
      {
        id: 'entity-1',
        name: 'Test Entity',
        description: 'A test entity type',
        parent: null,
        properties: {},
        wikidataId: null,
      },
    ],
    eventTypes: [
      {
        id: 'event-1',
        name: 'Test Event',
        description: 'A test event type',
        parent: null,
        properties: {},
        wikidataId: null,
      },
    ],
    roleTypes: [],
    relationTypes: [],
    createdAt: new Date('2025-10-01T10:00:00Z'),
    updatedAt: new Date('2025-10-01T10:00:00Z'),
    ...overrides,
  }
}

/**
 * Creates a baseball scout persona for domain-specific testing.
 *
 * @returns Persona configured for baseball scouting
 *
 * @example
 * ```ts
 * const scoutPersona = createBaseballScoutPersona()
 * ```
 */
export function createBaseballScoutPersona(): Persona {
  return createPersona({
    id: 'baseball-scout',
    name: 'Baseball Scout',
    role: 'Professional Scout',
    informationNeed: 'Evaluate pitcher mechanics and performance',
  })
}

/**
 * Creates a wildlife researcher persona for domain-specific testing.
 *
 * @returns Persona configured for wildlife research
 *
 * @example
 * ```ts
 * const researcherPersona = createWildlifeResearcherPersona()
 * ```
 */
export function createWildlifeResearcherPersona(): Persona {
  return createPersona({
    id: 'wildlife-researcher',
    name: 'Wildlife Researcher',
    role: 'Marine Biologist',
    informationNeed: 'Document whale pod behavior and migration patterns',
  })
}
