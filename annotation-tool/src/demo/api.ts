/**
 * Demo-mode API client helpers — calls to the FOVEA_DEMO_MODE-gated
 * backend routes (`/api/demo/anonymous-session`, `/api/demo/seed`).
 *
 * Kept in the demo layer rather than the shared API client so that
 * stock builds tree-shake the whole module out. The product code is
 * forbidden by ESLint from importing this file.
 */

export interface AnonymousSession {
  userId: string
  sessionToken: string
  ttlSeconds: number
}

/**
 * POST /api/demo/anonymous-session — issues a fresh ephemeral session
 * for a CVPR visitor. The session token is set as an httpOnly cookie
 * by the backend; we only need the userId for fixture seeding.
 *
 * Throws on non-2xx so the caller can surface a clear error to the
 * presenter — silently returning a broken session is worse at a booth
 * than crashing loudly.
 */
export async function createAnonymousSession(): Promise<AnonymousSession> {
  const res = await fetch('/api/demo/anonymous-session', {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`anonymous-session failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

/**
 * POST /api/demo/seed — wipes the given session's workspace state and
 * reseeds from the named fixture bundle. Used by the demo landing page's
 * `onBeforeLaunch` hook in `TourProvider`.
 *
 * The `X-Demo-Seed-Token` is injected at the edge (CDN / load balancer
 * config) for the public-facing demo so the token never reaches client
 * JS. In development, set it via a local proxy header rewrite.
 */
export async function seedFixture(args: {
  tourId: string
  sessionUserId: string
}): Promise<{ seeded: string[] }> {
  // Production demo deployments inject X-Demo-Seed-Token at the edge so
  // the token never reaches client JS. Local-run reads it from a Vite
  // env var instead — set VITE_FOVEA_DEMO_SEED_TOKEN to match the
  // backend's FOVEA_DEMO_SEED_TOKEN in run-demo-local.sh.
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const localToken = env.VITE_FOVEA_DEMO_SEED_TOKEN
  if (localToken) headers['X-Demo-Seed-Token'] = localToken

  const res = await fetch('/api/demo/seed', {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    throw new Error(`seed failed: ${res.status} ${res.statusText}`)
  }
  return res.json()
}
