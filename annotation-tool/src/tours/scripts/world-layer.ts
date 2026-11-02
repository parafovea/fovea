/**
 * "The world layer: instances, places, times" — what makes Fovea queryable:
 * the world is a first-class object, not just labels on pixels.
 *
 * Walks a visitor through creating a specific entity, dropping a map pin,
 * building a time interval, grouping times and entities into collections, and
 * linking annotations to world instances.
 *
 * Content comes from `TourWorldLayerContent`, so a deployment retheme the
 * running example (venue, time range, grouping labels) without touching
 * anchors.
 */

import type { TourWorldLayerContent } from '../content/types'
import type { Tour } from '../engine/tourSchema'

export function buildWorldLayerTour(c: TourWorldLayerContent): Tour {
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
    personaName: c.personaName,
    recap:
      "The world layer is what makes annotations queryable: 'show me all incidents at this venue between these dates'.",
    followUpTourId: 'model-in-the-loop',
    steps: [
      {
        anchor: 'world-panel-tabs',
        route: objectsRoute,
        narration: 'Beyond types, Fovea tracks specific instances: this game, this venue, this date.',
      },
      {
        anchor: 'entity-name-input',
        route: objectsRoute,
        driver: { capability: 'open-world-entity-editor' },
        narration: `Entity instance editor: bind an entity TYPE to a specific thing. Create '${c.entityName}' as an instance of '${c.entityType.name}'.`,
        expectAction: 'type',
        typeText: c.entityName,
      },
      {
        anchor: 'location-name-input',
        route: objectsRoute,
        driver: { capability: 'open-world-location-editor' },
        narration: `Location instance editor: same shape as an entity, but with geographic coordinates and a map pin. Drop one at ${c.locationName}.`,
        expectAction: 'type',
        typeText: c.locationName,
      },
      {
        anchor: 'event-name-input',
        route: objectsRoute,
        driver: { capability: 'open-world-event-editor' },
        narration:
          'Event instance editor: an occurrence in time with role bindings, not a thing in space. Note the start/end and the actor pickers the entity editor does not have.',
        expectAction: 'type',
        typeText: 'Foul ball grab',
      },
      {
        anchor: 'time-label-input',
        route: objectsRoute,
        driver: { capability: 'open-world-time-editor' },
        narration:
          'Time instance editor: points, intervals, or fuzzy ranges. The start/end/fuzzy controls are why this editor differs from the entity and location ones.',
        expectAction: 'type',
        typeText: '2025-09-05 game',
      },
      {
        anchor: 'time-collection-builder',
        route: objectsRoute,
        driver: { capability: 'open-time-collection-builder' },
        narration: `Group times: '${c.timeCollectionName}'.`,
        expectAction: 'click',
      },
      {
        anchor: 'collection-builder',
        route: objectsRoute,
        driver: { capability: 'open-entity-collection-builder' },
        narration: `Entity collections work the same way: '${c.entityCollectionName}'.`,
        expectAction: 'click',
      },
      {
        anchor: 'event-annotation-button',
        route: annotateRoute,
        routeParams: annotateParams,
        narration:
          'Switch the toolbar from Type mode to Object mode. Annotations bound to an OBJECT point at the specific instance you just created in the world layer. Not just its type.',
        expectAction: 'click',
      },
    ],
  }
}
