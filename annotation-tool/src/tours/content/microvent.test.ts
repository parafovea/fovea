/**
 * Tests that the TourContentBundle abstraction lets admins swap in
 * their own per-tour content and the tour catalogue rebuilds with the
 * new narration text + suggested type names. Documents-by-example the
 * admin tailoring path: fork microventContent, override the slots you
 * care about, hand it to TourProvider's contentBundle prop.
 */

import { describe, it, expect } from 'vitest'
import { microventContent } from './microvent'
import type { TourContentBundle } from './types'
import { getBuiltInTours } from '../scripts'

describe('TourContentBundle admin tailoring', () => {
  it('microvent default supplies content for every tour slot', () => {
    expect(microventContent.firstAnnotation.personaName).toBe(
      'Tech-Curious Spectator',
    )
    expect(microventContent.ontologyAuthoring.entityType.name).toBe('gunshot')
    expect(microventContent.ontologyAuthoring.eventType.name).toBe('wildfire')
    expect(microventContent.ontologyAuthoring.roleType.name).toBe('perpetrator')
    expect(microventContent.ontologyAuthoring.relationType.name).toBe(
      'occurred-at',
    )
    expect(microventContent.wikidataAugmentation.searchTerm).toBe('dust cloud')
    expect(microventContent.eventsRolesClaims.firstActor.name).toBe(
      'Phillies fan Karen',
    )
    expect(microventContent.eventsRolesClaims.secondActor.name).toBe(
      'Phillies fan son',
    )
    expect(microventContent.eventsRolesClaims.eventType.name).toBe('ball-grab')
    expect(microventContent.worldLayer.entityName).toBe('LoanDepot Park')
    expect(microventContent.summariesAndClaims.summaryText.length).toBeGreaterThan(
      20,
    )
  })

  it('getBuiltInTours(microvent) interpolates microvent values into narrations', () => {
    const tours = getBuiltInTours(microventContent)
    const tour2 = tours.find((t) => t.id === 'ontology-authoring')
    expect(tour2).toBeDefined()
    const step2Narration = tour2!.steps[1].narration
    expect(
      step2Narration,
      "narration mentions microvent's gunshot entity type",
    ).toContain('gunshot')
    const step4Narration = tour2!.steps[3].narration
    expect(step4Narration).toContain('wildfire')
  })

  it('swapping the bundle reroutes every narration to the new content', () => {
    // Worked example: an admin tailoring tours for a marine-safety
    // domain takes microvent as a starting point and overrides every
    // user-visible slot with their own content. The structural shape
    // is identical; only the strings (and a few coordinates) change.
    const marineBundle: TourContentBundle = {
      ...microventContent,
      firstAnnotation: {
        personaName: 'Coast Guard Inspector',
        personaRole: 'Vessel inspection officer',
        entityType: {
          name: 'Container',
          gloss: 'a standardized shipping container visible on deck',
        },
      },
      ontologyAuthoring: {
        personaName: 'Coast Guard Inspector',
        personaRole: 'Vessel inspection officer',
        entityType: { name: 'container', gloss: 'standardized shipping container' },
        eventType: { name: 'cargo-spill', gloss: 'cargo loss during transit' },
        roleType: { name: 'affected-party', gloss: 'who suffered the loss' },
        relationType: { name: 'loaded-on', gloss: 'cargo placement on vessel' },
      },
      eventsRolesClaims: {
        personaName: 'Coast Guard Inspector',
        personaRole: 'Vessel inspection officer',
        firstActor: { name: 'Cargo vessel', gloss: 'the ship losing cargo' },
        secondActor: { name: 'Port facility', gloss: 'the receiving dock' },
        eventType: { name: 'cargo-spill', gloss: 'overboard container loss' },
        firstRole: { name: 'losing-party', gloss: 'the vessel that lost cargo' },
        secondRole: { name: 'receiving-party', gloss: 'the destination port' },
        derivedClaimText: 'The cargo vessel lost containers en route to port',
      },
      worldLayer: {
        personaName: 'Coast Guard Inspector',
        personaRole: 'Vessel inspection officer',
        entityName: 'Port of Long Beach Pier 400',
        entityType: { name: 'Port', gloss: 'a deepwater shipping port' },
        locationLatitude: 33.7367,
        locationLongitude: -118.2517,
        locationName: 'Port of Long Beach, CA',
        timeCollectionName: 'September 2025 cargo incidents',
        entityCollectionName: 'the affected vessels',
      },
    }
    const tours = getBuiltInTours(marineBundle)
    const tour4 = tours.find((t) => t.id === 'events-roles-claims')
    expect(tour4).toBeDefined()
    // Tour 4 step 1's narration now reads "Box the Cargo vessel" not
    // "Box the Phillies fan Karen" — same anchor, different content.
    expect(tour4!.steps[0].narration).toContain('Cargo vessel')
    expect(tour4!.steps[0].narration).not.toContain('Karen')

    const tour5 = tours.find((t) => t.id === 'world-layer')
    expect(tour5!.steps[1].narration).toContain('Port of Long Beach Pier 400')
    expect(tour5!.steps[1].narration).not.toContain('LoanDepot')
  })
})
