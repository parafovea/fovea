/**
 * @file picker-wikidata-kind.spec.ts
 * @description E2E coverage for the span label picker's Wikidata sub-view and its
 * world-object kind selector. Importing a Wikidata result as a chosen kind mints
 * the matching world object and assigns it to the span.
 *
 * Wikidata is mocked via `mockWikidata(page)` so results are deterministic and
 * not at the mercy of www.wikidata.org's rate limiter.
 */

import { test, expect } from '../../fixtures/test-context.js'
import { mockWikidata } from '../../fixtures/mock-wikidata.js'
import { DocumentAnnotationPage } from '../../page-objects/DocumentAnnotationPage.js'

test.describe('Document span label picker Wikidata kind selector', () => {
  test.beforeEach(async ({ page }) => {
    await mockWikidata(page)
  })

  test('imports a Wikidata result as a LOCATION world object', async ({
    page,
    db,
    testDocument,
    testPersona,
  }) => {
    const doc = new DocumentAnnotationPage(page)
    await doc.goto(testDocument.id)
    await doc.selectPersona(testPersona.name)

    await doc.selectToken(0)
    await doc.expectPickerOpen()
    await doc.search('Phoenix')

    // Enter the Wikidata object sub-view; all four kind buttons are present.
    await doc.wikidataForObject()
    for (const kind of ['entity', 'location', 'event', 'time'] as const) {
      await expect(page.locator(`[data-testid="picker-kind-${kind}"]`)).toBeVisible({ timeout: 5000 })
    }

    // Choose LOCATION; its button reports pressed.
    await doc.chooseKind('location')

    // Import the first mocked result -> preview card -> "Import as Location".
    const firstResult = page.getByRole('option').first()
    await expect(firstResult).toBeVisible({ timeout: 5000 })
    await firstResult.click()
    const importButton = page.getByRole('button', { name: /import as location/i })
    await expect(importButton).toBeVisible({ timeout: 5000 })
    await importButton.click()

    // The picker closes and a LOCATION world object lands in world state. The
    // mock lowercases common-noun labels, so 'Phoenix' imports as 'phoenix'.
    await doc.expectPickerClosed()
    await expect
      .poll(
        async () => {
          const entities = (await db.getWorldState()).entities
          return entities.some((e) => e.name === 'phoenix' && 'locationType' in e)
        },
        { timeout: 10000 },
      )
      .toBe(true)
  })

  test('offers the Wikidata type sub-view and returns to the unified list', async ({
    page,
    testDocument,
    testPersona,
  }) => {
    const doc = new DocumentAnnotationPage(page)
    await doc.goto(testDocument.id)
    await doc.selectPersona(testPersona.name)

    await doc.selectToken(2)
    await doc.expectPickerOpen()
    await doc.search('Desert')

    // Type sub-view opens (no kind selector; that is object-only) and the back
    // control returns to the unified type/object list.
    await doc.wikidataForType()
    await expect(page.locator('[data-testid="picker-wikidata-back"]')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="picker-kind-location"]')).toHaveCount(0)
    await doc.wikidataBack()
    await expect(page.locator('[data-testid="picker-search"]')).toBeVisible({ timeout: 5000 })
  })
})
