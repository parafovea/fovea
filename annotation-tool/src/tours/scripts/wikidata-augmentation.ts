/**
 * Tour 3 — "Grow your ontology from Wikidata" (see CVPR_2026_DEMO_PLAN.md §4).
 *
 * The "wow" tour: short, visually satisfying, demonstrates how Fovea
 * grounds types in Wikidata QIDs so annotations are linkable rather
 * than just labels.
 *
 * The search term the narration suggests comes from the deployment's
 * TourContentBundle. Default: microvent's "dust cloud" (Q1267128 —
 * one of the nine Wikidata-imported types on microvent's Automated
 * persona). An admin tailoring for a different domain supplies a
 * different search term that fits their corpus.
 */

import type { TourScript } from '../engine/types'
import type { TourWikidataAugmentationContent } from '../content/types'

export function buildWikidataAugmentationTour(
  c: TourWikidataAugmentationContent,
): TourScript {
  return {
    id: 'wikidata-augmentation',
    title: 'Grow your ontology from Wikidata',
    description:
      'Search Wikidata live, import an entity type with QID grounding, expand via related concepts in seconds.',
    durationMinutes: 2,
    tags: ['ontology', 'wikidata', 'augmentation'],
    fixtureBundle: 'wikidata-augmentation',
    recap:
      'Wikidata grounding gives every type a global identifier — annotations are linkable, not just labels.',
    followUpTourId: 'events-roles-claims',
    steps: [
      {
        anchor: 'augmenter-search',
        narration: `Type '${c.searchTerm}'. Fovea queries Wikidata live.`,
        expectAction: 'type',
      },
      {
        anchor: 'augmenter-results',
        narration: 'Each hit is a real Wikidata entity, QID and all.',
      },
      {
        anchor: 'augmenter-import-target',
        narration:
          'Choose what to import: entity type, event type, role, or as an object instance.',
        expectAction: 'click',
      },
      {
        anchor: 'entity-type-editor',
        narration: 'Lands in your ontology, gloss seeded from Wikidata.',
      },
      {
        anchor: 'augmenter-related-suggestions',
        narration: 'Fovea offers connected concepts — one-click expansion.',
        expectAction: 'click',
        requiresFixture: true,
      },
      {
        anchor: 'annotation-editor-type-list',
        narration: 'Two clicks from search to a usable annotation type.',
        expectAction: 'click',
        requiresFixture: true,
      },
    ],
  }
}
