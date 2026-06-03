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
  return {
    id: 'world-layer',
    title: 'The world layer: instances, places, times',
    description:
      'Beyond types, Fovea tracks specific instances — this game, this venue, this date — and lets annotations point at them.',
    durationMinutes: 3,
    tags: ['world', 'entities', 'locations', 'times', 'collections'],
    fixtureBundle: 'world-layer',
    recap:
      "The world layer is what makes annotations queryable: 'show me all incidents at this venue between these dates'.",
    followUpTourId: 'model-in-the-loop',
    steps: [
      {
        anchor: 'world-panel-tabs',
        narration:
          'Beyond types, Fovea tracks specific instances: this game, this venue, this date.',
      },
      {
        anchor: 'entity-editor',
        narration: `Entity instance editor: bind an entity TYPE to a specific thing. Create '${c.entityName}' as an instance of '${c.entityType.name}'.`,
        expectAction: 'click',
      },
      {
        anchor: 'location-map-picker',
        narration: `Location instance editor: same shape as an entity, but with geographic coordinates and a map pin. Drop one at ${c.locationName}.`,
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'event-editor',
        narration:
          'Event instance editor: an occurrence in time with role bindings, not a thing in space. Note the start/end and the actor pickers the entity editor does not have.',
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'time-editor',
        narration:
          'Time instance editor: points, intervals, or fuzzy ranges. The start/end/fuzzy controls are why this editor differs from the entity and location ones.',
        expectAction: 'type',
      },
      {
        anchor: 'time-collection-builder',
        narration: `Group times: '${c.timeCollectionName}'.`,
        expectAction: 'click',
        requiresFixture: false,
      },
      {
        anchor: 'collection-builder',
        narration: `Entity collections work the same way: '${c.entityCollectionName}'.`,
        expectAction: 'click',
      },
      {
        anchor: 'annotation-world-reference',
        narration: 'Annotations link to these world instances, not just types.',
        expectAction: 'click',
        requiresFixture: false,
      },
    ],
  }
}
