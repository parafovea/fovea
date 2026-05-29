/**
 * Tour 5 — "The world layer: instances, places, times" (see plan §4).
 *
 * What makes Fovea queryable: the world is a first-class object, not
 * just labels on pixels. Walks a visitor through creating a specific
 * entity, dropping a map pin, building a time interval, grouping
 * times and entities into collections, and linking annotations to
 * world instances.
 */

import type { TourScript } from '../engine/types'

export const worldLayerTour: TourScript = {
  id: 'world-layer',
  title: 'The world layer: instances, places, times',
  description:
    'Beyond types, Fovea tracks specific instances — this concert, this venue, this date — and lets annotations point at them.',
  durationMinutes: 3,
  tags: ['world', 'entities', 'locations', 'times', 'collections'],
  fixtureBundle: 'tour-world-layer',
  recap:
    "The world layer is what makes annotations queryable: 'show me all events at this venue between these dates'.",
  followUpTourId: 'model-in-the-loop',
  steps: [
    {
      anchor: 'world-panel-tabs',
      narration:
        'Beyond types, Fovea tracks specific instances: this concert, this venue, this date.',
    },
    {
      anchor: 'entity-editor',
      narration: "Create entity 'Glastonbury 2025' — an instance of type 'Festival'.",
      expectAction: 'click',
    },
    {
      anchor: 'location-map-picker',
      narration: 'Locations are coordinates with semantics. Drop a pin on the map.',
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'time-editor',
      narration: 'Times can be points, intervals, or fuzzy ranges.',
      expectAction: 'type',
    },
    {
      anchor: 'time-collection-builder',
      narration: "Group times: 'all Saturdays of June 2025'.",
      expectAction: 'click',
      requiresFixture: false,
    },
    {
      anchor: 'collection-builder',
      narration: "Entity collections work the same way: 'the headliners'.",
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
