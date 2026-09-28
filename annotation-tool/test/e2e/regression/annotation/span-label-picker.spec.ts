/**
 * @file span-label-picker.spec.ts
 * @description E2E coverage for the document span label picker
 * (`SpanLabelPicker` -> `AnnotationAutocomplete` in unified `mode='both'`).
 *
 * Verifies that selecting a token opens the picker, that the picker surfaces the
 * active persona's ontology types AND the world's objects in one unified list,
 * that typing narrows the list, and that picking a type closes the picker and
 * labels the span (a chip appears on the span row and the token is highlighted).
 */

import { test, expect } from '../../fixtures/test-context.js'
import { DocumentAnnotationPage } from '../../page-objects/DocumentAnnotationPage.js'

test.describe('Document span label picker', () => {
  test('surfaces ontology type options, narrows on search, and labels the span on pick', async ({
    page,
    testDocument,
    testPersona,
    testEntityType,
  }) => {
    const doc = new DocumentAnnotationPage(page)
    await doc.goto(testDocument.id)
    await doc.selectPersona(testPersona.name)

    // Select the first token -> the label picker opens over the selection,
    // pre-seeded with that token's text.
    const firstTokenText = await doc.tokenText(0)
    await doc.selectToken(0)
    await doc.expectPickerOpen()
    expect(await doc.searchValue()).toBe(firstTokenText)

    // Clearing the seeded query shows the full unified list, which surfaces the
    // persona's ontology entity type.
    await doc.clearSearch()
    expect(await doc.optionKinds()).toContain('entity')
    expect(await doc.optionLabels()).toContain(testEntityType.name)

    // Typing narrows the list to the matching type.
    await doc.search('Test Entity')
    await expect
      .poll(async () => await doc.optionLabels(), { timeout: 5000 })
      .toContain(testEntityType.name)
    const narrowed = await doc.optionLabels()
    expect(narrowed.every((label) => label.toLowerCase().includes('test entity'))).toBe(true)

    // Picking the type closes the picker and labels the span.
    await doc.pickOption(testEntityType.name)
    await doc.expectPickerClosed()
    await doc.expectLabelChip(testEntityType.name)
    expect(await doc.coveredTokenCount()).toBeGreaterThanOrEqual(1)
  })

  test('unifies ontology types and world objects in one list', async ({
    page,
    testDocument,
    testPersona,
    testEntityType,
  }) => {
    const doc = new DocumentAnnotationPage(page)
    await doc.goto(testDocument.id)
    await doc.selectPersona(testPersona.name)

    // `testPersona` starts with no world objects, so mint one through the
    // picker's quick-add: this both creates the world object and labels the
    // token, making the list's 'both' nature real for the next selection.
    await doc.selectToken(1)
    await doc.expectPickerOpen()
    await doc.search('Metropolis')
    await doc.quickAddObject()
    await doc.expectPickerClosed()
    await doc.expectLabelChip('Metropolis')

    // A fresh selection now shows BOTH an ontology type and a world object
    // (clear the seeded span text so the full unified list is visible).
    await doc.selectToken(3)
    await doc.expectPickerOpen()
    await doc.clearSearch()
    await expect
      .poll(async () => await doc.optionKinds(), { timeout: 10000 })
      .toEqual(expect.arrayContaining(['entity', 'entity-object']))
    const labels = await doc.optionLabels()
    expect(labels).toContain(testEntityType.name)
    expect(labels).toContain('Metropolis')
  })

  test('pre-fills the span text and ranks the closest existing type to the top', async ({
    page,
    db,
    testDocument,
    testPersona,
  }) => {
    // Seed an exact match, a substring match, and an unrelated type so both
    // ranking (exact above substring) and pruning (unrelated dropped) show.
    await db.createEntityType(testPersona.id, { name: 'Storm', definition: 'exact' })
    await db.createEntityType(testPersona.id, { name: 'Storm System', definition: 'substring' })
    await db.createEntityType(testPersona.id, { name: 'Person', definition: 'unrelated' })

    const doc = new DocumentAnnotationPage(page)
    await doc.goto(testDocument.id)
    await doc.selectPersona(testPersona.name)

    // "The dust storm rolled ..." -> token index 2 is "storm".
    const stormIdx = 2
    expect((await doc.tokenText(stormIdx)).toLowerCase()).toContain('storm')
    await doc.selectToken(stormIdx)
    await doc.expectPickerOpen()

    // The search is seeded with the highlighted span's text...
    expect((await doc.searchValue()).toLowerCase()).toContain('storm')

    // ...and each section is ranked by similarity: the exact match ranks first,
    // the substring match is present, and the unrelated type is pruned out.
    await expect
      .poll(async () => await doc.optionLabels(), { timeout: 10000 })
      .toEqual(expect.arrayContaining(['Storm', 'Storm System']))
    const labels = await doc.optionLabels()
    expect(labels[0]).toBe('Storm')
    expect(labels).not.toContain('Person')
  })
})
