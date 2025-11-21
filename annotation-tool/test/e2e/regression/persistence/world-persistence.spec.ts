/**
 * @file world-persistence.spec.ts
 * @description E2E tests verifying world objects auto-save to database
 * and survive page reloads (not just Redux).
 */

import { test } from '../../fixtures/test-context.js'

test.describe('World Object Auto-Save Persistence', () => {
  test('new entity auto-saves and persists after page reload', async ({
    objectWorkspace,
    testPersona,
    testEntityType,
    page
  }) => {
    // Navigate to object workspace
    await objectWorkspace.navigateTo()

    // Wait for the save request
    const saveResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/world') &&
                  response.request().method() === 'PUT',
      { timeout: 10000 }
    )

    // Create new entity
    const newEntityName = `Persistent Entity ${Date.now()}`
    await objectWorkspace.createEntity(newEntityName, 'Should survive reload')

    // Wait for save API call to complete
    await saveResponsePromise
    await page.waitForTimeout(1500)

    // Reload page to clear Redux state
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // Navigate back to object workspace
    await objectWorkspace.navigateTo()
    await objectWorkspace.selectTab('entities')

    // Verify entity still exists (proving database persistence)
    await objectWorkspace.expectEntityExists(newEntityName)
  })
})
