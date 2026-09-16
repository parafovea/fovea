/**
 * @file quick-add.spec.ts
 * @description E2E coverage for the span label picker's inline quick-add: minting
 * a new ontology type and a new world object from the picker when the typed name
 * matches nothing existing, and assigning the fresh item to the selected span.
 *
 * Also verifies persistence: the created type and object survive a reload (they
 * reappear as picker options) and are visible through the ontology / world APIs.
 */

import { test, expect } from '../../fixtures/test-context.js'
import { DocumentAnnotationPage } from '../../page-objects/DocumentAnnotationPage.js'

test.describe('Document span label picker quick-add', () => {
  test('creates a type and a world object from the picker and persists them', async ({
    page,
    db,
    testDocument,
    testPersona,
  }) => {
    const doc = new DocumentAnnotationPage(page)
    await doc.goto(testDocument.id)
    await doc.selectPersona(testPersona.name)

    // Quick-add a new ontology type onto the first token.
    await doc.selectToken(0)
    await doc.expectPickerOpen()
    await doc.search('Novelcreature')
    await doc.quickAddType()
    await doc.expectPickerClosed()
    await doc.expectLabelChip('Novelcreature')

    // Quick-add a new world object onto another token.
    await doc.selectToken(2)
    await doc.expectPickerOpen()
    await doc.search('Metropolis')
    await doc.quickAddObject()
    await doc.expectPickerClosed()
    await doc.expectLabelChip('Metropolis')

    // The new items are persisted server-side.
    await expect
      .poll(async () => (await db.getEntityTypeByName(testPersona.id, 'Novelcreature'))?.name, {
        timeout: 10000,
      })
      .toBe('Novelcreature')
    await expect
      .poll(async () => (await db.getWorldState()).entities.map((e) => e.name), { timeout: 10000 })
      .toContain('Metropolis')

    // And they survive a reload. Re-assert persistence through the API first so
    // the check never depends solely on UI timing, then confirm both reappear as
    // options in a fresh picker.
    await doc.reload()
    await expect(doc.annotator).toBeVisible({ timeout: 20000 })
    await doc.selectPersona(testPersona.name)

    expect((await db.getEntityTypeByName(testPersona.id, 'Novelcreature'))?.name).toBe('Novelcreature')
    expect((await db.getWorldState()).entities.map((e) => e.name)).toContain('Metropolis')

    await doc.selectToken(5)
    await doc.expectPickerOpen()
    // Clear the seeded span text so the full list (not the similarity-ranked
    // subset for this token) is shown, then gate on the option list hydrating
    // (the ontology + world queries refetch from scratch after a reload) before
    // asserting membership, so the assertion does not race those post-reload loads.
    await doc.clearSearch()
    await expect
      .poll(async () => (await doc.optionLabels()).length, { timeout: 20000 })
      .toBeGreaterThan(0)
    await expect
      .poll(async () => await doc.optionLabels(), { timeout: 20000 })
      .toEqual(expect.arrayContaining(['Novelcreature', 'Metropolis']))
  })
})
