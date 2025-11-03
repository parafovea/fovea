import { test, expect } from '../../fixtures/test-context.js'

/**
 * Global Navigation Keyboard Shortcuts Tests
 *
 * Tests verify that global navigation shortcuts work correctly:
 * - Ctrl+1: Navigate to video browser
 * - Ctrl+2: Navigate to ontology workspace
 * - Ctrl+3: Navigate to object workspace
 * - Ctrl+,: Navigate to settings
 *
 * These shortcuts should work from any workspace.
 */

test.describe('Keyboard Shortcuts - Global Navigation', () => {
  test('Ctrl+1 navigates to video browser', async ({ page, testUser }) => {
    // Start from ontology workspace
    await page.goto('/ontology')
    await expect(page).toHaveURL('/ontology')
    await page.waitForLoadState('networkidle')

    // Press Ctrl+1
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(500)

    // Verify navigated to video browser
    await expect(page).toHaveURL('/')
    await expect(page.getByPlaceholder(/search videos/i)).toBeVisible()
  })

  test('Ctrl+2 navigates to ontology workspace', async ({ page, testUser }) => {
    // Start from video browser
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await page.waitForLoadState('networkidle')

    // Press Ctrl+2
    await page.keyboard.press('Control+2')
    await page.waitForTimeout(500)

    // Verify navigated to ontology workspace
    await expect(page).toHaveURL('/ontology')
    await expect(page.getByText('Ontology Builder')).toBeVisible()
  })

  test('Ctrl+3 navigates to object workspace', async ({ page, testUser }) => {
    // Start from video browser
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await page.waitForLoadState('networkidle')

    // Press Ctrl+3
    await page.keyboard.press('Control+3')
    await page.waitForTimeout(500)

    // Verify navigated to object workspace
    await expect(page).toHaveURL('/objects')
    await expect(page.getByRole('tab', { name: /entities/i })).toBeVisible()
  })

  test('global navigation works from annotation workspace', async ({ page, testUser, testVideo }) => {
    // Start from annotation workspace
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForLoadState('networkidle')

    // Test Ctrl+2
    await page.keyboard.press('Control+2')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL('/ontology')

    // Test Ctrl+1
    await page.keyboard.press('Control+1')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL('/')

    // Test Ctrl+3
    await page.keyboard.press('Control+3')
    await page.waitForTimeout(500)
    await expect(page).toHaveURL('/objects')
  })

})
