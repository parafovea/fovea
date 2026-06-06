/**
 * Demo-mode flag predicates exposed to product code.
 *
 * The CVPR_2026_DEMO_PLAN.md §6.2 layering rule forbids product
 * code from importing anything under `server/src/demo/`. The demo
 * layer reaches INTO product code, never the other way around.
 *
 * Routes still need to know whether FOVEA_DEMO_MODE is on to widen
 * a CASL filter against seeded fixtures (the persona-ontology,
 * world-state, summary, and annotation read paths all do this).
 * Putting the predicate in `lib/` keeps the layering clean: any
 * route imports `lib/demo-flags.js`, and the demo layer also
 * re-exports through `demo/config.js` so its own callers do not
 * cross the boundary in either direction.
 *
 * Keep this file dependency-free. It is read by both layers and a
 * misplaced cross-import here would defeat the layering rule.
 */

export function isDemoModeEnabled(): boolean {
  return (
    process.env.FOVEA_DEMO_MODE === 'true' ||
    process.env.FOVEA_DEMO_MODE === '1'
  )
}
