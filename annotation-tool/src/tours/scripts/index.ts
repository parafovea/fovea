/**
 * Built-in tour registry: a function of the deployment's content bundle. The
 * default bundle (microvent, see ../content/microvent.ts) gives every tour a
 * coherent news-event running example. An admin tailoring tours for their own
 * users supplies a different `TourContentBundle` and the tour narrations plus
 * suggested type names update across the catalogue without touching the engine.
 *
 * Importers that need the static catalogue (the menu when no admin override is
 * in scope, the static-anchor smoke, the test handle's tour lookup) read
 * `defaultBuiltInTours`. Importers that render tours against a specific admin's
 * bundle call `getBuiltInTours(bundle)`.
 */

import type { TourContentBundle } from '../content/types'
import { microventContent } from '../content/microvent'
import type { Tour } from '../engine'

import { buildFirstAnnotationTour } from './first-annotation'
import { buildOntologyAuthoringTour } from './ontology-authoring'
import { buildWikidataAugmentationTour } from './wikidata-augmentation'
import { buildEventsRolesClaimsTour } from './events-roles-claims'
import { buildWorldLayerTour } from './world-layer'
import { buildModelInTheLoopTour } from './model-in-the-loop'
import { buildSummariesAndClaimsTour } from './summaries-and-claims'
import { buildCollaborationTour } from './collaboration'
import { buildAdminTour } from './admin'
import { buildImportExportTour } from './import-export'
import { buildWelcomeTour } from './welcome'
import { buildKeyframesInterpolationTour } from './keyframes-interpolation'

export function getBuiltInTours(bundle: TourContentBundle): Tour[] {
  // Order matches the public tour catalogue's 4x3 grid: Welcome
  // first (orientation), followed by the four-layer arc (annotation,
  // ontology, world), then the model-assisted flows, then
  // collaboration and operator surfaces. Keyframes + interpolation
  // closes the grid as the temporal-modeling deep dive.
  return [
    buildWelcomeTour(),
    buildFirstAnnotationTour(bundle.firstAnnotation),
    buildOntologyAuthoringTour(bundle.ontologyAuthoring),
    buildWikidataAugmentationTour(bundle.wikidataAugmentation),
    buildEventsRolesClaimsTour(bundle.eventsRolesClaims),
    buildWorldLayerTour(bundle.worldLayer),
    buildModelInTheLoopTour(bundle.modelInTheLoop),
    buildSummariesAndClaimsTour(bundle.summariesAndClaims),
    buildCollaborationTour(bundle.collaboration),
    buildAdminTour(),
    buildImportExportTour(bundle.importExport),
    buildKeyframesInterpolationTour(bundle.modelInTheLoop),
  ]
}

/**
 * The default built-in tour list, baked against the microvent content bundle.
 * Use this when no admin-supplied bundle is in scope (the static catalogue
 * surfaces: menu defaults, the tour-anchor smoke, the `window.__foveaTour` test
 * handle's tour lookup).
 */
export const defaultBuiltInTours: Tour[] = getBuiltInTours(microventContent)

export function findTour(id: string): Tour | undefined {
  return defaultBuiltInTours.find((t) => t.id === id)
}

// Re-export the per-tour builders so admin tailoring can call them
// individually with bespoke content.
export {
  buildWelcomeTour,
  buildFirstAnnotationTour,
  buildOntologyAuthoringTour,
  buildWikidataAugmentationTour,
  buildEventsRolesClaimsTour,
  buildWorldLayerTour,
  buildModelInTheLoopTour,
  buildSummariesAndClaimsTour,
  buildCollaborationTour,
  buildAdminTour,
  buildImportExportTour,
  buildKeyframesInterpolationTour,
}
