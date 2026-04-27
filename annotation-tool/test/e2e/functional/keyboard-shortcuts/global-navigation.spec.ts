import { test, expect } from '../../fixtures/test-context.js'

/**
 * Global Navigation Keyboard Shortcuts Tests
 *
 * Tests verify that global navigation shortcuts work correctly:
 * - Cmd/Ctrl+1: Navigate to video browser
 * - Cmd/Ctrl+2: Navigate to ontology workspace
 * - Cmd/Ctrl+3: Navigate to object workspace
 *
 * Uses ControlOrMeta for cross-platform compatibility (Cmd on Mac, Ctrl on Windows/Linux).
 * Uses Digit1/Digit2/Digit3 for number keys.
 * These shortcuts should work from any workspace.
 */

test.describe('Keyboard Shortcuts - Global Navigation', () => {
  test('Cmd/Ctrl+1 navigates to video browser', async ({ page, testUser }) => {
    // Start from ontology workspace
    await page.goto('/ontology')
    await expect(page).toHaveURL('/ontology')
    await page.waitForLoadState('networkidle')

    // Press Cmd/Ctrl+1
    await page.keyboard.press('ControlOrMeta+Digit1')
    await page.waitForTimeout(500)

    // Verify navigated to video browser
    await expect(page).toHaveURL('/')
    await expect(page.getByPlaceholder(/search videos/i)).toBeVisible()
  })

  test('Cmd/Ctrl+2 navigates to ontology workspace', async ({ page, testUser }) => {
    // Start from video browser
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await page.waitForLoadState('networkidle')

    // Press Cmd/Ctrl+2
    await page.keyboard.press('ControlOrMeta+Digit2')
    await page.waitForTimeout(500)

    // Verify navigated to ontology workspace
    await expect(page).toHaveURL('/ontology')
    // "Persona Builder" appears in both the sidebar nav link and the
    // page breadcrumb; either resolution confirms we landed on /ontology.
    await expect(page.getByText('Persona Builder').first()).toBeVisible()
  })

  test('Cmd/Ctrl+3 navigates to object workspace', async ({ page, testUser }) => {
    // Start from video browser
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await page.waitForLoadState('networkidle')

    // Press Cmd/Ctrl+3
    await page.keyboard.press('ControlOrMeta+Digit3')
    await page.waitForTimeout(500)

    // Verify navigated to object workspace
    await expect(page).toHaveURL('/objects')
    await expect(page.getByRole('tab', { name: /entities/i })).toBeVisible()
  })

  test('global navigation works from annotation workspace', async ({ page, testUser, testVideo }) => {
    // Start from annotation workspace
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForSelector('video', { timeout: 15000 })

    // Test Cmd/Ctrl+2
    await page.keyboard.press('ControlOrMeta+Digit2')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL('/ontology')

    // Test Cmd/Ctrl+1
    await page.keyboard.press('ControlOrMeta+Digit1')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL('/')

    // Test Cmd/Ctrl+3
    await page.keyboard.press('ControlOrMeta+Digit3')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL('/objects')
  })

  test('back button works alongside Cmd/Ctrl+1 shortcut', async ({ page, testUser, testVideo }) => {
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForSelector('video', { timeout: 15000 })

    // Both back button and Cmd/Ctrl+1 should navigate to video browser
    const backButton = page.getByLabel('Back to video browser')
    await expect(backButton).toBeVisible()

    // Test keyboard shortcut first
    await page.keyboard.press('ControlOrMeta+Digit1')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL('/')

    // Navigate back to annotation
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForSelector('video', { timeout: 15000 })

    // Test back button
    await backButton.click()
    await page.waitForTimeout(500)
    await expect(page).toHaveURL('/')
  })

})
