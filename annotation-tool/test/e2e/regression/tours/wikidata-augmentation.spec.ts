/**
 * Tour 3 ("Grow your ontology from Wikidata") end to end.
 *
 * Creates a persona, opens its ontology workspace, then drives the tour through
 * the engine and asserts every step's anchor resolves and the tour reaches its
 * end. Wikidata REST calls are mocked via mockWikidata so the walk is
 * deterministic and never rate-limited.
 */
import { test, expect } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'
import { mockWikidata } from '../../fixtures/mock-wikidata.js'

const TOUR_ID = 'wikidata-augmentation'

test.describe('Tour 3: Grow your ontology from Wikidata', () => {
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
    await mockWikidata(page)

    const persona = await workerDb.createPersona(
      {
        userId: workerUser.id,
        name: 'Wikidata Tour Persona',
        role: 'Analyst',
      },
      workerSessionToken,
    )

    await page.goto('/app/ontology')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })
    const personaHeading = page.getByRole('heading', { level: 3, name: persona.name }).first()
    await expect(personaHeading).toBeVisible({ timeout: 10000 })
    await page
      .locator('div')
      .filter({ has: personaHeading })
      .locator('button', { hasText: 'Open' })
      .first()
      .click()
    await page.waitForSelector('[data-tour-anchor="ontology-workspace-tabs"]', { timeout: 10000 })

    await launchTour(page, TOUR_ID)
    await expectTourWalksClean(page)
  })
})
