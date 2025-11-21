/**
 * @file ontology-persistence.spec.ts
 * @description E2E tests verifying persona ontology types auto-save to database
 * and survive page reloads (not just Redux).
 */

import { test, expect } from '../../fixtures/test-context.js'

test.describe('Ontology Type Auto-Save Persistence', () => {
  test('new entity type auto-saves and persists after page reload', async ({
    page,
    testPersona
  }) => {
    // Navigate to ontology workspace
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    // Select test persona
    await page.getByText(testPersona.name).first().click()
    await page.waitForTimeout(1000)

    // Ensure we're on Entity Types tab
    const entitiesTab = page.getByRole('tab', { name: /entity types/i })
    await expect(entitiesTab).toBeVisible()

    // Create new entity type
    const addButton = page.getByRole('button', { name: /add/i }).first()
    await addButton.click()

    const newTypeName = `Auto-Save Test ${Date.now()}`
    await page.getByLabel(/name/i).fill(newTypeName)
    await page.getByLabel(/definition|gloss/i).first().fill('Test entity type')

    const saveButton = page.getByRole('button', { name: /save|create/i })
    await saveButton.click()

    // Wait for auto-save (1 second debounce + network time)
    await page.waitForTimeout(2500)

    // Verify it appears in list
    await expect(page.getByText(newTypeName).first()).toBeVisible()

    // Reload page to clear Redux state
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate back to ontology
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')
    await page.getByText(testPersona.name).first().click()
    await page.waitForTimeout(1000)

    // Verify entity type still exists (proving database persistence)
    await expect(page.getByText(newTypeName).first()).toBeVisible()
  })
})
