import { PrismaClient } from '@prisma/client'

/**
 * Ontology type structure from ontology JSON.
 */
interface OntologyType {
  id: string
  name: string
  description?: string
}

/**
 * Instance structure for world state objects.
 */
interface Instance {
  label: string
  type: string
  description?: string
}

/**
 * Options for building detection query from persona ontology and world state.
 */
export interface DetectionQueryOptions {
  // Ontology type options
  includeEntityTypes?: boolean
  includeEntityGlosses?: boolean
  includeEventTypes?: boolean
  includeEventGlosses?: boolean
  includeRoleTypes?: boolean
  includeRoleGlosses?: boolean
  includeRelationTypes?: boolean
  includeRelationGlosses?: boolean
  // World state instance options
  includeEntityInstances?: boolean
  includeEntityInstanceGlosses?: boolean
  includeEventInstances?: boolean
  includeEventInstanceGlosses?: boolean
  includeLocationInstances?: boolean
  includeLocationInstanceGlosses?: boolean
  includeTimeInstances?: boolean
  includeTimeInstanceGlosses?: boolean
}

/**
 * Default options for detection query building.
 */
const DEFAULT_QUERY_OPTIONS: DetectionQueryOptions = {
  includeEntityTypes: true,
  includeEntityGlosses: false,
  includeEventTypes: false,
  includeEventGlosses: false,
  includeRoleTypes: false,
  includeRoleGlosses: false,
  includeRelationTypes: false,
  includeRelationGlosses: false,
  includeEntityInstances: false,
  includeEntityInstanceGlosses: false,
  includeEventInstances: false,
  includeEventInstanceGlosses: false,
  includeLocationInstances: false,
  includeLocationInstanceGlosses: false,
  includeTimeInstances: false,
  includeTimeInstanceGlosses: false,
}

/**
 * Formats ontology types into a readable list with optional glosses.
 *
 * @param types - Array of ontology types
 * @param includeGlosses - Whether to include descriptions as glosses
 * @returns Formatted string (e.g., "pitcher, batter" or "pitcher (throws ball), batter (at bat)")
 */
function formatTypeList(types: OntologyType[], includeGlosses: boolean): string {
  if (types.length === 0) return ''

  return types
    .map(type => {
      const name = type.name.toLowerCase()
      if (includeGlosses && type.description) {
        return `${name} (${type.description})`
      }
      return name
    })
    .join(', ')
}

/**
 * Formats instances into a readable list with optional glosses.
 *
 * @param instances - Array of world state instances
 * @param includeGlosses - Whether to include descriptions as glosses
 * @returns Formatted string (e.g., "John Smith, Derek Jeter" or "John Smith (pitcher), Derek Jeter (shortstop)")
 */
function formatInstanceList(instances: Instance[], includeGlosses: boolean): string {
  if (instances.length === 0) return ''

  return instances
    .map(instance => {
      const label = instance.label
      if (includeGlosses && instance.description) {
        return `${label} (${instance.description})`
      }
      return label
    })
    .join(', ')
}

/**
 * Fetches world state instances from annotations for a persona.
 *
 * @param personaId - UUID of the persona
 * @param prisma - PrismaClient instance for database access
 * @returns Object containing arrays of entity, event, location, and time instances
 */
