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
    const newTypeDialog = page.getByRole('dialog')
    await newTypeDialog.getByLabel(/name/i).fill(newTypeName)
    await newTypeDialog.getByLabel(/definition|gloss/i).first().fill('Test entity type')

    const saveButton = newTypeDialog.getByRole('button', { name: /save|create/i })
    await saveButton.click()

    // CRITICAL: Wait for dialog to close (proves save started)
    await expect(newTypeDialog).not.toBeVisible({ timeout: 5000 })

    // CRITICAL: Wait for type to appear in list (proves save completed)
    await expect(page.getByText(newTypeName).first()).toBeVisible({ timeout: 10000 })

    // CRITICAL: Wait for network idle (all API calls completed)
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // Additional buffer for auto-save
    await page.waitForTimeout(500)

    // Now safe to reload
    await page.reload()

    // CRITICAL: Wait for page fully loaded
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })

    // Wait for React to hydrate
    await page.waitForTimeout(1000)

    // Navigate back to ontology workspace
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')
    await page.getByText(testPersona.name).first().click()
    await page.waitForTimeout(1000)

    // CRITICAL: Wait for Entity Types tab to be visible
    await expect(entitiesTab).toBeVisible({ timeout: 10000 })

    // Verify entity type persisted (proving database persistence)
    await expect(page.getByText(newTypeName).first()).toBeVisible({ timeout: 10000 })
  })
})
