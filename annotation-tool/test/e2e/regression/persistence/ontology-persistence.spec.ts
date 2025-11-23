/**
 * @file ontology-persistence.spec.ts
 * @description E2E tests verifying persona ontology types auto-save to database
 * and survive page reloads (not just Redux).
 */

import { test, expect } from '../../fixtures/test-context.js'

test.describe('Ontology Type Auto-Save Persistence', () => {
  test('new entity type auto-saves and persists after page reload', async ({
    page,
    ontologyWorkspace,
    testPersona
  }) => {
    // Navigate to ontology workspace
    await ontologyWorkspace.navigateTo(testPersona.id)

    // Create new entity type
    const newTypeName = `Auto-Save Test ${Date.now()}`
    await ontologyWorkspace.createEntityType(newTypeName, 'Test entity type for auto-save persistence')

    // CRITICAL: Wait for type to appear in list (proves save completed)
    await ontologyWorkspace.expectTypeExists(newTypeName)

    // CRITICAL: Wait for network idle (all API calls completed including auto-save)
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // Additional buffer for auto-save debounce to complete
    await page.waitForTimeout(1500)

    // Now safe to reload
    await page.reload()

    // CRITICAL: Wait for page fully loaded
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })

    // Wait for React to hydrate
    await page.waitForTimeout(1000)

    // Navigate back to ontology workspace
    await ontologyWorkspace.navigateTo(testPersona.id)
    await ontologyWorkspace.selectTab('entities')

    // Verify entity type persisted (proving database persistence via auto-save)
    await ontologyWorkspace.expectTypeExists(newTypeName)
  })
})
