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

  test('Done button gates on form validity and saves only on click (explicit-save contract)', async ({
    page,
    testUser
  }) => {
    const uniqueName = `DoneButton-${Date.now()}`

    // Count every POST that reaches /api/personas so we can assert how
    // many save attempts the dialog actually makes. The contract we're
    // proving: zero POSTs while the user types, exactly one POST when
    // the user clicks Done — i.e. no auto-save side-channel.
    const personaPosts: Array<{ url: string; status: number }> = []
    page.on('response', (resp) => {
      const url = resp.url()
      // Count only persona-CREATE POSTs (pathname exactly /api/personas), not
      // sub-resource POSTs like /api/personas/ontologies (the batched ontology
      // lookup the workspace fires on load), which would otherwise be miscounted
      // as a persona save fired "while typing".
      if (resp.request().method() === 'POST' && new URL(url).pathname === '/api/personas') {
        personaPosts.push({ url, status: resp.status() })
      }
    })

    // Navigate to ontology workspace
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle')

    // Open create persona dialog
    await page.getByRole('button', { name: /add/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // The shadcn PersonaEditor renders an explicit "Done" save button at all
    // times (the legacy MUI editor cycled between "Create" pre-save and "Done"
    // post-auto-save; tasks #71 and #72 dropped the auto-save hybrid in favour
    // of an explicit save). The button is disabled while the form is invalid
    // and enabled once name + role + informationNeed are populated.
    const actionButton = page.getByRole('button', { name: /done/i }).last()
    await expect(actionButton).toBeDisabled()

    // Fill required fields
    await page.getByLabel(/persona name/i).fill(uniqueName)
    await page.getByLabel(/role/i).first().fill('Role')
    await page.getByLabel(/information need/i).fill('Need')

    // Once all required fields are filled the Done button becomes enabled.
    await expect(actionButton).toBeEnabled({ timeout: 5000 })

    // Wait beyond any plausible auto-save debounce and assert that NO
    // POST reached /api/personas yet — this proves the auto-save hybrid
    // was actually removed in #71/#72 and replaced with an explicit save.
    await page.waitForTimeout(2500)
    expect(personaPosts, 'no POST /api/personas should fire while the user is typing (auto-save was removed)').toHaveLength(0)

    // Click Done — this is the explicit save. Exactly one successful POST
    // must fire to /api/personas as a result.
    await actionButton.click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 })
    expect(personaPosts.length, 'exactly one POST /api/personas should fire on Done click').toBe(1)
    expect(personaPosts[0].status, 'the persona POST should succeed').toBeGreaterThanOrEqual(200)
    expect(personaPosts[0].status).toBeLessThan(300)

    // Reload and confirm the persona persists across a fresh page load.
    await page.reload()
    await page.waitForLoadState('networkidle', { timeout: 10000 })
    await expect(
      page.locator('[data-persona-id]').filter({ hasText: uniqueName }),
    ).toBeVisible({ timeout: 10000 })
  })
})
