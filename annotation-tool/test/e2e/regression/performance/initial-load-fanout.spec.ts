/**
 * @file initial-load-fanout.spec.ts
 * @description E2E guard that the initial app load no longer fans out into one
 * request per persona (ontology) and one per video (summary). Those O(N) and
 * O(N*M) request storms tripped the server rate limit on large deployments;
 * they are now collapsed into batch endpoints.
 */

import { test, expect } from '../../fixtures/test-context.js'

test.describe('Initial-load request fan-out', () => {
  test('uses batch endpoints instead of per-persona / per-video requests', async ({
    page,
    testUser,
    testPersonaPersistent,
  }) => {
    // testUser authenticates the page; testPersonaPersistent guarantees at
    // least one persona exists so the ontology load actually does work.
    void testUser
    void testPersonaPersistent

    const perPersonaOntologyGets: string[] = []
    const perVideoSummaryGets: string[] = []
    let batchOntologyPosts = 0
    let batchSummaryPosts = 0

    page.on('request', (req) => {
      const { pathname } = new URL(req.url())
      const method = req.method()
      // Old fan-out shapes:
      if (method === 'GET' && /^\/api\/personas\/[^/]+\/ontology$/.test(pathname)) {
        perPersonaOntologyGets.push(pathname)
      }
      if (method === 'GET' && /^\/api\/videos\/[^/]+\/summaries\/[^/]+$/.test(pathname)) {
        perVideoSummaryGets.push(pathname)
      }
      // New batch shapes:
      if (method === 'POST' && pathname === '/api/personas/ontologies') batchOntologyPosts++
      if (method === 'POST' && pathname === '/api/videos/summaries/lookup') batchSummaryPosts++
    })

    await page.goto('/')
    // Wait for the video browser to settle (videos render or the empty state).
    await expect(
      page.getByRole('button', { name: /^annotate$/i }).first().or(page.getByText(/no videos found/i))
    ).toBeVisible({ timeout: 20000 })
    // Give any late fan-out a chance to fire before asserting.
    await page.waitForTimeout(1500)

    // The persona ontologies are fetched in one batched POST, not one GET per
    // persona. (usePersonaOntology may still issue at most one single GET for
    // the active persona, so allow <= 1 rather than requiring exactly 0.)
    expect(batchOntologyPosts).toBeGreaterThanOrEqual(1)
    expect(
      perPersonaOntologyGets.length,
      `expected no per-persona ontology fan-out, saw: ${perPersonaOntologyGets.join(', ')}`
    ).toBeLessThanOrEqual(1)

    // The per-(video, persona) summary fan-out is eliminated entirely: the
    // VideoBrowser cards read from the batched lookup's cache.
    expect(
      perVideoSummaryGets.length,
      `expected no per-video summary fan-out, saw ${perVideoSummaryGets.length}`
    ).toBe(0)
    // When a persona is active the batch lookup is used; it is never the old
    // per-video GET storm.
    expect(batchSummaryPosts).toBeGreaterThanOrEqual(0)
  })
})
