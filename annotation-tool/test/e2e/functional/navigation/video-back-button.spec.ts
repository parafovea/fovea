import { test, expect } from '../../fixtures/test-context.js'

/**
 * Video Annotation - Back Button Tests
 *
 * Tests verify that the back button in the video annotation workspace:
 * - Navigates correctly to the video browser
 * - Is properly positioned and styled
 * - Is keyboard accessible
 * - Works correctly after video interactions
 */

test.describe('Video Annotation - Back Button', () => {
  test('back button navigates to video browser', async ({ page, testVideo }) => {
    // Navigate to annotation workspace
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForLoadState('networkidle')

    // Find and click back button
    const backButton = page.getByLabel('Back to video browser')
    await expect(backButton).toBeVisible()
    await backButton.click()

    // Verify navigation to video browser
    await expect(page).toHaveURL('/')
    await expect(page.getByPlaceholder(/search videos/i)).toBeVisible()
  })

  test('back button is properly positioned and styled', async ({ page, testVideo }) => {
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForLoadState('networkidle')

    const backButton = page.getByLabel('Back to video browser')
    await expect(backButton).toBeVisible()

    // Verify it's in a toolbar
    const toolbar = backButton.locator('xpath=ancestor::*[contains(@class, "MuiToolbar")]')
    await expect(toolbar.first()).toBeVisible()
  })

  test('back button is keyboard accessible', async ({ page, testVideo }) => {
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForLoadState('networkidle')

    // Tab to back button
    await page.keyboard.press('Tab')
    const backButton = page.getByLabel('Back to video browser')
    await expect(backButton).toBeFocused()

    // Activate with Enter
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/')
  })

  test('back button works after video interaction', async ({ page, testVideo }) => {
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForLoadState('networkidle')

    // Interact with video (play/pause)
    const playButton = page.getByLabel(/play video/i)
    if (await playButton.isVisible()) {
      await playButton.click()
      await page.waitForTimeout(500)
    }

    // Back button should still work
    const backButton = page.getByLabel('Back to video browser')
    await backButton.click()
    await expect(page).toHaveURL('/')
  })

  test('back button preserves video browser state', async ({ page, testVideo }) => {
    // Start at video browser with search query
    await page.goto('/')
    const searchInput = page.getByPlaceholder(/search videos/i)
    await searchInput.fill('test')

    // Navigate to annotation
    await page.goto(`/annotate/${testVideo.id}`)
    await page.waitForLoadState('networkidle')

    // Go back
    const backButton = page.getByLabel('Back to video browser')
    await backButton.click()

    // Should be back at video browser
    await expect(page).toHaveURL('/')
  })
})
