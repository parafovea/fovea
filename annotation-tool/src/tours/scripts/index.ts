/**
 * Built-in tour registry — now a FUNCTION of the deployment's content
 * bundle. The default bundle (microvent — see ../content/microvent.ts)
 * gives every tour a coherent news-event running example. An admin
 * tailoring tours for their own users supplies a different
 * TourContentBundle and the tour narrations + suggested type names
 * update across the catalogue without touching the engine.
 *
 * Importers that need the static catalogue (the menu when no admin
 * override is in scope; the static-anchor smoke; the test handle's
 * findTour) read `defaultBuiltInTours`. Importers that need to render
 * tours against a specific admin's bundle call `getBuiltInTours(bundle)`.
 */

import type { TourContentBundle } from '../content/types'
import { microventContent } from '../content/microvent'
import type { TourScript } from '../engine/types'

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

export function getBuiltInTours(
  bundle: TourContentBundle,
): readonly TourScript[] {
  return [
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
  ]
}

/**
 * The default built-in tour list, baked against the microvent content
 * bundle. Use this when no admin-supplied bundle is in scope (the
 * static catalogue surfaces — menu defaults, tour-anchor smoke, the
 * window.__foveaTour test handle's findTour).
 */
export const defaultBuiltInTours: readonly TourScript[] = getBuiltInTours(
  microventContent,
)

/**
 * @deprecated Use `defaultBuiltInTours` or `getBuiltInTours(bundle)`.
 * Kept as an alias so the existing imports across the codebase keep
 * resolving; remove after the next sweep migrates them.
 */
export const builtInTours = defaultBuiltInTours

export function findTour(id: string): TourScript | undefined {
  return defaultBuiltInTours.find((t) => t.id === id)
}

// Re-export the per-tour builders so admin tailoring can call them
// individually with bespoke content.
export {
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
}
