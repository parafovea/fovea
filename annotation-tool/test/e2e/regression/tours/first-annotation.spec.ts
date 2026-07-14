/**
 * Tour 1 ("First annotation in 90 seconds") end to end.
 *
 * Provisions the microvent Tech-Curious Spectator persona plus its first
 * entity type, then drives the tour through the engine and asserts every
 * step's anchor resolves and the tour reaches its end.
 */
import { test, expect } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { launchTour, expectTourWalksClean } from './_walk-tour.js'

const TOUR_ID = 'first-annotation'

test.describe('Tour 1: First annotation in 90 seconds', () => {
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
    const personaGrist = microventGrist.personas.find(
      (p) => p.name === 'Tech-Curious Spectator',
    )
    expect(personaGrist, 'microvent grist exposes Tech-Curious Spectator').toBeTruthy()
    const persona = await workerDb.createPersona(
      { userId: workerUser.id, name: personaGrist!.name, role: personaGrist!.role },
      workerSessionToken,
    )
    const ontologyGrist = microventGrist.ontologyByPersonaName[personaGrist!.name]
    const entityTypeGrist = ontologyGrist?.entityTypes[0]
    expect(
      entityTypeGrist,
      "Tech-Curious Spectator's ontology has at least one entity type to drive against",
    ).toBeTruthy()
    await workerDb.createEntityType(persona.id, {
      name: entityTypeGrist!.name,
      definition: entityTypeGrist!.gloss.find((g) => g.type === 'text')?.content ?? '',
    })

    await page.goto('/app')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, { timeout: 10000 })

    await launchTour(page, TOUR_ID)
    await expectTourWalksClean(page)
  })
})
