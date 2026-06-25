/**
 * Tour 2 ("Building a persona's ontology") end to end.
 *
 * Creates a fresh persona, opens its ontology workspace, then drives the tour
 * through the engine and asserts every step's anchor resolves and the tour
 * reaches its end.
 */
import { test, expect } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'

const TOUR_ID = 'ontology-authoring'

test.describe('Tour 2: Building a persona\'s ontology', () => {
  test.beforeEach(async ({ page, workerSessionToken }) => {
    await skipUnlessRealVideoCorpus(page, workerSessionToken)
  })

  test('walks every step with each anchor resolving', async ({
    page,
    testUser,
    workerDb,
    workerUser,
    workerSessionToken,
    microventGrist,
  }) => {
    void testUser
    const personaGrist = microventGrist.personas.find((p) => p.name === 'Automated')
    expect(personaGrist, 'microvent grist exposes the Automated persona').toBeTruthy()
    const persona = await workerDb.createPersona(
      { userId: workerUser.id, name: personaGrist!.name, role: personaGrist!.role },
      workerSessionToken,
    )

    await page.goto('/ontology')
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
