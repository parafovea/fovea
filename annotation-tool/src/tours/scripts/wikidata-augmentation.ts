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
    personaName: c.personaName,
    recap:
      'Wikidata grounding gives every type a global identifier. Annotations are linkable, not just labels.',
    followUpTourId: 'events-roles-claims',
    startRoute: '/app/ontology',
    steps: [
      // Tour 3 covers BOTH ways to add a type. Steps 1-2 take the
      // manual-entry path so the visitor sees the typing-it-by-hand
      // baseline first. Steps 3-8 then contrast it with the
      // Wikidata-import shortcut. Tour 2 is the dedicated manual-
      // authoring tour, but the contrast lands harder when both
      // paths sit side by side in one walk-through.
      {
        anchor: 'type-editor-mode-manual',
        route: '/app/ontology',
        // The type-editor-mode-manual radio lives inside the
        // EntityTypeEditor dialog, which only mounts after the
        // Add-Type FAB at the bottom-right of the ontology workspace
        // is clicked. The engine clicks the FAB on the visitor's
        // behalf so step 1 has an anchor to mount against — no
        // need for the visitor to know they have to open the dialog
        // first.
        revealBy: 'ontology-add-type-button',
        narration:
          "Manual Entry: the type is whatever you type. Fast for one-off labels you do not need linked.",
        expectAction: 'click',
      },
      {
        anchor: 'type-editor-mode-wikidata',
        // The wikidata radio lives inside the same Add-Type dialog
        // step 1 opened. The engine's revealBy short-circuits when
        // the anchor is already mounted, so on a forward step from
        // step 1 the chain is a no-op (no dialog toggle). On a
        // Back-stepping or fresh entry the chain reopens the
        // dialog and the radio is reachable.
        revealBy: 'ontology-add-type-button',
        route: '/app/ontology',
        narration:
          "Now switch to Import from Wikidata. Same dialog, but the name and gloss come from Wikidata so the type is grounded.",
        expectAction: 'click',
      },
      {
        anchor: 'augmenter-search',
        route: '/app/ontology',
        // The augmenter-search input and every downstream
        // augmenter-* anchor live inside the Import-from-Wikidata
        // mode of the entity-type dialog. The mode radio defaults
        // to Manual Entry, so unless the engine clicks
        // type-editor-mode-wikidata first the Wikidata sub-tree
        // never mounts and steps 3-7 paint the missing-anchor
        // banner. (Step 2 narrates the click but expectAction is
        // 'click' on the visitor, not an auto-reveal.)
        revealBy: ['ontology-add-type-button', 'type-editor-mode-wikidata'],
        narration: `Type '${c.searchTerm}'. Fovea queries Wikidata live.`,
        expectAction: 'type',
        typeText: c.searchTerm,
      },
      {
        // The augmenter-results anchor mounts inside the WikidataSearch
        // component AFTER the live wikidata.org query returns. Network
        // round-trip + Wikidata's own rate-limit window can exceed
        // waitForAnchor's ceiling on a conference Wi-Fi link, so we
        // keep the spotlight on the always-mounted augmenter-search
        // wrapper and narrate the results as part of its caption
        // rather than chasing a result-list anchor that may race the
        // engine. The visitor's actual Wikidata hits render in-place
        // below the search box.
        anchor: 'augmenter-search',
        route: '/app/ontology',
        revealBy: ['ontology-add-type-button', 'type-editor-mode-wikidata'],
        narration:
          'Each hit below the search box is a real Wikidata entity: QID, label, description. Accept the best fit. The imported type lands in your ontology with its Wikidata grounding attached.',
        expectAction: 'none',
        requiresFixture: false,
      },
      {
        anchor: 'entity-type-editor',
        route: '/app/ontology',
        // The dialog mounts only when Add-Type is clicked; reopen it
        // so the Wikidata-seeded type editor anchor is present on
        // a fresh entry or a Back-stepping visitor.
        revealBy: 'ontology-add-type-button',
        narration: 'Lands in your ontology, gloss seeded from Wikidata.',
      },
      {
        // Spotlight the Create button so clicking it both commits
        // the Wikidata-seeded type AND closes the dialog — without
        // the dialog closing, step 10 (and the gloss-showcase steps
        // that follow) would paint behind the Radix modal overlay
        // and the visitor would see nothing.
        anchor: 'type-editor-save',
        route: '/app/ontology',
        revealBy: 'ontology-add-type-button',
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
