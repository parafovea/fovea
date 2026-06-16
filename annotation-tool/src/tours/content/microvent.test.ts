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
    expect(microventContent.ontologyAuthoring.entityType.name).toBe(
      'Shipping container',
    )
    expect(microventContent.ontologyAuthoring.eventType.name).toBe(
      'Container collapse',
    )
    expect(microventContent.ontologyAuthoring.roleType.name).toBe(
      'collapsed-stack',
    )
    expect(microventContent.ontologyAuthoring.relationType.name).toBe(
      'stowed-on',
    )
    expect(microventContent.wikidataAugmentation.searchTerm).toBe('foul ball')
    expect(microventContent.eventsRolesClaims.firstActor.name).toBe('Spectator')
    expect(microventContent.eventsRolesClaims.secondActor.name).toBe(
      'Spectator',
    )
    expect(microventContent.eventsRolesClaims.eventType.name).toBe('ball grab')
    expect(microventContent.worldLayer.entityName).toBe('LoanDepot Park')
    expect(microventContent.summariesAndClaims.summaryText.length).toBeGreaterThan(
      20,
    )
    // Each tour that uses a video must pin a specific videoId so the
    // booth visitor sees a clip whose content matches the narration.
    expect(microventContent.firstAnnotation.videoId).toMatch(/^[0-9a-f]{16}$/)
    expect(microventContent.eventsRolesClaims.videoId).toMatch(/^[0-9a-f]{16}$/)
    expect(microventContent.worldLayer.videoId).toMatch(/^[0-9a-f]{16}$/)
    expect(microventContent.modelInTheLoop.videoId).toMatch(/^[0-9a-f]{16}$/)
    expect(microventContent.summariesAndClaims.videoId).toMatch(/^[0-9a-f]{16}$/)
    // Tour 4 and Tour 7 both narrate the Phillies-Karen ball-grab
    // incident — they need to land on the same clip so the visitor
    // sees one coherent running example across the two tours.
    expect(microventContent.eventsRolesClaims.videoId).toBe(
      microventContent.summariesAndClaims.videoId,
    )
  })

  it('getBuiltInTours(microvent) interpolates microvent values into narrations', () => {
    const tours = getBuiltInTours(microventContent)
    const tour2 = tours.find((t) => t.id === 'ontology-authoring')
    expect(tour2).toBeDefined()
    const step2Narration = tour2!.steps[1].narration
    expect(
      step2Narration,
      "narration mentions microvent's shipping container entity type",
    ).toContain('Shipping container')
    const step6Narration = tour2!.steps[5].narration
    expect(step6Narration).toContain('Container collapse')
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
        // Marine-safety admin's bundle ships a different videoId
        // for Tour 5 — one of the cargo-spill clips their own
        // annotation project recorded, where Pier 400 is on screen.
        videoId: 'd20a07790ee5de6f',
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
