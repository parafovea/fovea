/**
 * @module seedTestData
 * @description Seed data utility for developer testing mode.
 *
 * IMPORTANT: This should only be used in development with VITE_ENABLE_TEST_DATA=true.
 *
 * Seeds two personas (a domain analyst and a casual-viewer reference)
 * with their ontologies, plus world entities and locations the personas'
 * type assignments can reference. Redux is fully removed (the Phase 3
 * migration is complete) so the previous "world-entities-only" gate is
 * lifted; the seeder now hits the REST API directly using the same
 * shapes the TanStack Query mutations use under the hood.
 */

import { fetchWorldState, saveWorldState, WorldState } from '@store/queries/useWorld'
import { Entity, EntityType, RoleType, EventType, GlossItem } from '@models/types'
import { generateId } from './uuid'

interface SeedPersonaInput {
  name: string
  role: string
  informationNeed: string
  details: string
  ontology: {
    entities: EntityType[]
    roles: RoleType[]
    events: EventType[]
    relationTypes: unknown[]
    relations: unknown[]
  }
}

async function seedOnePersona(input: SeedPersonaInput): Promise<void> {
  // Create the persona row.
  const personaResp = await fetch('/api/personas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      name: input.name,
      role: input.role,
      informationNeed: input.informationNeed,
      details: input.details,
    }),
  })
  if (!personaResp.ok) {
    throw new Error(`Failed to seed persona "${input.name}": ${personaResp.statusText}`)
  }
  const persona = await personaResp.json() as { id: string }

  // Write the ontology into the freshly created persona's ontology slot.
  const ontologyResp = await fetch(`/api/personas/${persona.id}/ontology`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input.ontology),
  })
  if (!ontologyResp.ok) {
    throw new Error(`Failed to seed ontology for persona "${input.name}": ${ontologyResp.statusText}`)
  }
}

function textGloss(content: string): GlossItem[] {
  return [{ type: 'text' as const, content }]
}

function entityType(name: string, gloss: GlossItem[]): EntityType {
  const stamp = new Date().toISOString()
  return { id: generateId(), name, gloss, createdAt: stamp, updatedAt: stamp }
}
function roleType(name: string, gloss: GlossItem[]): RoleType {
  const stamp = new Date().toISOString()
  return { id: generateId(), name, gloss, allowedFillerTypes: [], createdAt: stamp, updatedAt: stamp }
}
function eventType(name: string, gloss: GlossItem[]): EventType {
  const stamp = new Date().toISOString()
  return { id: generateId(), name, gloss, roles: [], createdAt: stamp, updatedAt: stamp }
}

/**
 * Seed test data for developer testing.
 * Only runs when VITE_ENABLE_TEST_DATA environment variable is set to 'true'.
 *
 * Seeds (in order, so that ontology type ids can be referenced from the
 * world entities if needed): two personas with ontologies, then world
 * entities and locations.
 */
