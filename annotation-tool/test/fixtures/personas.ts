import { Persona } from '../../src/types/index.ts'
import { EntityType, EventType, RoleType, RelationType } from '../../src/types/ontology.ts'

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
    createdAt: '2025-10-01T10:00:00Z',
    updatedAt: '2025-10-01T10:00:00Z',
    ...overrides,
  }
}

/**
 * Factory function to create test entity type objects.
 *
 * @param overrides - Partial entity type properties to override defaults
 * @returns A complete EntityType object for testing
 *
 * @example
 * ```ts
 * const entityType = createEntityType({ name: 'Player' })
 * ```
 */
export function createEntityType(overrides: Partial<EntityType> = {}): EntityType {
  return {
    id: 'test-entity-type-1',
    name: 'Test Entity',
    description: 'A test entity type',
    parent: null,
    properties: {},
    wikidataId: null,
    ...overrides,
  }
}

/**
 * Factory function to create test event type objects.
 *
 * @param overrides - Partial event type properties to override defaults
 * @returns A complete EventType object for testing
 *
 * @example
 * ```ts
 * const eventType = createEventType({ name: 'Home Run' })
 * ```
 */
export function createEventType(overrides: Partial<EventType> = {}): EventType {
  return {
    id: 'test-event-type-1',
    name: 'Test Event',
    description: 'A test event type',
    parent: null,
    properties: {},
    wikidataId: null,
    ...overrides,
  }
}

/**
 * Factory function to create test role type objects.
 *
 * @param overrides - Partial role type properties to override defaults
 * @returns A complete RoleType object for testing
 *
 * @example
 * ```ts
 * const roleType = createRoleType({ name: 'Pitcher' })
 * ```
 */
export function createRoleType(overrides: Partial<RoleType> = {}): RoleType {
  return {
    id: 'test-role-type-1',
    name: 'Test Role',
    description: 'A test role type',
    parent: null,
    properties: {},
    ...overrides,
  }
}

/**
 * Factory function to create test relation type objects.
 *
 * @param overrides - Partial relation type properties to override defaults
 * @returns A complete RelationType object for testing
 *
 * @example
 * ```ts
 * const relationType = createRelationType({ name: 'throws_to' })
 * ```
 */
export function createRelationType(overrides: Partial<RelationType> = {}): RelationType {
  return {
    id: 'test-relation-type-1',
    name: 'Test Relation',
    description: 'A test relation type',
    sourceType: 'entity',
    targetType: 'entity',
    properties: {},
    ...overrides,
  }
}

/**
 * Creates a baseball scout persona with typical ontology.
 * Useful for domain-specific testing.
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
 * Creates a wildlife researcher persona with typical ontology.
 * Useful for domain-specific testing.
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

/**
 * Creates a hierarchical ontology tree for testing.
 * Includes parent-child relationships.
 *
 * @returns Array of entity types with hierarchical structure
 *
 * @example
 * ```ts
 * const hierarchy = createHierarchicalOntology()
 * // Returns: Animal -> Mammal -> Whale
 * ```
 */
export function createHierarchicalOntology(): EntityType[] {
  const animal = createEntityType({
    id: 'animal',
    name: 'Animal',
    description: 'Any living organism',
    parent: null,
  })

  const mammal = createEntityType({
    id: 'mammal',
    name: 'Mammal',
    description: 'Warm-blooded vertebrate',
    parent: 'animal',
  })

  const whale = createEntityType({
    id: 'whale',
    name: 'Whale',
    description: 'Large marine mammal',
    parent: 'mammal',
  })

  return [animal, mammal, whale]
}
