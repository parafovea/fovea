/**
 * Tour 4 ("Beyond boxes: events, roles, and claims") end to end.
 *
 * Provisions an incident-analyst persona plus a Person-style entity type,
 * then drives the tour through the engine and asserts every step's anchor
 * resolves and the tour reaches its end.
 */
import { test, expect } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'

const TOUR_ID = 'events-roles-claims'

test.describe('Tour 4: Events, roles, claims', () => {
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
    const persona = await workerDb.createPersona(
      { userId: workerUser.id, name: 'Events Tour Persona', role: 'Incident analyst' },
      workerSessionToken,
    )
    const entityTypeName =
      microventGrist.ontologyByPersonaName['Tech-Curious Spectator']?.entityTypes[0]?.name ??
      'Person'
    await workerDb.createEntityType(persona.id, {
      name: entityTypeName,
      definition: 'an individual human',
    })

    await page.goto('/app')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })

    await launchTour(page, TOUR_ID)
    await expectTourWalksClean(page)
  })
})
