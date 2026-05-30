/**
 * Default tour content bundle: the microvent annotation project.
 *
 * Sourced from the microvent_v2 export's real personas + ontologies +
 * annotations + summaries + claims (see annotation-tool/test/e2e/
 * fixtures/microvent-seed.jsonl). Picks specific content per tour so
 * the visitor sees a coherent running example across the catalogue:
 *
 *   - Tour 1 (first-annotation): a Tech-Curious Spectator picks a
 *     Person — the simplest possible on-ramp.
 *   - Tour 2 (ontology-authoring): the Automated/Analyst persona
 *     builds gunshot + wildfire + perpetrator + occurred-at — four
 *     types covering all four ontology layers using microvent's
 *     actual Wikidata-grounded vocabulary.
 *   - Tour 3 (wikidata-augmentation): same Automated persona searches
 *     Wikidata for "dust cloud" — Q1267128, one of microvent's nine
 *     Automated entity types that was originally imported from
 *     Wikidata.
 *   - Tour 4 (events-roles-claims): the LoanDepot Park Guest Services
 *     Usher boxes the Phillies fan Karen and her son's father, creates
 *     a ball-grab event, assigns grabber + prior-holder roles.
 *   - Tour 5 (world-layer): same Usher persona creates LoanDepot Park
 *     (Miami coordinates), groups the September 2025 home games, and
 *     groups the involved fans.
 *   - Tour 7 (summaries-and-claims): types one of microvent's actual
 *     summary contents about the Phillies-Karen incident.
 *   - Tour 8 (collaboration): a Phillies-Marlins incident review
 *     project + Stadium operations team group.
 *   - Tour 10 (import-export): uploads the microvent_v2 JSONL.
 *
 * To tailor tours for a different domain, fork this file with the
 * same shape, supply per-tour content drawn from the deployment's own
 * annotation project, and pass the forked bundle as TourProvider's
 * `contentBundle` prop.
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
  },

  ontologyAuthoring: {
    personaName: 'Automated',
    personaRole: 'Analyst',
    entityType: {
      name: 'gunshot',
      gloss: 'discharge of a firearm',
    },
    eventType: {
      name: 'wildfire',
      gloss: 'an uncontrolled fire',
    },
    roleType: {
      name: 'perpetrator',
      gloss: 'the person responsible for the act',
    },
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
  },

  modelInTheLoop: {
    personaName: 'Tech-Curious Spectator',
    personaRole: 'General audience viewer with an interest in emerging technology',
  },

  summariesAndClaims: {
    personaName: 'LoanDepot Park Guest Services Usher',
    personaRole: 'LoanDepot Park Guest Services Usher',
    summaryText:
      'A woman seated behind home plate takes a foul ball that a man had caught and given to a young boy, then refuses to return it as the crowd reacts.',
    claimText:
      'A Phillies fan in the stands took a souvenir ball from a boy after his father caught it',
  },

  collaboration: {
    projectName: 'Phillies-Marlins incident review',
    groupName: 'Stadium operations team',
  },

  importExport: {
    // E2E test path; production deployments override this with their
    // own bundle URL.
    importBundlePath: 'test/e2e/fixtures/microvent-seed.jsonl',
  },
}
