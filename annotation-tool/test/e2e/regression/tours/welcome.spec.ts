/**
 * Tour 0 ("Welcome to FOVEA") end to end.
 *
 * The orientation splash: what FOVEA is and where the four-layer model
 * lives in the UI. Every step anchors on the app shell at /app, so no
 * persona or workspace data is needed. Lands on /app, then drives the
 * tour through the engine and asserts every step's anchor resolves and
 * the tour reaches its end.
 */
import { test } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'

const TOUR_ID = 'welcome'

test.describe('Tour 0: Welcome to FOVEA', () => {
  test.beforeEach(async ({ page, workerSessionToken }) => {
    await skipUnlessRealVideoCorpus(page, workerSessionToken)
  })

  test('walks every step with each anchor resolving', async ({
    page,
    testUser,
  }) => {
    void testUser

    await page.goto('/app')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })

    await launchTour(page, TOUR_ID)
    await expectTourWalksClean(page)
  })
})
