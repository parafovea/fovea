/**
 * Default tour content bundle: the microvent annotation project.
 * Used as the in-code fallback when /tour-content.json is missing or
 * malformed. The values mirror `annotation-tool/public/tour-content
 * .json` (which is the runtime source of truth and the file an admin
 * edits to retheme the tours for their own domain).
 *
 * If you're an admin tailoring tours, edit /tour-content.json. NOT
 * this file. The JSON loads at boot, ships videoFilenames the loader
 * resolves to videoIds, and falls back to these values only if the
 * JSON fetch fails. Editing this TS file requires a frontend rebuild;
 * the JSON does not.
 */

import type { TourContentBundle } from './types'

export const microventContent: TourContentBundle = {
  firstAnnotation: {
    personaName: 'Tech-Curious Spectator',
    personaRole: 'General audience viewer with an interest in emerging technology',
    entityType: {
      name: 'Person',
      gloss: 'an individual human',
    },
    // Crossing Broad's "angle from the stands" Phillies-Karen clip.
    videoId: '049f160046238b2f',
  },

  ontologyAuthoring: {
    personaName: 'Automated',
    personaRole: 'Analyst',
    entityType: { name: 'gunshot', gloss: 'discharge of a firearm' },
    eventType: { name: 'wildfire', gloss: 'an uncontrolled fire' },
    roleType: { name: 'perpetrator', gloss: 'the person responsible for the act' },
    relationType: {
      name: 'occurred-at',
      gloss: 'the event took place at the location',
    },
  },

  wikidataAugmentation: {
    personaName: 'Automated',
    personaRole: 'Analyst',
    searchTerm: 'dust cloud',
  },

  eventsRolesClaims: {
    personaName: 'LoanDepot Park Guest Services Usher',
    personaRole: 'LoanDepot Park Guest Services Usher',
    firstActor: {
      name: 'Phillies fan Karen',
      gloss: 'the woman seated behind home plate who claimed the ball',
    },
    secondActor: {
      name: 'Phillies fan son',
      gloss: 'the boy whose father had given him the ball',
    },
    eventType: {
      name: 'ball-grab',
      gloss: 'one spectator takes a souvenir ball from another',
    },
    firstRole: {
      name: 'grabber',
      gloss: 'the spectator who took the ball',
    },
    secondRole: {
      name: 'prior-holder',
      gloss: 'the spectator who had the ball before the grab',
    },
    derivedClaimText:
      'Phillies fan Karen took the souvenir ball from the Phillies fan son',
    // Collin Rugg's explainer cut of the Phillies-Karen incident.
    videoId: '8d9e6762f54408f4',
  },

  worldLayer: {
    personaName: 'LoanDepot Park Guest Services Usher',
    personaRole: 'LoanDepot Park Guest Services Usher',
    entityName: 'LoanDepot Park',
    entityType: {
      name: 'Stadium',
      gloss: 'a venue hosting major-league baseball games',
    },
    locationLatitude: 25.7781,
    locationLongitude: -80.2197,
    locationName: 'LoanDepot Park, Miami',
    timeCollectionName: 'Phillies-Marlins September 2025 home games',
    entityCollectionName: 'the involved fans',
    // Amiri King's heckling-response Phillies-Karen clip.
    videoId: 'cd0b278719bea692',
  },

  modelInTheLoop: {
    personaName: 'Tech-Curious Spectator',
    personaRole: 'General audience viewer with an interest in emerging technology',
    // ABC7 cargo-container column toppling at Port of Long Beach.
    videoId: '1fd9993237cbc33b',
  },

  summariesAndClaims: {
    personaName: 'LoanDepot Park Guest Services Usher',
    personaRole: 'LoanDepot Park Guest Services Usher',
    summaryText:
      'A woman seated behind home plate takes a foul ball that a man had caught and given to a young boy, then refuses to return it as the crowd reacts.',
    claimText:
      'A Phillies fan in the stands took a souvenir ball from a boy after his father caught it',
    // Same Collin Rugg explainer as Tour 4.
    videoId: '8d9e6762f54408f4',
  },

  collaboration: {
    projectName: 'Phillies-Marlins incident review',
    groupName: 'Stadium operations team',
  },

  importExport: {
    importBundlePath: 'test/e2e/fixtures/microvent-seed.jsonl',
  },
}
