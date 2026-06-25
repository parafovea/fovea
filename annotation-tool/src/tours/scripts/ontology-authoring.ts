/**
 * The "Building a persona's ontology" tour.
 *
 * A depth tour for type authoring. Centers the entity-type editor and
 * follows the four-layer model (entity types, event types, roles,
 * relations) that distinguishes Fovea from a flat label vocabulary,
 * then showcases the gloss editor's inline type and object references.
 *
 * The four type names (and their glosses) the narration suggests come
 * from the deployment's content bundle. The default microvent bundle
 * uses a news-event running example with each layer filled. An admin
 * tailoring tours for a different domain supplies a different bundle.
 */

import type { Tour } from '../engine/tourSchema'
import type { TourOntologyAuthoringContent } from '../content/types'

export function buildOntologyAuthoringTour(c: TourOntologyAuthoringContent): Tour {
  return {
    id: 'ontology-authoring',
    title: "Building a persona's ontology",
    description:
      'Author entity types, event types, roles, and relations: the four layers a Fovea persona uses to structure annotation.',
    durationMinutes: 3,
    tags: ['ontology', 'types', 'persona'],
    personaName: c.personaName,
    recap:
      'Same video, different persona = different annotation vocabulary. Try Tour 3 to seed an ontology from Wikidata.',
    followUpTourId: 'wikidata-augmentation',
    startRoute: '/app/ontology',
    steps: [
      {
        anchor: 'ontology-workspace-tabs',
        route: '/app/ontology',
        narration: 'An ontology has four layers: entity types, event types, roles, relations.',
      },
      {
        anchor: 'entity-type-editor',
        route: '/app/ontology',
        narration: `Entity types are categories of things. Add '${c.entityType.name}'.`,
        expectAction: 'click',
      },
      {
        anchor: 'gloss-editor',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor', params: { kind: 'entity' } },
        narration:
          'Each type carries a gloss. A structured definition collaborators agree on. Glosses are first-class text: they support inline references.',
        expectAction: 'type',
        typeText: 'An intermodal freight container moved by ship.',
      },
      {
        anchor: 'gloss-editor',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor', params: { kind: 'entity' } },
        narration:
          "Type # to reference another TYPE in this persona's ontology. E.g. \"a kind of #Container\". The reference is structured: the linked type travels with the gloss across exports and persona forks.",
        expectAction: 'type',
        typeText: ' A kind of #',
      },
      {
        anchor: 'gloss-editor',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor', params: { kind: 'entity' } },
        narration:
          'Type @ to reference a world OBJECT (entity instance, event instance, time instance); e.g. "stowed on @Mary Jane". Object references resolve against the persona\'s world workspace.',
        expectAction: 'type',
        typeText: ' stowed on @',
      },
      {
        anchor: 'event-type-editor',
        route: '/app/ontology',
        narration: `Event types are categories of happenings. Add '${c.eventType.name}'.`,
        expectAction: 'click',
      },
      {
        anchor: 'role-type-editor',
        route: '/app/ontology',
        narration: `Roles tie entities into events. '${c.roleType.name}': ${c.roleType.gloss}.`,
        expectAction: 'click',
      },
      {
        anchor: 'relation-type-editor',
        route: '/app/ontology',
        narration: `Relations connect entities directly. Unlike the entity, event, and role editors, the relation editor adds source-types and target-types: '${c.relationType.name}' takes a source on one side and a target on the other (${c.relationType.gloss}).`,
        expectAction: 'click',
      },
      {
        anchor: 'entity-type-editor',
        route: '/app/ontology',
        narration:
          "Each type cross-references the others. Open an entity editor. Its gloss is the place a more-specific type names its parent, neighbours, and the world objects it lives next to.",
        expectAction: 'click',
      },
      {
        anchor: 'gloss-editor',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor', params: { kind: 'entity' } },
        narration:
          "Type '#' in the gloss field to reference another TYPE in this persona's ontology. Every entity, role, event, and relation type appears, ranked by what you typed.",
        expectAction: 'type',
        typeText: 'A kind of #',
      },
      {
        anchor: 'gloss-autocomplete-popup',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor', params: { kind: 'entity' } },
        narration:
          'The popup is structured by layer: entity types, role types, event types, relation types. Arrow keys navigate, Enter or Tab inserts the highlighted item as a styled inline reference.',
        expectAction: 'none',
      },
      {
        anchor: 'gloss-editor',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor', params: { kind: 'entity' } },
        narration:
          "Type '@' to switch the popup to world OBJECTS. Entity instances, locations, events, times. References resolve against the persona's world workspace, not its ontology.",
        expectAction: 'type',
        typeText: 'that lives at @',
      },
      {
        anchor: 'gloss-preview',
        route: '/app/ontology',
        driver: { capability: 'open-type-editor', params: { kind: 'entity' } },
        narration:
          'References render as colored badges. Type refs italic-primary, object refs secondary. The structure travels with the gloss across exports, persona forks, and search.',
        expectAction: 'none',
      },
    ],
  }
}
