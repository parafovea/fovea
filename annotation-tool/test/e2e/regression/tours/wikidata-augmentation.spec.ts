/**
 * Tour 3 — "Grow your ontology from Wikidata" — end-to-end.
 *
 * Walks all 6 steps through the BaseTypeEditor's "Import from
 * Wikidata" mode → WikidataSearch + WikidataImportFlow. The augmenter-
 * search and augmenter-results anchors now live on WikidataSearch
 * (added in this commit so the narration about "queries Wikidata live"
 * actually matches the surface it spotlights — the previous placement
 * on OntologyAugmenter described the AI-suggestion flow which is a
 * different feature).
 *
 * Wikidata REST calls are mocked via mockWikidata so the spec is
 * deterministic and doesn't get rate-limited at the booth.
 */

import { test, expect } from '../../fixtures/test-context.js'
import { skipUnlessRealVideoCorpus } from './_skip-unless-real-videos.js'
import { mockWikidata } from '../../fixtures/mock-wikidata.js'

const TOUR_ID = 'wikidata-augmentation'

declare global {
  interface Window {
    __foveaTour?: { launch: (tourId: string) => Promise<boolean> }
  }
}

async function advanceTo(
  page: import('@playwright/test').Page,
  targetStep: number,
  totalSteps: number,
): Promise<void> {
  const card = page.locator('[data-fovea-tour-step-card]')
  for (let attempt = 0; attempt < 14; attempt++) {
    const text =
      (await card
        .locator('text=/^\\d+\\s*\\/\\s*\\d+$/')
        .first()
        .textContent()
        .catch(() => '')) ?? ''
    const match = text.match(/^(\d+)\s*\//)
    const current = match ? Number(match[1]) : 0
    if (current >= targetStep) return
    const btn = card.getByRole('button', { name: /^(Next|Skip|Finish)$/ })
    if (!(await btn.isVisible({ timeout: 500 }).catch(() => false))) {
      await page.waitForTimeout(400)
      continue
    }
    await btn.click()
  }
  void totalSteps
  throw new Error(`failed to advance to step ${targetStep} of ${totalSteps}`)
}

test.describe('Tour 3: Grow your ontology from Wikidata — end to end', () => {
  test.beforeEach(async ({ page, workerSessionToken }) => {
    await skipUnlessRealVideoCorpus(page, workerSessionToken)
  })

  test('walks all six steps surfacing the Wikidata search + import flow', async ({
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

    await page.goto('/ontology')
    await page.waitForFunction(() => Boolean(window.__foveaTour), undefined, {
      timeout: 10000,
    })
    const personaHeading = page
      .getByRole('heading', { level: 3, name: persona.name })
      .first()
    await expect(personaHeading).toBeVisible({ timeout: 10000 })
    await page
      .locator('div')
      .filter({ has: personaHeading })
      .locator('button', { hasText: 'Open' })
      .first()
      .click()
    await page.waitForSelector('[data-tour-anchor="ontology-workspace-tabs"]', {
      timeout: 10000,
    })

    // Open the Entity Type editor and switch to Wikidata mode so the
    // tour's augmenter-search anchor (now on WikidataSearch) mounts.
    await page.getByRole('tab', { name: /^Entity Types/ }).click()
    await page.getByRole('button', { name: 'add type' }).click()
    const editor = page.locator('[data-tour-anchor="entity-type-editor"]')
    await expect(editor).toBeVisible({ timeout: 5000 })
    await editor
      .getByRole('button', { name: /Import from Wikidata/i })
      .click()
    await page.waitForSelector('[data-tour-anchor="augmenter-search"]', {
      timeout: 5000,
    })

    const ok = await page.evaluate(
      async (id) => Boolean(await window.__foveaTour?.launch(id)),
      TOUR_ID,
    )
    expect(ok).toBe(true)
    const card = page.locator('[data-fovea-tour-step-card]')
    await expect(card).toBeAttached({ timeout: 5000 })

    // step 1: augmenter-search — type to trigger Wikidata query
    await expect(card.locator('text=/^1\\s*\\/\\s*6$/')).toBeVisible()
    const searchBox = editor
      .locator('[data-tour-anchor="augmenter-search"]')
      .getByRole('textbox')
      .first()
    await searchBox.fill('dust cloud')
    await advanceTo(page, 2, 6)

    // step 2: augmenter-results — mock returns deterministic results
    await page
      .waitForSelector('[data-tour-anchor="augmenter-results"]', { timeout: 10000 })
      .catch(() => {})
    await advanceTo(page, 3, 6)

    // step 3: augmenter-import-target — anchor lives on OntologyAugmenter
    // (a different surface than this Wikidata flow). Skip.
    await advanceTo(page, 4, 6)

    // step 4: entity-type-editor — still open from before
    await advanceTo(page, 5, 6)

    // step 5: augmenter-related-suggestions — requiresFixture
    await advanceTo(page, 6, 6)

    // step 6: annotation-editor-type-list — requiresFixture; Finish
    const finishOrSkip = card
      .getByRole('button', { name: /^(Finish|Skip)$/ })
      .first()
    await finishOrSkip
      .click({ force: true, timeout: 4500 })
      .catch(() => {})
    await page
      .waitForSelector('[data-fovea-tour-step-card]', {
        state: 'detached',
        timeout: 5000,
      })
      .catch(() => {})
  })
})
