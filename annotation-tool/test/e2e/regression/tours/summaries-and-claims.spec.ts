/**
 * Tour 7 ("Summaries, transcripts, and claim extraction") end to end.
 *
 * Provisions an incident-summarizer persona, opens the pinned video's
 * workspace, then drives the tour through the engine and asserts every
 * step's anchor resolves and the tour reaches its end.
 */
import { test, expect } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'
import { microventContent } from '@/tours/content/microvent'

const TOUR_ID = 'summaries-and-claims'

test.describe('Tour 7: Summaries, transcripts, claims', () => {
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
      { userId: workerUser.id, name: 'Summary Tour Persona', role: 'Incident summarizer' },
      workerSessionToken,
    )

    const targetVideoId = microventContent.summariesAndClaims.videoId
    await page.goto(`/annotate/${targetVideoId}`)
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })

    await launchTour(page, TOUR_ID)
    await expectTourWalksClean(page)
  })
})
