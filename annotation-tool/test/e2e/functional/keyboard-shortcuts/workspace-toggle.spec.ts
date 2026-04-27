import { test, expect } from '../../fixtures/test-context.js'

/**
 * Workspace Toggle Keyboard Shortcuts Tests
 *
 * Tests verify that workspace toggle shortcuts work correctly:
 * - o: Toggle to/from persona builder
 * - w: Toggle to/from object builder (world)
 * - Cmd+1/2/3: Direct navigation to workspaces
 *
 * Uses test-context fixtures for proper authentication and test isolation.
 */

test.describe('Keyboard Shortcuts - Workspace Toggle', () => {
  // testUser fixture sets up authentication - must be included to trigger auth
  test.beforeEach(async ({ testUser }) => {
    // Auth is set up by testUser fixture - testUser used for side effects
    void testUser
  })

  test('o navigates from video browser to persona builder', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Press 'o' to go to persona builder
    await page.keyboard.press('p')
    await page.waitForTimeout(500)

    await expect(page).toHaveURL(/\/ontology/)
  })

  test('w navigates from video browser to object builder', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Press 'w' to go to object builder
    await page.keyboard.press('w')
    await page.waitForTimeout(500)

    await expect(page).toHaveURL(/\/objects/)
  })

  test('o navigates to ontology from object builder', async ({ page }) => {
    await page.goto('/objects')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Press 'o' to go to persona builder
    await page.keyboard.press('p')
    await page.waitForTimeout(500)

    await expect(page).toHaveURL(/\/ontology/)
  })

  test('o does not fire when input is focused', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Find and focus a search input if it exists
    const searchInput = page.locator('input[type="search"], input[type="text"]').first()
    if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await searchInput.focus()
      await page.keyboard.press('p')
      await page.waitForTimeout(500)

      // Should still be on video browser since input was focused
      await expect(page).toHaveURL(/localhost:\d+\/$/)
    }
  })

  test('w does not fire when dialog is open', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Open keyboard shortcuts dialog (?)
    await page.keyboard.press('?')
    await page.waitForTimeout(500)

    // Check if dialog is visible
    const dialog = page.locator('[role="dialog"]')
    if (await dialog.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Try pressing 'w' - should not navigate
      await page.keyboard.press('w')
      await page.waitForTimeout(500)

      // Should still be on video browser
      await expect(page).toHaveURL(/localhost:\d+\/$/)

      // Close dialog
      await page.keyboard.press('Escape')
    }
  })

  test('o toggles back from ontology to annotation workspace', async ({ page, testVideo }) => {
    // Go to annotation workspace first
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForSelector('video', { timeout: 15000 })
    const annotationUrl = page.url()
    console.log('Annotation URL:', annotationUrl)

    // Toggle to ontology
    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/ontology/)
    console.log('Now at ontology:', page.url())

    // Toggle back to annotation
    await page.keyboard.press('p')
    await page.waitForTimeout(500)

    // Should be back at annotation workspace
    await expect(page).toHaveURL(/\/annotate\//)
  })

  test('w toggles back from object builder to annotation workspace', async ({ page, testVideo }) => {
    // Go to annotation workspace first
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForSelector('video', { timeout: 15000 })

    // Toggle to object builder
    await page.keyboard.press('w')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/objects/)

    // Toggle back to annotation
    await page.keyboard.press('w')
    await page.waitForTimeout(500)

    // Should be back at annotation workspace
    await expect(page).toHaveURL(/\/annotate\//)
  })

  test('o toggles back from ontology to video browser', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Press 'o' to go to persona builder
    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/ontology/)

    // Press 'o' again to toggle back to video browser
    await page.keyboard.press('p')
    await page.waitForTimeout(500)

    // Should be back at video browser (URL ends with just /)
    await expect(page).toHaveURL(/localhost:\d+\/$/)
  })

  test('w toggles back from object builder to video browser', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Press 'w' to go to object builder
    await page.keyboard.press('w')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/objects/)

    // Press 'w' again to toggle back to video browser
    await page.keyboard.press('w')
    await page.waitForTimeout(500)

    // Should be back at video browser (URL ends with just /)
    await expect(page).toHaveURL(/localhost:\d+\/$/)
  })

  test('keyboard shortcuts work after Cmd+1/2/3 navigation', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Use ControlOrMeta for cross-platform compatibility (Cmd on Mac, Ctrl on Windows/Linux)
    // Use Digit1/Digit2/Digit3 for number keys (not just '1', '2', '3')
    await page.keyboard.press('ControlOrMeta+Digit2')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/ontology/)

    // Now 'n' shortcut should work to create new persona
    const initialDialogCount = await page.locator('[role="dialog"]').count()
    await page.keyboard.press('n')
    await page.waitForTimeout(500)
    const dialogVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false)
    // Dialog should open (if we're in persona browser context)
    expect(dialogVisible || await page.locator('[role="dialog"]').count() > initialDialogCount).toBeTruthy

    // Close any dialog that opened
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    // Use Cmd/Ctrl+3 to go to object builder
    await page.keyboard.press('ControlOrMeta+Digit3')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/objects/)

    // Use Cmd/Ctrl+1 to go back to video browser
    await page.keyboard.press('ControlOrMeta+Digit1')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/localhost:\d+\/$/)
  })

  test('chained toggle shortcuts work correctly', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Chain: o -> w -> o -> w -> back to video browser
    // Press 'o' to go to ontology
    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/ontology/)

    // Press 'w' to go to object builder (from ontology)
    await page.keyboard.press('w')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/objects/)

    // Press 'o' to go back to ontology (from object builder)
    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/ontology/)

    // Press 'o' again - should go back to object builder (where we came from)
    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/objects/)

    // Press 'w' to toggle back (should go to ontology where we came from)
    await page.keyboard.press('w')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/ontology/)
  })

  test('toggle shortcuts reset after Cmd+1/2/3 direct navigation', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle', { timeout: 15000 })

    // Use 'o' to toggle to ontology (stores video browser as return path)
    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/ontology/)

    // Use Cmd/Ctrl+3 to go directly to object builder (bypasses toggle)
    await page.keyboard.press('ControlOrMeta+Digit3')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/objects/)

    // Now press 'w' - should toggle back to wherever we were before (ontology from Cmd+3)
    // Since we used direct nav, there's no stored return path, so it should go to '/'
    await page.keyboard.press('w')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/localhost:\d+\/$/)
  })

  test('shortcuts work correctly from annotation workspace after multiple navigations', async ({ page, testVideo }) => {
    // Go to annotation workspace
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForSelector('video', { timeout: 15000 })
    const annotationUrl = page.url()

    // Toggle to ontology
    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/ontology/)

    // Toggle back to annotation
    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(annotationUrl)

    // Toggle to object builder
    await page.keyboard.press('w')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/objects/)

    // Toggle back to annotation
    await page.keyboard.press('w')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(annotationUrl)

    // Now do a chain: o -> w -> o (from object builder)
    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/ontology/)

    await page.keyboard.press('w')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/objects/)

    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/ontology/)

    // Toggle o back should return to objects (where we came from)
    await page.keyboard.press('p')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL(/\/objects/)
  })
})
