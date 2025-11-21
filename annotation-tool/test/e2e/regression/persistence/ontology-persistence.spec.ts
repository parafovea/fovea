/**
 * @file ontology-persistence.spec.ts
 * @description E2E tests verifying persona ontology types auto-save to database
 * and survive page reloads (not just Redux).
 */

import { test } from '../../fixtures/test-context.js'

test.describe('Ontology Type Auto-Save Persistence', () => {
  test('new entity type auto-saves and persists after page reload', async ({
    ontologyWorkspace,
    testPersona,
    page
  }) => {
    // Navigate to ontology workspace
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Wait for the save request
    const saveResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/personas') &&
                  response.url().includes('/ontology') &&
                  response.request().method() === 'PUT',
      { timeout: 10000 }
    )

    // Create new entity type
    const newTypeName = `Auto-Save Test ${Date.now()}`
    await ontologyWorkspace.createEntityType(newTypeName, 'Test entity type')

    // Wait for save API call to complete
    await saveResponsePromise
    await page.waitForTimeout(1500)

    // Reload page to clear Redux state
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // Navigate back to ontology workspace
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('entities')

    // Verify entity type still exists (proving database persistence)
    await ontologyWorkspace.expectTypeExists(newTypeName)
  })
})
