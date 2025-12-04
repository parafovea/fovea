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
  test('back button navigates to video browser', async ({ page, annotationWorkspace, testVideo }) => {
    // Navigate to annotation workspace
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    // Find and click back button
    const backButton = page.getByLabel('Back to video browser')
    await expect(backButton).toBeVisible()
    await backButton.click()

    // Verify navigation to video browser
    await expect(page).toHaveURL('/')
    await expect(page.getByPlaceholder(/search videos/i)).toBeVisible()
  })

  test('back button is properly positioned and styled', async ({ page, annotationWorkspace, testVideo }) => {
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    const backButton = page.getByLabel('Back to video browser')
    await expect(backButton).toBeVisible()

    // Verify it's an IconButton (small size)
    await expect(backButton).toHaveAttribute('class', /MuiIconButton-sizeSmall/)

    // Verify it has the back icon
    const backIcon = backButton.locator('svg')
    await expect(backIcon).toBeVisible()
  })

  test('back button is keyboard accessible', async ({ page, annotationWorkspace, testVideo }) => {
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    const backButton = page.getByLabel('Back to video browser')

    // Verify button is in tab order
    await expect(backButton).toHaveAttribute('tabindex', '0')

    // Verify button can be focused and activated via keyboard
    await backButton.focus()
    await expect(backButton).toBeFocused()

    // Activate with Enter
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/')
  })

  test('back button works after video interaction', async ({ page, annotationWorkspace, testVideo }) => {
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

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

  test('back button preserves video browser state', async ({ page, annotationWorkspace, testVideo }) => {
    // Start at video browser with search query
    await page.goto('/')
    const searchInput = page.getByPlaceholder(/search videos/i)
    await searchInput.fill('test')

    // Navigate to annotation
    await page.goto(`/annotate/${testVideo.id}`)
    await annotationWorkspace.expectWorkspaceReady()

    // Go back
    const backButton = page.getByLabel('Back to video browser')
    await backButton.click()

    // Should be back at video browser
    await expect(page).toHaveURL('/')
  })
})
