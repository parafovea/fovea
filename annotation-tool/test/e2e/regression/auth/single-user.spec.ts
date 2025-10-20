import { test } from '../../fixtures/test-context.js'

/**
 * E2E tests for single-user mode authentication.
 * Tests single-user mode requirements:
 * - Auto-login on application start
 * - No authentication UI shown
 * - Default user persona creation
 * - Direct access to all features
 */
test.describe('Single-User Mode', () => {
  test('auto-login on application start', async ({ videoBrowser }) => {
    await videoBrowser.navigateToHome()

    // Should NOT show login page
    await videoBrowser.expectNoLoginUI()

    // Should show default user's display name
    await videoBrowser.expectUserLoggedIn()

    // Should show main app
    await videoBrowser.expectPageLoaded()
  })

  test('no authentication UI visible', async ({ videoBrowser }) => {
    await videoBrowser.navigateToHome()

    // Should NOT have login/register links
    await videoBrowser.expectNoLoginUI()

    // Should show user is logged in
    await videoBrowser.expectUserLoggedIn()
  })

  test('direct access to all features', async ({ videoBrowser }) => {
    await videoBrowser.navigateToHome()

    // Should show action buttons without requiring login
    await videoBrowser.expectActionButtonsVisible()

    // Should show video browser
    await videoBrowser.expectPageLoaded()

    // Should have video search available
    await videoBrowser.expectSearchAvailable()
  })
})
