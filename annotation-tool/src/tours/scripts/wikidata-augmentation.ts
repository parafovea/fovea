/**
 * Tour 3; "Grow your ontology from Wikidata" (see CVPR_2026_DEMO_PLAN.md §4).
 *
 * The "wow" tour: short, visually satisfying, demonstrates how Fovea
 * grounds types in Wikidata QIDs so annotations are linkable rather
 * than just labels.
 *
 * The search term the narration suggests comes from the deployment's
 * TourContentBundle. Default: microvent's "dust cloud" (Q1267128
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
      'Wikidata grounding gives every type a global identifier; annotations are linkable, not just labels.',
    followUpTourId: 'events-roles-claims',
    steps: [
      // Tour 3 covers BOTH ways to add a type. Steps 1-2 take the
      // manual-entry path so the visitor sees the typing-it-by-hand
      // baseline first; steps 3-8 then contrast it with the
      // Wikidata-import shortcut. Tour 2 is the dedicated manual-
      // authoring tour, but the contrast lands harder when both
      // paths sit side by side in one walk-through.
      {
        anchor: 'type-editor-mode-manual',
        narration:
          "Manual Entry: the type is whatever you type. Fast for one-off labels you do not need linked.",
        expectAction: 'click',
      },
      {
        anchor: 'type-editor-mode-wikidata',
        narration:
          "Now switch to Import from Wikidata. Same dialog, but the name and gloss come from Wikidata so the type is grounded.",
        expectAction: 'click',
      },
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
        narration: 'Fovea offers connected concepts; one-click expansion.',
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
