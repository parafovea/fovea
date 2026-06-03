/**
 * Tour 2 — "Building a persona's ontology" (see CVPR_2026_DEMO_PLAN.md §4).
 *
 * Depth tour for type authoring. Centers EntityTypeEditor and follows
 * the four-layer model (entity types, event types, roles, relations)
 * that distinguishes Fovea from a flat label vocabulary.
 *
 * The four type names (and their glosses) the narration suggests come
 * from the deployment's TourContentBundle. The default microvent
 * bundle uses gunshot / wildfire / perpetrator / occurred-at — a
 * news-event running example with each layer filled. An admin
 * tailoring tours for a different domain supplies a different bundle.
 */

import type { TourScript } from '../engine/types'
import type { TourOntologyAuthoringContent } from '../content/types'

export function buildOntologyAuthoringTour(
  c: TourOntologyAuthoringContent,
): TourScript {
  return {
    id: 'ontology-authoring',
    title: "Building a persona's ontology",
    description:
      'Author entity types, event types, roles, and relations — the four layers a Fovea persona uses to structure annotation.',
    durationMinutes: 3,
    tags: ['ontology', 'types', 'persona'],
    fixtureBundle: 'ontology-authoring',
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
        narration: `Entity types are categories of things. Add '${c.entityType.name}'.`,
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
        narration: `Event types are categories of happenings. Add '${c.eventType.name}'.`,
        expectAction: 'click',
      },
      {
        anchor: 'role-type-editor',
        narration: `Roles tie entities into events. '${c.roleType.name}': ${c.roleType.gloss}.`,
        expectAction: 'click',
      },
      {
        anchor: 'relation-type-editor',
        narration: `Relations connect entities directly. Unlike the entity, event, and role editors, the relation editor adds source-types and target-types: '${c.relationType.name}' takes a source on one side and a target on the other (${c.relationType.gloss}).`,
        expectAction: 'click',
      },
      {
        anchor: 'type-hierarchy-tree',
        narration:
          "Types can inherit. A more-specific type is a kind of its parent, inheriting its roles.",
        expectAction: 'click',
        requiresFixture: true,
      },
    ],
  }
}
