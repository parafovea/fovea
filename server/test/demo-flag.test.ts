/**
 * Demo-flag isolation gate — asserts that the FOVEA_DEMO_MODE-gated
 * routes are unreachable when the flag is off and reachable when it
 * is on, with the appropriate secondary flags. This is the load-bearing
 * verification that a misconfigured self-hoster can't accidentally
 * expose the anonymous-session endpoint by setting one variable.
 *
 * See docs/demo-mode.md and notes/CVPR_2026_DEMO_PLAN.md §6.10.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../src/app.js'

describe('FOVEA_DEMO_MODE flag isolation', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Strip any pre-existing demo flags from the host env so the test
    // sees only what we set explicitly.
    delete process.env.FOVEA_DEMO_MODE
    delete process.env.FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH
    delete process.env.FOVEA_DEMO_SEED_TOKEN
  })

  afterEach(() => {
    // Restore the original env so neighbouring tests in the same worker
    // are not polluted.
    process.env = { ...originalEnv }
  })

  it('returns 404 for /api/demo/anonymous-session when FOVEA_DEMO_MODE is off', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/demo/anonymous-session' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('returns 404 for /api/demo/seed when FOVEA_DEMO_MODE is off', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/demo/seed', payload: { tourId: 'x', sessionUserId: 'y' } })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('still returns 404 for /api/demo/anonymous-session when FOVEA_DEMO_MODE is on but the secondary flag is off', async () => {
    process.env.FOVEA_DEMO_MODE = 'true'
    // FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH deliberately NOT set.
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/demo/anonymous-session' })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('refuses to register /api/demo/seed when FOVEA_DEMO_SEED_TOKEN is too short', async () => {
    process.env.FOVEA_DEMO_MODE = 'true'
    process.env.FOVEA_DEMO_SEED_TOKEN = 'too-short'
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/demo/seed', payload: { tourId: 'x', sessionUserId: 'y' } })
    expect(res.statusCode).toBe(404)
    await app.close()
  })

  it('tours-manifest API ships in every deployment regardless of FOVEA_DEMO_MODE', async () => {
    // Tours are a product feature, not a demo concern (see plan §6.2).
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/tours' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Array.isArray(body.tours)).toBe(true)
    // All ten built-in tours from the plan ship in the catalog.
    expect(body.tours.length).toBeGreaterThanOrEqual(10)
    await app.close()
  })

  it('issues a real anonymous session when both flags are on', async () => {
    // This is the happy path the demo landing page hits on first visit:
    // a fresh User row gets created, a Session is minted, and the
    // session_token cookie is set. The idle-reset sweeper will GC the
    // user after 10 min idle — that's why the demo workspace is safe to
    // hand out unauthenticated.
    process.env.FOVEA_DEMO_MODE = 'true'
    process.env.FOVEA_DEMO_ALLOW_ANONYMOUS_AUTH = 'true'
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/api/demo/anonymous-session' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(typeof body.userId).toBe('string')
    expect(body.userId.length).toBeGreaterThan(0)
    expect(typeof body.ttlSeconds).toBe('number')
    expect(body.ttlSeconds).toBeGreaterThan(0)
    // Token never appears in the body — only via the httpOnly cookie.
    expect(body).not.toHaveProperty('sessionToken')
    expect(body).not.toHaveProperty('token')
    const setCookie = res.headers['set-cookie']
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : (setCookie ?? '')
    expect(cookieHeader).toMatch(/session_token=/)
    expect(cookieHeader).toMatch(/HttpOnly/i)
    await app.close()
  })
})
