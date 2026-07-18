import { PrismaClient } from '@prisma/client'

import type { GlossItem } from '@models/types.js'

import { readOntologyAggregate } from '../services/layers-bridge/ontology-bridge.js'
import { glossToText } from '../services/ontology-layers-mapper.js'
import { WORLD_NODE_TYPES } from '../services/world-layers-mapper.js'

/**
 * A persona ontology type reconstructed from the layers store: its display name
 * and its gloss as rich-text segments.
 */
interface OntologyType {
  name: string
  gloss?: GlossItem[]
}

/**
 * A world instance the detection query lists under its category.
 */
interface Instance {
  label: string
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
 * Formats ontology types into a readable list, optionally appending each type's
 * flattened gloss text in parentheses.
 *
 * @param types - Array of ontology types
 * @param includeGlosses - Whether to append the flattened gloss of each type
 * @returns Formatted string (e.g., "pitcher, batter" or "pitcher (throws ball), batter (at bat)")
 */
function formatTypeList(types: OntologyType[], includeGlosses: boolean): string {
  if (types.length === 0) return ''

  return types
    .map(type => {
      const name = type.name.toLowerCase()
      const gloss = includeGlosses && Array.isArray(type.gloss) ? glossToText(type.gloss) : null
      return gloss ? `${name} (${gloss})` : name
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

/** The four world-instance buckets the detection query draws its labels from. */
interface WorldInstances {
  entities: Instance[]
  events: Instance[]
  locations: Instance[]
  times: Instance[]
}

/** The world node type each instance bucket collects, keyed by node type. */
const NODE_TYPE_BUCKET: Record<string, keyof WorldInstances> = {
  entity: 'entities',
  situation: 'events',
  location: 'locations',
  time: 'times',
}

/**
 * Reads a scope's world-instance labels from the graph nodes, grouped by node
 * type into the entity, event, location, and time buckets. Entity and situation
 * nodes label entities and events, location and time nodes their own buckets;
 * duplicate labels within a bucket collapse to one entry.
 *
 * @param scope - the owning user and project the world nodes are scoped to
 * @param prisma - PrismaClient instance for database access
 * @returns the entity, event, location, and time instance buckets
 */
async function fetchWorldStateInstances(
  scope: { userId: string; projectId: string | null },
  prisma: PrismaClient
): Promise<WorldInstances> {
  const nodes = await prisma.graphNode.findMany({
    where: {
      createdByUserId: scope.userId,
      projectId: scope.projectId,
      nodeType: { in: [...WORLD_NODE_TYPES] },
    },
    select: { nodeType: true, label: true },
    orderBy: { createdAt: 'asc' },
  })

  const instances: WorldInstances = { entities: [], events: [], locations: [], times: [] }
  const seen: Record<keyof WorldInstances, Set<string>> = {
    entities: new Set(),
    events: new Set(),
    locations: new Set(),
    times: new Set(),
  }

  for (const node of nodes) {
    const bucket = NODE_TYPE_BUCKET[node.nodeType]
    if (!bucket || !node.label || seen[bucket].has(node.label)) continue
    seen[bucket].add(node.label)
    instances[bucket].push({ label: node.label })
  }

  return instances
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

  // Fetch persona; its ontology is reconstructed from the layers store.
  const persona = await prisma.persona.findUnique({ where: { id: personaId } })

  if (!persona) {
    throw new Error(`Persona not found: ${personaId}`)
  }

  const { aggregate: ontology, exists: ontologyExists } = await readOntologyAggregate(prisma, personaId)
  if (!ontologyExists) {
    throw new Error(`Persona has no ontology: ${personaId}`)
  }

  // Build query sections
  const sections: string[] = []

  // Always include persona context
  sections.push(`Analyst: ${persona.name}`)
  sections.push(`Focus: ${persona.informationNeed}`)
  sections.push('') // Blank line separator

  // Extract and format ontology types
  const entityTypes = ontology.entityTypes as unknown as OntologyType[]
  const eventTypes = ontology.eventTypes as unknown as OntologyType[]
  const roleTypes = ontology.roleTypes as unknown as OntologyType[]
  const relationTypes = ontology.relationTypes as unknown as OntologyType[]

  // Fetch world state instances if any instance options are enabled
  let worldState: WorldInstances = { entities: [], events: [], locations: [], times: [] }

  if (
    opts.includeEntityInstances ||
    opts.includeEventInstances ||
    opts.includeLocationInstances ||
    opts.includeTimeInstances
  ) {
    worldState = await fetchWorldStateInstances(
      { userId: persona.userId, projectId: persona.projectId },
      prisma
    )
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
