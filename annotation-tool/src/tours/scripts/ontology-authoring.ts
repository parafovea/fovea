/**
 * Tour 2 — "Building a persona's ontology" (see CVPR_2026_DEMO_PLAN.md §4).
 *
 * Depth tour for type authoring. Centers EntityTypeEditor and follows
 * the four-layer model (entity types, event types, roles, relations)
 * that distinguishes Fovea from a flat label vocabulary.
 */

import type { TourScript } from '../engine/types'

export const ontologyAuthoringTour: TourScript = {
  id: 'ontology-authoring',
  title: "Building a persona's ontology",
  description:
    'Author entity types, event types, roles, and relations — the four layers a Fovea persona uses to structure annotation.',
  durationMinutes: 3,
  tags: ['ontology', 'types', 'persona'],
  fixtureBundle: 'tour-ontology-authoring',
  recap:
    'Same video, different persona = different annotation vocabulary. Try Tour 3 to seed an ontology from Wikidata.',
  followUpTourId: 'wikidata-augmentation',
  steps: [
    {
      anchor: 'ontology-workspace-tabs',
      narration:
        'An ontology has four layers: entity types, event types, roles, relations.',
    },
    {
      anchor: 'entity-type-editor',
      narration: "Entity types are categories of things. Add 'Musician'.",
      expectAction: 'click',
    },
    {
      anchor: 'gloss-editor',
      narration:
        'Each type carries a definition — a gloss — so collaborators agree on meaning.',
      expectAction: 'type',
    },
    {
      anchor: 'event-type-editor',
      narration: "Event types are categories of happenings. Add 'Performance'.",
      expectAction: 'click',
    },
    {
      anchor: 'role-editor',
      narration:
        "Roles tie entities into events. 'Performer' connects a Musician to a Performance.",
      expectAction: 'click',
    },
    {
      anchor: 'relation-type-editor',
      narration:
        "Relations connect entities directly — e.g., 'member-of' between Musician and Band.",
      expectAction: 'click',
    },
    {
      anchor: 'type-hierarchy-tree',
      narration:
        "Types can inherit. 'Guitarist' is a kind of 'Musician', inheriting its roles.",
      expectAction: 'click',
      requiresFixture: true,
    },
  ],
}
