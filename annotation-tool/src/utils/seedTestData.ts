/**
 * @module seedTestData
 * @description Seed data utility for developer testing mode.
 * NOTE: This utility is temporarily disabled during the state management migration.
 * It will be re-enabled after Phase 3 when Redux is fully removed.
 *
 * IMPORTANT: This should only be used in development with VITE_ENABLE_TEST_DATA=true
 */

import { fetchWorldState, saveWorldState, WorldState } from '@store/queries/useWorld'
import { Entity } from '@models/types'
import { generateId } from './uuid'

/**
 * Seed test data for developer testing.
 * Only runs when VITE_ENABLE_TEST_DATA environment variable is set to 'true'.
 *
 * NOTE: Persona and ontology seeding is temporarily disabled during state management migration.
 * Currently only seeds world entities (locations, organizations).
 */
export async function seedTestData(): Promise<void> {
  const now = new Date().toISOString()

  // TODO: Re-enable persona seeding after Phase 3 of state management migration
  // For now, only seed world entities which don't depend on Redux
  console.log('[seedTestData] Persona seeding temporarily disabled during migration. Seeding world entities only.')

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
