/**
 * Built-in tour registry. The in-app tour menu reads this; the
 * server-side tours-manifest API in server/src/routes/tours.ts mirrors
 * it for the case where the menu wants a deployment-specific filtering
 * pass (e.g. dropping tours whose anchors don't resolve in the current
 * build, per the validation hook in CVPR_2026_DEMO_PLAN.md §6.5).
 *
 * Tours 2-10 from the plan ship over the next few weeks; they slot in
 * here as additional imports.
 */

import { firstAnnotationTour } from './first-annotation'
import { ontologyAuthoringTour } from './ontology-authoring'
import { wikidataAugmentationTour } from './wikidata-augmentation'
import { eventsRolesClaimsTour } from './events-roles-claims'
import { worldLayerTour } from './world-layer'
import { modelInTheLoopTour } from './model-in-the-loop'
import type { TourScript } from '../engine/types'

export const builtInTours: readonly TourScript[] = [
  firstAnnotationTour,
  ontologyAuthoringTour,
  wikidataAugmentationTour,
  eventsRolesClaimsTour,
  worldLayerTour,
  modelInTheLoopTour,
]

export function findTour(id: string): TourScript | undefined {
  return builtInTours.find((t) => t.id === id)
}

export {
  firstAnnotationTour,
  ontologyAuthoringTour,
  wikidataAugmentationTour,
  eventsRolesClaimsTour,
  worldLayerTour,
  modelInTheLoopTour,
}