async function fetchWorldStateInstances(
  personaId: string,
  prisma: PrismaClient
): Promise<{
  entities: Instance[]
  events: Instance[]
  locations: Instance[]
  times: Instance[]
}> {
  // Fetch all annotations for this persona across all videos
  const annotations = await prisma.annotation.findMany({
    where: { personaId },
    select: {
      type: true,
      label: true,
    },
  })

  // Group annotations by type category
  const entities: Instance[] = []
  const events: Instance[] = []
  const locations: Instance[] = []
  const times: Instance[] = []

  // Track unique instances by label to avoid duplicates
  const seenEntities = new Set<string>()
  const seenEvents = new Set<string>()
  const seenLocations = new Set<string>()
  const seenTimes = new Set<string>()

  for (const annotation of annotations) {
    const type = annotation.type.toLowerCase()
    const label = annotation.label

    // Categorize based on annotation type
    if (type === 'entity' && !seenEntities.has(label)) {
      entities.push({ label, type: annotation.type })
      seenEntities.add(label)
    } else if (type === 'event' && !seenEvents.has(label)) {
      events.push({ label, type: annotation.type })
      seenEvents.add(label)
    } else if (type === 'location' && !seenLocations.has(label)) {
      locations.push({ label, type: annotation.type })
      seenLocations.add(label)
    } else if (type === 'time' && !seenTimes.has(label)) {
      times.push({ label, type: annotation.type })
      seenTimes.add(label)
    }
  }

  return { entities, events, locations, times }
}

/**
 * Builds a detection query from a persona's ontology with advanced formatting options.
 *
 * This function constructs a structured query string that includes persona context
 * and selectable ontology components (entities, events, roles, relations) with
 * optional glosses (descriptions) for each term.
 *
 * The query format is optimized for detection models and includes:
 * - Persona name and information need (always included)
 * - Entity types with optional descriptions
 * - Event types with optional descriptions
 * - Role types with optional descriptions
 * - Relation types with optional descriptions
 *
 * @param personaId - UUID of the persona to build query for
 * @param prisma - PrismaClient instance for database access
 * @param options - Options controlling what to include in the query
 * @returns Structured query string formatted for detection models
 * @throws Error if persona not found or has no ontology
 *
 * @example
 * ```typescript
 * // Basic query with entity types only
 * const query = await buildDetectionQueryFromPersona(personaId, prisma)
 * // Returns:
 * // "Analyst: Baseball Scout
 * //  Focus: Evaluating pitcher mechanics
 * //
 * //  Entity Types: pitcher, batter, baseball"
 *
 * // Query with types and instances
 * const queryWithInstances = await buildDetectionQueryFromPersona(personaId, prisma, {
 *   includeEntityTypes: true,
 *   includeEntityInstances: true,
 *   includeLocationInstances: true
 * })
 * // Returns:
 * // "Analyst: Baseball Scout
 * //  Focus: Evaluating pitcher mechanics
 * //
 * //  Entity Types: pitcher, batter, baseball
 * //  Entity Instances: John Smith, Derek Jeter
 * //  Locations: Yankee Stadium, Home Plate"
 *
 * // Query with glosses for both types and instances
 * const queryWithGlosses = await buildDetectionQueryFromPersona(personaId, prisma, {
 *   includeEntityTypes: true,
 *   includeEntityGlosses: true,
 *   includeEntityInstances: true,
 *   includeEntityInstanceGlosses: true
 * })
 * // Returns:
 * // "Analyst: Baseball Scout
 * //  Focus: Evaluating pitcher mechanics
 * //
 * //  Entity Types: pitcher (throws ball), batter (at bat)
 * //  Entity Instances: John Smith (pitcher), Derek Jeter (shortstop)"
 * ```
 */
