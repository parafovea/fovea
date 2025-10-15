import { test, expect } from '@playwright/test'

/**
 * E2E tests for single-user mode authentication.
 * Tests Phase 10.4 requirements for single-user mode:
 * - Auto-login on application start
 * - No authentication UI shown
 * - Default user persona creation
 * - Direct access to all features
 */
test.describe('Single-User Mode', () => {
  test('auto-login on application start', async ({ page }) => {
    await page.goto('/')

    // Should NOT show login page
    await expect(page.getByRole('heading', { name: /sign in/i })).not.toBeVisible()

    // Should show default user's display name
    await expect(page.getByText('Default User')).toBeVisible()

    // Should show main app
    await expect(page.getByText('FOVEA')).toBeVisible()
  })

  test('no authentication UI visible', async ({ page }) => {
    await page.goto('/')

    // Should NOT have login/register links
    await expect(page.getByRole('link', { name: /sign in/i })).not.toBeVisible()
    await expect(page.getByRole('link', { name: /register/i })).not.toBeVisible()

    // Should show user is logged in
    await expect(page.getByText('Default User')).toBeVisible()
  })

  test('direct access to all features', async ({ page }) => {
    await page.goto('/')

    // Should show action buttons without requiring login
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /export/i })).toBeVisible()

    // Should show video browser
    await expect(page.getByText('Video Browser')).toBeVisible()

    // Should have video search available
    await expect(page.getByPlaceholder(/search videos/i)).toBeVisible()
  })
})
