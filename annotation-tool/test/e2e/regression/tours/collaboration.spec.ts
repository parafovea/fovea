/**
 * Collaboration tour end to end.
 *
 * Covers projects, groups, and sharing across the collaboration routes.
 * Drives the tour through the engine and asserts every step's anchor
 * resolves and the tour reaches its end.
 */
import { test } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'

const TOUR_ID = 'collaboration'

test.describe('Collaboration tour', () => {
  test.beforeEach(async ({ page, workerSessionToken }) => {
    await skipUnlessRealVideoCorpus(page, workerSessionToken)
  })

  test('walks every step with each anchor resolving', async ({ page, testUser }) => {
    void testUser

    await page.goto('/app/projects')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })
    await page.waitForSelector('[data-tour-anchor="projects-page"]', { timeout: 10000 })

    await launchTour(page, TOUR_ID)
    await expectTourWalksClean(page)
  })
})
