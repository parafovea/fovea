/**
 * Import and export tour end to end.
 *
 * Covers the import dialog, the import result surface, and the export
 * dialog. Drives the tour through the engine and asserts every step's
 * anchor resolves and the tour reaches its end.
 */
import { test } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'

const TOUR_ID = 'import-export'

test.describe('Import and export tour', () => {
  test.beforeEach(async ({ page, workerSessionToken }) => {
    await skipUnlessRealVideoCorpus(page, workerSessionToken)
  })

  test('walks every step with each anchor resolving', async ({ page, testUser }) => {
    void testUser

    await page.goto('/app')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })
    await page.waitForSelector('[data-tour-anchor="app-shell"]', { timeout: 10000 })

    await launchTour(page, TOUR_ID)
    await expectTourWalksClean(page)
  })
})
