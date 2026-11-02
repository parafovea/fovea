/**
 * @file deletion-carrier-preservation.spec.ts
 * @description E2E coverage for carrier-preserving deletion of a world object
 * that a document span denotes.
 *
 * When a world object is deleted, the server clears its references
 * carrier-aware: a document span that denoted the object KEEPS its base
 * placeholder (the span carrier stays rendered and re-labelable) while the
 * object-denotation annotation is removed (the reference is cleared). This spec
 * labels a token span with a freshly quick-added world object, deletes that
 * object, reloads, and asserts the span carrier survives with its object
 * reference gone and the label picker re-openable for reassignment.
 *
 * Freeze half: the sibling behavior — an inline text MENTION of the deleted
 * object (in a gloss / description / video summary / claim prose) being frozen
 * to its plain display name — is exercised by the server's reference-cleanup
 * unit tests (`dereferenceGlossItems` / `dereferenceSummaries`); seeding a
 * standoff mention through the UI here would be disproportionately heavy, so
 * this spec covers the carrier-preservation half end to end and leaves the
 * freeze half to that server coverage.
 */

import { test, expect } from '../../fixtures/test-context.js'
import { DocumentAnnotationPage } from '../../page-objects/DocumentAnnotationPage.js'

test.describe('World object deletion preserves the span carrier', () => {
  test('keeps the token span after its denoted object is deleted and clears the reference', async ({
    page,
    db,
    testDocument,
    testPersona,
    workerSessionToken,
  }) => {
    const doc = new DocumentAnnotationPage(page)
    await doc.goto(testDocument.id)
    await doc.selectPersona(testPersona.name)

    // Label the first token with a freshly minted world object.
    await doc.selectToken(0)
    await doc.expectPickerOpen()
    await doc.search('Carrieropolis')
    await doc.quickAddObject()
    await doc.expectPickerClosed()
    await doc.expectLabelChip('Carrieropolis')
    expect(await doc.coveredTokenCount()).toBeGreaterThanOrEqual(1)

    // Resolve the created world object's id, then delete it through the graceful
    // world API (which clears references carrier-aware).
    const objectId = await test.step('resolve world object id', async () => {
      const entities = (await db.getWorldState(workerSessionToken)).entities
      const match = entities.find((e) => e.name === 'Carrieropolis')
      expect(match, 'quick-added world object should exist in world state').toBeTruthy()
      return match!.id
    })
    await db.deleteWorldEntity(objectId, workerSessionToken)

    // Reload the document: the span carrier survives, but its object reference
    // (the 'Carrieropolis' chip) is gone.
    await doc.reload()
    await expect(doc.annotator).toBeVisible({ timeout: 20000 })
    await doc.selectPersona(testPersona.name)

    await expect(doc.spanRows.first()).toBeVisible({ timeout: 10000 })
    expect(await doc.coveredTokenCount()).toBeGreaterThanOrEqual(1)
    await expect(doc.annotator.getByText('Carrieropolis')).toHaveCount(0)

    // The carrier can be re-labeled: the picker re-opens on it for reassignment.
    await doc.reopenPickerOnFirstSpan()
    await doc.expectPickerOpen()
  })
})
