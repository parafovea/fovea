/**
 * @file auth-gate.spec.ts
 * @description E2E guard for the ProtectedRoute auth gate: in multi-user mode an
 * unauthenticated visitor must be sent to /login and must never be shown the
 * protected Video Browser. ProtectedRoute holds the loading screen until the
 * server's deployment mode is known (appConfig !== null), so the redirect is
 * deterministic rather than flashing protected content first.
 */

import { test, expect } from '../../fixtures/test-context.js'

test.describe('Auth gate', () => {
  // NOTE: deliberately does NOT request the `testUser` fixture, so the page
  // carries no session cookie and the visit is unauthenticated.
  test('unauthenticated visit to a protected route lands on /login, not the Video Browser', async ({ page }) => {
    await page.goto('/')

    // The gate resolves to the login route (the E2E backend runs multi-user).
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
    await expect(page.getByLabel(/username/i)).toBeVisible({ timeout: 10000 })

    // Protected content must not be present.
    await expect(page.getByRole('button', { name: /^annotate$/i })).toHaveCount(0)
  })

  test('unauthenticated deep-link to an annotation route also redirects to /login', async ({ page }) => {
    await page.goto('/annotate/some-video-id')
    await expect(page).toHaveURL(/\/login/, { timeout: 15000 })
    await expect(page.getByLabel(/password/i)).toBeVisible({ timeout: 10000 })
  })
})
