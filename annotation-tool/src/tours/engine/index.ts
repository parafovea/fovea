/**
 * The tour engine's public surface: the anchor catalog and registry, the tour
 * schema, the capability registry, the event stream, and the runner that drives
 * a single tour over its steps.
 */

// Register the workspace state seeders for their side effect, so a host that
// loads the engine has the `driver` capabilities tours reference available.
import './seeders'

export { anchorCatalog, allAnchorIds, isAnchorId } from './anchorCatalog'
export type { AnchorId, AnchorMeta } from './anchorCatalog'

export {
  AnchorRegistry,
  AnchorRegistryProvider,
  useAnchorRegistry,
  useTourAnchor,
  useAnchorElement,
} from './anchorRegistry'

export {
  tourSchema,
  tourStepSchema,
  parseTour,
  safeParseTour,
  TourValidationError,
} from './tourSchema'
export type { Tour, TourStep, TourDriver, TourTargeting } from './tourSchema'

export { registerCapability, getCapability, hasCapability } from './capabilities'
export type { TourCapability, TourCapabilityContext } from './capabilities'

export type { TourEvent, TourCloseReason } from './events'

export { AnchorInspector, useAnchorInspectorMode } from './AnchorInspector'

export { simulateAction } from './simulateAction'
export { SpotlightOverlay } from './SpotlightOverlay'
export { StepCard } from './StepCard'
export { TourRunner } from './TourRunner'
