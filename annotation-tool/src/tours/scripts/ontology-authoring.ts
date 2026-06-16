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
      'Author entity types, event types, roles, and relations: the four layers a Fovea persona uses to structure annotation.',
    durationMinutes: 3,
    tags: ['ontology', 'types', 'persona'],
    fixtureBundle: 'ontology-authoring',
    personaName: c.personaName,
    recap:
      'Same video, different persona = different annotation vocabulary. Try Tour 3 to seed an ontology from Wikidata.',
    followUpTourId: 'wikidata-augmentation',
    startRoute: '/app/ontology',
    steps: [
      {
        anchor: 'ontology-workspace-tabs',
        route: '/app/ontology',
        narration:
          'An ontology has four layers: entity types, event types, roles, relations.',
      },
      {
        anchor: 'entity-type-editor',
        route: '/app/ontology',
        // Each editor anchor lives inside a Radix Dialog that the
        // OntologyWorkspace mounts only after the add-type FAB is
        // clicked. revealBy clicks the FAB on the visitor's behalf;
        // tab 0 is selected by default so the Entity Type editor
        // opens here without an extra tab switch.
        revealBy: ['ontology-tab-entities', 'ontology-add-type-button'],
        narration: `Entity types are categories of things. Add '${c.entityType.name}'.`,
        expectAction: 'click',
      },
      {
        anchor: 'gloss-editor',
        route: '/app/ontology',
        // GlossEditor renders inside the same Entity-Type dialog
        // step 2 opens — reopen it via the entities tab + Add Type
        // FAB so the gloss-editor anchor is mounted after a back-
        // step or a refresh.
        revealBy: ['ontology-tab-entities', 'ontology-add-type-button'],
        narration:
          'Each type carries a gloss. A structured definition collaborators agree on. Glosses are first-class text: they support inline references.',
        expectAction: 'type',
        typeText: 'An intermodal freight container moved by ship.',
      },
      {
        anchor: 'gloss-editor',
        route: '/app/ontology',
        revealBy: ['ontology-tab-entities', 'ontology-add-type-button'],
        narration:
          "Type # to reference another TYPE in this persona's ontology. E.g. \"a kind of #Container\". The reference is structured: the linked type travels with the gloss across exports and persona forks.",
        expectAction: 'type',
        typeText: ' A kind of #',
      },
      {
        anchor: 'gloss-editor',
        route: '/app/ontology',
        revealBy: ['ontology-tab-entities', 'ontology-add-type-button'],
        narration:
          'Type @ to reference a world OBJECT (entity instance, event instance, time instance); e.g. "stowed on @Mary Jane". Object references resolve against the persona\'s world workspace.',
        expectAction: 'type',
        typeText: ' stowed on @',
      },
      {
        anchor: 'event-type-editor',
        route: '/app/ontology',
        // Chained reveal: switch to the Events tab THEN click the
        // add-type FAB, so the Event Type editor mounts where the
        // anchor expects it. The 120 ms per-link settle in the
        // engine lets the tab content commit before the FAB click
        // is dispatched.
        revealBy: ['ontology-tab-events', 'ontology-add-type-button'],
        narration: `Event types are categories of happenings. Add '${c.eventType.name}'.`,
        expectAction: 'click',
      },
      {
        anchor: 'role-type-editor',
        route: '/app/ontology',
        revealBy: ['ontology-tab-roles', 'ontology-add-type-button'],
        narration: `Roles tie entities into events. '${c.roleType.name}': ${c.roleType.gloss}.`,
        expectAction: 'click',
      },
      {
        anchor: 'relation-type-editor',
        route: '/app/ontology',
        revealBy: ['ontology-tab-relations', 'ontology-add-type-button'],
        narration: `Relations connect entities directly. Unlike the entity, event, and role editors, the relation editor adds source-types and target-types: '${c.relationType.name}' takes a source on one side and a target on the other (${c.relationType.gloss}).`,
        expectAction: 'click',
      },
      {
        // Re-open the entity-type editor for the gloss-reference
        // showcase. Step 8 left the Relation Type editor on screen;
        // base-ui dialogs with modal=false (the demo-mode setting)
        // let both dialogs coexist, so the revealBy chain MUST close
        // the relation editor BEFORE opening the entity editor —
        // otherwise the new entity dialog mounts behind a stale
        // dialog and the gloss-editor anchor resolves to the
        // relation editor's gloss field which the visitor cannot
        // see. The chain is: type-editor-cancel (closes whichever
        // type editor is currently open) → ontology-tab-entities
        // (ensures we're on the entities tab if a back-step left a
        // different tab active) → ontology-add-type-button (opens a
        // fresh Entity Type editor on top of nothing).
        anchor: 'entity-type-editor',
        route: '/app/ontology',
        revealBy: ['type-editor-cancel', 'ontology-tab-entities', 'ontology-add-type-button'],
        narration:
          "Each type cross-references the others. Open an entity editor. Its gloss is the place a more-specific type names its parent, neighbours, and the world objects it lives next to.",
        expectAction: 'click',
      },
      {
        // Type '#' to trigger the type-reference autocomplete. The
        // editor is freshly opened by the previous step, so the
        // textarea is empty and the popup mounts on the first '#'.
        anchor: 'gloss-editor',
        route: '/app/ontology',
        revealBy: ['type-editor-cancel', 'ontology-tab-entities', 'ontology-add-type-button'],
        narration:
          "Type '#' in the gloss field to reference another TYPE in this persona's ontology. Every entity, role, event, and relation type appears, ranked by what you typed.",
        expectAction: 'type',
        typeText: 'A kind of #',
      },
      {
        // Spotlight the autocomplete popup. The popup is a sibling
        // div inside the same gloss-editor wrapper, so it stays
        // mounted as long as the textarea retains focus and the
        // last typed character was a trigger.
        anchor: 'gloss-autocomplete-popup',
        route: '/app/ontology',
        narration:
          "The popup is structured by layer: entity types, role types, event types, relation types. Arrow keys navigate, Enter or Tab inserts the highlighted item as a styled inline reference.",
        expectAction: 'none',
      },
      {
        // Switch trigger to '@' to demonstrate the object-reference
        // mode. The popup re-renders against world objects (entity
        // instances, events, times, locations) instead of types.
        anchor: 'gloss-editor',
        route: '/app/ontology',
        narration:
          "Type '@' to switch the popup to world OBJECTS. Entity instances, locations, events, times. References resolve against the persona's world workspace, not its ontology.",
        expectAction: 'type',
        typeText: 'that lives at @',
      },
      {
        // Final beat: the preview renders the typed gloss as a mix
        // of plain spans and colored badges, one badge per inserted
        // reference. The preview lives outside the textarea so it
        // is always visible while the gloss is being authored.
        anchor: 'gloss-preview',
        route: '/app/ontology',
        narration:
          "References render as colored badges. Type refs italic-primary, object refs secondary. The structure travels with the gloss across exports, persona forks, and search.",
        expectAction: 'none',
        requiresFixture: false,
      },
    ],
  }
}
