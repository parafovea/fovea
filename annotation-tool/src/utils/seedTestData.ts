/**
 * @module seedTestData
 * @description Seed data utility for developer testing mode.
 * Pre-populates Redux store with tactical analyst persona, Wikidata-based ontology,
 * and sample entities/locations extracted from video metadata.
 *
 * IMPORTANT: This should only be used in development with VITE_ENABLE_TEST_DATA=true
 */

import { store } from '../store/store'
import {
  addPersona,
  setActivePersona,
  addEntityToPersona,
  addEventToPersona,
  addRoleToPersona,
} from '../store/personaSlice'
import { addEntity } from '../store/worldSlice'
import { generateId } from './uuid'
import { GlossItem } from '../models/types'

/**
 * Seed test data into Redux store for developer testing.
 * Only runs when VITE_ENABLE_TEST_DATA environment variable is set to 'true'.
 *
 * Pre-populates:
 * - Tactical analyst persona (disaster response focus)
 * - Entity types with Wikidata references
 * - Event types with Wikidata references
 * - Role types with Wikidata references
 * - Sample entities (locations, organizations) from video metadata
 * - GPS-tagged locations
 */
export async function seedTestData(): Promise<void> {
  console.log('🌱 Seeding test data for developer mode...')

  // Create tactical analyst persona and ontology
  const personaId = generateId()
  const persona = {
    id: personaId,
    name: 'Tactical Disaster Response Analyst',
    role: 'Intelligence Analyst',
    informationNeed: 'Track and assess natural disaster impacts, infrastructure damage, emergency response activities, and affected populations to support tactical decision-making and resource allocation.',
    details: 'Focused on rapid assessment of disaster events including dust storms, earthquakes, container ship incidents, and other hazardous situations. Prioritizes identification of damaged infrastructure, affected locations, response organizations, and impact on civilian populations.',
    isSystemGenerated: false,
    hidden: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const ontology = {
    id: generateId(),
    personaId,
    entities: [],
    roles: [],
    events: [],
    relationTypes: [],
    relations: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  store.dispatch(addPersona({ persona, ontology }))
  store.dispatch(setActivePersona(personaId))

  // Entity Types with Wikidata references
  const entityTypes = [
    {
      id: generateId(),
      name: 'Infrastructure',
      gloss: [{ type: 'text' as const, content: 'Physical structures and facilities including ports, airports, roads, buildings, and utilities' }],
      wikidataId: 'Q121359', // Infrastructure
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: 'Natural Phenomenon',
      gloss: [{ type: 'text' as const, content: 'Weather events, natural disasters, and environmental phenomena' }],
      wikidataId: 'Q1322005', // Natural phenomenon
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: 'Organization',
      gloss: [{ type: 'text' as const, content: 'Response organizations, government agencies, news outlets, and commercial entities' }],
      wikidataId: 'Q43229', // Organization
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: 'Person',
      gloss: [{ type: 'text' as const, content: 'Individuals affected by or responding to disaster events' }],
      wikidataId: 'Q5', // Human
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]

  entityTypes.forEach(entity => store.dispatch(addEntityToPersona({ personaId, entity })))

  // Event Types with Wikidata references
  const eventTypes = [
    {
      id: generateId(),
      name: 'Disaster Event',
      gloss: [{ type: 'text' as const, content: 'Natural or human-caused disaster occurrence' }],
      wikidataId: 'Q3839081', // Natural disaster
      roles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: 'Response Action',
      gloss: [{ type: 'text' as const, content: 'Emergency response and recovery activities' }],
      wikidataId: 'Q1460335', // Emergency management
      roles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: 'Impact Event',
      gloss: [{ type: 'text' as const, content: 'Observable effects and consequences of disaster' }],
      wikidataId: 'Q1190554', // Impact
      roles: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]

  eventTypes.forEach(event => store.dispatch(addEventToPersona({ personaId, event })))

  // Role Types with Wikidata references
  const roleTypes = [
    {
      id: generateId(),
      name: 'Affected Party',
      gloss: [{ type: 'text' as const, content: 'Individual or entity impacted by disaster event' }],
      wikidataId: 'Q1802668', // Victim
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: 'Responder',
      gloss: [{ type: 'text' as const, content: 'Person or organization providing emergency response' }],
      wikidataId: 'Q1473346', // First responder
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateId(),
      name: 'Reporter',
      gloss: [{ type: 'text' as const, content: 'Individual or organization documenting the event' }],
      wikidataId: 'Q1930187', // Journalist
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]

  roleTypes.forEach(role => store.dispatch(addRoleToPersona({ personaId, role })))

  // Sample Entities with Wikidata references (based on video content)
  const entities = [
    {
      name: 'Port of Long Beach',
      description: [{ type: 'text' as const, content: 'Major seaport in Long Beach, California. Second-busiest container port in the United States.' }],
      wikidataId: 'Q1144228',
      typeAssignments: [],
      metadata: {},
    },
    {
      name: 'Phoenix Sky Harbor International Airport',
      description: [{ type: 'text' as const, content: 'Primary airport serving Phoenix, Arizona metropolitan area.' }],
      wikidataId: 'Q845278',
      typeAssignments: [],
      metadata: {},
    },
    {
      name: 'ABC7 Eyewitness News',
      description: [{ type: 'text' as const, content: 'Los Angeles-based television news organization (KABC-TV).' }],
      wikidataId: 'Q4649870',
      typeAssignments: [],
      metadata: {},
    },
    {
      name: 'National Weather Service',
      description: [{ type: 'text' as const, content: 'U.S. government agency providing weather forecasts and warnings.' }],
      wikidataId: 'Q850795',
      typeAssignments: [],
      metadata: {},
    },
  ]

  entities.forEach(entity => store.dispatch(addEntity(entity)))

  // Sample Locations with GPS coordinates (locations are entities with location-specific fields)
  const locations = [
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
  ]

  locations.forEach(location => store.dispatch(addEntity(location)))

  console.log('✅ Test data seeded successfully')
  console.log(`   - Persona: ${persona.name}`)
  console.log(`   - Entity Types: ${entityTypes.length}`)
  console.log(`   - Event Types: ${eventTypes.length}`)
  console.log(`   - Role Types: ${roleTypes.length}`)
  console.log(`   - Entities: ${entities.length}`)
  console.log(`   - Locations: ${locations.length}`)
}

/**
 * Check if test data seeding is enabled via environment variable.
 * Requires VITE_ENABLE_TEST_DATA to be explicitly set to 'true'.
 */
export function isTestDataEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_TEST_DATA === 'true'
}
