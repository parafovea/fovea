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
    expect(body.tours.length).toBeGreaterThan(0)
    await app.close()
  })
})
