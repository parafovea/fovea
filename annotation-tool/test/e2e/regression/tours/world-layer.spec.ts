/**
 * Tour 5 ("The world layer: instances, places, times") end to end.
 *
 * Creates a persona, opens the object workspace for the venue clip pinned by
 * the bundle, then drives the tour through the engine and asserts every step's
 * anchor resolves and the tour reaches its end.
 */
import { test } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'
import { microventContent } from '@/tours/content/microvent'

const TOUR_ID = 'world-layer'

test.describe('Tour 5: The world layer', () => {
  test.beforeEach(async ({ page, workerSessionToken }) => {
    await skipUnlessRealVideoCorpus(page, workerSessionToken)
  })

  test('walks every step with each anchor resolving', async ({
    page,
    testUser,
    workerDb,
    workerUser,
    workerSessionToken,
  }) => {
    void testUser

    await workerDb.createPersona(
      {
        userId: workerUser.id,
        name: 'World Layer Tour Persona',
        role: 'Sports incidents analyst',
      },
      workerSessionToken,
    )

    const venueVideoId = microventContent.worldLayer.videoId
    await page.goto(`/annotate/${venueVideoId}`)
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.goto('/objects')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })
    await page.waitForSelector('[data-tour-anchor="world-panel-tabs"]', { timeout: 10000 })

    await launchTour(page, TOUR_ID)
    await expectTourWalksClean(page)
  })
})
