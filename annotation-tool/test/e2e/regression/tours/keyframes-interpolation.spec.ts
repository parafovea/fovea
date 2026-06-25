/**
 * Tour 5 ("Keyframes and interpolation") end to end.
 *
 * Walks the temporal model of an annotation: the drawing canvas, the
 * timeline panel of keyframes, and the video scrubber that follows the
 * interpolation curve. Creates a persona, lands on the annotation
 * workspace for the model-in-the-loop clip the tour pins, then drives
 * the tour through the engine and asserts every step's anchor resolves
 * and the tour reaches its end.
 */
import { test } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'
import { microventContent } from '@/tours/content/microvent'

const TOUR_ID = 'keyframes-interpolation'

test.describe('Tour 5: Keyframes and interpolation', () => {
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
        name: 'Keyframes Tour Persona',
        role: 'Temporal-annotation analyst',
      },
      workerSessionToken,
    )

    const keyframesVideoId = microventContent.modelInTheLoop.videoId
    await page.goto(`/annotate/${keyframesVideoId}`)
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })

    await launchTour(page, TOUR_ID)
    await expectTourWalksClean(page)
  })
})
