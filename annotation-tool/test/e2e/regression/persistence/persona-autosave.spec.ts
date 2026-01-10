/**
 * @file persona-autosave.spec.ts
 * @description E2E tests verifying persona auto-saves on creation
 * and persists after page reload (not just client state).
 *
 * Personas auto-save after a 1-second debounce when the form is valid.
 * The Create button changes to Done after auto-save completes.
 * Cancel after auto-save deletes the auto-created persona.
 */

import { test, expect } from '../../fixtures/test-context.js'

test.describe('Persona Creation Auto-Save', () => {
  test('new persona auto-saves and persists after page reload', async ({
    page,
    testUser
  }) => {
    const uniqueName = `AutoSave-${Date.now()}`

    // Navigate to ontology workspace
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    // Open create persona dialog
    await page.getByRole('button', { name: /add/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Fill required fields
    await page.getByLabel(/persona name/i).fill(uniqueName)
    await page.getByLabel(/role/i).first().fill('Test Role')
    await page.getByLabel(/information need/i).fill('Test Information Need')

    // Wait for auto-save debounce (1s) + network
    await page.waitForTimeout(2000)
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // After auto-save, button should change to "Done"
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 5000 })

    // Close dialog via Done button (persona already auto-saved)
    await page.getByRole('button', { name: /done/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })

    // Reload page to clear client state
    await page.reload()
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // Verify persona persisted - should see persona card in PersonaBrowser
    await expect(page.locator(`[data-persona-id]`).filter({ hasText: uniqueName })).toBeVisible({ timeout: 10000 })
  })

  test('persona is deleted when Cancel clicked after auto-creation', async ({
    page,
    testUser
  }) => {
    const uniqueName = `CancelAfterAutoSave-${Date.now()}`

    // Navigate to ontology workspace
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    // Open create persona dialog
    await page.getByRole('button', { name: /add/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Fill required fields
    await page.getByLabel(/persona name/i).fill(uniqueName)
    await page.getByLabel(/role/i).first().fill('Role')
    await page.getByLabel(/information need/i).fill('Need')

    // Wait for auto-save to complete
    await page.waitForTimeout(2000)
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // Verify auto-save happened (Done button visible)
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 5000 })

    // Click Cancel - should delete the auto-created persona
    await page.getByRole('button', { name: /cancel/i }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })

    // Wait for delete to complete
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // Reload to verify deletion from database
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Verify persona does NOT exist
    const personaVisible = await page.getByText(uniqueName).isVisible().catch(() => false)
    expect(personaVisible).toBe(false)
  })

  test('dialog shows Done button after auto-save completes', async ({
    page,
    testUser
  }) => {
    const uniqueName = `DoneButton-${Date.now()}`

    // Navigate to ontology workspace
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    // Open create persona dialog
    await page.getByRole('button', { name: /add/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Initially should show "Create" button (disabled)
    const actionButton = page.getByRole('button', { name: /create|done/i }).last()
    await expect(actionButton).toHaveText(/create/i)

    // Fill required fields
    await page.getByLabel(/persona name/i).fill(uniqueName)
    await page.getByLabel(/role/i).first().fill('Role')
    await page.getByLabel(/information need/i).fill('Need')

    // Wait for auto-save
    await page.waitForTimeout(2000)
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // After auto-save, button should change to "Done"
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 5000 })

    // Cancel to cleanup (will delete the auto-created persona)
    await page.getByRole('button', { name: /cancel/i }).click()
  })
})