export async function seedTestData(): Promise<void> {
  const now = new Date().toISOString()

  // Two personas covering complementary annotation perspectives:
  // 1. A domain analyst tracking critical-infrastructure incidents.
  // 2. A casual viewer for sanity-checking general-audience features.
  const personas: SeedPersonaInput[] = [
    {
      name: 'Infrastructure Analyst',
      role: 'domain expert',
      informationNeed: 'Identify critical-infrastructure events, their locations, and the organizations involved.',
      details: 'Focuses on transportation, energy, and emergency-response infrastructure. Cross-references organizations against public registries.',
      ontology: {
        entities: [
          entityType('Infrastructure Organization', textGloss('A public or private entity operating critical infrastructure (ports, airports, news outlets, government agencies).')),
          entityType('Geographic Location', textGloss('A geographic place — city, region, country, or natural feature.')),
        ],
        roles: [
          roleType('operator', textGloss('The entity operating or running the infrastructure.')),
          roleType('location', textGloss('The geographic site of the event.')),
        ],
        events: [
          eventType('Weather Event', textGloss('A notable weather occurrence: storm, dust storm, flood, drought.')),
          eventType('Infrastructure Disruption', textGloss('A disruption to normal operation of critical infrastructure.')),
        ],
        relationTypes: [],
        relations: [],
      },
    },
    {
      name: 'Casual Viewer',
      role: 'general audience',
      informationNeed: 'Track what happened and who was involved, without specialist context.',
      details: 'Surfaces high-level entities and events that a non-expert would notice on a first viewing.',
      ontology: {
        entities: [
          entityType('Person or Organization', textGloss('Any named person or organization mentioned in the content.')),
          entityType('Place', textGloss('Any geographic location mentioned, however general.')),
        ],
        roles: [],
        events: [
          eventType('Notable Event', textGloss('Anything the narrator or speaker flags as noteworthy.')),
        ],
        relationTypes: [],
        relations: [],
      },
    },
  ]

  // Seed personas first so the world entities below can reference them
  // for typeAssignments in future iterations.
  for (const p of personas) {
    try {
      await seedOnePersona(p)
    } catch (err) {
      console.warn(`[seedTestData] ${err instanceof Error ? err.message : err} — continuing with world entities`)
    }
  }

  // Sample Entities with Wikidata references (based on video content)
  const entities: Entity[] = [
    {
      id: generateId(),
      name: 'Port of Long Beach',
      description: [{ type: 'text' as const, content: 'Major seaport in Long Beach, California. Second-busiest container port in the United States.' }],
      wikidataId: 'Q1144228',
      typeAssignments: [],
      metadata: {},
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      name: 'Phoenix Sky Harbor International Airport',
      description: [{ type: 'text' as const, content: 'Primary airport serving Phoenix, Arizona metropolitan area.' }],
      wikidataId: 'Q845278',
      typeAssignments: [],
      metadata: {},
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      name: 'ABC7 Eyewitness News',
      description: [{ type: 'text' as const, content: 'Los Angeles-based television news organization (KABC-TV).' }],
      wikidataId: 'Q4649870',
      typeAssignments: [],
      metadata: {},
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      name: 'National Weather Service',
      description: [{ type: 'text' as const, content: 'U.S. government agency providing weather forecasts and warnings.' }],
      wikidataId: 'Q850795',
      typeAssignments: [],
      metadata: {},
      createdAt: now,
      updatedAt: now,
    },
  ]

  // Sample Locations with GPS coordinates (locations are entities with location-specific fields)
  const locations: Entity[] = [
    {
      id: generateId(),
      name: 'Phoenix, Arizona',
      description: [{ type: 'text' as const, content: 'State capital and largest city in Arizona. Frequent dust storm activity.' }],
      wikidataId: 'Q16556',
      typeAssignments: [],
      metadata: {},
      locationType: 'point' as const,
      coordinates: {
        latitude: 33.4484,
        longitude: -112.0740,
      },
      createdAt: now,
      updatedAt: now,
    } as Entity,
    {
      id: generateId(),
      name: 'Long Beach, California',
      description: [{ type: 'text' as const, content: 'Coastal city in Los Angeles County, home to major seaport.' }],
      wikidataId: 'Q49085',
      typeAssignments: [],
      metadata: {},
      locationType: 'point' as const,
      coordinates: {
        latitude: 33.7701,
        longitude: -118.1937,
      },
      createdAt: now,
      updatedAt: now,
    } as Entity,
    {
      id: generateId(),
      name: 'Kunar Province, Afghanistan',
      description: [{ type: 'text' as const, content: 'Eastern province of Afghanistan, seismically active region.' }],
      wikidataId: 'Q173570',
      typeAssignments: [],
      metadata: {},
      locationType: 'point' as const,
      coordinates: {
        latitude: 34.8458,
        longitude: 71.0936,
      },
      createdAt: now,
      updatedAt: now,
    } as Entity,
    {
      id: generateId(),
      name: 'Black Rock Desert, Nevada',
      description: [{ type: 'text' as const, content: 'Desert region in northwestern Nevada, site of Burning Man festival.' }],
      wikidataId: 'Q894825',
      typeAssignments: [],
      metadata: {},
      locationType: 'point' as const,
      coordinates: {
        latitude: 40.8736,
        longitude: -119.0653,
      },
      createdAt: now,
      updatedAt: now,
    } as Entity,
  ]

  // Save entities to world state via API
  try {
    const currentState = await fetchWorldState()
    const allNewEntities = [...entities, ...locations]
    const newState: Partial<WorldState> = {
      ...currentState,
      entities: [...(currentState.entities || []), ...allNewEntities],
    }
    await saveWorldState(newState)
  } catch {
    // If API fails (e.g., server not running), log and continue
    console.warn('Could not save seed entities via API - world state may not persist')
  }
}

/**
 * Check if test data seeding is enabled via environment variable.
 * Requires VITE_ENABLE_TEST_DATA to be explicitly set to 'true'.
 */
export function isTestDataEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_TEST_DATA === 'true'
}
