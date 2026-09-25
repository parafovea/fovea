/**
 * Tour 6 ("Model in the loop: tracking, interpolation, detection") end to end.
 *
 * Creates a persona, lands on the annotation workspace for the tracking clip
 * pinned by the bundle, then drives the tour through the engine and asserts
 * every step's anchor resolves and the tour reaches its end.
 */
import { test } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'
import { microventContent } from '@/tours/content/microvent'

const TOUR_ID = 'model-in-the-loop'

test.describe('Tour 6: Model in the loop', () => {
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
        name: 'Model-Loop Tour Persona',
        role: 'CV-curious analyst',
      },
      workerSessionToken,
    )

    const trackingVideoId = microventContent.modelInTheLoop.videoId
    await page.goto(`/annotate/${trackingVideoId}`)
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })

    await launchTour(page, TOUR_ID)
    await expectTourWalksClean(page)
  })
})
