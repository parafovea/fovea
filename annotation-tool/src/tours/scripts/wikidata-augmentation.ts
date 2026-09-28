/**
 * "Grow your ontology from Wikidata" — short and visually satisfying, showing
 * how Fovea grounds types in Wikidata QIDs so annotations are linkable rather
 * than just labels.
 *
 * The visitor walks the manual-entry baseline first, then contrasts it with the
 * Wikidata-import shortcut: search Wikidata live, import an entity type with QID
 * grounding, and see it land in the ontology.
 *
 * The search term comes from `TourWikidataAugmentationContent`, so a deployment
 * supplies a term that fits its corpus without touching anchors.
 */

import type { TourWikidataAugmentationContent } from '../content/types'
import type { Tour } from '../engine/tourSchema'

export function buildWikidataAugmentationTour(c: TourWikidataAugmentationContent): Tour {
  return {
    id: 'wikidata-augmentation',
    title: 'Grow your ontology from Wikidata',
    description:
      'Search Wikidata live, import an entity type with QID grounding, expand via related concepts in seconds.',
    durationMinutes: 2,
    tags: ['ontology', 'wikidata', 'augmentation'],
    personaName: c.personaName,
    recap: 'Wikidata grounding gives every type a global identifier. Annotations are linkable, not just labels.',
    followUpTourId: 'events-roles-claims',
    startRoute: '/app/ontology',
    steps: [
      {
        anchor: 'type-editor-mode-manual',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor' },
        narration: 'Manual Entry: the type is whatever you type. Fast for one-off labels you do not need linked.',
        expectAction: 'click',
      },
      {
        anchor: 'type-editor-mode-wikidata',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor' },
        narration:
          'Now switch to Import from Wikidata. Same dialog, but the name and gloss come from Wikidata so the type is grounded.',
        expectAction: 'click',
      },
      {
        anchor: 'augmenter-search',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor', params: { mode: 'wikidata' } },
        narration: `Type '${c.searchTerm}'. Fovea queries Wikidata live.`,
        expectAction: 'type',
        typeText: c.searchTerm,
      },
      {
        anchor: 'augmenter-search',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor', params: { mode: 'wikidata' } },
        narration:
          'Each hit below the search box is a real Wikidata entity: QID, label, description. Accept the best fit. The imported type lands in your ontology with its Wikidata grounding attached.',
        expectAction: 'none',
      },
      {
        anchor: 'entity-type-editor',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor', params: { mode: 'wikidata' } },
        narration: 'Lands in your ontology, gloss seeded from Wikidata.',
      },
      {
        anchor: 'type-editor-save',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor', params: { mode: 'wikidata' } },
        narration:
          "Click Create to commit the Wikidata-imported type into this persona's ontology. The QID stays attached so every annotation that uses it is globally linkable.",
        expectAction: 'click',
      },
      {
        anchor: 'ontology-tab-entities',
        route: '/app/ontology',
        narration:
          'The Wikidata-imported type lands in the Entity Types tab alongside the manual ones: persona-rooted, QID-tagged, ready to reference anywhere a type can be named.',
        expectAction: 'click',
      },
    ],
  }
}
