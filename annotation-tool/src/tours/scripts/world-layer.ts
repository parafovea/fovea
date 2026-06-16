/**
 * Tour 5 — "The world layer: instances, places, times" (see plan §4).
 *
 * What makes Fovea queryable: the world is a first-class object, not
 * just labels on pixels. Walks a visitor through creating a specific
 * entity, dropping a map pin, building a time interval, grouping
 * times and entities into collections, and linking annotations to
 * world instances.
 *
 * Running example via TourContentBundle. Default: microvent's
 * LoanDepot Park instance + Miami coordinates + September 2025 home
 * games group + the involved fans group. Admins for other domains
 * supply their own venue / time range / grouping label.
 */

import type { TourScript } from '../engine/types'
import type { TourWorldLayerContent } from '../content/types'

export function buildWorldLayerTour(c: TourWorldLayerContent): TourScript {
  const objectsRoute = '/app/objects'
  const annotateRoute = '/app/annotate/:videoId'
  const annotateParams = { videoId: c.videoId }
  return {
    id: 'world-layer',
    startRoute: '/app/objects',
    title: 'The world layer: instances, places, times',
    description:
      'Beyond types, Fovea tracks specific instances: this game, this venue, this date. Annotations point at them.',
    durationMinutes: 3,
    tags: ['world', 'entities', 'locations', 'times', 'collections'],
    fixtureBundle: 'world-layer',
    personaName: c.personaName,
    recap:
      "The world layer is what makes annotations queryable: 'show me all incidents at this venue between these dates'.",
    followUpTourId: 'model-in-the-loop',
    steps: [
      {
        anchor: 'world-panel-tabs',
        route: objectsRoute,
        narration:
          'Beyond types, Fovea tracks specific instances: this game, this venue, this date.',
      },
      {
        // Anchor on the entity Name input itself so the engine actually
        // types — previously the anchor sat on the Dialog body and the
        // narration described typing while the engine just clicked,
        // leaving an empty Name field visible behind the step card.
        anchor: 'entity-name-input',
        route: objectsRoute,
        revealBy: ['world-tab-entities', 'world-add-object-button'],
        narration: `Entity instance editor: bind an entity TYPE to a specific thing. Create '${c.entityName}' as an instance of '${c.entityType.name}'.`,
        expectAction: 'type',
        typeText: c.entityName,
      },
      {
        anchor: 'location-name-input',
        route: objectsRoute,
        revealBy: ['world-tab-locations', 'world-add-object-button'],
        narration: `Location instance editor: same shape as an entity, but with geographic coordinates and a map pin. Drop one at ${c.locationName}.`,
        expectAction: 'type',
        typeText: c.locationName,
        requiresFixture: false,
      },
      {
        anchor: 'event-name-input',
        route: objectsRoute,
        revealBy: ['world-tab-events', 'world-add-object-button'],
        narration:
          'Event instance editor: an occurrence in time with role bindings, not a thing in space. Note the start/end and the actor pickers the entity editor does not have.',
        expectAction: 'type',
        typeText: 'Foul ball grab',
        requiresFixture: false,
      },
      {
        anchor: 'time-label-input',
        route: objectsRoute,
        revealBy: ['world-tab-times', 'world-add-object-button'],
        narration:
          'Time instance editor: points, intervals, or fuzzy ranges. The start/end/fuzzy controls are why this editor differs from the entity and location ones.',
        expectAction: 'type',
        typeText: '2025-09-05 game',
      },
      {
        anchor: 'time-collection-builder',
        route: objectsRoute,
        revealBy: ['world-tab-collections', 'world-add-time-collection-button'],
        narration: `Group times: '${c.timeCollectionName}'.`,
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'collection-builder',
        route: objectsRoute,
        revealBy: ['world-tab-collections', 'world-add-entity-collection-button'],
        narration: `Entity collections work the same way: '${c.entityCollectionName}'.`,
        expectAction: 'click',
      },
      {
        // The Type/Object toolbar toggle is the always-mounted entry
        // point for binding an annotation to a world INSTANCE rather
        // than just a type — switching to Object mode turns the
        // annotation autocomplete into a world-object picker. Anchor
        // here so the spotlight lands on the actual UI that links an
        // annotation to the world instances the rest of this tour
        // walked through (the older annotation-world-reference anchor
        // only mounts inside an AnnotationEditor dialog that requires
        // a pre-selected annotation, which is not in the world-layer
        // tour's fixture).
        anchor: 'event-annotation-button',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Switch the toolbar from Type mode to Object mode. Annotations bound to an OBJECT point at the specific instance you just created in the world layer. Not just its type.',
        expectAction: 'click',
        requiresFixture: false,
      },
    ],
  }
}
