/**
 * FOVEA_DEMO_MODE — the master flag that turns on the CVPR demo layer.
 *
 * Off by default. The flag gates:
 *   - the CVPR landing page route group on the frontend (/, /card, /done)
 *   - the anonymous-session creation endpoint on the backend
 *   - the fixture-seeder admin endpoint and the idle-reset job
 *   - the demo.* telemetry event emitter
 *   - loading of the demo fixture bundle
 *   - the "Demo — data resets every 10 minutes" banner
 *
 * The flag does NOT gate the tour engine, tour scripts, data-tour-id
 * anchors, or the in-app tour menu — those are product features that
 * ship in every deployment. See CVPR_2026_DEMO_PLAN.md §6.7.
 *
 * Because flipping this flag enables an auth-bypass surface (anonymous
 * sessions) and a stateful state-wipe surface (fixture seeder), it MUST
 * be explicit at the env layer. We deliberately do not infer it from
 * NODE_ENV or similar.
 */

// Re-export the canonical predicate so demo-layer call-sites keep
// their existing import path. The implementation lives in lib/ so
// product code can also import it without violating the demo->product
// layering rule enforced by eslint no-restricted-imports.
import { config } from '../config.js'
import { isDemoModeEnabled } from '../lib/demo-flags.js'
export { isDemoModeEnabled }

/**
 * Secondary flag — required for the anonymous-session endpoint to
 * register alongside production auth providers. Without it set, the
 * anonymous endpoint refuses to register if any non-demo auth provider
 * is already wired up. This is the "I really do mean it" gate that
 * prevents a misconfigured self-hoster from accidentally enabling
 * unauthenticated access on a production deployment.
 */
export function isAnonymousAuthAllowed(): boolean {
  return isDemoModeEnabled() && config.demo.allowAnonymousAuth
}

/**
 * Shared secret the fixture seeder requires. Without this set, the
 * seeder refuses to register even when FOVEA_DEMO_MODE is on. The token
 * is checked via `X-Demo-Seed-Token` header — a 32+ char random secret.
 */
export function getSeedToken(): string | null {
  return config.demo.seedToken
}
