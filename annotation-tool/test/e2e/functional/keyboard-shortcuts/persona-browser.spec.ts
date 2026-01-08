import { test, expect } from '../../fixtures/test-context.js'

/**
 * Persona Browser Keyboard Shortcuts Tests
 *
 * Tests verify that persona browser shortcuts work correctly:
 * - n: Create new persona (when no persona is selected)
 *
 * Uses test-context fixtures for proper authentication and test isolation.
 */

test.describe('Keyboard Shortcuts - Persona Browser', () => {
  // testUser fixture sets up authentication - must be included to trigger auth
  test.beforeEach(async ({ testUser }) => {
    // Auth is set up by testUser fixture - testUser used for side effects
    void testUser
  })

  test('n creates new persona when in persona browser', async ({ page }) => {
    // Navigate to ontology workspace
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    await page.goto('/ontology')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Wait for page to stabilize
    await page.waitForTimeout(1000)

    // Wait for page to load - could show personas, empty state, or tabs (if auto-selected)
    await Promise.race([
      page.waitForSelector('button:has-text("Open")', { state: 'visible', timeout: 10000 }),
      page.waitForSelector('text="No personas found"', { state: 'visible', timeout: 10000 }),
      page.waitForSelector('[role="tab"]', { state: 'visible', timeout: 10000 })
    ])

    // Ensure we're in persona browser mode (not with a persona selected)
    const context = await page.evaluate(() => {
      const registry = (window as any).__commandRegistry
      return {
        personaBrowserActive: registry?.getContext('personaBrowserActive'),
        ontologyWorkspaceActive: registry?.getContext('ontologyWorkspaceActive')
      }
    })

    // If persona is selected (ontologyWorkspaceActive=true), need to go back to persona browser
    if (context.ontologyWorkspaceActive) {
      // Look for back button
      const backButton = page.locator('button').filter({ has: page.locator('svg[data-testid="ArrowBackIcon"]') }).first()
        .or(page.getByRole('button', { name: /back/i }).first())
        .or(page.locator('[aria-label*="back" i]').first())

      if (await backButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await backButton.click()
        await page.waitForTimeout(500)
      }
    }

    // Make sure no input is focused
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Verify context is correct before pressing n
    const contextBefore = await page.evaluate(() => {
      const registry = (window as any).__commandRegistry
      if (!registry) return null
      return {
        personaBrowserActive: registry.getContext('personaBrowserActive'),
        ontologyWorkspaceActive: registry.getContext('ontologyWorkspaceActive'),
        inputFocused: registry.getContext('inputFocused'),
        dialogOpen: registry.getContext('dialogOpen')
      }
    })

    // Should be in persona browser mode
    expect(contextBefore?.personaBrowserActive).toBe(true)
    expect(contextBefore?.ontologyWorkspaceActive).toBe(false)

    // Press n to create new persona via keyboard shortcut
    await page.keyboard.press('n')
    await page.waitForTimeout(500)

    // Verify dialog opened
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // The dialog should be the Create Persona dialog (check the title)
    const dialogTitle = dialog.getByRole('heading', { level: 2 })
    const titleText = await dialogTitle.textContent()

    // Assert it's the persona dialog, not the entity type dialog
    expect(titleText?.toLowerCase()).toContain('persona')
  })
})
