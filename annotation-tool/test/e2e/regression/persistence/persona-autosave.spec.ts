/**
 * @file persona-autosave.spec.ts
 * @description E2E tests verifying persona auto-saves on creation
 * and persists after page reload (not just Redux state).
 *
 * Issue: Creating a persona should auto-save like other user data (ontology,
 * world state, annotations) rather than requiring manual "Create" button click.
 */

import { test, expect } from '../../fixtures/test-context.js'

test.describe('Persona Creation Auto-Save', () => {
  test('new persona auto-saves and persists after page reload', async ({
    page,
    testUser
  }) => {
    const uniqueName = `AutoSave-${Date.now()}`

    // Navigate to ontology workspace where PersonaManager is visible
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    // Open create persona dialog by clicking the add button
    await page.getByRole('button', { name: /add/i }).first().click()

    // Wait for dialog to open
    await expect(page.getByRole('dialog')).toBeVisible()

    // Fill required fields
    await page.getByLabel(/persona name/i).fill(uniqueName)
    await page.getByLabel(/role/i).first().fill('Test Role')
    await page.getByLabel(/information need/i).fill('Test Information Need')

    // Wait for autosave debounce (1s) + network
    await page.waitForTimeout(2000)

    // Wait for network idle (all API calls completed including auto-save)
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // Close dialog via Done button (persona already auto-saved)
    await page.getByRole('button', { name: /done/i }).click()

    // Reload page to clear Redux state
    await page.reload()
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // Navigate back to ontology to see persona list
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    // Verify persona persisted (click dropdown to see persona list)
    await page.getByRole('button', { name: new RegExp(uniqueName, 'i') }).click().catch(async () => {
      // If button doesn't have persona name, click the dropdown button
      await page.getByRole('button', { name: /select persona|expand/i }).first().click()
    })

    // Check if persona appears in dropdown or is already selected
    const personaVisible = await page.getByText(uniqueName).isVisible()
    expect(personaVisible).toBe(true)
  })

  test('persona is deleted when Cancel clicked after auto-creation', async ({
    page,
    testUser
  }) => {
    const uniqueName = `CancelTest-${Date.now()}`

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

    // Wait for autosave
    await page.waitForTimeout(2000)
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // Click Cancel (should delete auto-created persona)
    await page.getByRole('button', { name: /cancel/i }).click()

    // Wait for delete to complete
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // Reload to verify from database
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Navigate to ontology
    await page.goto('/ontology')
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

    // Initially should show "Create Persona" button
    await expect(page.getByRole('button', { name: /create persona/i })).toBeVisible()

    // Fill required fields
    await page.getByLabel(/persona name/i).fill(uniqueName)
    await page.getByLabel(/role/i).first().fill('Role')
    await page.getByLabel(/information need/i).fill('Need')

    // Wait for autosave
    await page.waitForTimeout(2000)
    await page.waitForLoadState('networkidle', { timeout: 10000 })

    // After auto-save, button should change to "Done"
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 5000 })

    // Cancel to cleanup
    await page.getByRole('button', { name: /cancel/i }).click()
  })
})
