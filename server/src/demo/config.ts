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

export function isDemoModeEnabled(): boolean {
  return process.env.FOVEA_DEMO_MODE === 'true' || process.env.FOVEA_DEMO_MODE === '1'
}

/**
 * Secondary flag — required for the anonymous-session endpoint to
 * register alongside production auth providers. Without it set, the
 * anonymous endpoint refuses to register if any non-demo auth provider
 * is already wired up. This is the "I really do mean it" gate that
 * prevents a misconfigured self-hoster from accidentally enabling
 * unauthenticated access on a production deployment.
 */
export function isAnonymousAuthAllowed(): boolean {
  return (
    isDemoModeEnabled() &&
    (process.env.FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH === 'true' ||
      process.env.FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH === '1')
  )
}

/**
 * Shared secret the fixture seeder requires. Without this set, the
 * seeder refuses to register even when FOVEA_DEMO_MODE is on. The token
 * is checked via `X-Demo-Seed-Token` header — a 32+ char random secret.
 */
export function getSeedToken(): string | null {
  const t = process.env.FOVEA_DEMO_SEED_TOKEN
  if (!t || t.length < 32) return null
  return t
}