export async function buildDetectionQueryFromPersona(
  personaId: string,
  prisma: PrismaClient,
  options: DetectionQueryOptions = DEFAULT_QUERY_OPTIONS
): Promise<string> {
  const opts = { ...DEFAULT_QUERY_OPTIONS, ...options }

  // Fetch persona with ontology
  const persona = await prisma.persona.findUnique({
    where: { id: personaId },
    include: {
      ontology: true
    }
  })

  if (!persona) {
    throw new Error(`Persona not found: ${personaId}`)
  }

  if (!persona.ontology) {
    throw new Error(`Persona has no ontology: ${personaId}`)
  }

  // Build query sections
  const sections: string[] = []

  // Always include persona context
  sections.push(`Analyst: ${persona.name}`)
  sections.push(`Focus: ${persona.informationNeed}`)
  sections.push('') // Blank line separator

  // Extract and format ontology types
  const entityTypes = (persona.ontology.entityTypes as unknown as OntologyType[]) || []
  const eventTypes = (persona.ontology.eventTypes as unknown as OntologyType[]) || []
  const roleTypes = (persona.ontology.roleTypes as unknown as OntologyType[]) || []
  const relationTypes = (persona.ontology.relationTypes as unknown as OntologyType[]) || []

  // Fetch world state instances if any instance options are enabled
  let worldState = { entities: [], events: [], locations: [], times: [] } as {
    entities: Instance[]
    events: Instance[]
    locations: Instance[]
    times: Instance[]
  }

  if (
    opts.includeEntityInstances ||
    opts.includeEventInstances ||
    opts.includeLocationInstances ||
    opts.includeTimeInstances
  ) {
    worldState = await fetchWorldStateInstances(personaId, prisma)
  }

  // Add entity types if requested
  if (opts.includeEntityTypes && entityTypes.length > 0) {
    const entityList = formatTypeList(entityTypes, opts.includeEntityGlosses || false)
    sections.push(`Entity Types: ${entityList}`)
  }

  // Add entity instances if requested
  if (opts.includeEntityInstances && worldState.entities.length > 0) {
    const entityList = formatInstanceList(worldState.entities, opts.includeEntityInstanceGlosses || false)
    sections.push(`Entity Instances: ${entityList}`)
  }

  // Add event types if requested
  if (opts.includeEventTypes && eventTypes.length > 0) {
    const eventList = formatTypeList(eventTypes, opts.includeEventGlosses || false)
    sections.push(`Event Types: ${eventList}`)
  }

  // Add event instances if requested
  if (opts.includeEventInstances && worldState.events.length > 0) {
    const eventList = formatInstanceList(worldState.events, opts.includeEventInstanceGlosses || false)
    sections.push(`Event Instances: ${eventList}`)
  }

  // Add location instances if requested (locations are special entities)
  if (opts.includeLocationInstances && worldState.locations.length > 0) {
    const locationList = formatInstanceList(worldState.locations, opts.includeLocationInstanceGlosses || false)
    sections.push(`Locations: ${locationList}`)
  }

  // Add time instances if requested
  if (opts.includeTimeInstances && worldState.times.length > 0) {
    const timeList = formatInstanceList(worldState.times, opts.includeTimeInstanceGlosses || false)
    sections.push(`Times: ${timeList}`)
  }

  // Add role types if requested
  if (opts.includeRoleTypes && roleTypes.length > 0) {
    const roleList = formatTypeList(roleTypes, opts.includeRoleGlosses || false)
    sections.push(`Roles: ${roleList}`)
  }

  // Add relation types if requested
  if (opts.includeRelationTypes && relationTypes.length > 0) {
    const relationList = formatTypeList(relationTypes, opts.includeRelationGlosses || false)
    sections.push(`Relations: ${relationList}`)
  }

  return sections.join('\n')
}

/**
 * Builds persona prompt information for video summarization.
 *
 * Extracts the persona's role and information need to provide context
 * for the video summarization model.
 *
 * @param personaId - UUID of the persona to build prompts for
 * @param prisma - PrismaClient instance for database access
 * @returns Object containing persona_role and information_need strings
 * @throws Error if persona not found
 *
 * @example
 * ```typescript
 * const prompts = await buildPersonaPrompts(personaId, prisma)
 * // Returns: { persona_role: "Baseball Scout", information_need: "Evaluating pitcher mechanics" }
 * ```
 */
export async function buildPersonaPrompts(
  personaId: string,
  prisma: PrismaClient
): Promise<{ persona_role: string; information_need: string }> {
  const persona = await prisma.persona.findUnique({
    where: { id: personaId }
  })

  if (!persona) {
    throw new Error(`Persona not found: ${personaId}`)
  }

  return {
    persona_role: persona.role,
    information_need: persona.informationNeed
  }
}
