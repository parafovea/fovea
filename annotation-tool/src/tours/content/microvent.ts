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
    // Port Safety persona for the ontology-authoring tour. Its seeded
    // ontology already contains a coherent set of cross-referenceable
    // types (Shipping Container, Gantry Crane, Container Stack,
    // Container Vessel, Stevedore, Tipped Container, Falling
    // Container) which makes the #-trigger gloss reference beat land
    // naturally — typing "a kind of #" inside the new entity type's
    // gloss surfaces these as the autocomplete choices and the
    // visitor sees a real domain-coherent reference graph, rather
    // than the previous Spectator/Baseball game ontology where the
    // gloss-reference step had no related types to pick from.
    personaName: 'Port Safety Incident Investigator',
    personaRole: 'Maritime safety analyst documenting cargo-handling incidents at container terminals.',
    entityType: {
      name: 'Shipping container',
      gloss: 'an intermodal freight container used to move cargo by ship, rail, or truck',
      wikidataId: 'Q987767',
    },
    eventType: {
      name: 'Container collapse',
      gloss: 'a stack of stowed shipping containers losing structural integrity',
    },
    roleType: {
      name: 'collapsed-stack',
      gloss: 'the stack of containers that toppled in the incident',
    },
    relationType: {
      name: 'stowed-on',
      gloss: 'links a shipping container to the vessel it is loaded onto',
    },
  },

  wikidataAugmentation: {
    personaName: 'Automated',
    personaRole: 'Analyst',
    // Real Wikidata-searchable term that returns a clean hit:
    // Q1355676 ('foul ball: in baseball, generally, a struck ball that
    // ends up in foul territory') verified at seed-authoring time via
    // wbsearchentities. Narratively coherent with the Phillies-Karen
    // clip — the foul ball is the object at the centre of the
    // dispute, so the augmenter naturally pulls it into the persona's
    // ontology.
    searchTerm: 'foul ball',
    mockOntologyAugmentReasoning:
      'Suggestions drawn from the surrounding stadium-incident context, ranked by overlap with the existing persona ontology.',
    mockOntologyAugmentSuggestions: [
      // The visitor accepts this one but renames it to lowercase
      // hyphenated `ball-grab` to match microvent's canonical form.
      {
        name: 'Ball grab',
        parent: 'Stadium incident',
        description:
          "A spectator taking a souvenir baseball that was in another spectator's possession.",
        examples: ['Karen took the ball from the boy fan'],
        confidence: 0.81,
      },
      // Too broad. Visitor rejects.
      {
        name: 'Stadium incident',
        parent: null,
        description: 'An unplanned occurrence inside a sports venue affecting fans or play.',
        examples: ['Phillies fan Karen ball-grab', 'Bat-shard injury'],
        confidence: 0.88,
      },
      // Wrong framing (implies consent). Visitor rejects.
      {
        name: 'Souvenir transfer',
        parent: null,
        description:
          'Movement of a memorabilia object between fans, with or without consent.',
        examples: ['Stadium employee gives a foul ball to a child'],
        confidence: 0.66,
      },
      // Wrong: only one fan is the aggressor. Visitor rejects.
      {
        name: 'Fan-fan conflict',
        parent: null,
        description: 'An interpersonal dispute between two attendees at a public event.',
        examples: ['Argument over a seat', 'Souvenir dispute'],
        confidence: 0.61,
      },
      // Conflates the two distinct actors microvent encodes
      // separately. Visitor rejects.
      {
        name: 'Phillies fan',
        parent: null,
        description: 'A spectator attending a Philadelphia Phillies baseball game.',
        examples: ['Karen', 'The boy in row 12'],
        confidence: 0.53,
      },
    ],
  },

  eventsRolesClaims: {
    personaName: 'LoanDepot Park Guest Services Usher',
    personaRole: 'LoanDepot Park Guest Services Usher',
    // Both bounding boxes get the SAME type (Spectator / Q63443976).
    // The contrast the tour demonstrates is between TYPE (shared across
    // boxes) and INSTANCE (different world entity per box). The
    // instance names live in the world seed below ("Adult fan", "Child
    // fan"). Q-IDs only ride on types, not on instances.
    firstActor: {
      name: 'Spectator',
      gloss: 'a person observing an event as part of the audience',
      wikidataId: 'Q63443976',
    },
    secondActor: {
      name: 'Spectator',
      gloss: 'a person observing an event as part of the audience',
      wikidataId: 'Q63443976',
    },
    eventType: {
      // Souvenir-grab event. Not Wikidata-grounded because the
      // particular act of "one spectator takes a souvenir baseball
      // from another" is too specific to map to a single Wikidata
      // item. The OBJECT the actors fight over (a foul ball,
      // Q1355676) is grounded in the world seed below.
      name: 'ball grab',
      gloss: 'one spectator takes possession of a baseball from another',
    },
    firstRole: {
      name: 'grabber',
      gloss: 'the spectator who took possession of the ball',
    },
    secondRole: {
      name: 'prior-holder',
      gloss: 'the spectator who held the ball before the grab',
    },
    derivedClaimText:
      'The adult fan grabbed the foul ball from the child fan',
    // Collin Rugg's explainer cut of the Phillies-Karen incident.
    videoId: '8d9e6762f54408f4',
  },

  worldLayer: {
    personaName: 'LoanDepot Park Guest Services Usher',
    personaRole: 'LoanDepot Park Guest Services Usher',
    entityName: 'LoanDepot Park',
    entityType: {
      name: 'Stadium',
      gloss: 'a place or venue for outdoor sports, concerts, or other events',
      wikidataId: 'Q483110',
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
    mockDetectionQuery: 'container',
    // 24 fps × 8 s ≈ frame 192. The Port of Long Beach cargo-fall
    // clip is most visually informative around the 8 s mark when the
    // first stack hits the water.
    mockDetectionFrame: 192,
    // Bounding boxes were hand-grounded against an actual extracted
    // frame at t=8s of the ABC7 Port of Long Beach cargo-fall clip
    // (1080×1920 portrait). Coords are normalised 0..1; the
    // top-of-frame ABC7 chyron and the bottom "NEW VIDEO..." caption
    // are intentionally excluded.
    mockDetectionProposals: [
      // Genuine: the partly-submerged pile in the water. Largest,
      // highest confidence. Visitor accepts and snaps to the
      // general type `container` (Wikidata Q987767).
      {
        label: 'container',
        confidence: 0.89,
        boundingBox: { x: 0.05, y: 0.62, width: 0.66, height: 0.2 },
        acceptAsLabel: 'container',
        acceptAsWikidataId: 'Q987767',
      },
      // Genuine: the leaning stack mid-collapse on the ship deck.
      // Same type, different object instance.
      {
        label: 'container',
        confidence: 0.72,
        boundingBox: { x: 0.3, y: 0.5, width: 0.3, height: 0.18 },
        acceptAsLabel: 'container',
        acceptAsWikidataId: 'Q987767',
      },
      // Spurious: a patch of disturbed water to the right of the
      // pile. Detector thinks it might be a container. Visitor
      // rejects; it's water (Wikidata Q283), not a container.
      {
        label: 'container',
        confidence: 0.51,
        boundingBox: { x: 0.78, y: 0.66, width: 0.18, height: 0.1 },
        acceptAsLabel: null,
        acceptAsWikidataId: null,
      },
      // Spurious: a piece of the gantry crane in the upper background.
      // Detector thinks it might be a container. Visitor rejects
      // it's a crane (Wikidata Q178692).
      {
        label: 'container',
        confidence: 0.38,
        boundingBox: { x: 0.34, y: 0.59, width: 0.06, height: 0.06 },
        acceptAsLabel: null,
        acceptAsWikidataId: null,
      },
    ],
    // 30-frame trajectory beginning at frame 192. The pile of fallen
    // containers is roughly static in the water (it sloshes but does
    // not translate), so the tracker should hold the bbox steady. In
    // the demo, the first 22 frames stay locked; frames 22-29 drift
    // to the right as the receding splash plume tugs the tracker's
    // attention. Visitor re-anchors at the first flagged keyframe
    // (frame 214, i=22).
    mockTrackingKeyframes: Array.from({ length: 30 }, (_, i) => {
      const frame = 192 + i
      if (i < 22) {
        // Tiny jitter to feel real, but the box stays centred on the
        // pile (origin at x=0.05, y=0.62).
        const jitterX = (((i * 7) % 13) - 6) * 0.001
        const jitterY = (((i * 11) % 9) - 4) * 0.001
        return {
          frameNumber: frame,
          // r_frame_rate is 24000/1001 ≈ 23.976 fps.
          timestamp: frame / 23.976,
          boundingBox: {
            x: 0.05 + jitterX,
            y: 0.62 + jitterY,
            width: 0.66,
            height: 0.2,
          },
          confidence: 0.89 - 0.005 * i,
          flagged: false,
        }
      }
      // Drift: box slides right onto the receding splash and shrinks.
      const offset = i - 22
      return {
        frameNumber: frame,
        timestamp: frame / 23.976,
        boundingBox: {
          x: 0.5 + 0.04 * offset,
          y: 0.66 + 0.005 * offset,
          width: 0.3 - 0.02 * offset,
          height: 0.15,
        },
        confidence: 0.46 - 0.04 * offset,
        flagged: true,
      }
    }),
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
    // Four diarized segments. Segment 2 has a recognition error
    // ("snatched" vs eyewitness's preferred "grabbed") AND a wrong
    // speaker assignment; the analyst edits both inline.
    mockTranscript: {
      language: 'en',
      duration: 14.7,
      speakers: ['SPEAKER_00', 'SPEAKER_01'],
      segments: [
        {
          start: 0.0,
          end: 3.8,
          text: "Yeah, that's definitely the ball she grabbed.",
          confidence: 0.94,
          speaker: 'SPEAKER_00',
          intendedSpeaker: null,
          intendedText: null,
        },
        {
          start: 3.8,
          end: 6.9,
          text: 'Look, look, she just snatched it right out of his hands.',
          confidence: 0.78,
          speaker: 'SPEAKER_00',
          intendedSpeaker: 'SPEAKER_01',
          intendedText: 'Look, look, she just grabbed it right out of his hands.',
        },
        {
          start: 6.9,
          end: 9.5,
          text: 'The kid was bawling.',
          confidence: 0.97,
          speaker: 'SPEAKER_01',
          intendedSpeaker: null,
          intendedText: null,
        },
        {
          start: 9.5,
          end: 14.7,
          text: 'They actually gave him another one later, which was nice.',
          confidence: 0.93,
          speaker: 'SPEAKER_01',
          intendedSpeaker: null,
          intendedText: null,
        },
      ],
    },
    // Synthesised (microvent ships no summary prose) by composing the
    // eventual atomic claims with ONE believable factual error: the
    // model places the woman "above the right-field line" when the
    // final form is "behind home plate". Visitor edits that span.
    mockVlmSummaryText:
      'In a section of seats above the right-field line at LoanDepot Park, a woman in a Phillies jersey reaches across two seats and takes a baseball out of the hands of a young boy holding it. The boy reacts visibly, raising his hands. A stadium employee approaches and hands the boy a second baseball a few seconds later.',
    // Non-atomic compound the visitor splits.
    mockCompoundClaimText:
      'A woman took a baseball from a young boy who was visibly upset, before a stadium employee gave him a replacement.',
    mockClaimSplitAtoms: [
      {
        text:
          'A Phillies fan in the stands took a souvenir ball from a young boy after his father caught it.',
        start: 4.5,
        end: 9.3,
      },
      {
        text: 'The young boy reacted visibly, raising his hands.',
        start: 9.3,
        end: 12.6,
      },
      {
        text: 'A stadium employee gave the boy a replacement baseball.',
        start: 12.6,
        end: 14.7,
      },
    ],
  },

  collaboration: {
    projectName: 'Phillies-Marlins incident review',
    groupName: 'Stadium operations team',
  },

  importExport: {
    importBundlePath: 'test/e2e/fixtures/microvent-seed.jsonl',
  },

  // World-object seed materialized into WorldState by the demo seeder.
  // Without this the @-popup in Tour 2 step 5 says "No objects found",
  // the ClaimEditor's time / location pickers in Tour 4 are empty, and
  // the world workspace renders an empty state. All Q-IDs verified
  // against wikidata.org via wbsearchentities at seed-authoring time:
  //   Q1368138 — LoanDepot Park (baseball park in Miami, Florida)
  //   Q791187  — baseball (ball used in the sport of baseball)
  // World ENTITY instances ("Adult fan", "Child fan") do not carry
  // Q-IDs because they're not Wikidata items — they're particular
  // people in this specific incident. Their grounding lives in the
  // TYPE they're assigned (Spectator / Q63443976 from
  // ontologyAuthoring above), via the TypeAssignment row a persona
  // would add. Same for the time '2025-09-05' — a specific date, not
  // a Wikidata-known entity.
  world: {
    locations: [
      {
        name: 'LoanDepot Park',
        wikidataId: 'Q1368138',
        description: 'Baseball park in Miami, Florida, USA. Home of the Miami Marlins.',
        latitude: 25.7781,
        longitude: -80.2197,
      },
    ],
    times: [
      {
        timestamp: '2025-09-05T00:00:00Z',
        label: '2025-09-05',
      },
    ],
    entities: [
      {
        name: 'Adult fan',
        description: 'The adult spectator who took the foul ball.',
      },
      {
        name: 'Child fan',
        description: 'The child spectator who had been holding the foul ball.',
      },
      {
        name: 'the foul ball',
        wikidataId: 'Q791187',
        description: 'The baseball at the centre of the incident.',
      },
    ],
    entityCollections: [
      {
        name: 'the involved fans',
        description: 'The two spectators directly involved in the foul-ball grab.',
      },
    ],
  },
}
